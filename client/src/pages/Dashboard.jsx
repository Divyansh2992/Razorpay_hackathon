import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';
import EventCard from '../components/EventCard';
import AuditTable from '../components/AuditTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const FUNNEL_COLORS = { 1: '#0EA371', 2: '#2561E8', 3: '#C08B00', 4: '#6E56CF', 5: '#E5484D' };
const FUNNEL_LABELS = { 1: 'Silent', 2: 'Nudge', 3: 'In-App', 4: 'AI Chat', 5: 'Voice' };

function MetricCard({ label, value, sub, color, trend, icon }) {
  return (
    <div className="metric-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div className="metric-label">{label}</div>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div className="metric-value" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="metric-sub" style={{ marginTop: 4 }}>{sub}</div>}
      {trend && <div className={`metric-change-${trend.dir}`} style={{ marginTop: 4 }}>{trend.text}</div>}
    </div>
  );
}

function FunnelChart({ data }) {
  if (!data) return <div className="empty-state"><div>No data yet</div></div>;

  const chartData = [1,2,3,4,5].map(l => ({
    name: `L${l} ${FUNNEL_LABELS[l]}`,
    shortName: `L${l}`,
    atRisk:    data[l]?.atRisk    || 0,
    recovered: data[l]?.recovered || 0,
    count:     data[l]?.count     || 0,
    level: l
  }));

  const totalRec = chartData.reduce((s, d) => s + d.recovered, 0);
  const silentRec = (data[1]?.recovered || 0) + (data[2]?.recovered || 0);
  const silentPct = totalRec > 0 ? Math.round((silentRec / totalRec) * 100) : 0;

  return (
    <div>
      {silentPct > 0 && (
        <div className="infobox infobox-green" style={{ marginBottom: 12, fontSize: 12 }}>
          <strong>{silentPct}%</strong> recovered silently (L1–L2) — customer never saw a notification
        </div>
      )}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barGap={3} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`}
            tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: 'var(--shadow-md)' }}
            labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
            formatter={(val, name) => [`₹${val.toLocaleString('en-IN')}`, name === 'recovered' ? 'Recovered' : 'At Risk']}
          />
          <Bar dataKey="atRisk" radius={[3,3,0,0]} maxBarSize={28}>
            {chartData.map(d => <Cell key={d.level} fill={`${FUNNEL_COLORS[d.level]}18`} stroke={`${FUNNEL_COLORS[d.level]}40`} />)}
          </Bar>
          <Bar dataKey="recovered" radius={[3,3,0,0]} maxBarSize={28}>
            {chartData.map(d => <Cell key={d.level} fill={FUNNEL_COLORS[d.level]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4 }}>
        {chartData.map(d => (
          <div key={d.level} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: FUNNEL_COLORS[d.level] }}>L{d.level}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.count} events</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The REST /events shape (Mongoose-populated) differs from the socket 'detected' payload shape —
// this reshapes a fetched event into what EventCard/liveEvents expect, so opening the Dashboard
// after events already happened still shows recent history instead of an empty "live" feed.
function toLiveShape(ev) {
  return {
    recoveryEventId: ev._id,
    transactionId: ev.transactionId?._id,
    customerId: ev.customerId?._id,
    customer: { name: ev.customerId?.name, email: ev.customerId?.email },
    category: ev.category,
    amount: ev.amount,
    errorCode: ev.transactionId?.errorCode,
    errorReason: ev.transactionId?.errorReason,
    detectedAt: ev.detectedAt,
    diagnosis: ev.diagnosis,
    actionTaken: ev.actionTaken,
    outcome: ev.outcome,
    amountRecovered: ev.amountRecovered,
    _socketStatus: 'detected'
  };
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [tab, setTab] = useState('live');
  const liveSeededRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        axios.get('/api/dashboard/summary'),
        axios.get('/api/dashboard/events?limit=100')
      ]);
      setSummary(s.data);
      setAuditEvents(e.data.events || []);
      if (!liveSeededRef.current) {
        liveSeededRef.current = true;
        setLiveEvents((e.data.events || []).slice(0, 30).map(toLiveShape));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 8000);
    return () => clearInterval(t);
  }, [fetchData]);

  const handleSocket = useCallback((type, data) => {
    setLiveEvents(prev => {
      const idx = prev.findIndex(e => e.recoveryEventId === data.recoveryEventId);
      if (type === 'detected') return [{ ...data, _socketStatus: 'detected' }, ...prev.slice(0, 29)];
      if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], ...data }; return u; }
      return prev;
    });
    if (type === 'resolved' || type === 'blocked') setTimeout(fetchData, 600);
  }, [fetchData]);

  useSocket(handleSocket);

  const s = summary;
  const recRate = s?.recoveryRate || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="infobox infobox-blue" style={{ fontSize: 12 }}>
        ℹ️ This dashboard tracks <strong>at-risk revenue the agent recovered</strong> — payments that failed and were then fixed. A payment that succeeds on the first try never becomes "at risk," so it won't appear here; go check out with a Razorpay test card that <em>fails</em> to see the pipeline in action.
      </div>
      {/* Metric row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1fr 1fr 1fr', gap: 14 }}>
        {/* Big recovered card */}
        <div className="metric-card" style={{ border: '1px solid rgba(14,163,113,0.25)', background: 'linear-gradient(135deg, #FAFFFE 0%, #F0FDF9 100%)' }}>
          <div className="metric-label" style={{ color: '#065F46' }}>💰 Total Recovered</div>
          <div className="metric-value" style={{ color: 'var(--green)', fontSize: 28 }}>
            ₹{(s?.totalRecovered || 0).toLocaleString('en-IN')}
          </div>
          <div className="metric-sub">of ₹{(s?.totalAtRisk || 0).toLocaleString('en-IN')} at risk</div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Recovery rate</span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{recRate}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(recRate, 100)}%`, background: 'var(--green)' }} />
            </div>
          </div>
        </div>

        <MetricCard label="⚡ Total Events" value={s?.totalEvents || 0} sub="processed by agent" />
        <MetricCard label="🔧 Rule-based" value={s?.methodBreakdown?.rule?.count || 0}
          color="var(--text-primary)"
          sub={`₹${(s?.methodBreakdown?.rule?.recovered || 0).toLocaleString('en-IN')} recovered`} />
        <MetricCard label="🧠 AI-diagnosed" value={s?.methodBreakdown?.llm?.count || 0}
          color="#6E56CF"
          sub={`₹${(s?.methodBreakdown?.llm?.recovered || 0).toLocaleString('en-IN')} recovered`} />
        <MetricCard label="🛑 Gov. Blocked" value={s?.blockedByGovernance || 0}
          color="var(--text-muted)" sub="stopping rules applied" />
        <MetricCard label="💵 Razorpay Fees" value={`₹${(s?.razorpayFeeRevenue || 0).toLocaleString('en-IN')}`}
          color="var(--rzp-blue)" sub="2% of recovered" />
      </div>

      {/* Funnel + categories */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recovery Funnel</div>
              <div className="card-subtitle">₹ at risk vs ₹ recovered by escalation level</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="badge badge-rule">🔧 Rule</span>
              <span className="badge badge-ai">🧠 AI</span>
            </div>
          </div>
          <div className="card-body">
            <FunnelChart data={s?.funnelBreakdown} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['checkout', 'subscription', 'invoice', 'abandonment'].map(cat => {
            const d = s?.byCategory?.[cat] || { atRisk: 0, recovered: 0, count: 0 };
            const pct = d.atRisk > 0 ? Math.round((d.recovered / d.atRisk) * 100) : 0;
            return (
              <div key={cat} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{cat}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.count} events</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>₹{d.recovered.toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct}% recovered</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event stream */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Event Stream</div>
          <div className="tab-bar" style={{ border: 'none', gap: 0 }}>
            {[
              { id: 'live',  label: `Live Feed${liveEvents.length > 0 ? ` (${liveEvents.length})` : ''}` },
              { id: 'audit', label: `Audit Trail (${auditEvents.length})` }
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`tab-btn${tab === t.id ? ' active' : ''}`}
                id={`stream-tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body">
          {tab === 'live' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
              {liveEvents.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">⚡</div>
                  <div className="empty-state-title">Waiting for payment events</div>
                  <div className="empty-state-desc">Go to the Store and check out with a failure scenario to see the recovery agent in action</div>
                </div>
              ) : liveEvents.map((ev, i) => <EventCard key={ev.recoveryEventId || i} event={ev} />)}
            </div>
          )}
          {tab === 'audit' && <AuditTable events={auditEvents} />}
        </div>
      </div>
    </div>
  );
}
