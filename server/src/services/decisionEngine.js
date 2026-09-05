/**
 * 🔧 Decision Engine — Maps diagnosis bucket to recovery funnel level.
 * Pure rules, no LLM required.
 *
 * Funnel Levels:
 *   1 — Silent recovery (no customer contact)
 *   2 — Frictionless nudge (one-tap link)
 *   3 — In-context prompt (in-app)
 *   4 — Two-way AI conversation
 *   5 — Escalation (B2B staged / voice)
 */

const BUCKET_TO_FUNNEL = {
  infra_glitch: 1,     // Silent reroute — no customer contact
  soft_decline: 1,     // Silent scheduled retry near salary date
  hard_decline: 2,     // Nudge: update payment method
  auth_friction: 2,    // Nudge: complete verification
  fraud_fp: 3,         // In-app flag — don't auto-block
  ambiguous: 2         // Default nudge for post-LLM ambiguous
};

const ESCALATION_THRESHOLD_AMOUNT = 5000; // ₹5,000
const ESCALATION_RETRY_COUNT = 2;

/**
 * 🔧 Main decision function.
 * @param {Object} diagnosis - { bucket, method, confidence }
 * @param {Object} transaction - { amount, retryCount, category, ... }
 * @param {Object} customer - { savedPaymentMethods, contactPreferences, segment }
 * @returns {Object} { funnelLevel, actionType, channel, reasoning }
 */
function decide(diagnosis, transaction, customer) {
  const { bucket } = diagnosis;
  const { amount, retryCount, category } = transaction;
  const { savedPaymentMethods = [], contactPreferences = {} } = customer;

  // 🔧 Opt-out check — must be enforced before any decision
  if (contactPreferences.optedOut) {
    return {
      funnelLevel: null,
      actionType: 'none',
      channel: 'none',
      reasoning: 'Customer has opted out of contact — no action taken',
      blocked: true,
      blockReason: 'opted_out'
    };
  }

  // 🔧 Rule: soft decline (temporary funds issue) + alt payment method → silently retry with it.
  // Scoped to soft_decline only — infra/auth/ambiguous cases need their own targeted fix, not a card swap.
  const hasAltMethod = savedPaymentMethods.length > 1;
  if (hasAltMethod && bucket === 'soft_decline' && retryCount === 0) {
    return {
      funnelLevel: 1,
      actionType: 'alt_payment_method',
      channel: 'none',
      reasoning: 'Customer has secondary payment method — attempting silent alt-method retry first'
    };
  }

  // 🔧 Escalation rule: repeated failure + high value → Level 4 or 5
  if (retryCount >= ESCALATION_RETRY_COUNT && amount >= ESCALATION_THRESHOLD_AMOUNT) {
    if (category === 'invoice') {
      return {
        funnelLevel: 5,
        actionType: 'voice_escalation',
        channel: 'voice',
        reasoning: `High-value invoice (₹${amount}) with ${retryCount} retries — escalating to Hinglish voice agent`
      };
    }
    return {
      funnelLevel: 4,
      actionType: 'ai_conversation',
      channel: 'whatsapp',
      reasoning: `High-value payment (₹${amount}) with ${retryCount} retries — escalating to AI-personalized conversation`
    };
  }

  // 🔧 Standard bucket → funnel mapping
  const funnelLevel = BUCKET_TO_FUNNEL[bucket] || 2;

  const actionMap = {
    1: {
      infra_glitch: { actionType: 'silent_retry', channel: 'none' },
      soft_decline: { actionType: 'scheduled_retry', channel: 'none' },
      alt_method: { actionType: 'alt_payment_method', channel: 'none' }
    },
    2: {
      hard_decline: { actionType: 'nudge_link', channel: 'whatsapp' },
      auth_friction: { actionType: 'nudge_link', channel: 'whatsapp' },
      ambiguous: { actionType: 'nudge_link', channel: 'whatsapp' }
    },
    3: {
      fraud_fp: { actionType: 'in_app_prompt', channel: 'in_app' }
    }
  };

  const levelActions = actionMap[funnelLevel] || {};
  const action = levelActions[bucket] || { actionType: 'nudge_link', channel: 'whatsapp' };

  return {
    funnelLevel,
    ...action,
    reasoning: `Bucket "${bucket}" → Level ${funnelLevel} (${action.actionType})`
  };
}

module.exports = { decide, BUCKET_TO_FUNNEL };
