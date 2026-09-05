import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useNotifications } from '../hooks/useNotifications';

const INTENT_CONFIG = {
  promise_to_pay: { label: 'Promise to Pay',   color: '#0EA371' },
  dispute:        { label: 'Dispute',          color: '#E5484D' },
  confusion:      { label: 'Confused',         color: '#C08B00' },
  confirmation:   { label: 'Payment Confirmed', color: '#0EA371' },
  refusal:        { label: 'Opt-Out',          color: '#64748B' },
};

const APPROVAL_BADGE = {
  pending:  { label: '⏳ Awaiting admin verification', bg: '#FFF7ED', color: '#C2410C' },
  approved: { label: '✅ Approved by admin',            bg: '#EDFBF5', color: '#0EA371' },
  rejected: { label: '❌ Rejected by admin',            bg: '#FEF2F2', color: '#E5484D' },
};

const QUICK_REPLIES = [
  { label: "📅 We'll pay by Friday", text: "We'll pay by this Friday" },
  { label: '💸 Cash flow issue',     text: "We're having cash flow issues, can we split the payment?" },
  { label: '⚠️ Already paid',        text: 'We already cleared this invoice via NEFT last week' },
];

function NotificationBell({ notifications }) {
  const [open, setOpen] = useState(false);
  const { items, unreadCount, markAllRead, clear } = notifications;
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(o => !o); if (!open) markAllRead(); }} style={{
        position: 'relative', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
        width: 36, height: 36, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, background: '#E5484D', color: '#fff',
            borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="anim-in" style={{
          position: 'absolute', top: 44, right: 0, width: 320, maxHeight: 380, overflowY: 'auto',
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 700,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Notifications</span>
            {items.length > 0 && <button onClick={clear} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 11, cursor: 'pointer' }}>Clear all</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '28px 14px', textAlign: 'center', color: '#CBD5E1', fontSize: 12 }}>No notifications yet</div>
          ) : items.map(n => {
            const isLong = n.body && n.body.length > 140;
            const isExpanded = expandedId === n.id;
            return (
              <div key={n.id} onClick={() => isLong && setExpandedId(isExpanded ? null : n.id)}
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
  );
}

function InvoiceCard({ inv, onReply }) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const isOverdue = inv.status === 'overdue';
  const isPaid = inv.status === 'paid';
  const daysOverdue = isOverdue ? Math.ceil((Date.now() - new Date(inv.dueDate)) / 86400000) : 0;

  const statusBadge = {
    pending:  <span className="badge badge-pending">⏳ Pending</span>,
    overdue:  <span className="badge badge-failed">⚠️ Overdue</span>,
    paid:     <span className="badge badge-success">✅ Paid</span>,
    disputed: <span className="badge badge-escalated">⚠️ Disputed</span>,
  }[inv.status] || <span className="badge badge-blocked">{inv.status}</span>;

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    const res = await onReply(inv._id, replyText);
    setSent(res);
    setReplyText('');
    setSending(false);
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ padding: 16, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{inv.invoiceNumber}</span>
              {statusBadge}
              {inv.promiseSuppressed && inv.promiseToPayDate && (
                <span className="badge badge-success">📅 Promised {new Date(inv.promiseToPayDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              Due {new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {isOverdue && <span style={{ color: '#E5484D', marginLeft: 6, fontWeight: 500 }}>({daysOverdue}d overdue)</span>}
              {inv.description && ` · ${inv.description}`}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>₹{inv.amount.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
          {inv.approvalRequests?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>Your replies</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inv.approvalRequests.map((r, i) => {
                  const cfg = INTENT_CONFIG[r.extractedIntent] || { label: r.extractedIntent, color: '#64748B' };
                  const ab = APPROVAL_BADGE[r.status];
                  return (
                    <div key={i} style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, padding: 10, fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span className="badge badge-ai">🧠 AI: {cfg.label}</span>
                        <span style={{ background: ab.bg, color: ab.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{ab.label}</span>
                      </div>
                      <p style={{ fontStyle: 'italic', color: '#475569' }}>"{r.text}"</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sent && (
            <div className="anim-in" style={{ marginBottom: 12, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 10, fontSize: 12, color: '#C2410C' }}>
              🧠 AI understood this as <strong>{INTENT_CONFIG[sent.intent]?.label || sent.intent}</strong>. Sent to admin for verification — reminders won't change until approved.
            </div>
          )}

          {!isPaid && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>Reply to this invoice</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {QUICK_REPLIES.map(r => (
                  <button key={r.text} onClick={() => setReplyText(r.text)} className="btn btn-secondary btn-sm">{r.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Type your message to the vendor..." className="input" style={{ flex: 1 }} />
                <button onClick={handleSend} disabled={sending || !replyText.trim()} className="btn btn-primary">
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function B2BPortal() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const notifications = useNotifications(`rzp_demo_notifs_user2_${auth?.customerId}`);

  const fetchInvoices = useCallback(async () => {
    if (!auth?.customerId) return;
    try {
      const res = await axios.get(`/api/invoice/mine/${auth.customerId}`);
      setInvoices(res.data);
    } catch {}
    finally { setLoading(false); }
  }, [auth?.customerId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useSocket((type, data) => {
    if (!auth?.customerId || String(data.customerId) !== String(auth.customerId)) return;
    if (type === 'invoice_reminder_sent') {
      notifications.push({
        title: `📧 Reminder — ${data.invoiceNumber}`,
        body: data.message || 'A new reminder was sent.',
        dedupeKey: `reminder_${data.invoiceId}_${data.message?.length}`,
      });
      fetchInvoices();
    }
    if (type === 'invoice_approval_decided') {
      notifications.push({
        title: `${data.decision === 'approve' ? '✅ Approved' : '❌ Rejected'} — ${data.invoiceNumber}`,
        body: data.decision === 'approve' ? 'Admin approved your reply — it now applies to this invoice.' : 'Admin rejected your reply — no change was made.',
        dedupeKey: `decision_${data.requestId}`,
      });
      fetchInvoices();
    }
  });

  const handleReply = async (invoiceId, text) => {
    try {
      const res = await axios.post('/api/invoice/reply', { invoiceId, replyText: text });
      await fetchInvoices();
      return res.data;
    } catch { return null; }
  };

  if (!auth) return null;
  const overdue = invoices.filter(i => i.status === 'overdue');
  const totalOverdue = overdue.reduce((s, i) => s + i.amount, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60,
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} title="Back" style={{
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer', fontSize: 15,
          }}>←</button>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#6E56CF' }}>🏢</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>B2B Invoice Portal</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{auth.name} · logged in as User2</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NotificationBell notifications={notifications} />
          <button onClick={() => { logout(); navigate('/login'); }} style={{
            background: 'rgba(229,72,77,0.1)', border: '1px solid rgba(229,72,77,0.2)',
            color: '#E5484D', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>↩ Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px' }}>
        <div className="infobox infobox-purple" style={{ marginBottom: 20, fontSize: 12 }}>
          🏢 This is the <strong>separate B2B account</strong> your vendor's Admin cannot log into on your behalf. Replies you send here are classified by AI in real time, but only take effect on your invoice once your vendor's admin reviews and approves them.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 20 }}>
          <div className="metric-card" style={{ border: '1px solid rgba(229,72,77,0.2)' }}>
            <div className="metric-label">⚠️ Overdue</div>
            <div className="metric-value" style={{ color: 'var(--red)' }}>₹{totalOverdue.toLocaleString('en-IN')}</div>
            <div className="metric-sub">{overdue.length} invoice{overdue.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">📄 Total Invoices</div>
            <div className="metric-value">{invoices.length}</div>
            <div className="metric-sub">across all statuses</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">No invoices yet</div>
          </div>
        ) : invoices.map(inv => <InvoiceCard key={inv._id} inv={inv} onReply={handleReply} />)}
      </div>
    </div>
  );
}
