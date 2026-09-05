/**
 * 🧠 AI Service — All Groq calls are centralized here.
 * Uses a model exposed by the configured Groq account for inference.
 */

const Groq = require('groq-sdk');

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

async function callGroq(systemPrompt, userMessage) {
  const groq = getClient();
  if (!groq) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 512
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Groq returned an empty response');
    return content;
  } catch (error) {
    console.error(`[AI Service] Groq request failed: ${error.message}`);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 FR-2.2: Ambiguous failure diagnosis
// ─────────────────────────────────────────────────────────────────────────────
async function diagnoseAmbiguous({ errorCode, errorMessage, method, history, timestamp }) {
  const systemPrompt = `You are a payment failure diagnosis assistant for a fintech recovery system.
Given the failure context below, classify it into exactly one bucket:
hard_decline, soft_decline, auth_friction, fraud_fp, or infra_glitch.
Return ONLY valid JSON with no markdown: {"bucket": "...", "reasoning": "...", "confidence": 0.0-1.0}`;

  const userMessage = `Error code: ${errorCode}
Error message: ${errorMessage}
Payment method: ${method}
Customer past 5 transactions: ${JSON.stringify(history)}
Time of failure: ${timestamp}`;

  const raw = await callGroq(systemPrompt, userMessage);

  if (!raw) {
    const mockBuckets = ['soft_decline', 'auth_friction', 'hard_decline'];
    const bucket = mockBuckets[Math.floor(Math.random() * mockBuckets.length)];
    return {
      bucket,
      reasoning: `Error code ${errorCode} does not match standard Razorpay decline codes. Customer's payment history shows ${history.length} recent transactions — the unusual code combined with prior successful payments suggests a temporary issuer-side restriction or velocity flag rather than a true hard decline.`,
      confidence: 0.74,
      method: 'llm', isMock: true
    };
  }

  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return { ...parsed, method: 'llm', isMock: false };
  } catch {
    return { bucket: 'ambiguous', reasoning: raw, confidence: 0.5, method: 'llm', isMock: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 FR-2.3 + FR-2.4: Customer reply intent classification
// ─────────────────────────────────────────────────────────────────────────────
async function classifyReplyIntent({ replyText, amount, category, status }) {
  const systemPrompt = `You are classifying a customer's reply to a payment recovery message for an Indian fintech company.
Return ONLY valid JSON with no markdown:
{"intent": "dispute|promise_to_pay|confusion|confirmation|refusal", "extractedDate": "YYYY-MM-DD or null", "extractedAmount": number_or_null, "summary": "one concise line"}`;

  const userMessage = `Customer reply: "${replyText}"
Context: follow-up on ₹${amount} ${category} that was ${status}.`;

  const raw = await callGroq(systemPrompt, userMessage);

  if (!raw) {
    const text = replyText.toLowerCase();
    let intent = 'confusion';
    let extractedDate = null;
    if (text.includes('already paid') || text.includes('wrong') || text.includes('dispute') || text.includes('check again')) {
      intent = 'dispute';
    } else if (text.includes('friday') || text.includes('monday') || text.includes('next week') || text.includes('pay by') || text.includes('will pay') || text.includes('give me')) {
      intent = 'promise_to_pay';
      const d = new Date(); d.setDate(d.getDate() + 3);
      extractedDate = d.toISOString().split('T')[0];
    } else if (text.includes('ok') || text.includes('done') || text.includes('paid') || text.includes('yes') || text.includes('transferred')) {
      intent = 'confirmation';
    } else if (text.includes('no') || text.includes('stop') || text.includes('cancel') || text.includes('refuse') || text.includes('unsubscribe')) {
      intent = 'refusal';
    }
    return { intent, extractedDate, extractedAmount: null, summary: `Customer reply classified as ${intent}`, method: 'llm', isMock: true };
  }

  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return { ...parsed, method: 'llm', isMock: false };
  } catch {
    return { intent: 'confusion', extractedDate: null, extractedAmount: null, summary: raw, method: 'llm', isMock: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 OTP-failure sub-cause classification (customer explains what went wrong)
// ─────────────────────────────────────────────────────────────────────────────
async function classifyOtpIssue({ replyText, amount, category }) {
  const systemPrompt = `You are diagnosing why a customer's OTP/authentication step failed during a payment, for an Indian fintech platform.
Return ONLY valid JSON with no markdown:
{"intent": "not_received|expired|entered_correct_still_failing|multiple_codes|number_changed|unclear", "summary": "one concise line"}
- not_received: OTP never arrived on their phone
- expired: OTP arrived but the timer/window ran out before they could enter it
- entered_correct_still_failing: they entered the right OTP but the bank still rejected it
- multiple_codes: they received more than one OTP and are unsure which is valid
- number_changed: their registered phone number is no longer active/correct
- unclear: doesn't clearly match any of the above`;

  const userMessage = `Customer message: "${replyText}"
Context: OTP/authentication step failed on a ₹${amount} ${category} payment.`;

  const raw = await callGroq(systemPrompt, userMessage);

  if (!raw) {
    const text = replyText.toLowerCase();
    let intent = 'unclear';
    if (text.includes('nahi aaya') || text.includes("didn't receive") || text.includes('did not receive') || text.includes('no otp') || text.includes("haven't received") || text.includes('never got') || text.includes('never received')) {
      intent = 'not_received';
    } else if (text.includes('correct') || text.includes('sahi tha') || text.includes('right otp') || text.includes('still fail') || text.includes('still failing') || text.includes('phir bhi fail')) {
      intent = 'entered_correct_still_failing';
    } else if (text.includes('expired') || text.includes('time out') || text.includes('timed out') || text.includes('khatam') || text.includes('too late') || text.includes('ran out')) {
      intent = 'expired';
    } else if (text.includes('two otp') || text.includes('do otp') || text.includes('two codes') || text.includes('multiple') || text.includes('which one') || text.includes('konsa')) {
      intent = 'multiple_codes';
    } else if (text.includes('number change') || text.includes('naya number') || text.includes('new number') || text.includes('old number') || text.includes("don't have that number") || text.includes('different number')) {
      intent = 'number_changed';
    }
    return { intent, summary: `Customer message classified as ${intent}`, method: 'llm', isMock: true };
  }

  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return { ...parsed, method: 'llm', isMock: false };
  } catch {
    return { intent: 'unclear', summary: raw, method: 'llm', isMock: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 FR-3.7: Personalized nudge message for WhatsApp/SMS/Email
// ─────────────────────────────────────────────────────────────────────────────
async function generateNudgeMessage({ name, reason, amount, retryCount, category, channel, isRepeatCustomer }) {
  const channelInstructions = {
    whatsapp: 'Write a WhatsApp message. Include a payment link placeholder [PAYMENT_LINK]. Keep it conversational.',
    sms: 'Write an SMS under 160 chars. Include a short link placeholder [LINK].',
    email: 'Write a brief email subject and body (2-3 sentences). Format as Subject: ... | Body: ...'
  };

  const toneGuidance = retryCount === 0 ? 'friendly and helpful first outreach' :
    retryCount === 1 ? 'slightly more direct but still warm, second attempt' :
    'firm and professional, this is the third attempt';

  const loyaltyInstruction = isRepeatCustomer
    ? 'This customer is a loyal repeat customer (2+ prior successful payments). As a goodwill gesture to win them back, offer a 10% loyalty discount using code LOYAL10 on this payment.'
    : '';

  const systemPrompt = `You are writing a payment recovery message for an Indian fintech platform (Razorpay).
${channelInstructions[channel] || channelInstructions.whatsapp}
Tone: ${toneGuidance}. Include the customer name, amount in ₹, and a single clear call-to-action.
${loyaltyInstruction}
Do NOT use ALL CAPS or excessive exclamation marks. Write in natural Indian English.
Return ONLY the message text.`;

  const userMessage = `Customer: ${name}
Failure reason: ${reason}
Amount: ₹${amount}
Category: ${category}
Attempt #${retryCount + 1}
Repeat customer: ${isRepeatCustomer ? 'yes' : 'no'}`;

  const raw = await callGroq(systemPrompt, userMessage);

  if (!raw) {
    const discountLine = isRepeatCustomer ? `\n\n🎁 As a thank-you for being a loyal customer, use code LOYAL10 for 10% off this payment!` : '';
    const channelMocks = {
      whatsapp: [
        `Hi ${name}! 👋 Your ₹${amount} payment didn't go through. Complete it in one tap: [PAYMENT_LINK]\n\nTakes 30 seconds. Let us know if you need help!${discountLine}`,
        `Hey ${name}, your ₹${amount} ${category} payment is still pending. Here's your secure link to complete it: [PAYMENT_LINK]${discountLine}`,
        `${name}, we've noticed your ₹${amount} payment hasn't come through. Please update your payment details here: [PAYMENT_LINK]${discountLine}`
      ],
      sms: [
        `Hi ${name}, your ₹${amount} payment failed. Complete it: [LINK] - Razorpay${isRepeatCustomer ? ' Use LOYAL10 for 10% off!' : ''}`,
        `${name}: ₹${amount} payment pending. Retry here: [LINK]${isRepeatCustomer ? ' Code LOYAL10 = 10% off' : ''}`
      ],
      email: [
        `Subject: Action required — ₹${amount} payment needs attention | Body: Hi ${name}, your recent ₹${amount} payment didn't go through. Please click the link below to complete your payment at your earliest convenience.${discountLine}`
      ]
    };
    const msgs = channelMocks[channel] || channelMocks.whatsapp;
    return { message: msgs[Math.min(retryCount, msgs.length - 1)], method: 'llm', isMock: true };
  }

  return { message: raw.trim(), method: 'llm', isMock: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 FR-3.9: Hinglish voice conversation turn
// ─────────────────────────────────────────────────────────────────────────────
async function generateVoiceTurn({ amount, daysOverdue, conversationHistory, lastMessage }) {
  const systemPrompt = `You are a polite recovery agent for an Indian B2B company, speaking in Hinglish (natural Hindi-English mix).
The overdue invoice is ₹${amount}, ${daysOverdue} days past due.
Goals: Get a payment commitment date. Be respectful. If customer mentions financial difficulty, offer a longer date.
Keep response under 50 words. Return only the agent's dialogue.`;

  const historyText = conversationHistory.slice(-4).map(m => `${m.role === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`).join('\n');
  const userMessage = `${historyText}\nCustomer: "${lastMessage}"`;

  const raw = await callGroq(systemPrompt, userMessage);

  if (!raw) {
    const mocks = [
      `Namaskar ${conversationHistory.length === 0 ? '' : ''}! Aapka ₹${amount} ka invoice due tha. Kya aap is hafte complete kar sakte hain? Main aapko convenient payment link bhej sakta hoon.`,
      `Bilkul samajhta hoon. Cash flow issues hote hain. Kya Friday tak ho sakta hai? Agar nahi, main 10 din ka extension de sakta hoon.`,
      `Theek hai, main Friday reminder set kar deta hoon. Aapke liye payment link WhatsApp pe bhej raha hoon. Koi problem ho toh batayein.`
    ];
    return { message: mocks[Math.min(conversationHistory.length, mocks.length - 1)], method: 'llm', isMock: true };
  }

  return { message: raw.trim(), method: 'llm', isMock: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 Chat conversation handler
// ─────────────────────────────────────────────────────────────────────────────
async function generateChatResponse({ systemContext, conversationHistory, lastMessage }) {
  const systemPrompt = `You are an AI recovery agent for Razorpay handling customer messages about failed payments.
${systemContext}
Be concise (under 60 words), empathetic, and solution-focused. Write in natural Indian English.`;

  const historyText = conversationHistory.slice(-6).map(m => `${m.role === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`).join('\n');
  const userMessage = `${historyText}\nCustomer: "${lastMessage}"`;

  const raw = await callGroq(systemPrompt, userMessage);

  if (!raw) {
    return { message: `I understand your concern. Let me look into your payment right away and get this resolved for you quickly.`, method: 'llm', isMock: true };
  }

  return { message: raw.trim(), method: 'llm', isMock: false };
}

module.exports = {
  diagnoseAmbiguous,
  classifyReplyIntent,
  classifyOtpIssue,
  generateNudgeMessage,
  generateVoiceTurn,
  generateChatResponse
};
