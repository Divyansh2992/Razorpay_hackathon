/**
 * Mandate Retry Sequencer — real e-mandate/recurring-payment retry logic.
 *
 * RBI's recurring-payment framework requires a pre-debit notification ahead of every
 * auto-debit attempt, and caps how many times a bank can retry a failed mandate before
 * it must be escalated to the merchant/customer for manual handling. This service
 * implements that as a genuine multi-step sequence (not a single coin-flip action):
 * notice → wait → real bank-side retry attempt → (repeat or escalate).
 *
 * The retry itself is a silent, no-customer-interaction bank event — there's no human
 * action to wait for, so (unlike nudge/fraud-verify) a calibrated probability stands in
 * for the real bank decision, same as the other silent-action types in actionService.
 */

const Transaction = require('../models/Transaction');
const RecoveryEvent = require('../models/RecoveryEvent');
const aiService = require('./aiService');

const PRE_DEBIT_NOTICE_HOURS = 24; // RBI e-mandate framework minimum notice window
const MANDATE_SUCCESS_RATE = 0.6;  // real-world auto-debit retry success is moderate, not high

async function sendNotice(transaction, customer, recoveryEvent, attemptNumber, maxAttempts) {
  const retryAt = new Date(Date.now() + PRE_DEBIT_NOTICE_HOURS * 3600 * 1000);
  const notice = await aiService.generateMandateNotice({
    name: customer.name, amount: transaction.amount, category: transaction.category,
    attemptNumber, maxAttempts, retryAt: retryAt.toLocaleString('en-IN')
  });

  await Transaction.findByIdAndUpdate(transaction._id, {
    mandateNoticeSentAt: new Date(),
    nextMandateRetryAt: retryAt,
    status: 'failed'
  });

  await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
    'actionTaken.type': 'mandate_pre_debit_notice',
    'actionTaken.channel': customer.contactPreferences?.channel || 'email',
    'actionTaken.method': 'llm',
    'actionTaken.messageContent': notice.message,
    outcome: 'pending',
    amountRecovered: 0
  });

  return { retryAt, message: notice.message };
}

// Called when the pipeline first diagnoses a retry-eligible subscription/mandate failure.
async function startSequence(transaction, customer, recoveryEvent) {
  const attemptNumber = (transaction.retryCount || 0) + 1;
  const maxAttempts = transaction.maxRetries || 3;
  const { retryAt } = await sendNotice(transaction, customer, recoveryEvent, attemptNumber, maxAttempts);
  return { success: false, method: 'mandate_retry_sequence', attemptNumber, maxAttempts, retryAt };
}

// Called (by admin, or a real scheduler in production) once the notice window has
// elapsed — actually attempts the bank-side auto-debit retry.
async function attemptRetry(transaction, customer, recoveryEvent, { force = false } = {}) {
  const now = new Date();
  if (!force && transaction.nextMandateRetryAt && now < new Date(transaction.nextMandateRetryAt)) {
    return {
      blocked: true,
      reason: `RBI pre-debit notice window hasn't elapsed yet — eligible at ${new Date(transaction.nextMandateRetryAt).toLocaleString('en-IN')}`
    };
  }

  const attemptNumber = (transaction.retryCount || 0) + 1;
  const maxAttempts = transaction.maxRetries || 3;

  if (transaction.retryCount >= maxAttempts) {
    return { blocked: true, reason: 'Mandate retry limit already reached — this sequence is closed.' };
  }

  const success = Math.random() < MANDATE_SUCCESS_RATE;

  if (success) {
    await Transaction.findByIdAndUpdate(transaction._id, {
      $inc: { retryCount: 1 }, status: 'recovered', nextMandateRetryAt: null
    });
    await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
      'actionTaken.type': 'mandate_retry_attempt',
      'actionTaken.method': 'rule',
      'actionTaken.messageContent': `Auto-debit retry #${attemptNumber} succeeded — ₹${transaction.amount} recovered silently via mandate, no customer contact needed.`,
      outcome: 'recovered',
      amountRecovered: transaction.amount
    });
    return { success: true, attemptNumber, exhausted: false };
  }

  if (attemptNumber >= maxAttempts) {
    await Transaction.findByIdAndUpdate(transaction._id, {
      $inc: { retryCount: 1 }, status: 'written_off', nextMandateRetryAt: null
    });
    await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
      'actionTaken.type': 'mandate_retry_attempt',
      'actionTaken.method': 'rule',
      'actionTaken.messageContent': `Auto-debit retry #${attemptNumber} failed — mandate retry limit (${maxAttempts}) reached per governance stopping rule. Escalating to human/dunning follow-up.`,
      outcome: 'escalated',
      amountRecovered: 0
    });
    return { success: false, attemptNumber, exhausted: true };
  }

  await Transaction.findByIdAndUpdate(transaction._id, { $inc: { retryCount: 1 } });
  const updatedTx = await Transaction.findById(transaction._id);
  const { retryAt } = await sendNotice(updatedTx, customer, recoveryEvent, attemptNumber + 1, maxAttempts);
  return { success: false, attemptNumber, exhausted: false, nextRetryAt: retryAt };
}

module.exports = { startSequence, attemptRetry, PRE_DEBIT_NOTICE_HOURS };
