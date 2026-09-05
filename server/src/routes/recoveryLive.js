const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const eventBus = require('../eventBus');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recovery-live/trigger
// Admin-initiated scenario — creates a REAL transaction and fires it through the
// same pipeline the live checkout store uses (diagnosis → decision → governance → action).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/trigger', async (req, res) => {
  try {
    const { customerId, errorCode, errorReason, amount, category, description } = req.body;

    const transaction = await Transaction.create({
      customerId,
      amount,
      category: category || 'checkout',
      status: 'failed',
      errorCode,
      errorReason,
      description: description || 'Recovery Live demo scenario'
    });

    eventBus.emit('payment.failed', {
      event: 'payment.failed',
      transactionId: transaction._id.toString(),
      payload: { errorCode, errorReason, amount, source: 'recovery_live' }
    });

    res.json({ success: true, transactionId: transaction._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
