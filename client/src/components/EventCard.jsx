import { useState } from 'react';

const CHANNEL_ICONS  = { whatsapp: '💬', sms: '📱', email: '📧', voice: '📞', in_app: '🔔', none: '—' };
const CHANNEL_LABELS = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Voice Call', in_app: 'In-App', none: 'Silent' };

const BUCKET_CONFIG = {
  hard_decline:  { label: 'Hard Decline',  cls: 'badge-failed' },
  soft_decline:  { label: 'Soft Decline',  cls: 'badge-pending' },
  auth_friction: { label: 'Auth Friction', cls: 'badge-blue' },
  fraud_fp:      { label: 'Fraud FP',      cls: 'badge-pending' },
  infra_glitch:  { label: 'Infra Glitch',  cls: 'badge-blocked' },
  ambiguous:     { label: 'Ambiguous',     cls: 'badge-ai' }
};

const FUNNEL_CLS    = { 1: 'badge-l1', 2: 'badge-l2', 3: 'badge-l3', 4: 'badge-l4', 5: 'badge-l5' };
const FUNNEL_LABELS = { 1: 'L1 Silent', 2: 'L2 Nudge', 3: 'L3 In-App', 4: 'L4 AI Chat', 5: 'L5 Voice' };

const OUTCOME_CONFIG = {
  recovered:             { label: '✅ Recovered',   cls: 'badge-success' },
  pending:               { label: '⏳ Pending',     cls: 'badge-pending' },
  failed:                { label: '❌ Failed',      cls: 'badge-failed' },
  opted_out:             { label: '🚫 Opted Out',   cls: 'badge-blocked' },
  escalated:             { label: '📞 Escalated',  cls: 'badge-escalated' },
  blocked_stopping_rule: { label: '🛑 Blocked',    cls: 'badge-blocked' },
  written_off:           { label: '📝 Written Off', cls: 'badge-failed' }
};

function NotificationPreview({ channel, message }) {
  if (!message || !channel || channel === 'none') return null;
  const bubbleClass = channel === 'whatsapp' ? 'notif-wa' : channel === 'email' ? 'notif-email' : 'notif-sms';
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{CHANNEL_ICONS[channel]}</span>
        <span style={{ fontWeight: 500 }}>{CHANNEL_LABELS[channel]} notification sent</span>
        <span style={{ color: 'var(--green)' }}>✓ Delivered</span>
      </div>
      <div className={bubbleClass}>{message}</div>
    </div>
  );
}

export default function EventCard({ event }) {
  const [open, setOpen] = useState(false);

  const { diagnosis = {}, actionTaken = {}, outcome, amount, amountRecovered, customer, category, errorCode, errorReason, detectedAt } = event;

  const outcomeCfg = OUTCOME_CONFIG[outcome] || { label: outcome || 'Pending', cls: 'badge-pending' };
  const bucketCfg  = BUCKET_CONFIG[diagnosis?.bucket] || null;
  const funnelCls  = FUNNEL_CLS[actionTaken?.funnelLevel];
  const isRecovered = outcome === 'recovered';

  const borderColor =
    isRecovered ? 'var(--green)' :
    outcome === 'blocked_stopping_rule' ? '#CBD5E1' :
    outcome === 'pending' ? 'var(--amber)' :
    outcome === 'failed' ? 'var(--red)' : 'var(--border)';

  return (
    <div className="event-row anim-in" style={{ borderLeft: `3px solid ${borderColor}` }} onClick={() => setOpen(!open)}>
      {/* Row 1 — name + amount */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {customer?.name || 'Unknown'}
            </span>
            <span className="badge badge-blocked" style={{ textTransform: 'capitalize' }}>{category}</span>
            {diagnosis?.method === 'llm'  && <span className="badge badge-ai">🧠 AI</span>}
            {diagnosis?.method === 'rule' && <span className="badge badge-rule">🔧 Rule</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {errorCode && <span style={{ fontFamily: 'monospace', color: '#C2400C', marginRight: 6 }}>{errorCode}</span>}
            {errorReason}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: isRecovered ? 'var(--green)' : 'var(--text-primary)' }}>
            ₹{(amount || 0).toLocaleString('en-IN')}
          </div>
          <div style={{ marginTop: 4 }}>
            <span className={`badge ${outcomeCfg.cls}`}>{outcomeCfg.label}</span>
          </div>
        </div>
      </div>

      {/* Row 2 — badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {bucketCfg && <span className={`badge ${bucketCfg.cls}`}>{bucketCfg.label}</span>}
        {funnelCls && <span className={`badge ${funnelCls}`}>{FUNNEL_LABELS[actionTaken?.funnelLevel]}</span>}
        {actionTaken?.channel && actionTaken.channel !== 'none' && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            via {CHANNEL_ICONS[actionTaken.channel]} {CHANNEL_LABELS[actionTaken.channel]}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {detectedAt ? new Date(detectedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
        </span>
      </div>

      {/* Notification bubble */}
      {actionTaken?.messageContent && (
        <NotificationPreview channel={actionTaken.channel} message={actionTaken.messageContent} />
      )}

      {/* Expandable detail */}
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {diagnosis?.llmReasoning && (
            <div className="infobox infobox-purple" style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                🧠 LLM Reasoning
                {diagnosis.confidence && (
                  <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--purple)' }}>
                    {(diagnosis.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <p style={{ lineHeight: 1.6 }}>{diagnosis.llmReasoning}</p>
            </div>
          )}
          {actionTaken?.governanceBlock && (
            <div className="infobox infobox-red" style={{ fontSize: 12 }}>
              <strong>🛑 Governance Block:</strong> {actionTaken.governanceBlock}
            </div>
          )}
          {isRecovered && amountRecovered > 0 && (
            <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>
              ✅ ₹{amountRecovered.toLocaleString('en-IN')} recovered ·
              Razorpay platform fee: ₹{Math.round(amountRecovered * 0.02).toLocaleString('en-IN')}
            </div>
          )}
          {customer?.email && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📧 {customer.email}</div>
          )}
        </div>
      )}
    </div>
  );
}
