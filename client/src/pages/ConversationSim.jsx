import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const SESSION_ID = `sess_${Date.now().toString(36)}`;
const VOICE_SESSION_ID = `voice_${Date.now().toString(36)}`;

const QUICK_REPLIES = [
  { label: 'Why did it fail?',      text: "Why did this payment fail?" },
  { label: 'Best recovery move?',   text: "What's the recommended next action for this case, and why?" },
  { label: 'Retry risk?',           text: "If we retry this automatically, how likely is it to succeed?" },
  { label: 'Escalate or wait?',     text: "Should this be escalated, or is a simple nudge enough?" },
];

const VOICE_SAMPLES = [
  "Haan, kya baat hai? Kaunsa invoice?",
  "Main abhi paisa nahi de sakta, thoda time chahiye",
  "Theek hai, Friday tak kar deta hoon pakka",
  "Pehle se paid kar diya tha maine, check karo",
];

const INTENT_CONFIG = {
  promise_to_pay: { label: 'Promise to Pay',   color: 'var(--green)',  action: 'Reminders suppressed until promised date' },
  dispute:        { label: 'Dispute / Paid',   color: 'var(--red)',    action: '🛑 Auto-halt — flagged for human review' },
  confusion:      { label: 'Confused',          color: 'var(--amber)',  action: 'Clarification message queued' },
  confirmation:   { label: 'Payment Confirmed', color: 'var(--green)',  action: '✅ Marked as recovered — verification triggered' },
  refusal:        { label: 'Opt-Out',           color: '#64748B',      action: '✅ All outreach stopped immediately' },
};

function ChatBubble({ msg }) {
  const isAgent = msg.role === 'agent';
  return (
    <div className={isAgent ? 'chat-msg-agent' : 'chat-msg-customer'} style={{ marginBottom: 10 }}>
      <div className="chat-avatar"
        style={{ background: isAgent ? 'var(--rzp-blue)' : 'var(--border)', color: isAgent ? 'white' : 'var(--text-secondary)' }}>
        {isAgent ? '⚡' : '👤'}
      </div>
      <div className={isAgent ? 'chat-bubble-agent' : 'chat-bubble-customer'}>
        {msg.content}
      </div>
    </div>
  );
}

function IntentResult({ data }) {
  if (!data?.intent) return null;
  const cfg = INTENT_CONFIG[data.intent] || { label: data.intent, color: 'var(--text-muted)', action: '' };
  return (
    <div className="infobox infobox-blue anim-in" style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span className="badge badge-ai">🧠 Classified</span>
        <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
      </div>
      {data.summary && <p style={{ marginBottom: 4 }}>{data.summary}</p>}
      {data.extractedDate && <p style={{ color: 'var(--green)', fontWeight: 500 }}>📅 Date extracted: {data.extractedDate}</p>}
      <p style={{ marginTop: 4, color: cfg.color, fontWeight: 500 }}>→ {cfg.action}</p>
    </div>
  );
}

export default function ConversationSim() {
  const [tab, setTab] = useState('chat');

  // Real failed-transaction context — replaces the hardcoded ₹2,999/subscription/failed
  // stand-in so the LLM answers about an actual failure and can actually resolve it.
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [failedTxs, setFailedTxs] = useState([]);
  const [selectedTx, setSelectedTx] = useState(null);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    axios.get('/api/checkout/customers').then(res => {
      setCustomers(res.data);
      if (res.data.length) setCustomerId(res.data[0]._id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customerId) return;
    setLoadingTxs(true);
    setSelectedTx(null);
    axios.get(`/api/recovery-live/failed-transactions/${customerId}`)
      .then(res => setFailedTxs(res.data))
      .catch(() => setFailedTxs([]))
      .finally(() => setLoadingTxs(false));
  }, [customerId]);

  const ctx = selectedTx
    ? { role: 'admin', amount: selectedTx.amount, category: selectedTx.category, status: 'failed', errorCode: selectedTx.errorCode, errorReason: selectedTx.errorReason }
    : { role: 'admin', amount: 0, category: 'checkout', status: 'unknown' };

  // Chat state
  const [msgs, setMsgs] = useState([{
    role: 'agent',
    content: "Pick a real failed payment on the right — I'll reason over its actual failure data and answer whatever you ask about it."
  }]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [classification, setClassification] = useState(null);

  // Voice state
  const [voiceMsgs, setVoiceMsgs] = useState([{
    role: 'agent',
    content: "Namaskar! Main Razorpay ki taraf se call kar raha hoon. Aapka ₹15,000 ka invoice 7 din se overdue hai. Kya aap thodi baat kar sakte hain?"
  }]);
  const [voiceInput, setVoiceInput] = useState('');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceIntent, setVoiceIntent] = useState(null);

  const chatEndRef  = useRef(null);
  const voiceEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, chatLoading]);
  useEffect(() => { voiceEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [voiceMsgs, voiceLoading]);

  const sendChat = async () => {
    if (!input.trim() || chatLoading) return;
    const text = input;
    setInput('');
    setMsgs(p => [...p, { role: 'customer', content: text }]);
    setChatLoading(true);
    try {
      const res = await axios.post('/api/conversation/message', {
        sessionId: SESSION_ID, message: text,
        context: ctx
      });
      setMsgs(p => [...p, { role: 'agent', content: res.data.agentResponse }]);
      setClassification(res.data);
    } catch {
      setMsgs(p => [...p, { role: 'agent', content: 'Sorry, something went wrong. Please try again.' }]);
    }
    setChatLoading(false);
  };

  const sendVoice = async () => {
    if (!voiceInput.trim() || voiceLoading) return;
    const text = voiceInput;
    setVoiceInput('');
    setVoiceMsgs(p => [...p, { role: 'customer', content: text }]);
    setVoiceLoading(true);
    try {
      const res = await axios.post('/api/conversation/voice-turn', {
        sessionId: VOICE_SESSION_ID, message: text, amount: 15000, daysOverdue: 7
      });
      setVoiceMsgs(p => [...p, { role: 'agent', content: res.data.agentResponse }]);
      setVoiceIntent(res.data);
    } catch {
      setVoiceMsgs(p => [...p, { role: 'agent', content: 'Error — please try again.' }]);
    }
    setVoiceLoading(false);
  };

  const resetChat = async () => {
    await axios.delete(`/api/conversation/session/${SESSION_ID}`).catch(() => {});
    setMsgs([{ role: 'agent', content: "Hi, I'm the Razorpay Recovery Agent. Pick a real failed payment on the right and I'll help resolve it." }]);
    setClassification(null);
  };

  const selectTx = (tx) => {
    setSelectedTx(tx);
    setClassification(null);
    setMsgs([{
      role: 'agent',
      content: `Loaded: ₹${tx.amount.toLocaleString('en-IN')} ${tx.category} payment — ${tx.errorReason || tx.errorCode || 'failed'}. Ask me why it failed or what to do next.`
    }]);
  };

  // The admin can't pay on the customer's behalf — the real action here is to run this
  // transaction through the actual recovery pipeline, which reaches the CUSTOMER's own
  // device (Store chat / WhatsApp-style notification), same as Recovery Live's trigger.
  const handleSendRecoveryAction = async () => {
    if (!selectedTx || paying) return;
    setPaying(true);
    try {
      await axios.post('/api/recovery-live/trigger', { transactionId: selectedTx._id });
      setMsgs(p => [...p, { role: 'agent', content: `📨 Real recovery action dispatched to the customer's own device for this ₹${selectedTx.amount.toLocaleString('en-IN')} case — check the customer's Store session to see it land, and Recovery Live / Dashboard for the live pipeline status.` }]);
    } catch {
      setMsgs(p => [...p, { role: 'agent', content: 'Could not dispatch the recovery action — please try again.' }]);
    }
    setPaying(false);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      {/* Left — chat/voice */}
      <div>
        {/* Tabs */}
        <div className="card" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}>
          <div className="tab-bar" style={{ padding: '0 4px' }}>
            <button onClick={() => setTab('chat')}  className={`tab-btn${tab === 'chat'  ? ' active' : ''}`} id="tab-chat">💬 Chat Recovery</button>
            <button onClick={() => setTab('voice')} className={`tab-btn${tab === 'voice' ? ' active' : ''}`} id="tab-voice">📞 Hinglish Voice Agent</button>
          </div>
        </div>

        {/* Chat window */}
        {tab === 'chat' && (
          <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, display: 'flex', flexDirection: 'column', height: 480 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
              {msgs.map((m, i) => <ChatBubble key={i} msg={m} />)}
              {chatLoading && (
                <div className="chat-msg-agent" style={{ marginBottom: 10 }}>
                  <div className="chat-avatar" style={{ background: 'var(--rzp-blue)', color: 'white' }}>⚡</div>
                  <div className="chat-bubble-agent" style={{ color: 'var(--text-muted)' }}>
                    <div className="spinner" style={{ width: 14, height: 14 }} /> Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder={selectedTx ? "Ask about this failure..." : "Select a real failed payment on the right first..."}
                disabled={!selectedTx} className="input" id="chat-input" style={{ flex: 1 }} />
              <button onClick={sendChat} disabled={chatLoading || !input.trim() || !selectedTx} className="btn btn-primary" id="chat-send">Send</button>
              <button onClick={resetChat} className="btn btn-ghost btn-sm" title="Reset conversation">↺</button>
            </div>
          </div>
        )}

        {/* Voice window */}
        {tab === 'voice' && (
          <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, display: 'flex', flexDirection: 'column', height: 480 }}>
            <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-muted)' }}>
              📞 Simulated voice call · Invoice ₹15,000 · 7 days overdue · Hinglish conversation
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
              {voiceMsgs.map((m, i) => <ChatBubble key={i} msg={m} />)}
              {voiceLoading && (
                <div className="chat-msg-agent" style={{ marginBottom: 10 }}>
                  <div className="chat-avatar" style={{ background: '#6E56CF', color: 'white' }}>⚡</div>
                  <div className="chat-bubble-agent" style={{ color: 'var(--text-muted)' }}>Thinking in Hinglish...</div>
                </div>
              )}
              <div ref={voiceEndRef} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8 }}>
              <input value={voiceInput} onChange={e => setVoiceInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendVoice()}
                placeholder="Customer response (Hindi/English/Hinglish)..." className="input" id="voice-input" style={{ flex: 1 }} />
              <button onClick={sendVoice} disabled={voiceLoading || !voiceInput.trim()} className="btn btn-primary" id="voice-send">Send</button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Real failed-transaction picker */}
        {tab === 'chat' && (
          <div className="card">
            <div className="card-header"><div className="card-title">Real Failed Payment</div></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              {loadingTxs ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
              ) : failedTxs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No failed payments for this customer right now.</div>
              ) : (
                <select className="input" value={selectedTx?._id || ''} onChange={e => {
                  const tx = failedTxs.find(t => t._id === e.target.value);
                  if (tx) selectTx(tx);
                }}>
                  <option value="" disabled>Select a failure…</option>
                  {failedTxs.map(tx => (
                    <option key={tx._id} value={tx._id}>
                      ₹{tx.amount.toLocaleString('en-IN')} · {tx.category} · {tx.errorCode || 'unknown'}
                    </option>
                  ))}
                </select>
              )}
              {selectedTx && (
                <button onClick={handleSendRecoveryAction} disabled={paying} className="btn btn-primary btn-sm">
                  {paying ? 'Sending…' : `📨 Send Real Recovery Action`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick replies or samples */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{tab === 'chat' ? '⚡ Quick Replies' : '🎤 Sample Phrases'}</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tab === 'chat'
              ? QUICK_REPLIES.map(r => (
                  <button key={r.text} onClick={() => setInput(r.text)}
                    className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
                    {r.label}
                  </button>
                ))
              : VOICE_SAMPLES.map((s, i) => (
                  <button key={i} onClick={() => setVoiceInput(s)}
                    className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left', fontStyle: 'italic' }}>
                    "{s}"
                  </button>
                ))
            }
          </div>
        </div>

        {/* Classification result — voice tab only; admin chat has no customer-intent to classify */}
        {tab === 'voice' && voiceIntent && <IntentResult data={voiceIntent} />}

        {/* Context card */}
        {tab === 'chat' && (
        <div className="card">
          <div className="card-header"><div className="card-title">Context</div></div>
          <div className="card-body">
            <table style={{ width: '100%', fontSize: 12 }}>
              <tbody>
                {[
                  ['Category', selectedTx ? selectedTx.category : '—'],
                  ['Amount', selectedTx ? `₹${selectedTx.amount.toLocaleString('en-IN')}` : '—'],
                  ['Error', selectedTx ? <span style={{ fontFamily: 'monospace' }}>{selectedTx.errorCode}</span> : '—'],
                  ['Status', selectedTx ? <span className="badge badge-failed">Failed</span> : <span className="badge badge-blocked">No failure selected</span>],
                  ['Model', <span className="badge badge-ai">GPT-OSS 120B</span>],
                  ['Provider', 'Groq API'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '4px 0', color: 'var(--text-muted)', width: '40%' }}>{k}</td>
                    <td style={{ padding: '4px 0', color: 'var(--text-primary)', fontWeight: 500 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {tab === 'voice' && (
          <div className="infobox infobox-blue" style={{ fontSize: 11 }}>
            <strong>Real vs Simulated:</strong> The LLM conversation and intent classification are real (Groq API). In production, voice delivery would use Sarvam AI or Dhruva AI for actual phone calls.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
