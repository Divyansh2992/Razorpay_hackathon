import { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import { useNotifications } from './hooks/useNotifications';
import Dashboard from './pages/Dashboard';
import ConversationSim from './pages/ConversationSim';
import InvoiceTracker from './pages/InvoiceTracker';
import Reconciliation from './pages/Reconciliation';
import RecoveryLive from './pages/RecoveryLive';
import LoginPage from './pages/LoginPage';
import CustomerStore from './pages/CustomerStore';
import B2BPortal from './pages/B2BPortal';

// ─── Icons ────────────────────────────────────────────────────────────────────
const icons = {
  grid: (
    <svg viewBox="0 0 16 16" fill="currentColor" width="15" height="15">
      <rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/>
    </svg>
  ),
  live: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
      <circle cx="8" cy="8" r="3"/><path d="M3 8a5 5 0 0 1 5-5M13 8a5 5 0 0 1-5 5" strokeLinecap="round"/>
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
      <path d="M14 8.5A5.5 5.5 0 0 1 8.5 14h-5l1.5-3A5.5 5.5 0 1 1 14 8.5z"/>
    </svg>
  ),
  invoice: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5"/>
      <line x1="5" y1="5.5" x2="11" y2="5.5" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="11" y2="8" strokeLinecap="round"/>
      <line x1="5" y1="10.5" x2="8" y2="10.5" strokeLinecap="round"/>
    </svg>
  ),
  reconcile: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
      <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" strokeLinecap="round"/>
      <path d="M12.5 1.5v3h-3M3.5 14.5v-3h3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

const PAGE_TITLES = {
  '/':               { title: 'Recovery Dashboard',   sub: 'AI-powered payment recovery · Real-time pipeline' },
  '/recovery-live':  { title: 'Recovery Live',        sub: 'Admin + Customer dual-panel · LLM reasoning · AI auto-recovery' },
  '/conversation':   { title: 'LLM Reasoning Preview', sub: 'Sandbox — try the real Groq model, disconnected from live transactions' },
  '/invoices':       { title: 'B2B Invoice Recovery', sub: 'Staged reminders · Promise-to-pay tracking · AI intent' },
  '/reconciliation': { title: 'Reconciliation',       sub: 'Cross-check against Razorpay\'s real records · Auto-recover untracked payments' },
};

// ─── Admin Sidebar ────────────────────────────────────────────────────────────
function AdminSidebar() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const confirmTimerRef = useRef(null);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleResetClick = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      confirmTimerRef.current = setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmReset(false);
    setResetting(true);
    try {
      await axios.post('/api/checkout/reset');
      window.location.reload();
    } catch {
      setResetting(false);
    }
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">⚡</div>
        <div>
          <div className="sidebar-logo-text">Revenue Recovery</div>
          <div className="sidebar-logo-sub">Razorpay · Hackathon Track 03</div>
        </div>
      </div>

      {/* Admin nav */}
      <div className="sidebar-section-label">Admin</div>
      {[
        { to: '/',             end: true, icon: icons.grid,    label: 'Dashboard' },
        { to: '/recovery-live',           icon: icons.live,    label: 'Recovery Live' },
        { to: '/conversation',            icon: icons.chat,    label: 'LLM Reasoning Preview' },
        { to: '/invoices',                icon: icons.invoice, label: 'B2B Invoices' },
        { to: '/reconciliation',          icon: icons.reconcile, label: 'Reconciliation' },
      ].map(({ to, end, icon, label }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
          <span className="sidebar-item-icon">{icon}</span>
          {label}
        </NavLink>
      ))}

      {/* Footer with logged-in user + logout */}
      <div className="sidebar-footer">
        <div style={{
          background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg,#051E47,#2561E8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}>🔑</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1 }}>Admin</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {auth?.email}
            </div>
          </div>
        </div>
        <button
          onClick={handleResetClick}
          disabled={resetting}
          title={confirmReset ? 'Click again to confirm — this deletes all transactions, recovery events, and resets invoices' : 'Wipe all demo transactions/recovery events and reset invoices'}
          style={{
            width: '100%', marginBottom: 8,
            background: confirmReset ? 'rgba(229,72,77,0.16)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${confirmReset ? 'rgba(229,72,77,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: confirmReset ? '#E5484D' : 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px',
            fontSize: 12, fontWeight: 600, cursor: resetting ? 'not-allowed' : 'pointer', textAlign: 'center',
            transition: 'all 0.15s', opacity: resetting ? 0.6 : 1,
          }}
        >
          {resetting ? '🔄 Resetting...' : confirmReset ? '⚠️ Click again to confirm reset' : '🗑️ Reset Demo Data'}
        </button>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', background: 'rgba(229,72,77,0.1)', border: '1px solid rgba(229,72,77,0.2)',
            color: '#E5484D', borderRadius: 8, padding: '8px 12px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
            transition: 'all 0.15s',
          }}
        >
          ↩ Switch Role / Logout
        </button>
        <div className="live-dot" style={{ marginTop: 10 }}>
          <div className="live-dot-circle" />
          <span>Live recovery active</span>
        </div>
        <div className="rzp-brand" style={{ marginTop: 8 }}>
          <strong>Razorpay</strong> Test Mode
        </div>
      </div>
    </aside>
  );
}

// ─── Admin notification bell — pending B2B approvals, plus anything else worth flagging ──
function AdminNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications('rzp_demo_notifs_admin');

  useSocket((type, data) => {
    if (type === 'invoice_approval_requested') {
      notifications.push({
        title: `📄 New reply on ${data.invoiceNumber}`,
        body: `${data.summary || 'Customer sent a reply'} — needs your approval.`,
        dedupeKey: `approval_req_${data.invoiceId}_${data.summary}`,
        link: '/invoices',
      });
    }
  });

  // Seed from whatever's already pending — a bell that was closed when the reply
  // came in would otherwise show zero unread even though real approvals are waiting.
  useEffect(() => {
    axios.get('/api/invoice/pending-approvals').then(res => {
      (res.data || []).forEach(p => {
        notifications.push({
          title: `📄 Reply waiting on ${p.invoiceNumber}`,
          body: `${p.summary || p.text} — needs your approval.`,
          dedupeKey: `approval_req_id_${p.requestId}`,
          link: '/invoices',
        });
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(o => !o); if (!open) notifications.markAllRead(); }} title="Notifications" style={{
        position: 'relative', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
        width: 32, height: 32, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        🔔
        {notifications.unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, background: '#E5484D', color: '#fff',
            borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{notifications.unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="anim-in" style={{
          position: 'absolute', top: 40, right: 0, width: 320, maxHeight: 380, overflowY: 'auto',
          background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 700,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
            {notifications.items.length > 0 && <button onClick={notifications.clear} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>Clear all</button>}
          </div>
          {notifications.items.length === 0 ? (
            <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No notifications yet</div>
          ) : notifications.items.map(n => (
            <div key={n.id} onClick={() => { if (n.link) { navigate(n.link); setOpen(false); } }} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', cursor: n.link ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{n.body}</div>
              <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 4 }}>{new Date(n.time).toLocaleTimeString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TopBar (admin only) ──────────────────────────────────────────────────────
function TopBar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const info = PAGE_TITLES[loc.pathname] || { title: 'Recovery', sub: '' };
  return (
    <div className="topbar">
      <button onClick={() => navigate(-1)} title="Back" style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
        width: 32, height: 32, cursor: 'pointer', fontSize: 15, marginRight: 14, flexShrink: 0,
      }}>←</button>
      <div style={{ flex: 1 }}>
        <div className="topbar-title">{info.title}</div>
        {info.sub && <div className="topbar-breadcrumb">{info.sub}</div>}
      </div>
      <AdminNotificationBell />
      <span className="topbar-tag">Test Mode</span>
      <span className="topbar-tag" style={{ background: '#EDFBF5', color: '#0EA371', borderColor: 'rgba(14,163,113,0.2)' }}>
        🧠 Groq · LLaMA 3.3 70B
      </span>
      {auth && (
        <span className="topbar-tag" style={{ background: '#F4F0FF', color: '#6E56CF', borderColor: 'rgba(110,86,207,0.2)' }}>
          🔑 Admin
        </span>
      )}
    </div>
  );
}

// ─── Admin Layout ─────────────────────────────────────────────────────────────
function AdminLayout() {
  return (
    <div className="app-layout">
      <AdminSidebar />
      <div className="main-content">
        <TopBar />
        <div className="page-body">
          <Routes>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/recovery-live" element={<RecoveryLive />} />
            <Route path="/conversation"  element={<ConversationSim />} />
            <Route path="/invoices"      element={<InvoiceTracker />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="*"              element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// ─── Root — redirects based on role ──────────────────────────────────────────
function RootRedirect() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role === 'customer') return <Navigate to="/store" replace />;
  return <Navigate to="/" replace />;
}

// ─── Customer layout (full-width, no sidebar) ─────────────────────────────────
function CustomerLayout() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role !== 'customer') return <Navigate to="/login" replace />;
  return <CustomerStore />;
}

// ─── B2B layout (full-width, no sidebar) ──────────────────────────────────────
function B2BLayout() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role !== 'user2') return <Navigate to="/login" replace />;
  return <B2BPortal />;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { auth } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/store" element={<CustomerLayout />} />
        <Route path="/b2b" element={<B2BLayout />} />
        <Route path="/*" element={
          !auth ? <Navigate to="/login" replace /> :
          auth.role === 'customer' ? <Navigate to="/store" replace /> :
          auth.role === 'user2' ? <Navigate to="/b2b" replace /> :
          <AdminLayout />
        } />
      </Routes>
    </BrowserRouter>
  );
}
