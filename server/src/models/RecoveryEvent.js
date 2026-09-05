const mongoose = require('mongoose');

const recoveryEventSchema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  detectedAt: { type: Date, default: Date.now },
  category: { type: String, enum: ['checkout', 'subscription', 'invoice', 'abandonment'] },
  amount: Number,

  diagnosis: {
    bucket: {
      type: String,
      enum: ['hard_decline', 'soft_decline', 'auth_friction', 'fraud_fp', 'infra_glitch', 'ambiguous', 'pending']
    },
    method: { type: String, enum: ['rule', 'llm', 'pending'] },
    llmReasoning: String,
    confidence: Number
  },

  actionTaken: {
    funnelLevel: { type: Number, min: 1, max: 5 },
    type: {
      type: String,
      enum: [
        'silent_retry', 'alt_payment_method', 'scheduled_retry',
        'nudge_link', 'in_app_prompt', 'ai_conversation',
        'voice_escalation', 'invoice_reminder', 'none', 'blocked_governance',
        'mandate_pre_debit_notice', 'mandate_retry_attempt'
      ]
    },
    channel: {
      type: String,
      enum: ['none', 'whatsapp', 'sms', 'email', 'in_app', 'voice', 'human_handoff']
    },
    messageContent: String,
    method: { type: String, enum: ['rule', 'llm', 'pending'] },
    governanceBlock: String
  },

  outcome: {
    type: String,
    enum: ['recovered', 'pending', 'failed', 'opted_out', 'escalated', 'written_off', 'blocked_stopping_rule'],
    default: 'pending'
  },
  amountRecovered: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

recoveryEventSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('RecoveryEvent', recoveryEventSchema);
