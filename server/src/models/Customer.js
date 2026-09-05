const mongoose = require('mongoose');

const savedPaymentMethodSchema = new mongoose.Schema({
  type: { type: String, enum: ['card', 'upi', 'netbanking', 'wallet'], default: 'card' },
  last4: String,
  expiryMonth: Number,
  expiryYear: Number,
  upiId: String,
  isPrimary: { type: Boolean, default: false },
  label: String
});

const paymentHistorySchema = new mongoose.Schema({
  transactionId: String,
  status: { type: String, enum: ['succeeded', 'failed', 'refunded'] },
  amount: Number,
  timestamp: { type: Date, default: Date.now }
});

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  company: String,
  savedPaymentMethods: [savedPaymentMethodSchema],
  paymentHistory: [paymentHistorySchema],
  contactPreferences: {
    channel: { type: String, enum: ['whatsapp', 'sms', 'email', 'all'], default: 'whatsapp' },
    optedOut: { type: Boolean, default: false }
  },
  segment: { type: String, enum: ['high_value', 'medium', 'low'], default: 'medium' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Customer', customerSchema);
