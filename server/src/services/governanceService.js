/**
 * 🔧 Governance Service — Enforces stopping rules, compliance, and opt-outs.
 * Runs BEFORE any action executes. All blocks are logged even when they prevent action.
 *
 * Rules enforced:
 * - Max retry cap (3 retries per transaction)
 * - Max contact cap (5 reminder touches)
 * - Opt-out suppression
 * - Dispute/chargeback auto-halt
 * - RBI pre-debit notification compliance for mandate retries
 */

const Transaction = require('../models/Transaction');
const RecoveryEvent = require('../models/RecoveryEvent');

const MAX_RETRIES = 3;
const MAX_CONTACTS = 5;

/**
 * 🔧 Check all stopping rules for a transaction.
 * Returns { allowed: boolean, reason: string }
 */
async function checkStoppingRules(transaction, customer, proposedAction) {
  // 1. Opt-out check
  if (customer.contactPreferences && customer.contactPreferences.optedOut) {
    return { allowed: false, reason: 'Customer opted out of all contact' };
  }

  // 2. Max retry cap
  if (transaction.retryCount >= MAX_RETRIES) {
    return { allowed: false, reason: `Max retries reached (${transaction.retryCount}/${MAX_RETRIES})` };
  }

  // 3. Dispute halt — check if any prior recovery event for this transaction flagged dispute
  const disputeEvents = await RecoveryEvent.find({
    transactionId: transaction._id,
    'actionTaken.type': { $in: ['none', 'blocked_governance'] },
    outcome: 'escalated'
  });
  if (disputeEvents.length > 0) {
    return { allowed: false, reason: 'Dispute/chargeback flagged — auto-halted for human handoff' };
  }

  // 4. RBI pre-debit notification compliance
  // For subscription category silent retries, must have sent pre-debit notice first
  if (
    transaction.category === 'subscription' &&
    proposedAction.actionType === 'silent_retry' &&
    transaction.retryCount === 0
  ) {
    // Simulate: check if RBI notice was sent (we mark it as sent after first notification)
    const noticeEvents = await RecoveryEvent.countDocuments({
      transactionId: transaction._id,
      'actionTaken.type': 'nudge_link',
      'actionTaken.channel': { $in: ['whatsapp', 'sms', 'email'] }
    });
    if (noticeEvents === 0) {
      return {
        allowed: false,
        reason: 'RBI compliance: pre-debit notification required before silent mandate retry'
      };
    }
  }

  // 5. Contact frequency cap
  const contactCount = await RecoveryEvent.countDocuments({
    transactionId: transaction._id,
    'actionTaken.channel': { $in: ['whatsapp', 'sms', 'email', 'voice'] },
    outcome: { $ne: 'blocked_stopping_rule' }
  });
  if (contactCount >= MAX_CONTACTS) {
    return { allowed: false, reason: `Contact cap reached (${contactCount}/${MAX_CONTACTS} touches)` };
  }

  return { allowed: true, reason: null };
}

/**
 * 🔧 Check if a dispute intent should halt all recovery
 */
async function handleDisputeIntent(transactionId) {
  await Transaction.findByIdAndUpdate(transactionId, { status: 'written_off' });
  console.log(`[Governance] Dispute detected for tx ${transactionId} — halted, flagged for human handoff`);
  return { halted: true, reason: 'Dispute detected — flagged for human handoff' };
}

/**
 * 🔧 Check promise-to-pay suppression for invoices
 */
function shouldSuppressForPromise(invoice) {
  if (!invoice.promiseToPayDate || !invoice.promiseSuppressed) return false;
  const now = new Date();
  const promiseDate = new Date(invoice.promiseToPayDate);
  return now < promiseDate; // Suppress until promised date
}

module.exports = { checkStoppingRules, handleDisputeIntent, shouldSuppressForPromise, MAX_RETRIES, MAX_CONTACTS };
