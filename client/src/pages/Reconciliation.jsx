import { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_BADGE = {
  pending:   <span className="badge badge-pending">⏳ Pending</span>,
  failed:    <span className="badge badge-failed">❌ Failed</span>,
  abandoned: <span className="badge badge-blocked">🛒 Abandoned</span>,
  recovered: <span className="badge badge-success">✅ Recovered</span>,
};

// A real step-by-step trace of what the reconciliation check actually did — same
// checklist style used elsewhere in the app (Recovery Live's pipeline), so this
// reads as a genuine mechanism rather than a one-line verdict.
function TraceSteps({ trace }) {
  if (!trace?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 10 }}>
      {trace.map((step, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: i < trace.length - 1 ? 10 : 0, position: 'relative' }}>
          {i < trace.length - 1 && (
            <div style={{ position: 'absolute', left: 9, top: 20, bottom: 0, width: 1, background: 'var(--border)' }} />
          )}
          <div style={{
            width: 19, height: 19, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            background: step.isMismatch ? 'var(--amber-bg)' : step.isFinal ? 'var(--green-bg)' : step.ok === false ? 'var(--red-bg)' : 'var(--rzp-blue-50)',
            color: step.isMismatch ? '#78350F' : step.isFinal ? 'var(--green)' : step.ok === false ? 'var(--red)' : 'var(--rzp-blue)',
            border: `1px solid ${step.isMismatch ? 'rgba(192,139,0,0.3)' : step.isFinal ? 'rgba(14,163,113,0.3)' : step.ok === false ? 'rgba(229,72,77,0.3)' : 'rgba(37,97,232,0.3)'}`,
          }}>
            {step.isFinal ? '✓' : step.isMismatch ? '!' : step.ok === false ? '✕' : '✓'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 1 }}>{step.label}</div>
        </div>
      ))}
    </div>
  );
}

// Shows the actual data pulled from both sides — our DB record vs. Razorpay's real
// payment record — as a field-by-field diff, plus the raw API call/response. This is
// meant to look like what it is: a real data comparison, not a written explanation.
function RecordComparison({ result }) {
  if (!result.apiCall) return null;
  return (
    <div style={{ marginTop: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--rzp-blue)', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        GET https://api.razorpay.com{result.apiCall.endpoint}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div style={{ padding: 12, borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Our Database</div>
          {Object.entries(result.ourRecord || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, fontFamily: 'monospace' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
              <span style={{ fontWeight: 700, color: result.mismatch && k === 'status' ? 'var(--red)' : 'var(--text-primary)' }}>{String(v)}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Razorpay (source of truth)</div>
          {result.razorpayRecord ? Object.entries(result.razorpayRecord).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, fontFamily: 'monospace' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
              <span style={{ fontWeight: 700, color: result.mismatch && k === 'status' ? 'var(--green)' : 'var(--text-primary)' }}>{String(v)}</span>
            </div>
          )) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>}
        </div>
      </div>
      {result.allPayments?.length > 0 && (
        <details style={{ borderTop: '1px solid var(--border)' }}>
          <summary style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>Raw API response — {result.allPayments.length} payment attempt{result.allPayments.length !== 1 ? 's' : ''}</summary>
          <pre style={{ margin: 0, padding: '0 12px 12px', fontSize: 10, color: 'var(--text-secondary)', overflowX: 'auto' }}>{JSON.stringify(result.allPayments, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function CandidateRow({ tx, onRecheck }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const displayStatus = result?.mismatch ? 'recovered' : tx.status;

  const recheck = async () => {
    setChecking(true);
    const res = await onRecheck(tx._id);
    setResult(res);
    setChecking(false);
  };

  return (
    <div className="card" style={{ marginBottom: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{tx.customerId?.name || 'Unknown'}</span>
            {STATUS_BADGE[displayStatus] || <span className="badge badge-blocked">{displayStatus}</span>}
            <span className="badge badge-blocked" style={{ textTransform: 'capitalize' }}>{tx.category}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {tx.errorCode && <span style={{ fontFamily: 'monospace', marginRight: 6 }}>{tx.errorCode}</span>}
            {tx.errorReason || 'No error reason recorded'}
            {tx.razorpayOrderId && <span style={{ marginLeft: 6, color: '#CBD5E1' }}>· {tx.razorpayOrderId}</span>}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>₹{tx.amount.toLocaleString('en-IN')}</div>
        {!result?.mismatch && (
          <button onClick={recheck} disabled={checking} className="btn btn-secondary btn-sm">
            {checking ? 'Checking…' : '🔍 Recheck with Razorpay'}
          </button>
        )}
      </div>

      {checking && !result && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Calling Razorpay's real API for this order…
        </div>
      )}

      {result && (
        <div className={`anim-in`} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
          <TraceSteps trace={result.trace} />
          <RecordComparison result={result} />
          {!result.mismatch && result.apiCall && (
            <div className="infobox infobox-blue" style={{ marginTop: 10, fontSize: 12 }}>
              ℹ️ {result.reason || 'No mismatch — Razorpay confirms this genuinely was not paid.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Reconciliation() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);

  const fetchCandidates = async () => {
    try {
      const res = await axios.get('/api/checkout/reconciliation-candidates');
      setCandidates(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCandidates(); }, []);

  // Don't refetch (and silently drop the row) right after a fix — the whole point is
  // to let the admin see the evidence of what was just recovered, not have it vanish.
  const recheckOne = async (transactionId) => {
    try {
      const res = await axios.post('/api/checkout/reconcile', { transactionId });
      return res.data;
    } catch (err) {
      return { checked: false, mismatch: false, reason: err.response?.data?.error || 'Request failed', trace: [] };
    }
  };

  const runSweep = async () => {
    setSweeping(true);
    setSweepResult(null);
    try {
      const res = await axios.post('/api/checkout/reconcile-sweep');
      setSweepResult(res.data);
    } catch {}
    setSweeping(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {candidates.length} transaction{candidates.length !== 1 ? 's' : ''} not marked as paid
        </div>
        <button onClick={runSweep} disabled={sweeping || candidates.length === 0} className="btn btn-primary">
          {sweeping ? '🔄 Sweeping…' : '🔄 Run Full Reconciliation Sweep'}
        </button>
      </div>

      {sweepResult && (
        <div style={{ marginBottom: 16 }}>
          <div className={`anim-in infobox ${sweepResult.mismatchesFixed > 0 ? 'infobox-green' : 'infobox-blue'}`} style={{ marginBottom: 10, fontSize: 13 }}>
            Checked {sweepResult.checked} transaction{sweepResult.checked !== 1 ? 's' : ''} against Razorpay's real records —{' '}
            {sweepResult.mismatchesFixed > 0
              ? `found and fixed ${sweepResult.mismatchesFixed} mismatch${sweepResult.mismatchesFixed !== 1 ? 'es' : ''}, recovering ₹${sweepResult.amountRecovered.toLocaleString('en-IN')} that was already paid but untracked.`
              : `no mismatches — everything genuinely matches what Razorpay shows.`}
          </div>
          {sweepResult.results.map(r => (
            <div key={r.transactionId} className="card" style={{ marginBottom: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.customerName || 'Unknown'}</span>
                {STATUS_BADGE[r.mismatch ? 'recovered' : 'pending'] || null}
                <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 'auto' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <TraceSteps trace={r.trace} />
              <RecordComparison result={r} />
              {!r.mismatch && r.apiCall && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{r.reason}</div>}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
      ) : candidates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">Nothing to reconcile</div>
          <div className="empty-state-desc">Every transaction's status already matches Razorpay's records.</div>
        </div>
      ) : (
        candidates.map(tx => <CandidateRow key={tx._id} tx={tx} onRecheck={recheckOne} />)
      )}
    </div>
  );
}
