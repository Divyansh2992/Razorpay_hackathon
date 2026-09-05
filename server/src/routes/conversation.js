const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');

// Conversation state (in-memory for hackathon demo)
const conversations = new Map();

// POST /api/conversation/message — chat reply simulator
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message, context } = req.body;
    const session = conversations.get(sessionId) || { history: [], type: 'chat' };

    // 🧠 Classify intent first
    const intentResult = await aiService.classifyReplyIntent({
      replyText: message,
      amount: context?.amount || 5000,
      category: context?.category || 'checkout',
      status: context?.status || 'failed'
    });

    // 🧠 Generate contextual AI response
    const responseResult = await aiService.generateChatResponse({
      systemContext: `The customer had a failed ${context?.category || 'payment'} of ₹${context?.amount || 5000}. 
      Their intent has been classified as: ${intentResult.intent}.
      ${intentResult.intent === 'dispute' ? 'Flag for human handoff — do not pursue further automated recovery.' : ''}
      ${intentResult.intent === 'promise_to_pay' ? 'Acknowledge the commitment and suppress further reminders.' : ''}
      ${intentResult.intent === 'refusal' ? 'Respect their decision and confirm opt-out.' : ''}`,
      conversationHistory: session.history,
      lastMessage: message
    });

    // Update session
    session.history.push({ role: 'customer', content: message });
    session.history.push({ role: 'agent', content: responseResult.message });
    conversations.set(sessionId, session);

    // Determine system action
    let systemAction = null;
    if (intentResult.intent === 'dispute') {
      systemAction = { type: 'halt', message: '🛑 Auto-halted — flagged for human review' };
    } else if (intentResult.intent === 'promise_to_pay') {
      systemAction = { type: 'suppress', message: `✅ Reminders suppressed until ${intentResult.extractedDate || 'promised date'}` };
    } else if (intentResult.intent === 'refusal') {
      systemAction = { type: 'optout', message: '✅ Contact preference updated — no further messages' };
    } else if (intentResult.intent === 'confirmation') {
      systemAction = { type: 'resolve', message: '✅ Payment confirmed — case marked resolved' };
    }

    res.json({
      agentResponse: responseResult.message,
      intent: intentResult.intent,
      extractedDate: intentResult.extractedDate,
      extractedAmount: intentResult.extractedAmount,
      summary: intentResult.summary,
      systemAction,
      isMock: responseResult.isMock,
      history: session.history
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversation/voice-turn — Hinglish voice conversation turn
router.post('/voice-turn', async (req, res) => {
  try {
    const { sessionId, message, amount, daysOverdue } = req.body;
    const session = conversations.get(`voice_${sessionId}`) || { history: [] };

    const result = await aiService.generateVoiceTurn({
      amount: amount || 15000,
      daysOverdue: daysOverdue || 7,
      conversationHistory: session.history,
      lastMessage: message
    });

    session.history.push({ role: 'customer', content: message });
    session.history.push({ role: 'agent', content: result.message });
    conversations.set(`voice_${sessionId}`, session);

    // Also classify intent from customer message
    const intentResult = await aiService.classifyReplyIntent({
      replyText: message,
      amount: amount || 15000,
      category: 'invoice',
      status: 'overdue'
    });

    res.json({
      agentResponse: result.message,
      intent: intentResult.intent,
      extractedDate: intentResult.extractedDate,
      isMock: result.isMock,
      history: session.history
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversation/otp-message — OTP-failure sub-cause classifier + fix
router.post('/otp-message', async (req, res) => {
  try {
    const { sessionId, message, context } = req.body;
    const key = `otp_${sessionId}`;
    const session = conversations.get(key) || { history: [] };

    // 🧠 Classify the specific OTP sub-cause
    const classified = await aiService.classifyOtpIssue({
      replyText: message,
      amount: context?.amount || 2999,
      category: context?.category || 'checkout'
    });

    const ACTION_MAP = {
      not_received:                 { type: 'switch_channel',       message: '🔁 Switched OTP delivery to WhatsApp — resent instantly' },
      entered_correct_still_failing:{ type: 'reroute_bank',         message: '🏦 Bank-side auth flagged as issuer restriction — rerouting to backup acquiring bank for retry' },
      expired:                      { type: 'resend_otp',           message: '⏱️ Fresh OTP sent with a new 5-minute window' },
      multiple_codes:                { type: 'clarify_otp',          message: '📩 Latest OTP re-sent and clearly labeled; earlier codes invalidated' },
      number_changed:               { type: 'update_number_prompt', message: '📱 Number-update link sent — verify new number to receive future OTPs' },
      unclear:                       { type: 'fallback_link',        message: '🔗 Sent an OTP-free payment link (UPI Autopay) as a fallback' }
    };
    const systemAction = ACTION_MAP[classified.intent] || ACTION_MAP.unclear;

    // 🧠 Generate a matching agent reply
    const responseResult = await aiService.generateChatResponse({
      systemContext: `The customer's OTP/authentication step failed on a ₹${context?.amount || 2999} ${context?.category || 'checkout'} payment.
      Diagnosed cause: ${classified.intent} (${classified.summary}).
      You are applying this fix right now: ${systemAction.message.replace(/^[^\w]*/, '')}.
      Reassure them and briefly confirm the fix you just applied.`,
      conversationHistory: session.history,
      lastMessage: message
    });

    session.history.push({ role: 'customer', content: message });
    session.history.push({ role: 'agent', content: responseResult.message });
    conversations.set(key, session);

    res.json({
      agentResponse: responseResult.message,
      intent: classified.intent,
      summary: classified.summary,
      systemAction,
      isMock: classified.isMock || responseResult.isMock,
      history: session.history
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversation/session/:id — get conversation history
router.get('/session/:id', (req, res) => {
  const session = conversations.get(req.params.id) || { history: [] };
  res.json(session);
});

// DELETE /api/conversation/session/:id — reset conversation
router.delete('/session/:id', (req, res) => {
  conversations.delete(req.params.id);
  conversations.delete(`voice_${req.params.id}`);
  res.json({ success: true });
});

module.exports = router;
