/**
 * 🔧 Detection Service — Listens to internal event bus, normalizes payment events,
 * writes to DB, and kicks off the full recovery pipeline.
 *
 * Emits Socket.io events so the dashboard updates in real time.
 */

const Transaction = require('../models/Transaction');
const RecoveryEvent = require('../models/RecoveryEvent');
const Customer = require('../models/Customer');
const diagnosisService = require('./diagnosisService');
const decisionEngine = require('./decisionEngine');
const actionService = require('./actionService');
const governanceService = require('./governanceService');
const mandateService = require('./mandateService');
const eventBus = require('../eventBus');

let io = null; // Injected from index.js

function setSocketIO(socketIO) {
  io = socketIO;
}

function emitLive(event, data) {
  if (io) io.emit(event, data);
}

/**
 * 🔧 Normalize raw webhook payload into Transaction record
 */
function normalizeEvent(payload) {
  const errorCodeMap = {
    expired_card: 'CARD_EXPIRED',
    insufficient_balance: 'INSUFFICIENT_FUNDS',
    otp_timeout: 'OTP_TIMEOUT',
    fraud_block: 'FRAUD_BLOCK',
    gateway_timeout: 'GATEWAY_TIMEOUT',
    ambiguous: 'UNKNOWN_ERROR',
    unclear: 'CARD_DECLINED'
  };

  const errorReasonMap = {
    expired_card: 'Card has expired — customer needs to update payment method',
    insufficient_balance: 'Insufficient balance in account',
    otp_timeout: 'OTP/authentication timed out during checkout',
    fraud_block: 'Transaction blocked by fraud detection system (possible false positive)',
    gateway_timeout: 'Payment gateway timeout — likely transient infrastructure issue',
    ambiguous: 'Unknown decline reason — requires analysis',
    unclear: 'Unclear decline code — requires investigation'
  };

  const forceType = payload.forceFailureType || 'gateway_timeout';
  return {
    errorCode: errorCodeMap[forceType] || 'GATEWAY_TIMEOUT',
    errorReason: errorReasonMap[forceType] || 'Unknown error'
  };
}

/**
 * Main pipeline: detect → diagnose → decide → governance → act
 */
async function processPaymentEvent(payload) {
  try {
    console.log(`[Detection] Processing event: ${payload.event} | tx: ${payload.transactionId}`);

    // Fetch transaction + customer
    const transaction = await Transaction.findById(payload.transactionId);
    if (!transaction) {
      console.error('[Detection] Transaction not found:', payload.transactionId);
      return;
    }

    const customer = await Customer.findById(transaction.customerId);
    if (!customer) {
      console.error('[Detection] Customer not found:', transaction.customerId);
      return;
    }

    // Update transaction error info
    if (!transaction.errorCode) {
      const normalized = normalizeEvent(payload);
      transaction.errorCode = normalized.errorCode;
      transaction.errorReason = normalized.errorReason;
      transaction.status = 'failed';
      await transaction.save();
    }

    // Create initial RecoveryEvent (audit trail entry)
    const recoveryEvent = await RecoveryEvent.create({
      transactionId: transaction._id,
      customerId: customer._id,
      category: transaction.category,
      amount: transaction.amount,
      diagnosis: { bucket: 'pending', method: 'pending' },
      actionTaken: { type: 'none', channel: 'none', method: 'pending' },
      outcome: 'pending'
    });

    // Emit to dashboard immediately
    emitLive('event:detected', {
      recoveryEventId: recoveryEvent._id,
      transactionId: transaction._id,
      customerId: customer._id,
      customer: { name: customer.name, email: customer.email },
      amount: transaction.amount,
      category: transaction.category,
      errorCode: transaction.errorCode,
      errorReason: transaction.errorReason,
      detectedAt: recoveryEvent.detectedAt,
      status: 'detected'
    });

    // ── DIAGNOSIS ──────────────────────────────────────────────────────────
    const historyForDiagnosis = customer.paymentHistory || [];
    const diagnosis = await diagnosisService.diagnoseTransaction(transaction, historyForDiagnosis);

    await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
      diagnosis: {
        bucket: diagnosis.bucket,
        method: diagnosis.method,
        llmReasoning: diagnosis.llmReasoning,
        confidence: diagnosis.confidence
      }
    });

    emitLive('event:diagnosed', {
      recoveryEventId: recoveryEvent._id,
      diagnosis,
      status: 'diagnosed'
    });

    // ── DECISION ───────────────────────────────────────────────────────────
    const decision = decisionEngine.decide(diagnosis, transaction, customer);

    if (decision.blocked) {
      await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
        'actionTaken.type': 'blocked_governance',
        'actionTaken.governanceBlock': decision.blockReason,
        outcome: 'opted_out'
      });
      emitLive('event:blocked', { recoveryEventId: recoveryEvent._id, reason: decision.blockReason });
      return;
    }

    // ── GOVERNANCE ─────────────────────────────────────────────────────────
    const gov = await governanceService.checkStoppingRules(transaction, customer, decision);
    if (!gov.allowed) {
      await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
        'actionTaken.type': 'blocked_governance',
        'actionTaken.governanceBlock': gov.reason,
        outcome: 'blocked_stopping_rule'
      });

      emitLive('event:blocked', {
        recoveryEventId: recoveryEvent._id,
        reason: gov.reason,
        status: 'blocked'
      });
      console.log(`[Governance] Blocked: ${gov.reason}`);
      return;
    }

    // ── ACTION ─────────────────────────────────────────────────────────────
    await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
      'actionTaken.funnelLevel': decision.funnelLevel,
      'actionTaken.type': decision.actionType,
      'actionTaken.channel': decision.channel
    });

    emitLive('event:action_started', {
      recoveryEventId: recoveryEvent._id,
      transactionId: transaction._id,
      customerId: customer._id,
      amount: transaction.amount,
      funnelLevel: decision.funnelLevel,
      actionType: decision.actionType,
      status: 'acting'
    });

    let result;
    const reloadedEvent = await RecoveryEvent.findById(recoveryEvent._id);

    switch (decision.actionType) {
      case 'alt_payment_method':
        result = await actionService.executeAltPaymentMethod(transaction, customer, reloadedEvent);
        break;
      case 'silent_retry':
        result = await actionService.executeSilentRetry(transaction, reloadedEvent);
        break;
      case 'scheduled_retry':
        result = await actionService.executeScheduledRetry(transaction, reloadedEvent);
        break;
      case 'nudge_link':
        result = await actionService.executeNudge(transaction, customer, diagnosis, reloadedEvent);
        break;
      case 'in_app_prompt':
        result = await actionService.executeInAppPrompt(transaction, reloadedEvent);
        break;
      case 'ai_conversation':
      case 'voice_escalation':
        result = await actionService.executeEscalation(transaction, customer, reloadedEvent, decision.funnelLevel);
        break;
      case 'mandate_retry_sequence':
        result = await mandateService.startSequence(transaction, customer, reloadedEvent);
        break;
      default:
        result = { success: false };
    }

    // Fetch final state of recoveryEvent for emit
    const finalEvent = await RecoveryEvent.findById(recoveryEvent._id)
      .populate('transactionId')
      .populate('customerId', 'name email');

    emitLive('event:resolved', {
      recoveryEventId: recoveryEvent._id,
      transactionId: transaction._id,
      customerId: customer._id,
      amount: transaction.amount,
      outcome: finalEvent.outcome,
      amountRecovered: finalEvent.amountRecovered,
      actionTaken: finalEvent.actionTaken,
      diagnosis: finalEvent.diagnosis,
      status: 'resolved'
    });

    console.log(`[Detection] Pipeline complete for tx ${transaction._id} — outcome: ${finalEvent.outcome}`);

  } catch (err) {
    console.error('[Detection] Pipeline error:', err);
  }
}

/**
 * A nudge only sends a payment link — this is what actually closes the loop when
 * the customer genuinely pays. Finds the transaction's pending RecoveryEvent and
 * marks it recovered, then re-emits so both the customer's screen and the admin
 * Dashboard update live.
 */
async function handlePaymentSucceeded({ transactionId, payload }) {
  try {
    const recoveryEvent = await RecoveryEvent.findOne({ transactionId, outcome: 'pending' }).sort({ detectedAt: -1 });
    if (!recoveryEvent) return;

    const amount = recoveryEvent.amount;
    await RecoveryEvent.findByIdAndUpdate(recoveryEvent._id, {
      outcome: 'recovered',
      amountRecovered: amount
    });

    console.log(`[Detection] Real payment succeeded for tx ${transactionId} — RecoveryEvent ${recoveryEvent._id} marked recovered`);

    emitLive('event:resolved', {
      recoveryEventId: recoveryEvent._id,
      transactionId,
      customerId: recoveryEvent.customerId,
      amount,
      outcome: 'recovered',
      amountRecovered: amount,
      actionTaken: recoveryEvent.actionTaken,
      diagnosis: recoveryEvent.diagnosis,
      status: 'resolved'
    });
  } catch (err) {
    console.error('[Detection] payment.succeeded handler error:', err);
  }
}

// Register event bus listener
eventBus.on('payment.failed', processPaymentEvent);
eventBus.on('subscription.charge.failed', processPaymentEvent);
eventBus.on('order.abandoned', processPaymentEvent);
eventBus.on('payment.succeeded', handlePaymentSucceeded);

module.exports = { processPaymentEvent, setSocketIO, emitLive };
