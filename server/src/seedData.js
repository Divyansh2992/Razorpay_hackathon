/**
 * Seed Data — Pre-populates MongoDB with realistic demo data.
 * Run: node src/seedData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const Transaction = require('./models/Transaction');
const RecoveryEvent = require('./models/RecoveryEvent');
const Invoice = require('./models/Invoice');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/revenue-recovery';

const customers = [
  {
    name: 'GlobalTech Solutions',
    email: 'finance@globaltech.co.in',
    phone: '+91-9812398765',
    company: 'GlobalTech Solutions',
    segment: 'high_value',
    savedPaymentMethods: [
      { type: 'card', last4: '4242', expiryMonth: 12, expiryYear: 2027, isPrimary: true, label: 'HDFC Credit' },
      { type: 'upi', upiId: 'globaltech@okicici', isPrimary: false, label: 'UPI Backup' }
    ],
    paymentHistory: [
      { status: 'succeeded', amount: 12000, timestamp: new Date(Date.now() - 90 * 86400000) },
      { status: 'succeeded', amount: 7500, timestamp: new Date(Date.now() - 30 * 86400000) },
      { status: 'failed', amount: 2999, timestamp: new Date(Date.now() - 5 * 86400000) }
    ],
    contactPreferences: { channel: 'whatsapp', optedOut: false }
  }
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing
  await Promise.all([
    Customer.deleteMany({}),
    Transaction.deleteMany({}),
    RecoveryEvent.deleteMany({}),
    Invoice.deleteMany({})
  ]);

  // Create customers
  const createdCustomers = await Customer.insertMany(customers);
  console.log(`Created ${createdCustomers.length} customers`);

  // Create pre-existing historical recovery events (so dashboard isn't empty)
  const txs = [];
  const events = [];

  const historical = [
    { custIdx: 0, amount: 2999, category: 'subscription', errorCode: 'INSUFFICIENT_FUNDS', outcome: 'recovered', funnelLevel: 1, actionType: 'scheduled_retry', channel: 'none', method: 'rule', bucket: 'soft_decline' },
    { custIdx: 0, amount: 12000, errorCode: 'CARD_EXPIRED', outcome: 'pending', funnelLevel: 2, actionType: 'nudge_link', channel: 'email', method: 'llm', bucket: 'hard_decline', category: 'subscription' },
    { custIdx: 0, amount: 7500, errorCode: 'GATEWAY_TIMEOUT', outcome: 'recovered', funnelLevel: 1, actionType: 'silent_retry', channel: 'none', method: 'rule', bucket: 'infra_glitch', category: 'checkout' },
    { custIdx: 0, amount: 85000, errorCode: 'UNKNOWN_ERROR', outcome: 'escalated', funnelLevel: 5, actionType: 'voice_escalation', channel: 'voice', method: 'llm', bucket: 'ambiguous', category: 'invoice', llmReasoning: 'Error context and payment history suggest a soft-decline with issuer-side velocity limit — the UNKNOWN_ERROR code does not map cleanly to standard buckets. High-value B2B context warrants escalation to voice agent.' },
    { custIdx: 0, amount: 499, errorCode: 'OTP_TIMEOUT', outcome: 'blocked_stopping_rule', funnelLevel: 2, actionType: 'blocked_governance', channel: 'none', method: 'rule', bucket: 'auth_friction', category: 'checkout', govBlock: 'Max retries reached (3/3)' },
    { custIdx: 0, amount: 2999, errorCode: 'CARD_DECLINED', outcome: 'recovered', funnelLevel: 2, actionType: 'nudge_link', channel: 'whatsapp', method: 'llm', bucket: 'ambiguous', category: 'subscription', llmReasoning: 'CARD_DECLINED with recent successful history suggests temporary issuer-side issue rather than true hard decline. Nudge with payment link recommended over blocking customer.' },
    { custIdx: 0, amount: 145000, errorCode: 'CARD_EXPIRED', outcome: 'pending', funnelLevel: 5, actionType: 'invoice_reminder', channel: 'email', method: 'rule', bucket: 'hard_decline', category: 'invoice' },
    { custIdx: 0, amount: 499, errorCode: 'GATEWAY_TIMEOUT', outcome: 'recovered', funnelLevel: 1, actionType: 'alt_payment_method', channel: 'none', method: 'rule', bucket: 'infra_glitch', category: 'checkout' }
  ];

  for (const h of historical) {
    const customer = createdCustomers[h.custIdx];
    const tx = await Transaction.create({
      customerId: customer._id,
      amount: h.amount,
      category: h.category || 'checkout',
      status: h.outcome === 'recovered' ? 'recovered' : 'failed',
      errorCode: h.errorCode,
      errorReason: `Simulated: ${h.errorCode}`,
      retryCount: h.funnelLevel >= 4 ? 2 : 1,
      maxRetries: 3
    });

    const ev = await RecoveryEvent.create({
      transactionId: tx._id,
      customerId: customer._id,
      category: h.category || 'checkout',
      amount: h.amount,
      diagnosis: {
        bucket: h.bucket,
        method: h.bucket === 'ambiguous' ? 'llm' : 'rule',
        llmReasoning: h.llmReasoning || null,
        confidence: h.bucket === 'ambiguous' ? 0.78 : 1.0
      },
      actionTaken: {
        funnelLevel: h.funnelLevel,
        type: h.actionType,
        channel: h.channel,
        method: h.method,
        governanceBlock: h.govBlock || null
      },
      outcome: h.outcome,
      amountRecovered: h.outcome === 'recovered' ? h.amount : 0,
      detectedAt: new Date(Date.now() - Math.random() * 2 * 60 * 60 * 1000) // Last 2 hours
    });
  }

  // Create invoices
  const invoiceData = [
    { custIdx: 0, amount: 85000, daysOverdue: 7, stage: 2, number: 'INV-2026-001' },
    { custIdx: 0, amount: 145000, daysOverdue: 3, stage: 1, number: 'INV-2026-002' },
    { custIdx: 0, amount: 32000, daysOverdue: 0, stage: 0, number: 'INV-2026-003' },
    { custIdx: 0, amount: 62000, daysOverdue: 14, stage: 3, number: 'INV-2026-004', promiseDate: new Date(Date.now() + 2 * 86400000) }
  ];

  for (const inv of invoiceData) {
    const customer = createdCustomers[inv.custIdx];
    const dueDate = new Date(Date.now() - inv.daysOverdue * 86400000);
    await Invoice.create({
      customerId: customer._id,
      invoiceNumber: inv.number,
      amount: inv.amount,
      description: `Services rendered - ${customer.company || customer.name}`,
      dueDate,
      status: inv.daysOverdue > 0 ? 'overdue' : 'pending',
      reminderStage: inv.stage,
      promiseToPayDate: inv.promiseDate || null,
      promiseSuppressed: !!inv.promiseDate,
      replyLog: inv.promiseDate ? [{
        text: "I'll pay by Friday, please give me 2 more days",
        extractedIntent: 'promise_to_pay',
        extractedDate: inv.promiseDate.toISOString().split('T')[0],
        summary: 'Customer committed to paying within 2 days'
      }] : []
    });
  }

  console.log('Created invoices');
  console.log('✅ Seed complete!');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
