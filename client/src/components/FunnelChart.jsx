import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

const FUNNEL_COLORS = {
  1: '#4ADE80',
  2: '#22D3EE',
  3: '#FACC15',
  4: '#A78BFA',
  5: '#F97316'
};

const FUNNEL_LABELS = {
  1: 'L1 Silent',
  2: 'L2 Nudge',
  3: 'L3 In-App',
  4: 'L4 AI Chat',
  5: 'L5 Voice'
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="glass-card p-3 border border-white/10 text-xs" style={{ minWidth: 160 }}>
      <div className="font-semibold text-white mb-1">{d?.fullLabel}</div>
      <div className="text-slate-400">₹ At Risk: <span className="text-white font-medium">₹{(d?.atRisk || 0).toLocaleString('en-IN')}</span></div>
      <div className="text-slate-400">₹ Recovered: <span className="font-medium" style={{ color: FUNNEL_COLORS[d?.level] }}>₹{(d?.recovered || 0).toLocaleString('en-IN')}</span></div>
      <div className="text-slate-400">Events: <span className="text-white">{d?.count}</span></div>
      {d?.level <= 2 && <div className="mt-1 text-green-400 font-medium">✅ Silent/Low-friction recovery</div>}
    </div>
  );
}

export default function FunnelChart({ data }) {
  if (!data) return null;

  const chartData = Object.values(data).map(d => ({
    name: FUNNEL_LABELS[d.level],
    fullLabel: `Level ${d.level}: ${d.label}`,
    atRisk: d.atRisk || 0,
    recovered: d.recovered || 0,
    count: d.count || 0,
    level: d.level,
    recoveryRate: d.atRisk > 0 ? ((d.recovered / d.atRisk) * 100).toFixed(0) : 0
  }));

  const totalRecovered = chartData.reduce((s, d) => s + d.recovered, 0);
  const silentRecovered = chartData.filter(d => d.level <= 2).reduce((s, d) => s + d.recovered, 0);
  const silentPct = totalRecovered > 0 ? ((silentRecovered / totalRecovered) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-4">
      {/* Silent recovery callout */}
      {totalRecovered > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg"
          style={{ background: 'rgba(74, 222, 128, 0.07)', border: '1px solid rgba(74, 222, 128, 0.15)' }}>
          <div className="text-2xl">⚡</div>
          <div>
            <div className="text-sm font-semibold text-green-400">
              {silentPct}% recovered silently (L1–L2)
            </div>
            <div className="text-xs text-slate-400">
              ₹{silentRecovered.toLocaleString('en-IN')} out of ₹{totalRecovered.toLocaleString('en-IN')} recovered without relying on customer reading a notification
            </div>
          </div>
        </div>
      )}

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barGap={4} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`}
            tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="atRisk" name="At Risk" radius={[3,3,0,0]} maxBarSize={40}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={`${FUNNEL_COLORS[entry.level]}22`} stroke={`${FUNNEL_COLORS[entry.level]}44`} />
            ))}
          </Bar>
          <Bar dataKey="recovered" name="Recovered" radius={[3,3,0,0]} maxBarSize={40}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={FUNNEL_COLORS[entry.level]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Level legend */}
      <div className="grid grid-cols-5 gap-2">
        {chartData.map(d => (
          <div key={d.level} className="text-center">
            <div className="text-xs font-semibold" style={{ color: FUNNEL_COLORS[d.level] }}>{d.name}</div>
            <div className="text-xs text-slate-500">{d.count} events</div>
            {d.recoveryRate > 0 && <div className="text-xs text-slate-400">{d.recoveryRate}%</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
