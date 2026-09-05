const express = require('express');
const router = express.Router();
const RecoveryEvent = require('../models/RecoveryEvent');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const events = await RecoveryEvent.find({});

    const totalAtRisk = events.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalRecovered = events.reduce((sum, e) => sum + (e.amountRecovered || 0), 0);
    const recoveryRate = totalAtRisk > 0 ? ((totalRecovered / totalAtRisk) * 100).toFixed(1) : 0;

    // Breakdown by category
    const categories = ['checkout', 'subscription', 'invoice', 'abandonment'];
    const byCategory = {};
    categories.forEach(cat => {
      const catEvents = events.filter(e => e.category === cat);
      byCategory[cat] = {
        atRisk: catEvents.reduce((s, e) => s + (e.amount || 0), 0),
        recovered: catEvents.reduce((s, e) => s + (e.amountRecovered || 0), 0),
        count: catEvents.length
      };
    });

    // Funnel level breakdown (core proof point)
    const funnelBreakdown = {};
    for (let level = 1; level <= 5; level++) {
      const levelEvents = events.filter(e => e.actionTaken?.funnelLevel === level);
      funnelBreakdown[level] = {
        level,
        label: ['', 'Silent Recovery', 'Frictionless Nudge', 'In-App Prompt', 'AI Conversation', 'Voice Escalation'][level],
        atRisk: levelEvents.reduce((s, e) => s + (e.amount || 0), 0),
        recovered: levelEvents.reduce((s, e) => s + (e.amountRecovered || 0), 0),
        count: levelEvents.length,
        isAI: level >= 4
      };
    }

    // Method breakdown: rule vs llm
    const ruleEvents = events.filter(e => e.diagnosis?.method === 'rule');
    const llmEvents = events.filter(e => e.diagnosis?.method === 'llm');
    const blockedEvents = events.filter(e => e.outcome === 'blocked_stopping_rule');

    // Outcome counts
    const outcomes = {};
    events.forEach(e => {
      outcomes[e.outcome] = (outcomes[e.outcome] || 0) + 1;
    });

    // Incremental Razorpay fee revenue (2% of recovered for demo)
    const razorpayFeeRevenue = totalRecovered * 0.02;

    res.json({
      totalAtRisk,
      totalRecovered,
      recoveryRate: parseFloat(recoveryRate),
      totalEvents: events.length,
      byCategory,
      funnelBreakdown,
      methodBreakdown: {
        rule: { count: ruleEvents.length, recovered: ruleEvents.reduce((s, e) => s + (e.amountRecovered || 0), 0) },
        llm: { count: llmEvents.length, recovered: llmEvents.reduce((s, e) => s + (e.amountRecovered || 0), 0) }
      },
      blockedByGovernance: blockedEvents.length,
      outcomes,
      razorpayFeeRevenue: Math.round(razorpayFeeRevenue)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/events
router.get('/events', async (req, res) => {
  try {
    const { page = 1, limit = 50, outcome, category, method } = req.query;
    const filter = {};
    if (outcome) filter.outcome = outcome;
    if (category) filter.category = category;
    if (method) filter['diagnosis.method'] = method;

    const events = await RecoveryEvent.find(filter)
      .populate('customerId', 'name email phone segment')
      .populate('transactionId', 'amount category status errorCode errorReason retryCount')
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await RecoveryEvent.countDocuments(filter);

    res.json({ events, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/event/:id — single event full detail
router.get('/event/:id', async (req, res) => {
  try {
    const event = await RecoveryEvent.findById(req.params.id)
      .populate('customerId')
      .populate('transactionId');
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/stats/live — quick live stats for header
router.get('/stats/live', async (req, res) => {
  try {
    const [total, recovered, pending, blocked] = await Promise.all([
      RecoveryEvent.countDocuments(),
      RecoveryEvent.countDocuments({ outcome: 'recovered' }),
      RecoveryEvent.countDocuments({ outcome: 'pending' }),
      RecoveryEvent.countDocuments({ outcome: 'blocked_stopping_rule' })
    ]);

    const recoveredAmount = await RecoveryEvent.aggregate([
      { $match: { outcome: 'recovered' } },
      { $group: { _id: null, total: { $sum: '$amountRecovered' } } }
    ]);

    const atRiskAmount = await RecoveryEvent.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      total,
      recovered,
      pending,
      blocked,
      totalRecovered: recoveredAmount[0]?.total || 0,
      totalAtRisk: atRiskAmount[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
