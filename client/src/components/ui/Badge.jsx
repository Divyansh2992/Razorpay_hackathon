export function MethodBadge({ method, size = 'sm' }) {
  if (method === 'llm') {
    return (
      <span className="badge-ai">
        🧠 AI
      </span>
    );
  }
  return (
    <span className="badge-rule">
      🔧 Rule
    </span>
  );
}

export function FunnelBadge({ level }) {
  const labels = ['', 'Silent', 'Nudge', 'In-App', 'AI Chat', 'Voice'];
  const colors = [
    '',
    'bg-green-500/10 text-green-400 border-green-500/20',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[level] || colors[2]}`}>
      L{level} {labels[level]}
    </span>
  );
}

export function CategoryBadge({ category }) {
  const map = {
    checkout: { label: 'Checkout', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    subscription: { label: 'Subscription', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    invoice: { label: 'Invoice', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    abandonment: { label: 'Abandoned', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
  };
  const def = map[category] || map.checkout;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${def.color}`}>
      {def.label}
    </span>
  );
}
