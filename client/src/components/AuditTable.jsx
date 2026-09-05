const FUNNEL_CLS    = { 1: 'badge-l1', 2: 'badge-l2', 3: 'badge-l3', 4: 'badge-l4', 5: 'badge-l5' };
const FUNNEL_LABELS = { 1: 'L1 Silent', 2: 'L2 Nudge', 3: 'L3 In-App', 4: 'L4 AI Chat', 5: 'L5 Voice' };

const OUTCOME_CONFIG = {
  recovered:             { label: '✅ Recovered',   cls: 'badge-success' },
  pending:               { label: '⏳ Pending',     cls: 'badge-pending' },
  failed:                { label: '❌ Failed',      cls: 'badge-failed' },
  opted_out:             { label: '🚫 Opted Out',  cls: 'badge-blocked' },
  escalated:             { label: '📞 Escalated', cls: 'badge-escalated' },
  blocked_stopping_rule: { label: '🛑 Blocked',    cls: 'badge-blocked' },
  written_off:           { label: '📝 Written Off', cls: 'badge-failed' }
};

const METHOD_CONFIG = {
  rule: { label: '🔧 Rule', cls: 'badge-rule' },
  llm:  { label: '🧠 AI',   cls: 'badge-ai' }
};

const CAT_CONFIG = {
  checkout:     { label: 'Checkout',     cls: 'badge-blue' },
  subscription: { label: 'Subscription', cls: 'badge-rule' },
  invoice:      { label: 'Invoice',      cls: 'badge-pending' },
  abandonment:  { label: 'Abandonment',  cls: 'badge-blocked' }
};

export default function AuditTable({ events = [] }) {
  if (!events.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-title">No events recorded yet</div>
        <div className="empty-state-desc">Trigger a payment failure from the Store or Recovery Live to see it here</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="rzp-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Error Code</th>
            <th>Diagnosis</th>
            <th>Action</th>
            <th>Outcome</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev, i) => {
            const outcomeCfg = OUTCOME_CONFIG[ev.outcome] || { label: ev.outcome, cls: 'badge-blocked' };
            const methodCfg  = METHOD_CONFIG[ev.diagnosis?.method];
            const catCfg     = CAT_CONFIG[ev.category] || { label: ev.category, cls: 'badge-blocked' };
            const funnelCls  = FUNNEL_CLS[ev.actionTaken?.funnelLevel];

            return (
              <tr key={ev._id || i}>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{ev.customerId?.name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.customerId?.email}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    ₹{(ev.amount || 0).toLocaleString('en-IN')}
                  </div>
                  {ev.amountRecovered > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--green)' }}>
                      ↑ ₹{ev.amountRecovered.toLocaleString('en-IN')}
                    </div>
                  )}
                </td>
                <td><span className={`badge ${catCfg.cls}`}>{catCfg.label}</span></td>
                <td>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C2400C' }}>
                    {ev.transactionId?.errorCode || '—'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {(ev.diagnosis?.bucket || '—').replace(/_/g, ' ')}
                    </span>
                    {methodCfg && <span className={`badge ${methodCfg.cls}`} style={{ width: 'fit-content' }}>{methodCfg.label}</span>}
                  </div>
                </td>
                <td>
                  {funnelCls
                    ? <span className={`badge ${funnelCls}`}>{FUNNEL_LABELS[ev.actionTaken?.funnelLevel]}</span>
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td>
                  <span className={`badge ${outcomeCfg.cls}`}>{outcomeCfg.label}</span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {ev.detectedAt
                    ? new Date(ev.detectedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
