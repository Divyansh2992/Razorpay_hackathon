const mongoose = require('mongoose');

const replyLogSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now },
  extractedIntent: {
    type: String,
    enum: ['dispute', 'promise_to_pay', 'confusion', 'confirmation', 'refusal', 'unknown']
  },
  extractedDate: String,
  extractedAmount: Number,
  summary: String
});

const approvalRequestSchema = new mongoose.Schema({
  text: String,
  extractedIntent: {
    type: String,
    enum: ['dispute', 'promise_to_pay', 'confusion', 'confirmation', 'refusal', 'unknown']
  },
  extractedDate: String,
  extractedAmount: Number,
  summary: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  decidedAt: Date
});

const invoiceSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  invoiceNumber: { type: String, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  description: String,
  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['pending', 'overdue', 'paid', 'written_off', 'disputed'],
    default: 'pending'
  },
  reminderStage: { type: Number, default: 0, min: 0, max: 5 },
  nextReminderAt: Date,
  promiseToPayDate: Date,
  promiseSuppressed: { type: Boolean, default: false },
  replyLog: [replyLogSchema],
  approvalRequests: [approvalRequestSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

invoiceSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
