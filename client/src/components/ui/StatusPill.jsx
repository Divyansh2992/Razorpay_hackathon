export function OutcomePill({ outcome }) {
  const map = {
    recovered: { label: '✅ Recovered', cls: 'pill-recovered' },
    pending: { label: '⏳ Pending', cls: 'pill-pending' },
    failed: { label: '❌ Failed', cls: 'pill-failed' },
    opted_out: { label: '🚫 Opted Out', cls: 'pill-blocked' },
    escalated: { label: '📞 Escalated', cls: 'pill-escalated' },
    written_off: { label: '📝 Written Off', cls: 'pill-failed' },
    blocked_stopping_rule: { label: '🛑 Blocked', cls: 'pill-blocked' }
  };
  const def = map[outcome] || { label: outcome, cls: 'pill-pending' };
  return <span className={def.cls}>{def.label}</span>;
}

export function BucketPill({ bucket }) {
  const map = {
    hard_decline: { label: 'Hard Decline', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
    soft_decline: { label: 'Soft Decline', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    auth_friction: { label: 'Auth Friction', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    fraud_fp: { label: 'Fraud F+', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    infra_glitch: { label: 'Infra Glitch', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
    ambiguous: { label: '⚠️ Ambiguous', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' }
  };
  const def = map[bucket] || { label: bucket, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${def.color}`}>
      {def.label}
    </span>
  );
}
