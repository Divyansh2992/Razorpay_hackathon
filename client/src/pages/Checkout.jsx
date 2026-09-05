import { useState, useEffect } from 'react';
import axios from 'axios';

const FAILURE_OPTIONS = [
  { value: 'gateway_timeout',      label: 'Gateway Timeout',       badge: 'L1 Silent',      color: '#10B981', desc: 'Silent reroute — no customer notification sent' },
  { value: 'insufficient_balance', label: 'Insufficient Balance',  badge: 'L1 Scheduled',   color: '#10B981', desc: 'Retry scheduled near next salary date' },
  { value: 'expired_card',         label: 'Expired Card',          badge: 'L2 AI Nudge',    color: '#3B82F6', desc: 'AI generates personalized WhatsApp/SMS/email message' },
  { value: 'otp_timeout',          label: 'OTP / Auth Timeout',    badge: 'L2 Nudge',       color: '#3B82F6', desc: 'Recovery link sent with instructions to complete auth' },
  { value: 'fraud_block',          label: 'Fraud Block (FP)',      badge: 'L3 In-App',      color: '#F59E0B', desc: 'In-app soft paywall on next login — no aggressive outreach' },
  { value: 'ambiguous',            label: 'Ambiguous Error',       badge: '🧠 LLM diagnose', color: '#7C3AED', desc: 'LLM reasoning path — watch audit log for AI analysis' },
  { value: 'none',                 label: 'No Failure (Success)',  badge: '✅ Success',      color: '#64748B', desc: 'Payment completes normally' }
];

const PRODUCTS = [
  { id: 'prod_001', name: 'Razorpay Pro Plan',       amount: 2999,  category: 'subscription', icon: '⚡' },
  { id: 'prod_002', name: 'Cloud Storage 100GB',      amount: 499,   category: 'checkout',      icon: '☁️' },
  { id: 'prod_003', name: 'API Access — Annual',      amount: 12000, category: 'checkout',      icon: '🔌' },
  { id: 'prod_004', name: 'Team Seats (5 users)',     amount: 7500,  category: 'subscription', icon: '👥' }
];

function RecoveryAlert({ result, onClose }) {
  if (!result) return null;
  const success = result.status === 'succeeded';
  return (
    <div className={`card p-4 anim-in mb-4`}
      style={{ border: `1px solid ${success ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.25)'}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-white mb-1">
            {success ? '✅ Payment Successful' : '⚡ Payment Failed — Recovery Agent Activated'}
          </div>
          {!success && (
            <>
              <div className="text-xs text-slate-400">
                <span className="font-mono text-orange-400">{result.errorCode}</span> — {result.errorReason}
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-blue-400">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-dot" />
                Recovery pipeline running — check Dashboard for live events
              </div>
            </>
          )}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
      </div>
    </div>
  );
}

export default function Checkout() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('prod_001');
  const [failureType, setFailureType] = useState('gateway_timeout');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [subCustomer, setSubCustomer] = useState('');
  const [subFailure, setSubFailure] = useState('insufficient_balance');
  const [subLoading, setSubLoading] = useState(false);
  const [abanCustomer, setAbanCustomer] = useState('');
  const [abanLoading, setAbanLoading] = useState(false);

  useEffect(() => {
    axios.get('/api/checkout/customers').then(res => {
      setCustomers(res.data);
      if (res.data.length) {
        setSelectedCustomer(res.data[0]._id);
        setSubCustomer(res.data[0]._id);
        setAbanCustomer(res.data[0]._id);
      }
    });
  }, []);

  const product = PRODUCTS.find(p => p.id === selectedProduct) || PRODUCTS[0];
  const customer = customers.find(c => c._id === selectedCustomer);
  const failureOpt = FAILURE_OPTIONS.find(f => f.value === failureType) || FAILURE_OPTIONS[0];

  const pay = async () => {
    if (!selectedCustomer) return;
    setLoading(true); setResult(null);
    try {
      const { data: order } = await axios.post('/api/checkout/create-order', { customerId: selectedCustomer, productId: selectedProduct });
      const { data: pay } = await axios.post('/api/checkout/pay', { orderId: order.orderId, forceFailureType: failureType });
      setResult(pay);
    } catch (e) { setResult({ error: e.message }); }
    setLoading(false);
  };

  const triggerSub = async () => {
    if (!subCustomer) return;
    setSubLoading(true);
    try {
      const { data } = await axios.post('/api/checkout/simulate-subscription-failure', { customerId: subCustomer, forceFailureType: subFailure, amount: 2999 });
      setResult({ ...data, success: false });
    } catch {}
    setSubLoading(false);
  };

  const triggerAbandon = async () => {
    if (!abanCustomer) return;
    setAbanLoading(true);
    try {
      const { data } = await axios.post('/api/checkout/simulate-abandon', { customerId: abanCustomer, amount: 1499 });
      setResult({ ...data, success: false });
    } catch {}
    setAbanLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white">Trigger Failure</h1>
        <p className="text-sm text-slate-500 mt-0.5">Fire payment failures to demonstrate the recovery agent live</p>
      </div>

      <RecoveryAlert result={result} onClose={() => setResult(null)} />

      <div className="grid md:grid-cols-3 gap-4">
        {/* Left: Checkout simulator */}
        <div className="md:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="text-base">🛒</span>
              <div>
                <div className="text-sm font-semibold text-white">Checkout Payment</div>
                <div className="text-xs text-slate-500">Simulate a payment with a forced failure type</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Customer */}
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">Customer</label>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className="sel" id="cust-sel">
                  {customers.map(c => (
                    <option key={c._id} value={c._id}>{c.name} — {c.savedPaymentMethods?.length || 0} method{c.savedPaymentMethods?.length !== 1 ? 's' : ''}</option>
                  ))}
                </select>
                {customer && (
                  <div className="mt-2 text-xs space-y-0.5">
                    <div className="text-slate-500">{customer.email}</div>
                    {customer.savedPaymentMethods?.length > 1 && (
                      <div className="text-emerald-400">💳 {customer.savedPaymentMethods.length} saved methods → L1 alt-retry eligible</div>
                    )}
                    {customer.contactPreferences?.channel && (
                      <div className="text-slate-400">Prefers: {customer.contactPreferences.channel}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Product */}
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">Product</label>
                <div className="space-y-1.5">
                  {PRODUCTS.map(p => (
                    <button key={p.id} onClick={() => setSelectedProduct(p.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        selectedProduct === p.id
                          ? 'border-blue-500/40 bg-blue-500/8 text-white'
                          : 'border-transparent text-slate-400 hover:text-white hover:bg-white/3'
                      }`}
                      style={{ background: selectedProduct === p.id ? 'rgba(37,99,235,0.08)' : undefined }}
                      id={`product-${p.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{p.icon} {p.name}</span>
                        <span className="font-semibold">₹{p.amount.toLocaleString('en-IN')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Failure type */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <label className="text-xs text-slate-400 font-medium block mb-2">Force Failure Type → Recovery Action</label>
              <div className="space-y-1.5">
                {FAILURE_OPTIONS.map(f => (
                  <button key={f.value} onClick={() => setFailureType(f.value)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      failureType === f.value
                        ? 'border-white/15 bg-white/5'
                        : 'border-transparent hover:bg-white/2'
                    }`}
                    id={`failure-${f.value}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">{f.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{ color: f.color, background: `${f.color}18`, border: `1px solid ${f.color}30` }}>
                        {f.badge}
                      </span>
                    </div>
                    {failureType === f.value && (
                      <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={pay} disabled={loading || !selectedCustomer}
              className="btn-rzp w-full mt-4" id="pay-btn">
              {loading ? '⏳ Processing...' : failureType === 'none' ? '✅ Complete Payment' : `⚡ Trigger: ${failureOpt.label}`}
            </button>
          </div>
        </div>

        {/* Right: Quick simulators + demo guide */}
        <div className="space-y-3">
          {/* Subscription failure */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span>🔁</span>
              <div>
                <div className="text-sm font-semibold text-white">Subscription Failure</div>
                <div className="text-xs text-slate-500">Failed auto-debit mandate</div>
              </div>
            </div>
            <select value={subCustomer} onChange={e => setSubCustomer(e.target.value)} className="sel mb-2" id="sub-cust">
              {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select value={subFailure} onChange={e => setSubFailure(e.target.value)} className="sel mb-3" id="sub-fail">
              <option value="insufficient_balance">💸 Insufficient Balance</option>
              <option value="expired_card">🚫 Expired Card</option>
              <option value="otp_timeout">🔐 Mandate Auth Failed</option>
            </select>
            <button onClick={triggerSub} disabled={subLoading} className="btn-rzp w-full" id="sub-btn">
              {subLoading ? '⏳...' : '⚡ Trigger Subscription Fail'}
            </button>
          </div>

          {/* Cart abandonment */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span>🛒</span>
              <div>
                <div className="text-sm font-semibold text-white">Cart Abandonment</div>
                <div className="text-xs text-slate-500">Order created, no payment</div>
              </div>
            </div>
            <select value={abanCustomer} onChange={e => setAbanCustomer(e.target.value)} className="sel mb-3" id="aban-cust">
              {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <button onClick={triggerAbandon} disabled={abanLoading} className="btn-rzp w-full" id="aban-btn">
              {abanLoading ? '⏳...' : '⚡ Simulate Abandon (₹1,499)'}
            </button>
          </div>

          {/* Demo guide */}
          <div className="card p-4">
            <div className="text-xs font-semibold text-white mb-2.5">📋 Demo Script</div>
            <div className="space-y-2">
              {[
                { n: 1, desc: 'Gateway Timeout → silent recovery, no message' },
                { n: 2, desc: 'Expired Card → AI nudge on WhatsApp/Email' },
                { n: 3, desc: 'Ambiguous → LLM reasoning in audit trail' },
                { n: 4, desc: 'Priya (2 methods) → alt card silently tried' },
                { n: 5, desc: 'Conversation: "already paid" → auto-halt' },
                { n: 6, desc: 'Invoice: "pay by Friday" → suppressed' }
              ].map(step => (
                <div key={step.n} className="flex gap-2 text-xs">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 font-semibold text-xs"
                    style={{ background: 'rgba(37,99,235,0.2)', color: '#93C5FD' }}>{step.n}</span>
                  <span className="text-slate-400">{step.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
