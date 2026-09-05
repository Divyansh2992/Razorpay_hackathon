import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const SEGMENT_COLORS = { high_value: '#6E56CF', medium: '#2561E8', low: '#0EA371' };
const SEGMENT_LABELS = { high_value: 'High Value', medium: 'Medium', low: 'Standard' };

export default function LoginPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [hover, setHover]         = useState(null);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  useEffect(() => {
    axios.get('/api/checkout/customers')
      .then(r => setCustomers(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loginAdmin = () => {
    login({ role: 'admin', name: 'Admin', email: 'admin@razorpay.com' });
    navigate('/');
  };

  const loginCustomer = (c) => {
    login({ role: 'customer', customerId: c._id, name: c.name, email: c.email, phone: c.phone, customer: c });
    navigate('/store');
  };

  const loginB2B = (c) => {
    login({ role: 'user2', customerId: c._id, name: c.company || c.name, email: c.email, phone: c.phone, customer: c });
    navigate('/b2b');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter', sans-serif", background: '#F4F6F9' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
        .login-row:hover { background: #F0F4FF !important; border-color: #2561E8 !important; transform: translateX(4px); }
        .login-row { transition: all 0.15s ease; }
        .shimmer { background: linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size: 400%; animation: shimmer 1.5s infinite; }
        @keyframes shimmer { 0%{background-position:100%}100%{background-position:-100%} }
      `}</style>

      {/* ─── Left: Branding panel ─────────────────────────────────────────── */}
      <div style={{
        width: 420, background: 'linear-gradient(160deg,#051E47 0%,#0A3580 50%,#1A4DC9 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '48px 40px', flexShrink: 0,
      }}>
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
            <div style={{
              width: 44, height: 44, background: 'rgba(255,255,255,0.12)',
              border: '2px solid rgba(255,255,255,0.15)', borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 900, color: 'white',
            }}>⚡</div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>Revenue Recovery</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Razorpay · Hackathon Track 03</div>
            </div>
          </div>

          {/* Hero text */}
          <div style={{ color: 'white', fontSize: 28, fontWeight: 800, lineHeight: 1.25, marginBottom: 16 }}>
            AI-powered<br />revenue recovery<br />at scale
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.8, marginBottom: 40 }}>
            Detects revenue at risk, diagnoses failures using LLM, and executes the right recovery action automatically.
          </div>

          {/* Feature list */}
          {[
            ['🔍', 'Detects', 'Payment failures, cart abandonment, B2B overdue'],
            ['🧠', 'Diagnoses', 'Groq LLaMA 3.3 70B classifies root cause'],
            ['⚡', 'Recovers', 'L1–L5 escalation ladder, governance-safe'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 36, height: 36, background: 'rgba(255,255,255,0.1)',
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>{icon}</div>
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>{title}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Groq LLaMA 3.3 70B', 'Razorpay SDK', 'Node.js + React', 'MongoDB', 'Socket.io'].map(tag => (
            <span key={tag} style={{
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
              fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)',
            }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* ─── Right: Role picker ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 520, animation: 'fadeUp 0.3s ease' }}>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
              Choose your role
            </div>
            <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>
              Pick a role to continue. Data persists across logins — reset it manually from the Admin dashboard whenever you want a clean slate.
            </div>
          </div>

          {/* ── Admin role ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Admin Role
            </div>
            <button
              onClick={loginAdmin}
              onMouseEnter={() => setHover('admin')}
              onMouseLeave={() => setHover(null)}
              style={{
                width: '100%', textAlign: 'left', background: hover === 'admin' ? '#EBF0FE' : '#fff',
                border: `2px solid ${hover === 'admin' ? '#2561E8' : '#E2E8F0'}`,
                borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 16,
                transition: 'all 0.15s ease', transform: hover === 'admin' ? 'translateX(4px)' : 'none',
              }}
            >
              <div style={{
                width: 48, height: 48, background: 'linear-gradient(135deg,#051E47,#2561E8)',
                borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>🔑</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Admin Dashboard</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  View recovery metrics, live pipeline, LLM reasoning, audit trail
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#2561E8', fontSize: 18 }}>→</div>
            </button>
          </div>

          {/* ── Customer roles ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Customer Role — Shop & Checkout
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3].map(i => (
                  <div key={i} className="shimmer" style={{ height: 72, borderRadius: 12 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {customers.slice(0, 6).map(c => {
                  const segColor = SEGMENT_COLORS[c.segment] || '#64748B';
                  const methods = c.savedPaymentMethods || [];
                  return (
                    <button
                      key={c._id}
                      onClick={() => loginCustomer(c)}
                      onMouseEnter={() => setHover(c._id)}
                      onMouseLeave={() => setHover(null)}
                      className="login-row"
                      style={{
                        width: '100%', textAlign: 'left',
                        background: hover === c._id ? '#F0F4FF' : '#fff',
                        border: `1.5px solid ${hover === c._id ? '#2561E8' : '#E2E8F0'}`,
                        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `linear-gradient(135deg,${segColor}30,${segColor}60)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {c.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.email}
                        </div>
                      </div>

                      {/* Tags */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                          background: `${segColor}18`, color: segColor, border: `1px solid ${segColor}30`,
                        }}>{SEGMENT_LABELS[c.segment] || c.segment}</span>
                        <span style={{ fontSize: 10, color: '#94A3B8' }}>
                          {methods.length} method{methods.length !== 1 ? 's' : ''}
                          {methods.length > 1 ? ' · ⚡ L1 eligible' : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── B2B role (User2) ── */}
          {!loading && customers.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                B2B Role — User2 · Invoice Portal
              </div>
              {customers.slice(0, 1).map(c => (
                <button
                  key={`b2b_${c._id}`}
                  onClick={() => loginB2B(c)}
                  onMouseEnter={() => setHover(`b2b_${c._id}`)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    width: '100%', textAlign: 'left', background: hover === `b2b_${c._id}` ? '#F4F0FF' : '#fff',
                    border: `2px solid ${hover === `b2b_${c._id}` ? '#6E56CF' : '#E2E8F0'}`,
                    borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 16,
                    transition: 'all 0.15s ease', transform: hover === `b2b_${c._id}` ? 'translateX(4px)' : 'none',
                  }}
                >
                  <div style={{
                    width: 48, height: 48, background: 'linear-gradient(135deg,#3D2A85,#6E56CF)',
                    borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, flexShrink: 0,
                  }}>🏢</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{c.company || c.name} — B2B Portal</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      A separate account from Admin — view invoices, reply to reminders, awaiting admin verification
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', color: '#6E56CF', fontSize: 18 }}>→</div>
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#CBD5E1' }}>
            🔒 Demo environment — no real payments processed in production
          </div>
        </div>
      </div>
    </div>
  );
}
