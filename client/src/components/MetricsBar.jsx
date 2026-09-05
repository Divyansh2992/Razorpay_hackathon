function MetricCard({ label, value, sub, color = 'white', icon, glow }) {
  return (
    <div className={`metric-card ${glow ? 'shadow-glow' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</div>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold mt-1`} style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function MetricsBar({ summary }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="metric-card animate-pulse">
            <div className="h-4 bg-white/5 rounded w-24 mb-2"></div>
            <div className="h-8 bg-white/5 rounded w-32"></div>
          </div>
        ))}
      </div>
    );
  }

  const { totalAtRisk, totalRecovered, recoveryRate, totalEvents, blockedByGovernance, methodBreakdown, razorpayFeeRevenue } = summary;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <div className="col-span-2 md:col-span-2 metric-card" style={{ border: '1px solid rgba(74,222,128,0.2)' }}>
        <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">₹ Recovered</div>
        <div className="text-3xl font-bold text-green-400 mt-1 text-glow-green">
          ₹{(totalRecovered || 0).toLocaleString('en-IN')}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          of ₹{(totalAtRisk || 0).toLocaleString('en-IN')} at risk
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Recovery rate</span>
            <span className="text-green-400 font-semibold">{recoveryRate || 0}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(recoveryRate || 0, 100)}%` }} />
          </div>
        </div>
      </div>

      <MetricCard
        label="Total Events"
        value={totalEvents || 0}
        icon="⚡"
        sub="processed by agent"
      />

      <MetricCard
        label="Rule-based"
        value={methodBreakdown?.rule?.count || 0}
        icon="🔧"
        color="#FB923C"
        sub={`₹${(methodBreakdown?.rule?.recovered || 0).toLocaleString('en-IN')} recovered`}
      />

      <MetricCard
        label="AI-diagnosed"
        value={methodBreakdown?.llm?.count || 0}
        icon="🧠"
        color="#A78BFA"
        sub={`₹${(methodBreakdown?.llm?.recovered || 0).toLocaleString('en-IN')} recovered`}
      />

      <MetricCard
        label="Governance Blocks"
        value={blockedByGovernance || 0}
        icon="🛑"
        color="#94A3B8"
        sub="stopping rules enforced"
      />

      <MetricCard
        label="Razorpay Fee Revenue"
        value={`₹${(razorpayFeeRevenue || 0).toLocaleString('en-IN')}`}
        icon="💰"
        color="#00D4FF"
        sub="2% of recovered amount"
        glow
      />
    </div>
  );
}
