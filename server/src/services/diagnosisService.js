/**
 * 🔧 Diagnosis Service — Rule-based classification first; LLM only for ambiguous cases.
 *
 * This is a core part of the product story: ~80% of cases are handled by deterministic
 * rules (cheap, fast, reliable). The LLM is invoked ONLY when the error code is not
 * in the known lookup table.
 */

const aiService = require('./aiService');

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 Known error code → bucket lookup table
// These ~80% of cases need no LLM whatsoever
// ─────────────────────────────────────────────────────────────────────────────
const ERROR_CODE_MAP = {
  // Hard declines (card/account blocked, stolen, etc.)
  CARD_EXPIRED: 'hard_decline',
  CARD_STOLEN: 'hard_decline',
  CARD_LOST: 'hard_decline',
  DO_NOT_HONOR: 'hard_decline',
  CARD_BLOCKED: 'hard_decline',
  INVALID_CARD: 'hard_decline',
  CARD_001: 'hard_decline',

  // Soft declines (temporary, retriable)
  INSUFFICIENT_FUNDS: 'soft_decline',
  EXCEED_WITHDRAWAL_LIMIT: 'soft_decline',
  DAILY_LIMIT_EXCEEDED: 'soft_decline',
  CARD_002: 'soft_decline',

  // Auth/OTP friction
  OTP_TIMEOUT: 'auth_friction',
  THREE_D_SECURE_FAILED: 'auth_friction',
  AUTH_REQUIRED: 'auth_friction',
  AUTHENTICATION_FAILED: 'auth_friction',
  OTP_INCORRECT: 'auth_friction',
  CARD_003: 'auth_friction',

  // Fraud false-positive
  FRAUD_BLOCK: 'fraud_fp',
  SUSPECTED_FRAUD: 'fraud_fp',
  VELOCITY_EXCEEDED: 'fraud_fp',
  CARD_004: 'fraud_fp',

  // Infrastructure / gateway issues
  GATEWAY_TIMEOUT: 'infra_glitch',
  NETWORK_ERROR: 'infra_glitch',
  PROCESSOR_DOWN: 'infra_glitch',
  BANK_UNAVAILABLE: 'infra_glitch',
  CARD_005: 'infra_glitch',

  // Cart abandonment — no bank/card signal at all, so there's nothing to silently
  // retry; the customer simply needs a nudge back. Always routed deterministically,
  // never left to the LLM to (mis)judge as a silent-retry case.
  ABANDONED: 'ambiguous'
};

// Failure types explicitly mapped to "ambiguous" to force LLM path (15-20% of cases)
const AMBIGUOUS_CODES = ['UNKNOWN_ERROR', 'CARD_DECLINED', 'TRANSACTION_NOT_PERMITTED', 'ERROR_UNCLEAR'];

/**
 * 🔧 Rule-based classification. Returns bucket or null if ambiguous.
 */
function classifyByRules(errorCode) {
  if (!errorCode) return null;
  const upper = errorCode.toUpperCase();
  if (AMBIGUOUS_CODES.includes(upper)) return null; // Force LLM path
  return ERROR_CODE_MAP[upper] || null;
}

/**
 * Main entry point. Tries rules first; falls back to LLM for ambiguous cases.
 * Returns: { bucket, method: 'rule'|'llm', llmReasoning, confidence }
 */
async function diagnoseTransaction(transaction, customerHistory = []) {
  const ruleBucket = classifyByRules(transaction.errorCode);

  if (ruleBucket) {
    // 🔧 Rule-based — no LLM needed
    return {
      bucket: ruleBucket,
      method: 'rule',
      llmReasoning: null,
      confidence: 1.0
    };
  }

  // 🧠 LLM path — code is ambiguous, needs AI reasoning
  console.log(`[Diagnosis] Ambiguous code "${transaction.errorCode}" — invoking LLM`);
  const result = await aiService.diagnoseAmbiguous({
    errorCode: transaction.errorCode,
    errorMessage: transaction.errorReason || 'Unknown error',
    method: transaction.paymentMethod,
    history: customerHistory.slice(0, 5).map(h => ({
      status: h.status,
      amount: h.amount,
      timestamp: h.timestamp
    })),
    timestamp: transaction.createdAt
  });

  return {
    bucket: result.bucket,
    method: 'llm',
    llmReasoning: result.reasoning,
    confidence: result.confidence
  };
}

module.exports = { diagnoseTransaction, classifyByRules, ERROR_CODE_MAP };
