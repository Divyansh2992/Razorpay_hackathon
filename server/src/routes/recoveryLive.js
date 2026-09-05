const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const eventBus = require('../eventBus');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recovery-live/failed-transactions/:customerId
// Real failed transactions for a customer (from real Store checkouts) — lets admin
// demo-recover an actual failure instead of a canned amount/product.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/failed-transactions/:customerId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ customerId: req.params.customerId, status: 'failed' })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recovery-live/trigger
// Admin-initiated recovery — fires the real pipeline (diagnosis → decision →
// governance → action) for an EXISTING real failed transaction (pass transactionId).
// Falls back to creating a synthetic transaction if no transactionId is given
// (legacy path, kept for compatibility).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/trigger', async (req, res) => {
  try {
    const { customerId, errorCode, errorReason, amount, category, description, transactionId } = req.body;

    let transaction;
    if (transactionId) {
      transaction = await Transaction.findById(transactionId);
      if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    } else {
      transaction = await Transaction.create({
        customerId,
        amount,
        category: category || 'checkout',
        status: 'failed',
        errorCode,
        errorReason,
        description: description || 'Recovery Live demo scenario'
      });
    }

    eventBus.emit('payment.failed', {
      event: 'payment.failed',
      transactionId: transaction._id.toString(),
      payload: {
        errorCode: transaction.errorCode, errorReason: transaction.errorReason,
        amount: transaction.amount, source: 'recovery_live'
      }
    });

    res.json({ success: true, transactionId: transaction._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
