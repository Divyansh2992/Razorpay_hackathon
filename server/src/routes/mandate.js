const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const RecoveryEvent = require('../models/RecoveryEvent');
const mandateService = require('../services/mandateService');
const { emitLive } = require('../services/detectionService');

// GET /api/mandate/status/:transactionId — current sequence state, for the admin UI
router.get('/status/:transactionId', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    const recoveryEvent = await RecoveryEvent.findOne({ transactionId: transaction._id }).sort({ detectedAt: -1 });
    res.json({
      retryCount: transaction.retryCount,
      maxRetries: transaction.maxRetries,
      status: transaction.status,
      mandateNoticeSentAt: transaction.mandateNoticeSentAt,
      nextMandateRetryAt: transaction.nextMandateRetryAt,
      recoveryEvent
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mandate/advance — attempt the next real retry in the sequence.
// force:true bypasses the 24h RBI notice window (demo-only escape hatch — the real
// window is still enforced and shown by default).
router.post('/advance', async (req, res) => {
  try {
    const { transactionId, force } = req.body;
    const transaction = await Transaction.findById(transactionId).populate('customerId');
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    const customer = transaction.customerId;

    const recoveryEvent = await RecoveryEvent.findOne({ transactionId: transaction._id }).sort({ detectedAt: -1 });
    if (!recoveryEvent) return res.status(404).json({ error: 'No recovery event for this transaction' });
    if (['recovered', 'escalated'].includes(recoveryEvent.outcome)) {
      return res.status(400).json({ error: 'This mandate sequence has already reached a final outcome.' });
    }

    const result = await mandateService.attemptRetry(transaction, customer, recoveryEvent, { force: !!force });
    if (result.blocked) return res.status(400).json({ error: result.reason });

    const updatedEvent = await RecoveryEvent.findById(recoveryEvent._id);
    emitLive('event:resolved', {
      recoveryEventId: recoveryEvent._id, transactionId: transaction._id,
      customerId: customer._id, amount: transaction.amount,
      outcome: updatedEvent.outcome, amountRecovered: updatedEvent.amountRecovered,
      actionTaken: updatedEvent.actionTaken, diagnosis: updatedEvent.diagnosis, status: 'resolved'
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
