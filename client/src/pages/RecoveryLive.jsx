import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';

// ─── Scenario definitions with full recovery metadata ──────────────────────
const RECOVERY_SCENARIOS = [
  // ── CUSTOMER-ACTION NEEDED ────────────────────────────────────────────────
  {
    id: 'CARD_DECLINED_CUSTOMER',
    label: 'Card Declined → Customer Notified',
    category: '👤 Customer Action Needed',
    icon: '💳',
    badge: 'L2',
    badgeColor: '#2561E8',
    requiresCustomer: true,
    customerAction: 'payment_link',
    channel: 'whatsapp',
    failMsg: 'Your card was declined by the issuing bank.',
    errorCode: 'CARD_DECLINED',
    amount: 2999, productName: 'Razorpay Pro Plan',
    tcpLayer: 'Application Layer',
    whatsappMsg: 'Hi {name}! 👋\nYour ₹{amount} payment for {product} didn\'t go through (bank declined).\n\nTry a different card or UPI:\n🔗 {link}\n\nNeed help? Reply here.',
    recovery: { level: 'L2', channel: 'whatsapp', label: 'WhatsApp Nudge — Payment Link' },
    adminSteps: ['Failure: bank hard decline received', 'Rule: CARD_DECLINED → L2 WhatsApp nudge', 'WhatsApp message dispatched to customer', 'Waiting for customer to complete payment…', 'Customer paid via alternate method ✓'],
  },
  {
    id: 'CARD_EXPIRED_CUSTOMER',
    label: 'Expired Card → Update Card Details',
    category: '👤 Customer Action Needed',
    icon: '📅',
    badge: 'L2',
    badgeColor: '#2561E8',
    requiresCustomer: true,
    customerAction: 'card_update',
    channel: 'email',
    failMsg: 'Your card has expired. Update your payment details to complete the transaction.',
    errorCode: 'CARD_EXPIRED',
    amount: 499, productName: 'Cloud Storage 100 GB',
    tcpLayer: 'Application Layer',
    emailSubject: 'Action needed — update your card for Cloud Storage 100 GB',
    emailBody: 'Hi {name},\n\nYour card ending ****{last4} has expired, and your\n₹499 payment for Cloud Storage 100 GB didn\'t go through.\n\nUpdate your card in 30 seconds:',
    recovery: { level: 'L2', channel: 'email', label: 'Email — Card Update Link' },
    adminSteps: ['Failure: card expiry validation failed', 'Rule: CARD_EXPIRED → L2 email with update link', 'Recovery email dispatched', 'Waiting for customer to update card…', 'Card updated — payment retried and collected ✓'],
  },
  {
    id: 'OTP_TIMEOUT_CUSTOMER',
    label: 'OTP Timed Out → Fresh Link',
    category: '👤 Customer Action Needed',
    icon: '⏱️',
    badge: 'L2',
    badgeColor: '#2561E8',
    requiresCustomer: true,
    customerAction: 'payment_link',
    channel: 'whatsapp',
    failMsg: 'Authentication timed out — OTP window expired.',
    errorCode: 'OTP_TIMEOUT',
    amount: 12000, productName: 'API Access — Annual',
    tcpLayer: 'Application Layer',
    whatsappMsg: 'Hi {name}! ⚡\nYour OTP window expired — happens to everyone!\n\nHere\'s a fresh payment link:\n🔗 {link}\n\n✅ Valid for 15 minutes.',
    recovery: { level: 'L2', channel: 'whatsapp', label: 'WhatsApp — Fresh Payment Link' },
    adminSteps: ['3DS OTP session expired (5-min TTL)', 'Rule: OTP_TIMEOUT → L2 WhatsApp fresh link', 'New payment link generated (15-min TTL)', 'WhatsApp dispatched to customer', 'Customer clicked link — payment completed ✓'],
  },
  {
    id: 'FRAUD_VERIFY',
    label: 'Fraud False-Positive → Customer Verify',
    category: '👤 Customer Action Needed',
    icon: '🛡️',
    badge: 'L3',
    badgeColor: '#C08B00',
    requiresCustomer: true,
    customerAction: 'verify',
    channel: 'email',
    failMsg: 'Transaction blocked by fraud detection. Possible false positive.',
    errorCode: 'FRAUD_DETECTED',
    amount: 7500, productName: 'Team Seats (5 users)',
    tcpLayer: 'Application Layer',
    llmDiagnosis: 'Risk score 87/100 triggered block. However: customer has 6 prior successful transactions, device fingerprint matches last 3 sessions, and amount is within historical range. High likelihood of false positive (73%). Recommend: request customer identity verification before retry. Do not hard-block.',
    llmAction: 'REQUEST_VERIFICATION',
    emailSubject: 'Security check required — verify it\'s you',
    emailBody: 'Hi {name},\n\nOur security system flagged your ₹7,500 payment as unusual activity — this may be a false alert.\n\nTo verify it\'s you and complete the payment, click below:',
    recovery: { level: 'L3', channel: 'email', label: 'Email — Identity Verification' },
    adminSteps: ['Fraud Shield: HIGH_RISK (87/100)', 'LLM: Likely false positive — 6 prior txns match profile', 'LLM: Recommend verification instead of hard block', 'Verification email sent to customer', 'Customer verified — payment unblocked and collected ✓'],
  },

  // ── CONVERSATION-BASED (LLM dialogue) ─────────────────────────────────────
  {
    id: 'CUSTOMER_ASKS_WHY',
    label: 'Customer asks "Why did my payment fail?"',
    category: '💬 LLM Conversation',
    icon: '💬',
    badge: 'AI',
    badgeColor: '#6E56CF',
    requiresCustomer: true,
    customerAction: 'conversation',
    channel: 'whatsapp',
    failMsg: 'Card declined — customer replied to recovery message asking for explanation.',
    errorCode: 'CARD_DECLINED',
    amount: 2999, productName: 'Razorpay Pro Plan',
    tcpLayer: 'Application Layer',
    whatsappMsg: 'Hi {name}! 👋\nYour ₹{amount} payment didn\'t go through.\n\nRetry here: 🔗 {link}',
    conversationStarter: 'Why did my payment fail? I have money in my account.',
    llmReply: 'Hi {name}! Your bank declined the payment — this can happen even with sufficient balance if your bank flags a new merchant or transaction pattern.\n\nHere\'s what to do:\n✅ Try UPI (usually works instantly)\n✅ Or call your bank and ask them to allow the transaction\n\nWant me to send a UPI payment link instead? 🔗',
    recovery: { level: 'L4', channel: 'whatsapp', label: 'AI Conversation → Customer Educated' },
    adminSteps: ['WhatsApp sent — customer replied with query', 'LLM classifying intent: WANTS_EXPLANATION', 'LLM generating personalized response…', 'Response sent — customer re-engaging', 'Customer completed payment via UPI ✓'],
  },
  {
    id: 'PAY_LATER',
    label: 'Customer says "I\'ll pay on Friday"',
    category: '💬 LLM Conversation',
    icon: '📅',
    badge: 'AI',
    badgeColor: '#6E56CF',
    requiresCustomer: true,
    customerAction: 'conversation',
    channel: 'whatsapp',
    failMsg: 'Customer responded to recovery message with a promise-to-pay.',
    errorCode: 'INSUFFICIENT_FUNDS',
    amount: 2999, productName: 'Razorpay Pro Plan',
    tcpLayer: 'Application Layer',
    whatsappMsg: 'Hi {name}! 👋\nYour ₹{amount} subscription renewal failed.\n\nRetry now: 🔗 {link}',
    conversationStarter: 'I\'ll pay on Friday, I get paid then.',
    llmReply: 'No problem at all! 👍\n\nI\'ve noted your payment for Friday. I\'ll pause all reminders until then and send you a gentle reminder on Friday morning.\n\nHere\'s your payment link for when you\'re ready:\n🔗 {link2}\n\nSee you Friday! 😊',
    llmExtracted: 'Promise date: Friday (Aug 30). Suppressing all reminders. Auto-follow-up scheduled.',
    recovery: { level: 'L2', channel: 'whatsapp', label: 'Promise-to-Pay Recorded — Reminders Paused' },
    adminSteps: ['WhatsApp recovery message sent', 'Customer replied: "I\'ll pay on Friday"', 'LLM classifying intent: PROMISE_TO_PAY', 'LLM extracted date: Friday Aug 30', 'Reminders suppressed · Follow-up scheduled Aug 30'],
  },
  {
    id: 'HINGLISH',
    label: 'Hinglish Conversation Recovery',
    category: '💬 LLM Conversation',
    icon: '🗣️',
    badge: 'AI',
    badgeColor: '#6E56CF',
    requiresCustomer: true,
    customerAction: 'conversation',
    channel: 'whatsapp',
    failMsg: 'Customer responded in Hinglish to recovery message.',
    errorCode: 'CARD_DECLINED',
    amount: 499, productName: 'Cloud Storage 100 GB',
    tcpLayer: 'Application Layer',
    whatsappMsg: 'Hi {name}! 👋\nAapka ₹{amount} ka payment fail ho gaya.\n\nRetry karein: 🔗 {link}',
    conversationStarter: 'Yaar payment kyon fail hui, sab kuch theek tha mere account mein',
    llmReply: 'Arre {name} bhai! 😊\n\nKoi baat nahi — kabhi kabhi bank naya merchant dekh ke rok deta hai, balance se koi issue nahi.\n\nAb kya karein:\n✅ UPI se try karein — seedha ho jaata hai\n✅ Ya is link se dobara try karein: 🔗 {link2}\n\nKuch aur chahiye? Main yahaan hoon! 🙏',
    recovery: { level: 'L4', channel: 'whatsapp', label: 'Hinglish AI Response → Customer Re-engaged' },
    adminSteps: ['Customer replied in Hinglish', 'LLM: Language detected — Hinglish (Hindi+English)', 'LLM classifying intent: WANTS_EXPLANATION + CONFUSED', 'Generating Hinglish-appropriate response…', 'Customer replied "ok try karta hoon" → payment completed ✓'],
  },
];

const CATEGORY_ORDER = ['👤 Customer Action Needed', '💬 LLM Conversation'];

// ─── Utilities ──────────────────────────────────────────────────────────────
const randSlug = () => Math.random().toString(36).slice(2, 8);

// ─── Admin Recovery Pipeline ─────────────────────────────────────────────────
function AdminPipeline({ steps, currentStep, recovered, failed }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const isDone     = i < currentStep;
        const isActive   = i === currentStep;
        const isLastFail = i === steps.length - 1 && failed;
        const isLastOk   = i === steps.length - 1 && recovered;
        const lineColor  = isLastFail ? 'var(--red)' : isDone ? 'var(--green)' : 'var(--border)';
        const dotColor   = isLastFail ? 'var(--red)' : (isDone || isLastOk) ? 'var(--green)' : isActive ? 'var(--rzp-blue)' : 'var(--text-muted)';
        const dotBg      = isLastFail ? 'var(--red-bg)' : (isDone || isLastOk) ? 'var(--green-bg)' : isActive ? 'var(--rzp-blue-50)' : 'var(--surface-2)';
        const dotBorder  = isLastFail ? '1.5px solid var(--red)' : (isDone || isLastOk) ? '1.5px solid var(--green)' : isActive ? '1.5px solid var(--rzp-blue)' : '1px solid var(--border)';
        return (
          <div key={step} style={{ display: 'flex', gap: 12, paddingBottom: i < steps.length - 1 ? 16 : 0, position: 'relative' }}>
            {i < steps.length - 1 && (
              <div style={{ position: 'absolute', left: 12, top: 25, bottom: 0, width: 1, background: lineColor, transition: 'background 0.4s' }} />
            )}
            <div style={{ width: 25, height: 25, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, transition: 'all 0.3s ease',
              background: dotBg, border: dotBorder, color: dotColor,
              boxShadow: isActive ? '0 0 0 3px rgba(37,97,232,0.1)' : 'none',
            }}>
              {isLastFail ? '✕'
                : (isDone || isLastOk) ? '✓'
                : isActive ? <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid var(--rzp-blue)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                : i + 1}
            </div>
            <div style={{ paddingTop: 2, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: dotColor, transition: 'color 0.3s' }}>{step}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Customer: Conversation panel — real Groq call, not scripted ─────────────
function ConversationPanel({ scenario, customer, onComplete }) {
  const name = customer?.name?.split(' ')[0] || 'Customer';
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [llmTyping, setLlmTyping] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionId] = useState(() => `rl_${scenario.id}_${Date.now().toString(36)}`);
  const endRef = useRef(null);

  useEffect(() => {
    setMessages([{ from: 'agent', text: scenario.whatsappMsg?.replace(/\{name\}/g,name).replace(/\{amount\}/g,scenario.amount.toLocaleString('en-IN')).replace(/\{product\}/g,scenario.productName).replace('{link}',`pay.rzp.io/${randSlug()}`) }]);
    setInput(scenario.conversationStarter || '');
  }, [scenario.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, llmTyping]);

  const send = async () => {
    if (!input.trim() || llmTyping) return;
    const userMsg = input.trim();
    setMessages(m => [...m, { from: 'user', text: userMsg }]);
    setInput('');
    setLlmTyping(true);
    try {
      const inferredCategory = /plan|seats/i.test(scenario.productName || '') ? 'subscription' : 'checkout';
      const res = await axios.post('/api/conversation/message', {
        sessionId, message: userMsg,
        context: { amount: scenario.amount, category: inferredCategory, status: 'failed' }
      });
      setMessages(m => [...m, { from: 'agent', text: res.data.agentResponse }]);
      if (res.data.intent === 'confirmation' || res.data.intent === 'promise_to_pay') {
        setDone(true);
        setTimeout(() => onComplete(true), 900);
      }
    } catch {
      setMessages(m => [...m, { from: 'agent', text: 'Sorry, something went wrong reaching the AI agent. Please try again.' }]);
    }
    setLlmTyping(false);
  };

  return (
    <div style={{ background: '#ECE5DD', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', height: 340 }}>
      <div style={{ background: '#128C7E', color: 'white', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, background: '#25D366', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>R</div>
        <div><div style={{ fontSize: 13, fontWeight: 600 }}>Razorpay Recovery</div><div style={{ fontSize: 10, opacity: 0.8 }}>Groq GPT-OSS 120B · ● Online</div></div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ background: m.from === 'user' ? '#dcf8c6' : '#fff', borderRadius: m.from === 'user' ? '8px 8px 0 8px' : '0 8px 8px 8px', padding: '8px 10px', maxWidth: '80%', fontSize: 12, lineHeight: 1.5, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
              <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{m.text}</pre>
            </div>
          </div>
        ))}
        {llmTyping && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: '#fff', borderRadius: '0 8px 8px 8px', width: 50, alignItems: 'center' }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9E9E9E', animation: `bounce 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!done && (
        <div style={{ padding: 10, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 8, background: '#f0f2f5', flexShrink: 0 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter' && send()} placeholder="Type a reply…"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #E8EDF2', borderRadius: 20, fontSize: 12, outline: 'none', fontFamily: 'inherit', background: 'white' }} />
          <button onClick={send} disabled={!input.trim() || llmTyping}
            style={{ padding: '8px 14px', background: '#25D366', color: 'white', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Send</button>
        </div>
      )}
    </div>
  );
}

// ─── Full dual-panel recovery view (LLM Conversation scenarios only) ─────────
function RecoveryDualPanel({ scenario, customer, onReset }) {
  const [adminStep, setAdminStep] = useState(0);
  const [recovered, setRecovered] = useState(false);
  const [customerDone, setCustomerDone] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    setAdminStep(0); setRecovered(false); setCustomerDone(false);
    let base = 600;
    const t0 = setTimeout(() => setAdminStep(1), base);
    const t1 = setTimeout(() => setAdminStep(2), base + 1200);
    const t2 = setTimeout(() => setAdminStep(3), base + 2200);
    timers.current = [t0, t1, t2];
    return () => timers.current.forEach(clearTimeout);
  }, [scenario.id]);

  const handleCustomerComplete = () => {
    setCustomerDone(true);
    setTimeout(() => { setAdminStep(scenario.adminSteps.length - 1); setRecovered(true); }, 600);
  };

  const BADGE_COLORS = { AI:'#6E56CF', L1:'var(--green)', L2:'var(--rzp-blue)', L3:'#C08B00', L4:'var(--purple)', L5:'var(--red)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: recovered ? 'var(--green-bg)' : 'var(--surface)', border: `1px solid ${recovered ? 'rgba(14,163,113,0.25)' : 'var(--border)'}`, borderRadius: 10, transition: 'all 0.4s ease' }}>
        <span style={{ fontSize: 20 }}>{scenario.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {scenario.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {customer?.name} · ₹{scenario.amount.toLocaleString('en-IN')} · {scenario.productName}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: BADGE_COLORS[scenario.badge], background: `${BADGE_COLORS[scenario.badge]}18`, border: `1px solid ${BADGE_COLORS[scenario.badge]}30`, padding: '3px 8px', borderRadius: 4 }}>{scenario.badge}</span>
        {recovered && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid rgba(14,163,113,0.25)', padding: '4px 10px', borderRadius: 5 }}>✅ RECOVERED · ₹{scenario.amount.toLocaleString('en-IN')}</span>}
        <button onClick={onReset} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>← Change scenario</button>
      </div>

      {/* Dual panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── LEFT: Admin / Merchant View ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rzp-blue)' }} /> Merchant / Admin View
          </div>

          {/* Failure event */}
          <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid rgba(229,72,77,0.2)', borderLeft: '3px solid var(--red)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>❌ Payment Failed</div>
            <div style={{ fontSize: 11, color: '#9B1C1C', lineHeight: 1.5 }}>{scenario.failMsg}</div>
            <div style={{ fontSize: 10, color: '#BE3131', marginTop: 4, fontFamily: 'monospace' }}>errorCode: {scenario.errorCode}</div>
          </div>

          {/* Pipeline */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recovery Pipeline</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: recovered ? 'var(--green)' : 'var(--rzp-blue)', background: recovered ? 'var(--green-bg)' : 'var(--rzp-blue-50)', padding: '2px 8px', borderRadius: 4 }}>
                {recovered ? 'COMPLETE' : 'LIVE'}
              </span>
            </div>
            <div className="card-body">
              <AdminPipeline steps={scenario.adminSteps} currentStep={adminStep} recovered={recovered} />
            </div>
          </div>

          {/* Recovery outcome */}
          {recovered && (
            <div style={{ padding: '12px 14px', background: 'var(--green-bg)', border: '1px solid rgba(14,163,113,0.2)', borderLeft: '3px solid var(--green)', borderRadius: 8, animation: 'slideIn 0.25s ease-out' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>✅ ₹{scenario.amount.toLocaleString('en-IN')} Recovered</div>
              <div style={{ fontSize: 11, color: '#065F46', marginTop: 3 }}>Customer completed payment · Event logged to Dashboard</div>
            </div>
          )}

          {/* Status: awaiting customer */}
          {!recovered && adminStep >= 3 && (
            <div style={{ padding: '10px 14px', background: 'var(--amber-bg)', border: '1px solid rgba(192,139,0,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#78350F' }}>⏳ Awaiting customer action</div>
              <div style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>Recovery message delivered · Waiting for customer to complete payment</div>
            </div>
          )}

          {/* Promise-to-pay extracted */}
          {scenario.id === 'PAY_LATER' && customerDone && (
            <div style={{ padding: '10px 14px', background: 'var(--purple-bg)', border: '1px solid rgba(110,86,207,0.2)', borderRadius: 8, animation: 'slideIn 0.2s ease-out' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>📅 Promise-to-Pay Recorded</div>
              <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 3, lineHeight: 1.5 }}>{scenario.llmExtracted}</div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Customer View ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#25D366' }} />
            {customer?.name || 'Customer'}'s View
          </div>

          <ConversationPanel scenario={scenario} customer={customer} onComplete={handleCustomerComplete} />

          {customerDone && (
            <div style={{ padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid rgba(14,163,113,0.2)', borderRadius: 8, animation: 'slideIn 0.2s ease-out' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>✅ Customer action complete</div>
              <div style={{ fontSize: 11, color: '#065F46', marginTop: 2 }}>Recovery event firing to Dashboard → check Event Stream</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Customer's real device — read-only preview of the actual message sent ───
function DeliveredPreview({ channel, message, customer, outcome, amountRecovered }) {
  if (!message) {
    return (
      <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <div style={{ fontSize: 12 }}>Diagnosing and deciding the recovery action…</div>
      </div>
    );
  }
  const isWhatsapp = channel === 'whatsapp';
  const recovered = outcome === 'recovered';
  const escalated = outcome === 'escalated';
  const CHANNEL_HEADERS = {
    whatsapp: 'Razorpay Recovery · WhatsApp',
    email: `Email to ${customer?.email || 'customer'}`,
    sms: `SMS to ${customer?.phone || 'customer'}`,
    in_app: 'In-App Banner — shown on next login',
  };
  const channelHeader = CHANNEL_HEADERS[channel] || 'Delivered to customer';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: isWhatsapp ? '#ECE5DD' : 'var(--surface)', border: isWhatsapp ? '1px solid rgba(0,0,0,0.08)' : '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: isWhatsapp ? '#128C7E' : 'var(--surface-2)', color: isWhatsapp ? 'white' : 'var(--text-primary)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: isWhatsapp ? '#25D366' : 'var(--rzp-blue-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: isWhatsapp ? 'white' : 'var(--rzp-blue)' }}>R</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{channelHeader}</div>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ background: 'white', borderRadius: isWhatsapp ? '0 8px 8px 8px' : 6, padding: '10px 12px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', boxShadow: isWhatsapp ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', border: isWhatsapp ? 'none' : '1px solid var(--border-light)' }}>{message}</div>
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: recovered ? 'var(--green-bg)' : escalated ? 'var(--red-bg)' : 'var(--amber-bg)', border: `1px solid ${recovered ? 'rgba(14,163,113,0.2)' : escalated ? 'rgba(229,72,77,0.2)' : 'rgba(192,139,0,0.2)'}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: recovered ? 'var(--green)' : escalated ? 'var(--red)' : '#78350F' }}>
          {recovered ? `✅ Recovered · ₹${Number(amountRecovered).toLocaleString('en-IN')}` : escalated ? '🛑 Blocked — flagged as fraud' : '⏳ Awaiting payment'}
        </div>
        <div style={{ fontSize: 11, color: recovered ? '#065F46' : escalated ? '#9B1C1C' : '#92400E', marginTop: 2 }}>
          {recovered ? 'Customer completed payment on their own device.' : escalated ? 'Customer said "not me" on their own device — no charge made.' : "Delivered to the customer's own device — watch it complete live on their Store tab."}
        </div>
      </div>
    </div>
  );
}

// ─── Full dual-panel view, driven entirely by the REAL pipeline ──────────────
// Used for the 4 "Customer Action Needed" scenarios: triggers a real Transaction,
// runs the same diagnosis→decision→governance→action chain the live store uses,
// and reflects real Socket.io events — no scripted timers, no fake customer form.
function RecoveryDualPanelLive({ scenario, customer, onReset }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [action, setAction] = useState(null); // { type, channel }
  const [messageContent, setMessageContent] = useState(null);
  const [outcome, setOutcome] = useState('pending');
  const [amountRecovered, setAmountRecovered] = useState(0);
  const [transactionId, setTransactionId] = useState(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const recoveryEventIdRef = useRef(null);
  const firedKeyRef = useRef(null);

  useEffect(() => {
    // StrictMode double-invokes effects in dev — guard against firing this real,
    // side-effecting trigger twice for the same scenario+customer combination.
    const key = `${scenario.id}:${customer?._id}`;
    if (firedKeyRef.current === key) return;
    firedKeyRef.current = key;

    setDiagnosis(null); setAction(null); setMessageContent(null);
    setOutcome('pending'); setAmountRecovered(0); setTransactionId(null);
    setIdentityConfirmed(false);
    recoveryEventIdRef.current = null;

    const inferredCategory = /plan|seats/i.test(scenario.productName || '') ? 'subscription' : 'checkout';
    axios.post('/api/recovery-live/trigger', {
      customerId: customer._id, errorCode: scenario.errorCode, errorReason: scenario.failMsg,
      amount: scenario.amount, category: inferredCategory
    }).then(res => setTransactionId(res.data.transactionId)).catch(() => {});
  }, [scenario.id, customer?._id]);

  useSocket((type, data) => {
    if (type === 'detected') {
      if (transactionId && String(data.transactionId) === String(transactionId)) {
        recoveryEventIdRef.current = data.recoveryEventId;
      }
      return;
    }
    if (!recoveryEventIdRef.current || String(data.recoveryEventId) !== String(recoveryEventIdRef.current)) return;
    if (type === 'diagnosed') setDiagnosis(data.diagnosis);
    if (type === 'action_started') {
      setAction({ type: data.actionType });
      if (data.status === 'verified') setIdentityConfirmed(true);
    }
    if (type === 'resolved') {
      setAction({ type: data.actionTaken?.type, channel: data.actionTaken?.channel });
      setMessageContent(data.actionTaken?.messageContent);
      setOutcome(data.outcome);
      setAmountRecovered(data.amountRecovered);
    }
  });

  const recovered = outcome === 'recovered';
  const escalated = outcome === 'escalated';
  const isVerificationGate = action?.type === 'in_app_prompt';
  const lastStepLabel = recovered
    ? `Recovered ✓ · ₹${Number(amountRecovered).toLocaleString('en-IN')}`
    : escalated
      ? '❌ Customer said "not me" — escalated to fraud review, blocked'
      : isVerificationGate && !identityConfirmed
        ? 'Awaiting customer to verify their identity…'
        : 'Awaiting customer to complete payment…';
  const steps = [
    'Failure event received',
    diagnosis ? `Diagnosed: ${diagnosis.bucket} (${diagnosis.method === 'llm' ? 'LLM diagnosis' : 'rule'})` : 'Diagnosing…',
    action ? `Action: ${action.type}${action.channel ? ' via ' + action.channel : ''}` : 'Deciding recovery action…',
    ...(isVerificationGate ? [identityConfirmed ? '✓ Customer confirmed their identity' : 'Awaiting customer verification…'] : []),
    lastStepLabel,
  ];
  const currentStep = !transactionId ? 0
    : !diagnosis ? 1
    : !action ? 2
    : (recovered || escalated) ? steps.length
    : (isVerificationGate && !identityConfirmed) ? 3
    : steps.length - 1;
  const BADGE_COLORS = { AI:'#6E56CF', L1:'var(--green)', L2:'var(--rzp-blue)', L3:'#C08B00', L4:'var(--purple)', L5:'var(--red)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: recovered ? 'var(--green-bg)' : escalated ? 'var(--red-bg)' : 'var(--surface)', border: `1px solid ${recovered ? 'rgba(14,163,113,0.25)' : escalated ? 'rgba(229,72,77,0.25)' : 'var(--border)'}`, borderRadius: 10, transition: 'all 0.4s ease' }}>
        <span style={{ fontSize: 20 }}>{scenario.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{scenario.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {customer?.name} · ₹{scenario.amount.toLocaleString('en-IN')} · {scenario.productName}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: BADGE_COLORS[scenario.badge], background: `${BADGE_COLORS[scenario.badge]}18`, border: `1px solid ${BADGE_COLORS[scenario.badge]}30`, padding: '3px 8px', borderRadius: 4 }}>{scenario.badge}</span>
        {recovered && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid rgba(14,163,113,0.25)', padding: '4px 10px', borderRadius: 5 }}>✅ RECOVERED · ₹{Number(amountRecovered).toLocaleString('en-IN')}</span>}
        {escalated && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid rgba(229,72,77,0.25)', padding: '4px 10px', borderRadius: 5 }}>🛑 BLOCKED — FRAUD REVIEW</span>}
        <button onClick={onReset} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>← Change scenario</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ── LEFT: real pipeline status ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rzp-blue)' }} /> Merchant / Admin View — real pipeline
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid rgba(229,72,77,0.2)', borderLeft: '3px solid var(--red)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>❌ Payment Failed</div>
            <div style={{ fontSize: 11, color: '#9B1C1C', lineHeight: 1.5 }}>{scenario.failMsg}</div>
            <div style={{ fontSize: 10, color: '#BE3131', marginTop: 4, fontFamily: 'monospace' }}>errorCode: {scenario.errorCode}</div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recovery Pipeline</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: recovered ? 'var(--green)' : escalated ? 'var(--red)' : 'var(--rzp-blue)', background: recovered ? 'var(--green-bg)' : escalated ? 'var(--red-bg)' : 'var(--rzp-blue-50)', padding: '2px 8px', borderRadius: 4 }}>
                {recovered ? 'COMPLETE' : escalated ? 'BLOCKED' : 'LIVE'}
              </span>
            </div>
            <div className="card-body">
              <AdminPipeline steps={steps} currentStep={currentStep} recovered={recovered} failed={escalated} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: what the customer sees on their own device ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#25D366' }} /> 📲 On {customer?.name || 'the customer'}'s own device
          </div>
          <DeliveredPreview channel={action?.channel} message={messageContent} customer={customer} outcome={outcome} amountRecovered={amountRecovered} />
        </div>
      </div>
    </div>
  );
}

// ─── Scenario picker card ─────────────────────────────────────────────────────
function ScenarioCard({ sc, disabled, onClick, badgeColor }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 12,
        border: `1.5px solid ${hover && !disabled ? badgeColor : 'var(--border)'}`,
        background: 'var(--surface)', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
        transform: hover && !disabled ? 'translateY(-2px)' : 'none',
        boxShadow: hover && !disabled ? '0 8px 20px rgba(0,0,0,0.08)' : 'none',
        fontFamily: 'inherit',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${badgeColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{sc.icon}</div>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: badgeColor, background: `${badgeColor}15`, border: `1px solid ${badgeColor}30`, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>{sc.badge}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>{sc.label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>₹{sc.amount.toLocaleString('en-IN')} · {sc.productName}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: badgeColor, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        Launch <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function RecoveryLive() {
  const [customers,        setCustomers]        = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [activeView,       setActiveView]       = useState('picker'); // picker | panel

  useEffect(() => {
    axios.get('/api/checkout/customers').then(r => {
      const list = r.data || [];
      setCustomers(list);
      if (list.length) setSelectedCustomer(list[0]._id);
    }).catch(() => {});
  }, []);

  const customer = customers.find(c => c._id === selectedCustomer);

  const handleLaunch = (sc) => { setSelectedScenario(sc); setActiveView('panel'); };
  const handleReset  = () => { setActiveView('picker'); setSelectedScenario(null); };

  const grouped = CATEGORY_ORDER.map(cat => ({ cat, items: RECOVERY_SCENARIOS.filter(s => s.category === cat) }));
  const BADGE_COLORS = { AI:'#6E56CF', L1:'var(--green)', L2:'var(--rzp-blue)', L3:'#C08B00', L4:'var(--purple)', L5:'var(--red)' };

  return (
    <>
      <style>{`
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce  { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes modalIn { from{opacity:0;transform:scale(0.96) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
      `}</style>

      {activeView === 'picker' && (
        <div style={{ maxWidth: 1100, display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Customer selector */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">🎯 Recovery Live — Choose a scenario to simulate</div>
                  <div className="card-subtitle">Pick a customer and a failure type to see the full admin + customer recovery process</div>
                </div>
              </div>
              <div className="card-body">
                <label className="label">Customer</label>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className="select" id="rl-customer">
                  {customers.map(c => <option key={c._id} value={c._id}>{c.name} · {c.email} · {c.segment}</option>)}
                </select>
                {customer && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                    <span>📱 {customer.phone}</span>
                    <span>💳 {customer.savedPaymentMethods?.length || 0} saved method(s)</span>
                    <span>📣 {customer.contactPreferences?.channel}</span>
                    {(customer.savedPaymentMethods?.length || 0) > 1 && <span style={{ color: 'var(--green)', fontWeight: 600 }}>→ Alt-card eligible</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Scenario groups */}
            {grouped.map(({ cat, items }) => (
              <div key={cat} className="card">
                <div className="card-header">
                  <div className="card-title">{cat}</div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{items.length} scenarios</span>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {cat === '👤 Customer Action Needed' && (
                    <div className="infobox infobox-blue" style={{ fontSize: 11 }}>
                      👤 Launching one of these fires a real transaction through the recovery pipeline — the message and payment link genuinely appear on that customer's own Store session.
                    </div>
                  )}
                  {cat === '💬 LLM Conversation' && (
                    <div className="infobox infobox-green" style={{ fontSize: 11 }}>
                      💬 The AI converses with the customer in natural language (including Hinglish). Type the pre-filled reply or edit it to test different customer responses.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {items.map(sc => (
                      <ScenarioCard key={sc.id} sc={sc} disabled={!selectedCustomer}
                        badgeColor={BADGE_COLORS[sc.badge]}
                        onClick={() => { if (!selectedCustomer) return; handleLaunch(sc); }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <div className="card-header"><div className="card-title">📖 How it works</div></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                {[
                  { icon:'👤', title:'Customer Action', desc:'AI sends a notification. Recovery stays pending until customer acts on the right panel.' },
                  { icon:'💬', title:'LLM Conversation', desc:'Customer replies in natural language — LLM extracts intent and responds appropriately.' },
                ].map(r => (
                  <div key={r.title} style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{r.icon} {r.title}</div>
                    <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">⚡ Recovery Levels</div></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['L1','var(--green)','Silent retry — customer unaware'],['L2','var(--rzp-blue)','WhatsApp/email nudge'],['L3','#C08B00','In-app + verification'],['L4','var(--purple)','AI conversation'],['L5','var(--red)','Voice / manual review'],['AI','#6E56CF','LLM auto-diagnosed']].map(([l,c,d]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ fontWeight: 800, color: c, width: 22 }}>{l}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'panel' && selectedScenario && (
        <div style={{ maxWidth: 1200 }}>
          {selectedScenario.customerAction === 'conversation'
            ? <RecoveryDualPanel scenario={selectedScenario} customer={customer} onReset={handleReset} />
            : <RecoveryDualPanelLive scenario={selectedScenario} customer={customer} onReset={handleReset} />}
        </div>
      )}
    </>
  );
}
