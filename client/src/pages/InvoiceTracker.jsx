import { useState, useEffect } from 'react';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';

const INTENT_CONFIG = {
  promise_to_pay: { label: 'Promise to Pay',   color: 'var(--green)' },
  dispute:        { label: 'Dispute',           color: 'var(--red)' },
  confusion:      { label: 'Confused',          color: 'var(--amber)' },
  confirmation:   { label: 'Payment Confirmed', color: 'var(--green)' },
  refusal:        { label: 'Opt-Out',           color: '#64748B' },
};

const REMINDER_STAGES = ['Pre-due', 'On due', '+3 days', '+7 days', 'Final Notice'];

const APPROVAL_BADGE = {
  pending:  { label: '⏳ Awaiting your review', bg: '#FFF7ED', color: '#C2410C' },
  approved: { label: '✅ Approved', bg: '#EDFBF5', color: '#0EA371' },
  rejected: { label: '❌ Rejected', bg: '#FEF2F2', color: '#E5484D' },
};

function InvoiceRow({ inv, onTriggerOverdue, onAdvanceReminder, onDecide, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState({});
  const [sentMessage, setSentMessage] = useState(null);

  const setLoad = (k, v) => setLoading(p => ({ ...p, [k]: v }));

  const isOverdue = inv.status === 'overdue';
  const isPaid = inv.status === 'paid';
  const isDisputed = inv.status === 'disputed';
  const daysOverdue = isOverdue ? Math.ceil((Date.now() - new Date(inv.dueDate)) / 86400000) : 0;

  const statusBadge = {
    pending:  <span className="badge badge-pending">⏳ Pending</span>,
    overdue:  <span className="badge badge-failed">⚠️ Overdue</span>,
    paid:     <span className="badge badge-success">✅ Paid</span>,
    disputed: <span className="badge badge-escalated">⚠️ Disputed</span>,
  }[inv.status] || <span className="badge badge-blocked">{inv.status}</span>;

  const handleOverdue = async () => {
    setLoad('overdue', true);
    const res = await onTriggerOverdue(inv._id);
    if (res?.message) { setSentMessage(res.message); setExpanded(true); }
    setLoad('overdue', false);
  };

  const handleReminder = async () => {
    setLoad('reminder', true);
    const res = await onAdvanceReminder(inv._id);
    if (res?.message) { setSentMessage(res.message); setExpanded(true); }
    setLoad('reminder', false);
  };

  const handleDecide = async (requestId, decision) => {
    setLoad(`decide_${requestId}`, true);
    await onDecide(inv._id, requestId, decision);
    setLoad(`decide_${requestId}`, false);
  };

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      {/* Header row */}
      <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
        onClick={() => setExpanded(!expanded)}>
        {/* Left */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {inv.customerId?.company || inv.customerId?.name}
            </span>
            {statusBadge}
            {inv.promiseSuppressed && inv.promiseToPayDate && (
              <span className="badge badge-success">
                📅 Promised {new Date(inv.promiseToPayDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {inv.invoiceNumber} · Due {new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {isOverdue && <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 500 }}>({daysOverdue} days overdue)</span>}
            {inv.description && ` · ${inv.description}`}
          </div>

          {/* Reminder stage dots */}
          {isOverdue && inv.reminderStage > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reminders:</span>
              {REMINDER_STAGES.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i < inv.reminderStage ? 'var(--green)' :
                                i === inv.reminderStage - 1 ? 'var(--rzp-blue)' : 'var(--border)',
                    border: `1px solid ${i < inv.reminderStage ? 'transparent' : 'var(--border)'}`,
                    transition: 'all 0.2s'
                  }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s}</span>
                  {i < REMINDER_STAGES.length - 1 && (
                    <div style={{ width: 12, height: 1, background: i < inv.reminderStage ? 'var(--green)' : 'var(--border)', marginRight: 2 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — amount + actions */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            ₹{inv.amount.toLocaleString('en-IN')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {!isOverdue && !isPaid && !isDisputed && (
              <button onClick={e => { e.stopPropagation(); handleOverdue(); }}
                disabled={loading.overdue} className="btn btn-danger btn-sm" id={`overdue-${inv._id}`}>
                {loading.overdue ? '...' : '⚡ Mark Overdue'}
              </button>
            )}
            {isOverdue && !inv.promiseSuppressed && (
              <button onClick={e => { e.stopPropagation(); handleReminder(); }}
                disabled={loading.reminder} className="btn btn-secondary btn-sm" id={`reminder-${inv._id}`}>
                {loading.reminder ? '...' : '📧 Next Reminder'}
              </button>
            )}
            {inv.promiseSuppressed && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⏸ Suppressed</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded — reply + history */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
          {/* Message just sent */}
          {sentMessage && (
            <div className="anim-in infobox infobox-green" style={{ marginBottom: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <span className="badge badge-success">📧 Message sent</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{sentMessage}</p>
            </div>
          )}

          {/* Approval requests — every reply (from the B2B User2 portal, or simulated here) needs your sign-off */}
          {inv.approvalRequests?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Customer Replies — Needs Verification</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inv.approvalRequests.map((r) => {
                  const cfg = INTENT_CONFIG[r.extractedIntent] || { label: r.extractedIntent, color: 'var(--text-muted)' };
                  const ab = APPROVAL_BADGE[r.status];
                  return (
                    <div key={r._id} className="infobox infobox-blue" style={{ fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span className="badge badge-ai">🧠 AI</span>
                        <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                        {r.extractedDate && <span style={{ color: 'var(--green)' }}>📅 {r.extractedDate}</span>}
                        <span style={{ background: ab.bg, color: ab.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>{ab.label}</span>
                      </div>
                      <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{r.text}"</p>
                      {r.summary && <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{r.summary}</p>}
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => handleDecide(r._id, 'approve')} disabled={loading[`decide_${r._id}`]}
                            className="btn btn-primary btn-sm">✅ Approve</button>
                          <button onClick={() => handleDecide(r._id, 'reject')} disabled={loading[`decide_${r._id}`]}
                            className="btn btn-secondary btn-sm">❌ Reject</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isPaid && !inv.approvalRequests?.length && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
              No replies yet — the customer replies from their own B2B portal, not from here.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InvoiceTracker() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = async () => {
    try {
      const res = await axios.get('/api/invoice');
      setInvoices(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchInvoices(); }, []);

  useSocket((type) => {
    if (type === 'invoice_approval_requested') fetchInvoices();
  });

  const triggerOverdue = async (id) => {
    const res = await axios.post('/api/invoice/trigger-overdue', { invoiceId: id }).catch(() => null);
    await fetchInvoices();
    return res?.data;
  };

  const advanceReminder = async (id) => {
    const res = await axios.post('/api/invoice/advance-reminder', { invoiceId: id }).catch(() => null);
    await fetchInvoices();
    return res?.data;
  };

  const decide = async (invoiceId, requestId, decision) => {
    try {
      await axios.post('/api/invoice/approve', { invoiceId, requestId, decision });
      await fetchInvoices();
    } catch {}
  };

  const overdue = invoices.filter(i => i.status === 'overdue');
  const paid    = invoices.filter(i => i.status === 'paid');
  const promised = invoices.filter(i => i.promiseSuppressed);
  const pendingApprovals = invoices.reduce((n, i) => n + (i.approvalRequests?.filter(r => r.status === 'pending').length || 0), 0);

  const totalOverdue = overdue.reduce((s, i) => s + i.amount, 0);
  const totalPaid    = paid.reduce((s, i) => s + i.amount, 0);

  return (
    <div>
      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="metric-card" style={{ border: '1px solid rgba(229,72,77,0.2)' }}>
          <div className="metric-label">⚠️ Overdue</div>
          <div className="metric-value" style={{ color: 'var(--red)' }}>₹{totalOverdue.toLocaleString('en-IN')}</div>
          <div className="metric-sub">{overdue.length} invoice{overdue.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="metric-card" style={{ border: '1px solid rgba(14,163,113,0.2)' }}>
          <div className="metric-label">✅ Collected</div>
          <div className="metric-value" style={{ color: 'var(--green)' }}>₹{totalPaid.toLocaleString('en-IN')}</div>
          <div className="metric-sub">{paid.length} paid</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">⏳ Pending</div>
          <div className="metric-value">{invoices.filter(i => i.status === 'pending').length}</div>
          <div className="metric-sub">awaiting due date</div>
        </div>
        <div className="metric-card" style={{ border: '1px solid rgba(14,163,113,0.15)' }}>
          <div className="metric-label">📅 Promised</div>
          <div className="metric-value" style={{ color: 'var(--green)' }}>{promised.length}</div>
          <div className="metric-sub">reminders paused</div>
        </div>
      </div>

      {pendingApprovals > 0 && (
        <div className="infobox infobox-amber" style={{ marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          🔔 {pendingApprovals} customer repl{pendingApprovals !== 1 ? 'ies' : 'y'} waiting on your approval — expand the invoice below to review.
        </div>
      )}

      {/* Invoices */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading invoices...</div>
      ) : (
        <div>
          {invoices.map(inv => (
            <InvoiceRow key={inv._id} inv={inv}
              onTriggerOverdue={triggerOverdue}
              onAdvanceReminder={advanceReminder}
              onDecide={decide}
              onRefresh={fetchInvoices} />
          ))}
        </div>
      )}
    </div>
  );
}
