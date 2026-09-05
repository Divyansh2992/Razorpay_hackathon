const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  category: {
    type: String,
    enum: ['checkout', 'subscription', 'invoice'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'failed', 'succeeded', 'recovered', 'abandoned', 'written_off'],
    default: 'pending'
  },
  paymentMethod: { type: String, enum: ['card', 'upi', 'netbanking', 'wallet'], default: 'card' },
  errorCode: String,
  errorReason: String,
  forceFailureType: String,
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  dueDate: Date,
  promiseToPayDate: Date,
  merchantId: { type: String, default: 'RAZORPAY_DEMO_MERCHANT' },
  description: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

transactionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
