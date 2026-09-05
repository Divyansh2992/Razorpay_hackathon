import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useNotifications } from '../hooks/useNotifications';

// ─── Product catalogue ────────────────────────────────────────────────────────
const STORE_PRODUCTS = [
  {
    id: 'prod_001', name: 'Razorpay Pro Plan', price: 2999, category: 'subscription',
    icon: '⚡', color: '#2561E8', badge: 'Most Popular',
    desc: 'Unlimited API calls · Priority support · Advanced analytics',
    features: ['Unlimited API calls', 'Priority 24/7 support', 'Advanced analytics dashboard', 'Custom webhooks'],
    emoji: '🚀',
  },
  {
    id: 'prod_002', name: 'Cloud Storage 100 GB', price: 499, category: 'checkout',
    icon: '☁️', color: '#0EA371', badge: null,
    desc: 'Instant top-up · Never run out of storage',
    features: ['100 GB cloud storage', 'Auto-sync across devices', 'File versioning', '99.9% uptime SLA'],
    emoji: '💾',
  },
  {
    id: 'prod_003', name: 'API Access — Annual', price: 12000, category: 'checkout',
    icon: '🔌', color: '#6E56CF', badge: 'Best Value',
    desc: 'Annual plan · Priority support · Save 33% vs monthly',
    features: ['Full API access (all endpoints)', 'Priority support SLA <2h', 'Rate limit: 10k req/min', 'Dedicated account manager'],
    emoji: '🔑',
  },
  {
    id: 'prod_004', name: 'Team Seats — 5 Users', price: 7500, category: 'subscription',
    icon: '👥', color: '#C08B00', badge: null,
    desc: 'Monthly · Admin panel · SSO included',
    features: ['5 user seats', 'Admin control panel', 'SSO / SAML support', 'Audit logs & compliance'],
    emoji: '🏢',
  },
];

// ─── Real Razorpay Checkout.js widget — genuine test-mode payment ────────────
function openRazorpay({ keyId, orderId, amount, customer, productName, onSuccess, onFailed, onDismissed }) {
  if (!keyId || keyId.includes('placeholder') || !window.Razorpay) {
    // Fallback only if no real key is configured — keeps the demo usable either way
    const ok = window.confirm(`[No Razorpay key configured] Simulate checkout for ${productName} ₹${amount}?\nOK = Success · Cancel = Failed`);
    if (ok) onSuccess({ razorpay_order_id: orderId, razorpay_payment_id: `pay_mock_${Date.now()}`, razorpay_signature: 'mock_sig' });
    else onFailed({ code: 'BAD_REQUEST_ERROR', description: 'Your card was declined.' });
    return;
  }
  // Razorpay's own widget can report payment.failed more than once for the same checkout
  // session — e.g. its built-in "try again" screen re-submitting the same attempt — and
  // calls modal.ondismiss whenever the widget closes, including AFTER a failure it already
  // reported. This guard makes sure only the FIRST failure (or dismissal, or success) for
  // this widget session ever reaches the backend, so one real incident produces one event.
  let settled = false;
  const rzp = new window.Razorpay({
    key: keyId,
    amount: amount * 100,
    currency: 'INR',
    name: 'Razorpay Store',
    description: productName,
    order_id: orderId,
    prefill: { name: customer.name, email: customer.email, contact: customer.phone || '9999999999' },
    theme: { color: '#2561E8' },
    modal: { ondismiss: () => { if (!settled) { settled = true; onDismissed(); } } },
    handler: (resp) => { settled = true; onSuccess(resp); },
  });
  rzp.on('payment.failed', r => { if (!settled) { settled = true; onFailed(r.error); } });
  rzp.open();
}

// ─── OTP-failure AI help — for when a real Razorpay test-mode OTP attempt fails ─
function OtpHelpChat() {
  const [expanded, setExpanded] = useState(false);
  const [msgs, setMsgs] = useState([{ role: 'agent', content: "Had trouble with an OTP on a recent payment? Tell me what happened and I'll help live." }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [sessionId] = useState(() => `otp_store_${Date.now().toString(36)}`);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    setInput('');
    setMsgs(p => [...p, { role: 'customer', content: text }]);
    setLoading(true);
    try {
      const res = await axios.post('/api/conversation/otp-message', {
        sessionId, message: text, context: { amount: 0, category: 'checkout' }
      });
      setMsgs(p => [...p, { role: 'agent', content: res.data.agentResponse }]);
      setLastAction(res.data.systemAction);
    } catch {
      setMsgs(p => [...p, { role: 'agent', content: 'Sorry, something went wrong reaching the AI agent.' }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ border: '1px solid #E8EDF2', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        background: '#F4F0FF', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <span style={{ fontSize: 13 }}>🧠</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6E56CF' }}>Had an OTP or bank-auth issue? Ask AI</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6E56CF' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: 12, background: '#fff' }}>
          <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 8 }}>
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'agent' ? 'chat-msg-agent' : 'chat-msg-customer'} style={{ marginBottom: 8 }}>
                <div className="chat-avatar" style={{ background: m.role === 'agent' ? 'var(--rzp-blue)' : 'var(--border)', color: m.role === 'agent' ? 'white' : 'var(--text-secondary)', width: 24, height: 24, fontSize: 11 }}>
                  {m.role === 'agent' ? '⚡' : '👤'}
                </div>
                <div className={m.role === 'agent' ? 'chat-bubble-agent' : 'chat-bubble-customer'} style={{ fontSize: 12 }}>{m.content}</div>
              </div>
            ))}
            {loading && <div style={{ fontSize: 11, color: '#8B94A5', paddingLeft: 32 }}>Diagnosing…</div>}
          </div>
          {lastAction && (
            <div style={{ fontSize: 11, color: '#0EA371', background: '#EDFBF5', borderRadius: 6, padding: '6px 9px', marginBottom: 8 }}>
              ✅ {lastAction.message}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={() => send("I never received any OTP on my phone")} disabled={loading} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>OTP hasn't come</button>
            <button onClick={() => send("I entered the correct OTP but it still failed")} disabled={loading} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>Entered correct OTP, still failing</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Or type what happened..." className="input" style={{ flex: 1, fontSize: 12 }} />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="btn btn-primary btn-sm">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Floating AI assistant — free-form chat, ask anything any time ───────────
function RecoveryChatWidget({ context }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [sessionId] = useState(() => `store_${Date.now().toString(36)}`);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading, open]);

  const hasActiveFailure = !!context.transactionId && !!context.errorCode;

  const send = async (text) => {
    if (!text.trim() || loading) return;
    setInput('');
    setMsgs(p => [...p, { role: 'customer', content: text }]);
    setLoading(true);
    try {
      const res = await axios.post('/api/conversation/message', {
        sessionId, message: text,
        context: {
          amount: context.amount, category: context.category,
          status: hasActiveFailure ? 'failed' : 'unknown',
          errorCode: context.errorCode, errorReason: context.errorReason,
        }
      });
      setMsgs(p => [...p, { role: 'agent', content: res.data.agentResponse }]);
    } catch {
      setMsgs(p => [...p, { role: 'agent', content: 'Sorry, something went wrong. Please try again.' }]);
    }
    setLoading(false);
  };

  // A real retry, not just advice — reuses the same real Razorpay flow as everywhere else.
  const handlePayNow = async () => {
    setPaying(true);
    try {
      const { data: order } = await axios.post('/api/checkout/create-retry-order', { transactionId: context.transactionId });
      openRazorpay({
        keyId: order.keyId, orderId: order.orderId, amount: order.amount,
        customer: order.customer, productName: 'Retry Payment',
        onSuccess: async (resp) => {
          await axios.post('/api/checkout/payment-success', { ...resp, internalId: context.transactionId });
          setMsgs(p => [...p, { role: 'agent', content: `✅ Payment successful — ₹${order.amount.toLocaleString('en-IN')} went through.` }]);
          setPaying(false);
        },
        onFailed: async (err) => {
          await axios.post('/api/checkout/payment-failed', { razorpay_order_id: order.orderId, internalId: context.transactionId, razorpayError: err }).catch(() => {});
          setMsgs(p => [...p, { role: 'agent', content: `That attempt didn't go through either — try a different card or UPI ID.` }]);
          setPaying(false);
        },
        onDismissed: () => setPaying(false),
      });
    } catch {
      setPaying(false);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500 }}>
      {open && (
        <div className="card anim-in" style={{ width: 320, height: 420, display: 'flex', flexDirection: 'column', marginBottom: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--rzp-blue)', color: 'white', borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>⚡ AI Recovery Agent</span>
            <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 0' }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
                Ask me anything about a payment or recovery — I'm here to help.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'agent' ? 'chat-msg-agent' : 'chat-msg-customer'} style={{ marginBottom: 10 }}>
                <div className="chat-avatar" style={{ background: m.role === 'agent' ? 'var(--rzp-blue)' : 'var(--border)', color: m.role === 'agent' ? 'white' : 'var(--text-secondary)' }}>
                  {m.role === 'agent' ? '⚡' : '👤'}
                </div>
                <div className={m.role === 'agent' ? 'chat-bubble-agent' : 'chat-bubble-customer'}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="chat-msg-agent" style={{ marginBottom: 10 }}>
                <div className="chat-avatar" style={{ background: 'var(--rzp-blue)', color: 'white' }}>⚡</div>
                <div className="chat-bubble-agent" style={{ color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ width: 14, height: 14 }} /> Thinking...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {hasActiveFailure && (
            <div style={{ padding: '0 14px 10px' }}>
              <button onClick={handlePayNow} disabled={paying} style={{
                width: '100%', padding: '9px', border: 'none', borderRadius: 8, cursor: paying ? 'not-allowed' : 'pointer',
                background: '#0EA371', color: 'white', fontSize: 12.5, fontWeight: 700,
              }}>
                {paying ? '⏳ Opening Razorpay…' : `💳 Retry Payment — ₹${Number(context.amount).toLocaleString('en-IN')}`}
              </button>
            </div>
          )}
          <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Type a message..." className="input" style={{ flex: 1 }} />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="btn btn-primary">Send</button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} style={{
        width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg,#2561E8,#1A4DC9)', color: 'white', fontSize: 24,
        boxShadow: '0 8px 24px rgba(37,97,232,0.4)', position: 'relative',
      }}>
        💬
      </button>
    </div>
  );
}

// ─── Incoming recovery notification — the REAL WhatsApp/email message, live ──
// Fires for any nudge_link action addressed to this customer (from their own checkout
// failures, or an admin-triggered Recovery Live scenario) — same event, same code path.
function IncomingRecoveryNotification({ customerId, customer, onNotify }) {
  const [notif, setNotif] = useState(null); // { transactionId, message, amount, channel, hasOffer }
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null); // null = undecided, true = confirmed, false = denied (real fraud)

  useSocket((type, data) => {
    if (type !== 'resolved') return;
    if (String(data.customerId) !== String(customerId)) return;
    if (data.outcome === 'escalated') {
      // A real "no, wasn't me" answer — possibly from another tab for the same notification
      if (notif && String(notif.transactionId) === String(data.transactionId)) setVerified(false);
      return;
    }
    if (data.outcome !== 'pending') return;
    const channel = data.actionTaken?.channel;
    const content = data.actionTaken?.messageContent;
    if (!channel || channel === 'none' || !content) return;
    if (channel === 'voice') return; // handled by the dedicated VoiceRecoveryWidget instead
    setPaid(false);
    setPayError(null);
    setVerified(null);
    setNotif({
      transactionId: data.transactionId,
      message: content,
      amount: data.amount,
      channel,
      hasOffer: /loyal10|discount|% off/i.test(content),
    });
    onNotify?.({
      title: `${channel === 'whatsapp' ? '💬 WhatsApp' : channel === 'in_app' ? '🛡️ Security check' : '📧 Email'} — Payment recovery`,
      body: content,
      dedupeKey: `resolved_${data.transactionId}_${content.length}`,
    });
  });

  // Real verification gate for the fraud-false-positive scenario — the customer's own
  // answer is what unblocks (or blocks) the transaction, not a random outcome.
  const handleVerify = async (confirmed) => {
    setVerifying(true);
    try {
      await axios.post('/api/checkout/confirm-identity', { transactionId: notif.transactionId, confirmed });
      setVerified(confirmed);
    } catch {
      setPayError('Something went wrong — please try again.');
    }
    setVerifying(false);
  };

  const handlePay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const { data: order } = await axios.post('/api/checkout/create-retry-order', { transactionId: notif.transactionId });
      openRazorpay({
        keyId: order.keyId, orderId: order.orderId, amount: order.amount,
        customer: order.customer, productName: 'Pending Recovery Payment',
        onSuccess: async (resp) => {
          await axios.post('/api/checkout/payment-success', { ...resp, internalId: notif.transactionId });
          setPaid(true);
          setTimeout(() => setNotif(null), 3000);
        },
        onFailed: async (err) => {
          // A retry can fail again — report it just like the first attempt does, so it still
          // creates a real RecoveryEvent and shows up on the Dashboard (this was previously a no-op).
          try {
            const { data } = await axios.post('/api/checkout/payment-failed', {
              razorpay_order_id: order.orderId, internalId: notif.transactionId, razorpayError: err,
            });
            setPayError(data.errorReason || 'Payment failed — please try again.');
          } catch {
            setPayError('Payment failed — please try again.');
          }
          setPaying(false);
        },
        onDismissed: async () => {
          try {
            await axios.post('/api/checkout/payment-abandoned', {
              razorpay_order_id: order.orderId, internalId: notif.transactionId,
            });
          } catch {}
          setPaying(false);
        },
      });
    } catch {
      setPaying(false);
    }
  };

  if (!notif) return null;
  const isWhatsapp = notif.channel === 'whatsapp';
  const isFraudCheck = notif.channel === 'in_app';
  const needsVerification = isFraudCheck && verified !== true;
  const CHANNEL_LABELS = { whatsapp: 'WhatsApp · Business Account', email: 'New Email', sms: 'New SMS', in_app: 'In-App Notification' };
  const channelLabel = CHANNEL_LABELS[notif.channel] || 'New Notification';

  return (
    <div className="anim-in" style={{ position: 'fixed', top: 20, right: 20, width: 340, zIndex: 600, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 56px rgba(0,0,0,0.3)' }}>
      {paid ? (
        <div style={{ background: 'white', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
          <div style={{ fontWeight: 700, color: '#0F172A' }}>Paid — thank you!</div>
        </div>
      ) : verified === false ? (
        <div style={{ background: 'white', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🛑</div>
          <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Reported & blocked</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Thanks for confirming — this payment has been blocked and flagged for fraud review. No charge was made.</div>
        </div>
      ) : (
        <>
          <div style={{
            background: isFraudCheck ? '#7C2D12' : isWhatsapp ? '#128C7E' : '#2561E8', color: 'white',
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: isFraudCheck ? '#F59E0B' : isWhatsapp ? '#25D366' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{isFraudCheck ? '🛡️' : 'R'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{isFraudCheck ? 'Security Check' : 'Razorpay Recovery'}</div>
              <div style={{ fontSize: 10, opacity: 0.85 }}>{channelLabel} · now</div>
            </div>
            {notif.hasOffer && (
              <span style={{ flexShrink: 0, background: '#FBBF24', color: '#7C2D12', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20, animation: 'pulseOffer 1.4s ease-in-out infinite' }}>🎁 OFFER</span>
            )}
            <button onClick={() => setNotif(null)} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, opacity: 0.85 }}>×</button>
          </div>
          <div style={{ background: isWhatsapp ? '#ECE5DD' : '#F8FAFC', padding: 14 }}>
            <div style={{ background: 'white', borderRadius: '0 8px 8px 8px', padding: '10px 12px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', maxHeight: 200, overflowY: 'auto' }}>
              {notif.message}
            </div>
            {payError && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px' }}>
                ❌ {payError} The recovery agent has been notified — check the Dashboard.
              </div>
            )}
            {needsVerification ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => handleVerify(true)} disabled={verifying} style={{
                  flex: 1, padding: '11px 8px', border: 'none', borderRadius: 8, background: '#25D366',
                  color: 'white', fontSize: 12, fontWeight: 700, cursor: verifying ? 'not-allowed' : 'pointer', opacity: verifying ? 0.7 : 1,
                }}>
                  {verifying ? '…' : '✅ Yes, that was me'}
                </button>
                <button onClick={() => handleVerify(false)} disabled={verifying} style={{
                  flex: 1, padding: '11px 8px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white',
                  color: '#475569', fontSize: 12, fontWeight: 700, cursor: verifying ? 'not-allowed' : 'pointer', opacity: verifying ? 0.7 : 1,
                }}>
                  🚫 Not me
                </button>
              </div>
            ) : (
              <button onClick={handlePay} disabled={paying} style={{
                marginTop: 12, width: '100%', padding: '11px', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer', color: 'white', opacity: paying ? 0.7 : 1,
                background: notif.hasOffer ? 'linear-gradient(135deg,#F59E0B,#D97706)' : '#25D366',
              }}>
                {paying ? '⏳ Opening Razorpay…' : `💳 Tap to Pay${notif.amount ? ` ₹${Number(notif.amount).toLocaleString('en-IN')}` : ''}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Real Hinglish voice recovery — genuine browser TTS/STT, real Groq dialogue ──
// Fires for a real L5 voice_escalation action. Uses the Web Speech API (no telephony
// provider needed) to actually speak the agent's lines and listen for the customer's
// reply; each turn goes through the real /api/conversation/voice-turn endpoint tied
// to this transaction's real amount. Ends in a real payment, same as every other
// recovery channel — never a scripted "success".
function VoiceRecoveryWidget({ customerId, customer }) {
  const [call, setCall] = useState(null); // { transactionId, amount }
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const sessionIdRef = useRef(null);
  const recognitionRef = useRef(null);

  const speechSupported = typeof window !== 'undefined' && !!window.speechSynthesis;
  const RecognitionCtor = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useSocket((type, data) => {
    if (type !== 'resolved') return;
    if (String(data.customerId) !== String(customerId)) return;
    if (data.outcome !== 'pending') return;
    if (data.actionTaken?.channel !== 'voice') return;
    sessionIdRef.current = `voice_store_${data.transactionId}_${Date.now().toString(36)}`;
    setPaid(false);
    setCall({ transactionId: data.transactionId, amount: data.amount });
    setTranscript([{ role: 'agent', content: data.actionTaken.messageContent }]);
  });

  const speak = (text) => {
    if (!speechSupported) return;
    setSpeaking(true);
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = 'hi-IN';
    utter.rate = 0.95;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  };

  const sendTurn = async (message) => {
    if (!message.trim()) return;
    setTranscript(p => [...p, { role: 'customer', content: message }]);
    setTextInput('');
    try {
      const { data } = await axios.post('/api/conversation/voice-turn', {
        sessionId: sessionIdRef.current, message, amount: call.amount
      });
      setTranscript(p => [...p, { role: 'agent', content: data.agentResponse }]);
      speak(data.agentResponse);
    } catch {
      setTranscript(p => [...p, { role: 'agent', content: 'Sorry, connection issue — please try again.' }]);
    }
  };

  const startListening = () => {
    if (!RecognitionCtor) return;
    const rec = new RecognitionCtor();
    rec.lang = 'hi-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { sendTurn(e.results[0][0].transcript); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };

  const answerCall = () => {
    setActive(true);
    if (transcript[0]) speak(transcript[0].content);
  };

  const endCall = () => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    setActive(false);
    setCall(null);
  };

  const handlePayNow = async () => {
    setPaying(true);
    try {
      const { data: order } = await axios.post('/api/checkout/create-retry-order', { transactionId: call.transactionId });
      openRazorpay({
        keyId: order.keyId, orderId: order.orderId, amount: order.amount,
        customer: order.customer, productName: 'Voice Recovery Payment',
        onSuccess: async (resp) => {
          await axios.post('/api/checkout/payment-success', { ...resp, internalId: call.transactionId });
          setPaid(true);
          endCall();
        },
        onFailed: async (err) => {
          try {
            await axios.post('/api/checkout/payment-failed', { razorpay_order_id: order.orderId, internalId: call.transactionId, razorpayError: err });
          } catch {}
          setPaying(false);
        },
        onDismissed: async () => {
          try { await axios.post('/api/checkout/payment-abandoned', { razorpay_order_id: order.orderId, internalId: call.transactionId }); } catch {}
          setPaying(false);
        },
      });
    } catch {
      setPaying(false);
    }
  };

  if (paid) {
    return (
      <div className="anim-in" style={{ position: 'fixed', bottom: 96, right: 20, width: 320, zIndex: 610, background: 'white', borderRadius: 14, padding: 24, textAlign: 'center', boxShadow: '0 20px 56px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
        <div style={{ fontWeight: 700, color: '#0F172A' }}>Paid — thanks for staying on the call!</div>
      </div>
    );
  }

  if (!call) return null;

  return (
    <div className="anim-in" style={{ position: 'fixed', bottom: 96, right: 20, width: 340, zIndex: 610, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 56px rgba(0,0,0,0.3)' }}>
      <div style={{ background: '#6E56CF', color: 'white', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📞</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{active ? 'Recovery Call — Live' : 'Incoming Recovery Call'}</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>Razorpay Recovery · Hinglish voice agent</div>
        </div>
        {!active && <button onClick={endCall} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, opacity: 0.85 }}>×</button>}
      </div>

      <div style={{ background: '#F8FAFC', padding: 14 }}>
        {!active ? (
          <button onClick={answerCall} style={{ width: '100%', padding: '11px', border: 'none', borderRadius: 8, background: '#0EA371', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            📞 Answer — ₹{Number(call.amount).toLocaleString('en-IN')} overdue
          </button>
        ) : (
          <>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {transcript.map((m, i) => (
                <div key={i} className={m.role === 'agent' ? 'chat-msg-agent' : 'chat-msg-customer'}>
                  <div className="chat-avatar" style={{ background: m.role === 'agent' ? '#6E56CF' : 'var(--border)', color: m.role === 'agent' ? 'white' : 'var(--text-secondary)', width: 24, height: 24, fontSize: 11 }}>
                    {m.role === 'agent' ? '🎙️' : '👤'}
                  </div>
                  <div className={m.role === 'agent' ? 'chat-bubble-agent' : 'chat-bubble-customer'} style={{ fontSize: 12 }}>{m.content}</div>
                </div>
              ))}
              {speaking && <div style={{ fontSize: 11, color: '#6E56CF', paddingLeft: 32 }}>🔊 Agent speaking…</div>}
            </div>

            {!speechSupported && (
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6 }}>Voice not supported in this browser — reply below instead.</div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {RecognitionCtor && (
                <button onClick={listening ? stopListening : startListening} disabled={speaking} style={{
                  flex: 1, padding: '9px', border: 'none', borderRadius: 8, cursor: speaking ? 'not-allowed' : 'pointer',
                  background: listening ? '#E5484D' : '#6E56CF', color: 'white', fontSize: 12, fontWeight: 700,
                }}>
                  {listening ? '⏹ Stop listening' : '🎤 Speak reply'}
                </button>
              )}
              <input value={textInput} onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendTurn(textInput)}
                placeholder="Or type your reply..." className="input" style={{ flex: 1, fontSize: 12 }} />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handlePayNow} disabled={paying} style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 8, cursor: paying ? 'not-allowed' : 'pointer',
                background: '#0EA371', color: 'white', fontSize: 12, fontWeight: 700,
              }}>
                {paying ? '⏳ Opening Razorpay…' : `💳 Pay Now ₹${Number(call.amount).toLocaleString('en-IN')}`}
              </button>
              <button onClick={endCall} className="btn btn-secondary btn-sm">End Call</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, qty }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        borderRadius: 14,
        border: `2px solid ${qty > 0 ? product.color : hover ? '#E2E8F0' : '#F1F5F9'}`,
        padding: '20px',
        transition: 'all 0.18s ease',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {product.badge && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: product.color, color: '#fff',
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          letterSpacing: '0.03em',
        }}>{product.badge}</div>
      )}

      <div style={{ fontSize: 36, marginBottom: 12 }}>{product.emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>{product.name}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>{product.desc}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
        {product.features.map(f => (
          <div key={f} style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: product.color, fontWeight: 700 }}>✓</span> {f}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>₹{product.price.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>
            {product.category === 'subscription' ? '/month' : 'one-time'}
          </div>
        </div>
        <button
          onClick={() => onAddToCart(product)}
          style={{
            background: qty > 0 ? product.color : `${product.color}15`,
            color: qty > 0 ? '#fff' : product.color,
            border: `1.5px solid ${product.color}`,
            borderRadius: 8, padding: '8px 16px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {qty > 0 ? `✓ ${qty} in cart · +Add` : '+ Add'}
        </button>
      </div>
    </div>
  );
}

// ─── Payment Result overlay ────────────────────────────────────────────────────
function PaymentResult({ result, onClose, onRetry }) {
  if (!result) return null;
  const isOk = result.type === 'success';
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 40, maxWidth: 420, width: '90%',
        textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        animation: 'fadeUp 0.25s ease',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{isOk ? '🎉' : result.type === 'abandoned' ? '🛒' : '⚡'}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
          {isOk ? 'Payment Successful!' : result.type === 'abandoned' ? 'Did you forget something?' : 'Payment Failed'}
        </div>
        <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 20 }}>
          {isOk && 'Your order has been confirmed. Thank you!'}
          {result.type === 'abandoned' && "You closed the payment window. Our AI agent is looking into this now — check the chat in the bottom right in a moment."}
          {result.type === 'failed' && (
            <>
              <span style={{ fontFamily: 'monospace', color: '#E5484D', fontWeight: 600 }}>{result.errorCode}</span>
              <br />{result.errorReason}
              <br /><br />
              <span style={{ color: '#2561E8', fontWeight: 600 }}>⚡ Recovery agent activated — check the chat in the bottom right for what it's doing.</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {(result.type === 'failed') && (
            <button onClick={onRetry} style={{
              background: '#2561E8', color: '#fff', border: 'none', borderRadius: 10,
              padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>↺ Retry Payment</button>
          )}
          <button onClick={onClose} style={{
            background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 10,
            padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Store Component ─────────────────────────────────────────────────────
const CART_STORAGE_PREFIX = 'rzp_demo_cart_';

export default function CustomerStore() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const customerId = auth?.customerId;
  const cartKey = `${CART_STORAGE_PREFIX}${customerId}`;
  const notifications = useNotifications(`rzp_demo_notifs_customer_${customerId}`);

  const [cart, setCart]               = useState(() => {
    try {
      const s = customerId && localStorage.getItem(`${CART_STORAGE_PREFIX}${customerId}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [expandedNotifId, setExpandedNotifId] = useState(null);

  const [chatContext, setChatContext] = useState({ amount: 0, category: 'checkout' });

  useEffect(() => {
    if (!auth) { navigate('/login'); }
  }, [auth, navigate]);

  useEffect(() => {
    if (!customerId) return;
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch {}
  }, [cart, cartKey, customerId]);

  if (!auth) return null;

  const customer = auth.customer || { name: auth.name, email: auth.email, phone: auth.phone };

  const cartTotal = cart.reduce((s, p) => s + p.price * p.qty, 0);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) return prev.map(p => p.id === product.id ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { ...product, qty: 1 }];
    });
  };
  const incQty = (id) => setCart(prev => prev.map(p => p.id === id ? { ...p, qty: p.qty + 1 } : p));
  const decQty = (id) => setCart(prev => prev.flatMap(p => p.id === id ? (p.qty > 1 ? [{ ...p, qty: p.qty - 1 }] : []) : [p]));
  const removeFromCart = (id) => setCart(prev => prev.filter(p => p.id !== id));

  const handleLogout = () => { logout(); navigate('/login'); };

  const orderLabel = () => cart.length > 1 ? `${cart.reduce((s, p) => s + p.qty, 0)} items` : cart[0]?.name || 'Order';

  const finishOrder = (status, extra = {}) => {
    setOrderHistory(h => [{ name: orderLabel(), price: cartTotal, status, time: new Date(), ...extra }, ...h]);
    setCart([]);
    setLoading(false);
  };

  const startCheckout = async () => {
    if (!cart.length || loading) return;
    setLoading(true);
    setResult(null);
    const category = cart.some(p => p.category === 'subscription') ? 'subscription' : 'checkout';
    try {
      const { data: order } = await axios.post('/api/checkout/create-order', {
        customerId, productId: cart[0].id, amount: cartTotal, category,
      });
      setCurrentOrder(order);
      setChatContext({ amount: cartTotal, category, transactionId: order.internalId });

      openRazorpay({
        keyId: order.keyId, orderId: order.orderId, amount: order.amount,
        customer: order.customer, productName: orderLabel(),
        onSuccess: async (resp) => {
          await axios.post('/api/checkout/payment-success', { ...resp, internalId: order.internalId });
          setResult({ type: 'success', paymentId: resp.razorpay_payment_id });
          setChatContext({ amount: 0, category: 'checkout' });
          finishOrder('success');
        },
        onFailed: async (err) => {
          const { data } = await axios.post('/api/checkout/payment-failed', {
            razorpay_order_id: order.orderId, internalId: order.internalId, razorpayError: err,
          });
          // Real, specific failure detail the chatbot can actually reason about —
          // not just "amount + category", which is all it had before.
          setChatContext({
            amount: cartTotal, category, transactionId: order.internalId,
            errorCode: data.errorCode, errorReason: data.errorReason,
          });
          setResult({ type: 'failed', errorCode: data.errorCode, errorReason: data.errorReason });
          finishOrder('failed', { errorCode: data.errorCode });
        },
        onDismissed: async () => {
          await axios.post('/api/checkout/payment-abandoned', {
            razorpay_order_id: order.orderId, internalId: order.internalId,
          });
          setChatContext({
            amount: cartTotal, category, transactionId: order.internalId,
            errorCode: 'ABANDONED', errorReason: 'Customer closed the payment window without completing it',
          });
          setResult({ type: 'abandoned' });
          finishOrder('abandoned');
        },
      });
      setLoading(false);
    } catch (err) {
      setResult({ type: 'failed', errorCode: 'API_ERROR', errorReason: err.message });
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseOffer { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        .store-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap: 18px; }
      `}</style>

      {/* Store Header — single header, no floating overlay */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0',
        padding: '0 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 60, position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} title="Back" style={{
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer', fontSize: 15, flexShrink: 0,
          }}>←</button>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#2561E8' }}>⚡</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Razorpay Store</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>logged in as {auth.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#F0FDF9', color: '#0EA371',
            border: '1.5px solid #0EA371', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
          }}>
            🔒 Real Razorpay Test Mode
          </span>

          {/* Notification bell — persisted across reloads */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) notifications.markAllRead(); }} style={{
              position: 'relative', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
              width: 36, height: 36, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              🔔
              {notifications.unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, background: '#E5484D', color: '#fff',
                  borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{notifications.unreadCount}</span>
              )}
            </button>
            {notifOpen && (
              <div className="anim-in" style={{
                position: 'absolute', top: 44, right: 0, width: 320, maxHeight: 380, overflowY: 'auto',
                background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 700,
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Notifications</span>
                  {notifications.items.length > 0 && <button onClick={notifications.clear} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 11, cursor: 'pointer' }}>Clear all</button>}
                </div>
                {notifications.items.length === 0 ? (
                  <div style={{ padding: '28px 14px', textAlign: 'center', color: '#CBD5E1', fontSize: 12 }}>No notifications yet</div>
                ) : notifications.items.map(n => {
                  const isLong = n.body && n.body.length > 140;
                  const isExpanded = expandedNotifId === n.id;
                  return (
                    <div key={n.id} onClick={() => isLong && setExpandedNotifId(isExpanded ? null : n.id)}
                      style={{ padding: '10px 14px', borderBottom: '1px solid #F8FAFC', cursor: isLong ? 'pointer' : 'default' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {isExpanded || !isLong ? n.body : `${n.body.slice(0, 140)}…`}
                      </div>
                      {isLong && <div style={{ fontSize: 10, color: '#2561E8', fontWeight: 600, marginTop: 4 }}>{isExpanded ? 'Show less' : 'Show more'}</div>}
                      <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 4 }}>{new Date(n.time).toLocaleTimeString('en-IN')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart indicator */}
          {cart.length > 0 && (
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', top: -6, right: -6,
                background: '#E5484D', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1,
              }}>{cart.reduce((s, p) => s + p.qty, 0)}</div>
              <div style={{ fontSize: 22 }}>🛒</div>
            </div>
          )}

          {/* Logout — single place, no floating overlay */}
          <button onClick={handleLogout} style={{
            background: 'rgba(229,72,77,0.1)', border: '1px solid rgba(229,72,77,0.2)',
            color: '#E5484D', borderRadius: 20, padding: '6px 14px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            ↩ Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Products */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
              🛍️ Browse Products
            </div>
            <div style={{ fontSize: 14, color: '#64748B' }}>
              Add items to cart, adjust quantities, then check out through Razorpay's real test-mode checkout.
            </div>
          </div>

          <div className="store-product-grid">
            {STORE_PRODUCTS.map(p => (
              <ProductCard
                key={p.id} product={p}
                qty={cart.find(c => c.id === p.id)?.qty || 0}
                onAddToCart={addToCart}
              />
            ))}
          </div>

          {/* Order History */}
          {orderHistory.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 14 }}>📋 Order History (this session)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orderHistory.map((o, i) => (
                  <div key={i} style={{
                    background: '#fff', borderRadius: 10,
                    border: `1px solid ${o.status === 'success' ? '#BBF7D0' : o.status === 'abandoned' ? '#FEF3C7' : '#FEE2E2'}`,
                    padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{o.name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>{o.time.toLocaleTimeString('en-IN')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>₹{o.price.toLocaleString('en-IN')}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: o.status === 'success' ? '#DCFCE7' : o.status === 'abandoned' ? '#FEF3C7' : '#FEE2E2',
                        color: o.status === 'success' ? '#16A34A' : o.status === 'abandoned' ? '#92400E' : '#DC2626',
                      }}>
                        {o.status === 'success' ? '✅ Paid' : o.status === 'abandoned' ? '🛒 Abandoned' : `❌ ${o.errorCode || 'Failed'}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#2561E8', fontWeight: 500 }}>
                ⚡ The AI recovery chat (bottom right) shows what the agent is doing in real time — or check Admin → Recovery Live / Dashboard
              </div>
            </div>
          )}
        </div>

        {/* Cart sidebar */}
        <div style={{ width: 300, flexShrink: 0, position: 'sticky', top: 76 }}>
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0',
            padding: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#0F172A', marginBottom: 14 }}>🛒 Cart</div>

            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#CBD5E1' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🛍️</div>
                <div style={{ fontSize: 13 }}>Add products from the store</div>
              </div>
            ) : (
              <>
                {cart.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid #F1F5F9', gap: 8,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.emoji} {item.name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>₹{item.price.toLocaleString('en-IN')} each</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => decQty(item.id)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>−</button>
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => incQty(item.id)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>+</button>
                      <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 16, marginLeft: 2 }}>×</button>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Total</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>₹{cartTotal.toLocaleString('en-IN')}</span>
                  </div>

                  <button
                    onClick={startCheckout}
                    disabled={loading}
                    style={{
                      width: '100%', background: '#2561E8', color: '#fff',
                      border: 'none', borderRadius: 10, padding: '14px',
                      fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {loading ? '⏳ Opening Razorpay…' : '💳 Pay Now'}
                  </button>
                  <div style={{ fontSize: 11, textAlign: 'center', color: '#CBD5E1', marginTop: 8 }}>
                    🔒 Secured by Razorpay
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Real test-mode guidance */}
          <div style={{
            marginTop: 14, background: '#EBF0FE', borderRadius: 10,
            padding: '12px 14px', fontSize: 12, color: '#3B5FC0', lineHeight: 1.6,
          }}>
            <strong>💡 This is Razorpay's real test-mode checkout.</strong> Use any of Razorpay's{' '}
            <a href="https://razorpay.com/docs/payments/payments/test-card-upi-details/" target="_blank" rel="noreferrer" style={{ color: '#2561E8', fontWeight: 600 }}>documented test cards/UPI IDs</a>.
            Razorpay's own test-mode simulator decides success/failure (and shows a genuine OTP step for 3D-Secure cards) — our recovery agent reacts to whatever it returns.
          </div>

          {/* OTP help — for a real Razorpay OTP step that failed */}
          <div style={{ marginTop: 14 }}>
            <OtpHelpChat />
          </div>
        </div>
      </div>

      {/* Payment result overlay */}
      <PaymentResult
        result={result}
        onClose={() => setResult(null)}
        onRetry={() => { setResult(null); startCheckout(); }}
      />

      {/* Real WhatsApp/email recovery notification — from own failures or an admin trigger */}
      <IncomingRecoveryNotification customerId={customerId} customer={customer} onNotify={notifications.push} />

      {/* Real Hinglish voice recovery — genuine browser TTS/STT, tied to a real escalated failure */}
      <VoiceRecoveryWidget customerId={customerId} customer={customer} />

      {/* Floating AI assistant — free-form chat, ask anything any time */}
      <RecoveryChatWidget context={chatContext} />
    </div>
  );
}
