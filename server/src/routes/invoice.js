const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const RecoveryEvent = require('../models/RecoveryEvent');
const Transaction = require('../models/Transaction');
const aiService = require('../services/aiService');
const actionService = require('../services/actionService');
const governanceService = require('../services/governanceService');
const { emitLive } = require('../services/detectionService');
const { v4: uuidv4 } = require('uuid');

// GET /api/invoice — list all invoices
router.get('/', async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate('customerId', 'name email company phone')
      .sort({ dueDate: 1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoice/pending-approvals — flattened list of every unresolved B2B reply,
// so the admin notification bell can show what's waiting even if opened after the fact
// (a live socket event only reaches a bell that was already open when it fired).
router.get('/pending-approvals', async (req, res) => {
  try {
    const invoices = await Invoice.find({ 'approvalRequests.status': 'pending' })
      .populate('customerId', 'name company');
    const pending = [];
    for (const inv of invoices) {
      for (const r of inv.approvalRequests) {
        if (r.status === 'pending') {
          pending.push({
            invoiceId: inv._id,
            invoiceNumber: inv.invoiceNumber,
            requestId: r._id,
            intent: r.extractedIntent,
            summary: r.summary,
            text: r.text,
            createdAt: r.createdAt
          });
        }
      }
    }
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoice/trigger-overdue
// Manually marks a pending invoice as overdue and starts reminder sequence
router.post('/trigger-overdue', async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const invoice = await Invoice.findById(invoiceId).populate('customerId');
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    invoice.status = 'overdue';
    invoice.reminderStage = 1;
    await invoice.save();

    const customer = invoice.customerId;

    // Create a transaction for audit trail
    const transaction = await Transaction.create({
      customerId: customer._id,
      amount: invoice.amount,
      category: 'invoice',
      status: 'failed',
      errorCode: 'INVOICE_OVERDUE',
      errorReason: `Invoice #${invoice.invoiceNumber} is past due date`,
      dueDate: invoice.dueDate
    });

    // Check governance (promise-to-pay suppression)
    if (governanceService.shouldSuppressForPromise(invoice)) {
      return res.json({ message: 'Reminder suppressed — promise-to-pay is active', promiseDate: invoice.promiseToPayDate });
    }

    const recoveryEvent = await RecoveryEvent.create({
      transactionId: transaction._id,
      customerId: customer._id,
      category: 'invoice',
      amount: invoice.amount,
      diagnosis: { bucket: 'hard_decline', method: 'rule', confidence: 1.0 },
      actionTaken: { funnelLevel: 5, type: 'invoice_reminder', channel: 'none', method: 'rule' },
      outcome: 'pending'
    });

    const result = await actionService.sendInvoiceReminder(invoice, customer, recoveryEvent);

    emitLive('invoice:reminder_sent', {
      invoiceId: invoice._id, customerId: customer._id,
      invoiceNumber: invoice.invoiceNumber, message: result.message
    });

    res.json({ success: true, message: result.message, invoice: await Invoice.findById(invoiceId).populate('customerId') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoice/mine/:customerId — invoices for one B2B customer (User2 portal)
router.get('/mine/:customerId', async (req, res) => {
  try {
    const invoices = await Invoice.find({ customerId: req.params.customerId })
      .populate('customerId', 'name email company phone')
      .sort({ dueDate: 1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoice/reply — B2B customer (User2) replies to an invoice (promise-to-pay, dispute, etc.)
// The AI classifies intent immediately, but the effect on the invoice (status change, reminder
// suppression) is NOT applied until an admin reviews and approves the request — a real B2B
// collections workflow needs a human check before, say, pausing reminders on a promise to pay.
router.post('/reply', async (req, res) => {
  try {
    const { invoiceId, replyText } = req.body;
    const invoice = await Invoice.findById(invoiceId).populate('customerId');
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // 🧠 AI intent classification
    const classified = await aiService.classifyReplyIntent({
      replyText,
      amount: invoice.amount,
      category: 'invoice',
      status: invoice.status
    });

    invoice.replyLog.push({
      text: replyText,
      extractedIntent: classified.intent,
      extractedDate: classified.extractedDate,
      extractedAmount: classified.extractedAmount,
      summary: classified.summary
    });

    invoice.approvalRequests.push({
      text: replyText,
      extractedIntent: classified.intent,
      extractedDate: classified.extractedDate,
      extractedAmount: classified.extractedAmount,
      summary: classified.summary,
      status: 'pending'
    });

    await invoice.save();

    const updated = await Invoice.findById(invoiceId).populate('customerId');
    emitLive('invoice:approval_requested', {
      invoiceId: invoice._id,
      customerId: invoice.customerId._id,
      invoiceNumber: invoice.invoiceNumber,
      intent: classified.intent,
      summary: classified.summary
    });

    res.json({
      success: true,
      intent: classified.intent,
      extractedDate: classified.extractedDate,
      extractedAmount: classified.extractedAmount,
      summary: classified.summary,
      pendingApproval: true,
      invoice: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoice/approve — Admin approves or rejects a B2B customer's pending reply.
// Only on approval does the classified intent actually take effect on the invoice.
router.post('/approve', async (req, res) => {
  try {
    const { invoiceId, requestId, decision } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }
    const invoice = await Invoice.findById(invoiceId).populate('customerId');
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const reqEntry = invoice.approvalRequests.id(requestId);
    if (!reqEntry) return res.status(404).json({ error: 'Approval request not found' });
    if (reqEntry.status !== 'pending') return res.status(400).json({ error: 'Already decided' });

    reqEntry.status = decision === 'approve' ? 'approved' : 'rejected';
    reqEntry.decidedAt = new Date();

    if (decision === 'approve') {
      if (reqEntry.extractedIntent === 'promise_to_pay' && reqEntry.extractedDate) {
        invoice.promiseToPayDate = new Date(reqEntry.extractedDate);
        invoice.promiseSuppressed = true;
      }
      if (reqEntry.extractedIntent === 'dispute') {
        invoice.status = 'disputed';
      }
      if (reqEntry.extractedIntent === 'confirmation') {
        invoice.status = 'paid';
      }
    }

    await invoice.save();
    const updated = await Invoice.findById(invoiceId).populate('customerId');

    emitLive('invoice:approval_decided', {
      invoiceId: invoice._id,
      customerId: invoice.customerId._id,
      requestId,
      decision,
      invoiceNumber: invoice.invoiceNumber
    });

    res.json({ success: true, invoice: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoice/advance-reminder — manually advance reminder stage
router.post('/advance-reminder', async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const invoice = await Invoice.findById(invoiceId).populate('customerId');
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (governanceService.shouldSuppressForPromise(invoice)) {
      return res.json({ suppressed: true, message: 'Suppressed until promise date', promiseDate: invoice.promiseToPayDate });
    }

    invoice.reminderStage = Math.min(invoice.reminderStage + 1, 4);
    await invoice.save();

    // Create a dummy transaction ref for RecoveryEvent
    const transaction = await Transaction.findOne({ customerId: invoice.customerId._id, category: 'invoice' }) ||
      await Transaction.create({
        customerId: invoice.customerId._id,
        amount: invoice.amount,
        category: 'invoice',
        status: 'failed',
        errorCode: 'INVOICE_OVERDUE',
        errorReason: `Invoice #${invoice.invoiceNumber} overdue`
      });

    const recoveryEvent = await RecoveryEvent.create({
      transactionId: transaction._id,
      customerId: invoice.customerId._id,
      category: 'invoice',
      amount: invoice.amount,
      diagnosis: { bucket: 'hard_decline', method: 'rule', confidence: 1.0 },
      actionTaken: { funnelLevel: 5, type: 'invoice_reminder', channel: 'email', method: 'rule' },
      outcome: 'pending'
    });

    const result = await actionService.sendInvoiceReminder(invoice, invoice.customerId, recoveryEvent);

    emitLive('invoice:reminder_sent', {
      invoiceId: invoice._id, customerId: invoice.customerId._id,
      invoiceNumber: invoice.invoiceNumber, message: result.message
    });

    res.json({ success: true, stage: invoice.reminderStage, message: result.message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
