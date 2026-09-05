import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ─── TCP/IP Layers ──────────────────────────────────────────────────────────
const TCPIP_LAYERS = [
  { id: 4, name: 'Application', proto: 'HTTPS / TLS 1.3', color: '#6E56CF', bg: '#F4F0FF' },
  { id: 3, name: 'Transport',   proto: 'TCP (port 443)',   color: '#2561E8', bg: '#EBF0FE' },
  { id: 2, name: 'Internet',    proto: 'IP / BGP routing', color: '#0EA371', bg: '#EDFBF5' },
  { id: 1, name: 'Network',     proto: 'Ethernet / Wi-Fi', color: '#C08B00', bg: '#FFFBEB' },
];

const PRODUCTS = [
  { id: 'prod_001', name: 'Razorpay Pro Plan',    amount: 2999,  icon: '⚡', desc: 'Monthly · Unlimited API' },
  { id: 'prod_002', name: 'Cloud Storage 100 GB', amount: 499,   icon: '☁️', desc: 'One-time top-up' },
  { id: 'prod_003', name: 'API Access — Annual',  amount: 12000, icon: '🔌', desc: 'Annual · Priority support' },
  { id: 'prod_004', name: 'Team Seats (5 users)', amount: 7500,  icon: '👥', desc: 'Monthly · Admin panel' },
];

// ─── All failure scenarios ───────────────────────────────────────────────────
const SCENARIO_GROUPS = [
  {
    label: '💳 Card & Funds', color: '#E5484D',
    scenarios: [
      {
        id: 'CARD_DECLINED', label: 'Card Declined', icon: '💳',
        desc: 'Bank rejected the transaction',
        failLayer: 4, method: 'card',
        prefill: { cardNumber: '4000 0000 0000 0002', expiry: '12/29', cvv: '123' },
        failMsg: 'Your card was declined. Please try a different payment method.',
        tcpStory: 'TCP ✓ · TLS 1.3 ✓ · HTTPS POST ✓ · Bank returned DECLINED',
        failReason: 'Issuing bank returned a hard decline (HTTP 402) at Application layer. All TCP/IP layers were perfectly healthy — this is a business-logic rejection from the card network.',
        recovery: { level: 'L2', channel: 'whatsapp', label: 'WhatsApp Nudge',
          msg: 'Hi {name}! 👋\nYour ₹{amount} payment for {product} didn\'t go through (bank declined).\n\nTry a different card or UPI:\n🔗 {link}\n\nNeed help? Just reply here.' },
      },
      {
        id: 'INSUFFICIENT_FUNDS', label: 'Insufficient Funds', icon: '💸',
        desc: 'Not enough balance at payment time',
        failLayer: 4, method: 'card',
        prefill: { cardNumber: '4000 0000 0000 9995', expiry: '12/29', cvv: '123' },
        failMsg: 'Payment declined — insufficient funds in your account.',
        tcpStory: 'TCP ✓ · TLS 1.3 ✓ · HTTPS POST ✓ · Core-banking balance check failed',
        failReason: 'Transaction reached the issuer\'s core-banking system. Balance check failed at Application layer. Network layers were completely healthy — purely a funds issue.',
        recovery: { level: 'L1', channel: 'retry', label: 'Salary-date Retry',
          retrySeconds: 120, retryCount: 3, note: 'No notification sent — silent recovery. Retry scheduled near 1st/last of month when salary is expected.' },
      },
      {
        id: 'CARD_EXPIRED', label: 'Card Expired', icon: '📅',
        desc: 'Card past its expiry date',
        failLayer: 4, method: 'card',
        prefill: { cardNumber: '4000 0000 0000 0069', expiry: '08/23', cvv: '123' },
        failMsg: 'Your card has expired. Please update your payment details.',
        tcpStory: 'TCP ✓ · TLS 1.3 ✓ · HTTPS POST ✓ · Expiry validation failed at card network',
        failReason: 'Card network (Visa/MC) rejected at Application layer — expiry date is in the past. Rejection before even reaching the issuer bank. All TCP/IP layers healthy.',
        recovery: { level: 'L2', channel: 'email', label: 'Card-update Email',
          subject: 'Action needed — update your card for {product}',
          body: 'Hi {name},\n\nYour card ending ****{last4} has expired and your\n₹{amount} payment for {product} didn\'t go through.\n\nUpdate your card in 30 seconds to complete the payment.' },
      },
      {
        id: 'CARD_LIMIT', label: 'Daily Limit Exceeded', icon: '🚫',
        desc: 'Transaction limit reached for today',
        failLayer: 4, method: 'card',
        prefill: { cardNumber: '4000 0000 0000 0036', expiry: '12/29', cvv: '123' },
        failMsg: 'Transaction exceeds your daily card limit.',
        tcpStory: 'TCP ✓ · TLS 1.3 ✓ · HTTPS POST ✓ · EXCEED_WITHDRAWAL_LIMIT returned',
        failReason: 'Bank returned EXCEED_WITHDRAWAL_LIMIT at Application layer. Customer\'s daily spend cap has been hit. Retry tomorrow when limit resets at midnight.',
        recovery: { level: 'L1', channel: 'retry', label: 'Next-day Retry',
          retrySeconds: 200, retryCount: 1, note: 'Auto-retries at 00:05 IST when bank resets daily limits.' },
      },
    ],
  },
  {
    label: '🔐 Authentication', color: '#6E56CF',
    scenarios: [
      {
        id: 'OTP_TIMEOUT', label: 'OTP Timed Out', icon: '⏱️',
        desc: 'Customer didn\'t enter OTP in time',
        failLayer: 4, method: 'card', showOtp: true, otpAutoFail: true,
        prefill: { cardNumber: '4000 0000 0000 0101', expiry: '12/29', cvv: '123' },
        failMsg: 'Authentication timed out. OTP window expired.',
        tcpStory: 'TCP ✓ · TLS ✓ · 3DS challenge sent → ACS session expired (5-min TTL)',
        failReason: '3D Secure session at the ACS server expired while waiting for OTP entry. All TCP/IP layers stayed healthy throughout — purely an application-level session timeout.',
        recovery: { level: 'L2', channel: 'whatsapp', label: 'Fresh Payment Link',
          msg: 'Hi {name}! ⚡\nYour OTP window expired — no worries!\n\nHere\'s a fresh payment link:\n🔗 {link}\n\n✅ Valid for 15 minutes.' },
      },
      {
        id: 'THREE_DS_FAIL', label: '3DS Auth Failed', icon: '🔒',
        desc: 'Bank rejected the authentication',
        failLayer: 4, method: 'card', showOtp: true, otpAutoFail: false,
        prefill: { cardNumber: '4000 0000 0000 0119', expiry: '12/29', cvv: '123' },
        failMsg: 'Bank authentication failed. Please try a different card.',
        tcpStory: 'TCP ✓ · TLS ✓ · 3DS challenge completed → ACS returned AUTHENTICATION_FAILED',
        failReason: 'Bank ACS server returned authentication failure after OTP. Could be wrong OTP, bank fraud policy, or issuer-side restriction. Application layer failure.',
        recovery: { level: 'L2', channel: 'sms', label: 'SMS — Try Alternate Method',
          msg: 'Razorpay: Card auth failed for ₹{amount}. Try UPI or NetBanking instead: {link} - RAZORPAY' },
      },
    ],
  },
  {
    label: '⚡ Network & Gateway', color: '#2561E8',
    scenarios: [
      {
        id: 'GATEWAY_TIMEOUT', label: 'Gateway Timeout', icon: '⏳',
        desc: 'Razorpay gateway didn\'t respond',
        failLayer: 3, method: 'card',
        prefill: { cardNumber: '4111 1111 1111 1111', expiry: '12/29', cvv: '123' },
        failMsg: 'Payment gateway timed out. This is a temporary issue.',
        tcpStory: 'TCP SYN-ACK ✓ → keep-alive timeout at Transport layer — gateway overloaded',
        failReason: 'TCP connection established (SYN-ACK) but payment ACK never received within 30s. Transport layer timeout due to gateway overload. No payment data was transmitted.',
        recovery: { level: 'L1', channel: 'retry', label: 'Auto-Retry (2 min)',
          retrySeconds: 120, retryCount: 3, note: 'Exponential backoff: 2 min → 10 min → 30 min. No customer notification on first attempt.' },
      },
      {
        id: 'NETWORK_DROP', label: 'Network Drop', icon: '🌐',
        desc: 'IP routing failure mid-transaction',
        failLayer: 2, method: 'card',
        prefill: { cardNumber: '4111 1111 1111 1111', expiry: '12/29', cvv: '123' },
        failMsg: 'Connection lost. Your payment was not processed.',
        tcpStory: 'TCP SYN sent → BGP route flap → IP packets dropped → TCP RST',
        failReason: 'BGP routing instability at Internet layer dropped IP packets before TCP could establish. No payment data transmitted. Idempotency key ensures safe retry.',
        recovery: { level: 'L1', channel: 'retry', label: 'Idempotency Retry',
          retrySeconds: 5, retryCount: 1, note: 'Immediate retry via alternate CDN endpoint. Idempotency key prevents double-charge.' },
      },
    ],
  },
  {
    label: '📱 UPI', color: '#0EA371',
    scenarios: [
      {
        id: 'UPI_PIN_WRONG', label: 'Wrong UPI PIN', icon: '🔢',
        desc: 'Incorrect PIN entered in UPI app',
        failLayer: 4, method: 'upi',
        prefill: { upiId: 'customer@upi' },
        failMsg: 'UPI authentication failed. Incorrect PIN entered.',
        tcpStory: 'NPCI routing ✓ → UPI PIN validation failed at Application layer',
        failReason: 'NPCI returned PIN_VALIDATION_FAILED at Application layer. Customer entered wrong PIN in their UPI app. After 3 failures, UPI PIN locks for 24 hours.',
        recovery: { level: 'L2', channel: 'whatsapp', label: 'WhatsApp — UPI Guide',
          msg: 'Hi {name}! 🔢\nYour UPI payment of ₹{amount} failed (wrong PIN).\n\nTry again here:\n🔗 {link}\n\nOr reset your UPI PIN in your banking app settings.' },
      },
      {
        id: 'UPI_TIMEOUT', label: 'UPI Request Expired', icon: '📵',
        desc: 'Customer didn\'t approve in time',
        failLayer: 4, method: 'upi',
        prefill: { upiId: 'customer@paytm' },
        failMsg: 'UPI collect request expired. You didn\'t respond in time.',
        tcpStory: 'NPCI collect sent → Customer notified → 5-min TTL expired at Application layer',
        failReason: 'UPI collect has a 5-minute TTL at NPCI. Customer got the notification but didn\'t open the UPI app within the window. Application-level session expiry.',
        recovery: { level: 'L2', channel: 'whatsapp', label: 'Fresh UPI Request',
          msg: 'Hi {name}! 📱\nYour UPI payment of ₹{amount} request expired.\n\nHere\'s a fresh link:\n🔗 {link}\n\nTap to open payment directly in your UPI app.' },
      },
    ],
  },
  {
    label: '🚨 Fraud & Risk', color: '#C08B00',
    scenarios: [
      {
        id: 'FRAUD_DETECTED', label: 'Fraud Detected', icon: '🛡️',
        desc: 'Risk engine flagged the transaction',
        failLayer: 4, method: 'card',
        prefill: { cardNumber: '4000 0000 0000 0127', expiry: '12/29', cvv: '123' },
        failMsg: 'Transaction blocked. Our security system detected unusual activity.',
        tcpStory: 'TCP ✓ · TLS ✓ · Payload received → Fraud Shield returned HIGH_RISK (87/100)',
        failReason: 'Razorpay Fraud Shield (ML engine) flagged HIGH_RISK. Signals: unusual device fingerprint, IP geolocation mismatch, multiple rapid attempts. Recovery blocked by governance rule.',
        recovery: { level: 'L5', channel: 'manual', label: 'Governance Block',
          riskScore: 87,
          signals: ['Unusual device fingerprint', 'IP geolocation mismatch', 'Multiple rapid attempts in 5 min', 'Card present in shared risk DB'] },
      },
    ],
  },
];

const ALL_SCENARIOS = SCENARIO_GROUPS.flatMap(g => g.scenarios);

// ─── Utilities ──────────────────────────────────────────────────────────────
const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const fmtExp  = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length >= 3 ? d.slice(0, 2) + '/' + d.slice(2) : d; };
const randSlug = () => Math.random().toString(36).slice(2, 8);
const getCardBrand = (num) => {
  const n = num.replace(/\s/g, '');
  if (/^4/.test(n))        return { name: 'Visa',       color: '#1A1F71' };
  if (/^5[1-5]/.test(n))  return { name: 'Mastercard', color: '#EB001B' };
  if (/^3[47]/.test(n))   return { name: 'Amex',       color: '#007BC1' };
  if (/^(60|65|81|82|508)/.test(n)) return { name: 'RuPay', color: '#F37B20' };
  return null;
};

function buildSimSteps(scenario) {
  const fl = scenario?.failLayer || 4;
  if (fl === 2) return [
    { id: 'net',   label: 'Network interface active',        detail: 'Ethernet/Wi-Fi · Signal OK',                layer: 1, ms: 80  },
    { id: 'route', label: 'Routing IP packets to CDN…',      detail: 'Internet layer · BGP resolving…',           layer: 2, ms: 140 },
    { id: 'fail',  label: 'BGP route flap — packets dropped',detail: 'Internet layer · TCP RST received · Terminated', layer: 2, ms: 500 },
  ];
  if (fl === 3) return [
    { id: 'net',  label: 'Network interface active',         detail: 'Ethernet/Wi-Fi · Signal OK',                layer: 1, ms: 80  },
    { id: 'ip',   label: 'IP routing resolved',              detail: 'Internet layer · BGP OK · TTL 64',          layer: 2, ms: 130 },
    { id: 'tcp',  label: 'TCP SYN sent to gateway…',         detail: 'Transport layer · Awaiting SYN-ACK',        layer: 3, ms: 300 },
    { id: 'wait', label: 'Waiting for ACK…',                 detail: 'Transport layer · keep-alive sent · no response', layer: 3, ms: 1800 },
    { id: 'fail', label: 'TCP timeout — gateway unreachable',detail: 'Transport layer · 30s window exceeded · reset', layer: 3, ms: 400 },
  ];
  // Application layer (most failures)
  return [
    { id: 'net',  label: 'Network interface active',         detail: 'Ethernet/Wi-Fi · Signal OK',                layer: 1, ms: 80  },
    { id: 'ip',   label: 'IP routing to Razorpay CDN',       detail: 'Internet layer · BGP OK · TTL 64',          layer: 2, ms: 130 },
    { id: 'tcp',  label: 'TCP handshake (port 443)',          detail: 'Transport layer · SYN → SYN-ACK → ACK',    layer: 3, ms: 260 },
    { id: 'tls',  label: 'TLS 1.3 handshake',                detail: 'Application layer · ECDHE-AES-256-GCM',     layer: 4, ms: 300 },
    { id: 'post', label: 'HTTPS POST /v1/payments',           detail: 'Application layer · Encrypted payload sent', layer: 4, ms: 200 },
    { id: 'gw',   label: 'Gateway → card network',           detail: 'Application layer · Visa/MC routing',       layer: 4, ms: 500 },
    { id: 'bank', label: 'Awaiting bank authorization…',      detail: 'Application layer · Issuer processing',     layer: 4, ms: 700 },
    { id: 'done', label: scenario ? 'Authorization rejected' : 'Authorization approved',
                  detail: scenario ? scenario.failMsg : 'APPROVED · Payment ID generated', layer: 4, ms: 280 },
  ];
}

// ─── TCP/IP Stack (two modes) ───────────────────────────────────────────────
function TcpIpStack({ failLayer, activeLayer, done, failed, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: dark ? 4 : 5 }}>
      {!dark && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>TCP/IP Stack</div>}
      {TCPIP_LAYERS.map(layer => {
        const isActive  = activeLayer === layer.id && !done && !failed;
        const isFailed  = failed && failLayer === layer.id;
        const isPassed  = done ? true : (failed ? layer.id < failLayer : layer.id < activeLayer);
        const isBlocked = failed && layer.id > failLayer;
        if (dark) return (
          <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: isBlocked ? 0.3 : 1 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: isFailed ? '#FF7B7B' : isActive ? '#79C0FF' : isPassed ? '#3FB950' : 'rgba(255,255,255,0.15)' }} />
            <span style={{ fontSize: 10, color: isFailed ? '#FF7B7B' : isActive ? '#79C0FF' : isPassed ? '#3FB950' : 'rgba(255,255,255,0.35)' }}>{layer.name}</span>
            {isActive  && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#79C0FF' }}>···</span>}
            {isFailed  && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#FF7B7B', fontWeight: 700 }}>FAIL</span>}
            {isPassed && !isFailed && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#3FB950' }}>✓</span>}
          </div>
        );
        return (
          <div key={layer.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6,
            border: isFailed ? '1.5px solid var(--red)' : isActive ? `1.5px solid ${layer.color}` : '1px solid var(--border-light)',
            background: isFailed ? 'var(--red-bg)' : isActive ? layer.bg : isPassed ? 'var(--green-bg)' : 'var(--surface-2)',
            opacity: isBlocked ? 0.3 : 1, transition: 'all 0.3s ease',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: isFailed ? 'var(--red)' : isActive ? layer.color : isPassed ? 'var(--green)' : '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, transition: 'all 0.3s ease' }}>
              {isFailed ? '✕' : isPassed ? '✓' : layer.id}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isFailed ? 'var(--red)' : isActive ? layer.color : isPassed ? 'var(--green)' : 'var(--text-muted)' }}>{layer.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{layer.proto}</div>
            </div>
            {isActive  && <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${layer.color}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />}
            {isFailed  && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>FAIL</span>}
            {isPassed && !isFailed && !isActive && <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 600 }}>OK</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Terminal-style network log ─────────────────────────────────────────────
function NetworkLog({ steps, current, failed }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [current]);
  return (
    <div style={{ background: '#0D1117', borderRadius: 8, padding: '10px 12px', fontFamily: 'Courier New, monospace', fontSize: 10.5, maxHeight: 175, overflowY: 'auto' }}>
      {steps.slice(0, current + 1).map((s, i) => {
        const done   = i < current;
        const active = i === current;
        const fail   = failed && active;
        return (
          <div key={s.id} style={{ display: 'flex', gap: 8, marginBottom: 3, color: fail ? '#FF7B7B' : done ? '#3FB950' : '#79C0FF', animation: active ? 'fadeInLine 0.15s ease' : 'none' }}>
            <span style={{ opacity: 0.35, flexShrink: 0 }}>{String(i+1).padStart(2,'0')}</span>
            <span style={{ flexShrink: 0 }}>{fail ? '[FAIL]' : done ? '[ OK ]' : '[····]'}</span>
            <span>{s.label}</span>
          </div>
        );
      })}
      {failed && current >= 0 && (
        <div style={{ color: '#FF7B7B', marginTop: 6, paddingTop: 6, borderTop: '1px solid #21262D' }}>!! {steps[current]?.detail}</div>
      )}
      <div ref={endRef} />
    </div>
  );
}

// ─── Recovery channel visuals ────────────────────────────────────────────────
function WhatsAppBubble({ name, amount, productName, msg }) {
  const link = `pay.rzp.io/${randSlug()}`;
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const text = msg.replace('{name}', name).replace('{amount}', Number(amount).toLocaleString('en-IN')).replace('{product}', productName).replace('{link}', link);
  return (
    <div style={{ background: '#ECE5DD', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.07)' }}>
      <div style={{ background: '#128C7E', color: 'white', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, background: '#25D366', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>R</div>
        <div><div style={{ fontSize: 13, fontWeight: 600 }}>Razorpay Recovery</div><div style={{ fontSize: 10, opacity: 0.8 }}>Business Account · ● Online</div></div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', padding: '8px 10px', maxWidth: '82%', fontSize: 12, lineHeight: 1.55, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', animation: 'slideIn 0.2s ease-out' }}>
          <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{text}</pre>
          <div style={{ fontSize: 10, color: '#9E9E9E', marginTop: 4, textAlign: 'right' }}>{time} ✓✓</div>
        </div>
      </div>
    </div>
  );
}

function EmailCard({ name, amount, productName, subject, body }) {
  const s = subject.replace('{name}', name).replace('{product}', productName).replace('{amount}', `₹${Number(amount).toLocaleString('en-IN')}`);
  const b = body.replace(/\{name\}/g, name).replace(/\{amount\}/g, `₹${Number(amount).toLocaleString('en-IN')}`).replace(/\{product\}/g, productName).replace(/\{last4\}/g, '****');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', animation: 'slideIn 0.2s ease-out' }}>
      <div style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-light)', padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>From: <strong style={{ color: 'var(--text-secondary)' }}>noreply@razorpay.com</strong></div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>To: <strong style={{ color: 'var(--text-secondary)' }}>customer email</strong></div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{s}</div>
        <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 3 }}>✓ Delivered</div>
      </div>
      <div style={{ padding: 14 }}>
        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{b}</pre>
        <div style={{ marginTop: 14, background: 'var(--rzp-blue)', color: 'white', padding: '11px 20px', borderRadius: 6, textAlign: 'center', fontSize: 13, fontWeight: 600, cursor: 'default', boxShadow: '0 2px 8px rgba(37,97,232,0.3)' }}>🔗 Update Card &amp; Complete Payment</div>
      </div>
    </div>
  );
}

function SmsCard({ name, amount, productName, msg }) {
  const link = `rzp.io/${randSlug()}`;
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const text = msg.replace(/\{name\}/g, name).replace(/\{amount\}/g, Number(amount).toLocaleString('en-IN')).replace(/\{product\}/g, productName).replace('{link}', link);
  return (
    <div style={{ background: '#EBF0FE', border: '1px solid rgba(37,97,232,0.15)', borderRadius: 10, padding: 14, animation: 'slideIn 0.2s ease-out' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>📱 SMS Delivered · RAZORPAY</div>
      <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}>{text}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>✓ {time} · Delivered</div>
    </div>
  );
}

function RetryCard({ recovery, countdown }) {
  const total = recovery.retrySeconds || 120;
  const pct   = Math.max(0, Math.round((countdown / total) * 100));
  const mins  = Math.floor(countdown / 60);
  const secs  = countdown % 60;
  const fast  = total <= 10;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, animation: 'slideIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, background: 'var(--rzp-blue-50)', border: '1px solid rgba(37,97,232,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔄</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{recovery.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Attempt 1 of {recovery.retryCount} · Customer not notified ✓</div>
        </div>
      </div>
      {fast ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontSize: 12, fontWeight: 500 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--green)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          Retrying now via alternate CDN endpoint…
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next retry in</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: 'var(--rzp-blue)' }}>{mins}:{String(secs).padStart(2,'0')}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--rzp-blue)', borderRadius: 3, transition: 'width 1s linear' }} />
          </div>
        </>
      )}
      {recovery.note && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 5 }}>💡 {recovery.note}</div>}
    </div>
  );
}

function FraudCard({ recovery }) {
  return (
    <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(229,72,77,0.25)', borderRadius: 8, padding: 16, animation: 'slideIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 26 }}>🛡️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Fraud Shield — Transaction Blocked</div>
          <div style={{ fontSize: 11, color: '#9B1C1C' }}>Recovery agent: BLOCKED by governance rule</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Risk score</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ height: 6, width: 80, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${recovery.riskScore}%`, background: 'var(--red)', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)' }}>{recovery.riskScore}/100</span>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Risk signals:</div>
      {recovery.signals.map(sig => (
        <div key={sig} style={{ fontSize: 11, color: '#9B1C1C', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 7, color: 'var(--red)' }}>●</span>{sig}
        </div>
      ))}
      <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(229,72,77,0.08)', borderRadius: 5, fontSize: 11, color: '#7F1D1D', borderLeft: '3px solid var(--red)' }}>
        Action: Queued for manual review · Support notified · Est. 2-4 hours
      </div>
    </div>
  );
}

// ─── AI Recovery Assistant — inline OTP-failure chat (real Groq classification) ──
function OtpAiAssistant({ scenario, customer, amount }) {
  const [expanded, setExpanded] = useState(false);
  const [msgs, setMsgs]         = useState([{
    role: 'agent',
    content: "I see your OTP verification didn't go through — what happened on your end?"
  }]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [sessionId]             = useState(() => `otp_sim_${Date.now().toString(36)}`);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    setInput('');
    setMsgs(p => [...p, { role: 'customer', content: text }]);
    setLoading(true);
    try {
      const res = await axios.post('/api/conversation/otp-message', {
        sessionId, message: text, context: { amount, category: 'checkout' }
      });
      setMsgs(p => [...p, { role: 'agent', content: res.data.agentResponse }]);
      setLastAction(res.data.systemAction);
    } catch {
      setMsgs(p => [...p, { role: 'agent', content: 'Sorry, something went wrong reaching the AI agent. Please try again.' }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
      <button onClick={() => setExpanded(e => !e)}
        title="Ask the AI Recovery Agent why the OTP failed"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: expanded ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.6)', borderRadius: 20, padding: '4px 10px',
          fontSize: 10.5, fontWeight: 700, color: '#4C2A9A', cursor: 'pointer', fontFamily: 'inherit',
        }}>
        🧠 Ask AI
      </button>

      {expanded && (
        <div className="card anim-in" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, display: 'flex', flexDirection: 'column', maxHeight: 380, zIndex: 30, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-ai">🧠 AI Recovery Agent</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Groq · LLaMA — real-time OTP diagnosis</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 0', minHeight: 120 }}>
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'agent' ? 'chat-msg-agent' : 'chat-msg-customer'} style={{ marginBottom: 10 }}>
                <div className="chat-avatar" style={{ background: m.role === 'agent' ? 'var(--rzp-blue)' : 'var(--border)', color: m.role === 'agent' ? 'white' : 'var(--text-secondary)' }}>
                  {m.role === 'agent' ? '⚡' : '👤'}
                </div>
                <div className={m.role === 'agent' ? 'chat-bubble-agent' : 'chat-bubble-customer'}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="chat-msg-agent" style={{ marginBottom: 10 }}>
                <div className="chat-avatar" style={{ background: 'var(--rzp-blue)', color: 'white' }}>⚡</div>
                <div className="chat-bubble-agent" style={{ color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ width: 14, height: 14 }} /> Diagnosing...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {lastAction && (
            <div className="infobox infobox-blue" style={{ margin: '10px 14px 0', fontSize: 12 }}>
              ✅ Fix applied: {lastAction.message}
            </div>
          )}

          <div style={{ padding: '10px 14px 4px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => send("I never received any OTP on my phone")} disabled={loading} className="btn btn-secondary btn-sm">OTP hasn't come</button>
            <button onClick={() => send("I entered the correct OTP but it still failed")} disabled={loading} className="btn btn-secondary btn-sm">Entered correct OTP, still failing</button>
          </div>
          <div style={{ padding: '6px 14px 14px', display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Or describe what happened..." className="input" style={{ flex: 1 }} />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="btn btn-primary">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryVisual({ scenario, customer, amount, productName }) {
  const [step, setStep]         = useState(0);
  const [countdown, setCountdown] = useState(120);
  const timerRef = useRef(null);

  useEffect(() => {
    setStep(0);
    const t1 = setTimeout(() => setStep(1), 350);
    const t2 = setTimeout(() => setStep(2), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [scenario?.id]);

  useEffect(() => {
    if (scenario?.recovery?.channel !== 'retry') return;
    const total = scenario.recovery.retrySeconds || 120;
    setCountdown(total);
    timerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [scenario?.id]);

  if (!scenario) return null;
  const { recovery } = scenario;
  const name = customer?.name?.split(' ')[0] || 'there';
  const LEVEL_COLOR = { L1: 'var(--green)', L2: 'var(--rzp-blue)', L3: 'var(--amber)', L4: 'var(--purple)', L5: 'var(--red)' };
  const LEVEL_BG    = { L1: 'var(--green-bg)', L2: 'var(--rzp-blue-50)', L3: 'var(--amber-bg)', L4: 'var(--purple-bg)', L5: 'var(--red-bg)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'slideIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: LEVEL_BG[recovery.level], borderRadius: 8, border: `1px solid ${LEVEL_COLOR[recovery.level]}28` }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: LEVEL_COLOR[recovery.level] }}>{recovery.level}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Recovery in Action — {recovery.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {recovery.channel === 'whatsapp' && '📱 WhatsApp message dispatched'}
            {recovery.channel === 'email'    && '📧 Recovery email queued'}
            {recovery.channel === 'sms'      && '💬 SMS queued for delivery'}
            {recovery.channel === 'retry'    && '🔄 Silent retry scheduled — customer unaware'}
            {recovery.channel === 'manual'   && '🚨 Blocked by governance · Sent for manual review'}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: LEVEL_COLOR[recovery.level], background: LEVEL_BG[recovery.level], border: `1px solid ${LEVEL_COLOR[recovery.level]}30`, padding: '2px 7px', borderRadius: 4 }}>LIVE</div>
        {scenario.showOtp && <OtpAiAssistant scenario={scenario} customer={customer} amount={amount} key={scenario.id} />}
      </div>

      {step >= 1 && recovery.channel === 'whatsapp' && <WhatsAppBubble name={name} amount={amount} productName={productName} msg={recovery.msg} />}
      {step >= 1 && recovery.channel === 'email'    && <EmailCard name={name} amount={amount} productName={productName} subject={recovery.subject} body={recovery.body} />}
      {step >= 1 && recovery.channel === 'sms'      && <SmsCard name={name} amount={amount} productName={productName} msg={recovery.msg} />}
      {step >= 1 && recovery.channel === 'retry'    && <RetryCard recovery={recovery} countdown={countdown} />}
      {step >= 1 && recovery.channel === 'manual'   && <FraudCard recovery={recovery} />}

      {step >= 2 && recovery.channel !== 'manual' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '7px 12px', background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
          📊 Event logged to Dashboard · Agent monitoring outcome · View in Dashboard → Event Stream
        </div>
      )}
    </div>
  );
}

// ─── Razorpay-style checkout modal ───────────────────────────────────────────
const TABS = [
  { id: 'card',       label: 'Cards',      icon: '💳' },
  { id: 'upi',        label: 'UPI',        icon: '📱' },
  { id: 'netbanking', label: 'Netbanking', icon: '🏦' },
  { id: 'wallet',     label: 'Wallets',    icon: '👛' },
];

function RazorpayModal({ isOpen, scenario, amount, productName, customer, onClose, onComplete }) {
  const [tab,        setTab]        = useState('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName,   setCardName]   = useState('');
  const [expiry,     setExpiry]     = useState('');
  const [cvv,        setCvv]        = useState('');
  const [upiId,      setUpiId]      = useState('');
  const [phase,      setPhase]      = useState('form'); // form | processing | otp | failed | success
  const [simSteps,   setSimSteps]   = useState([]);
  const [simStep,    setSimStep]    = useState(0);
  const [simFailed,  setSimFailed]  = useState(false);
  const [activeLayer,setActiveLayer]= useState(1);
  const [otpVal,     setOtpVal]     = useState('');
  const [otpTick,    setOtpTick]    = useState(30);
  const [shake,      setShake]      = useState(false);
  const timers  = useRef([]);
  const otpInt  = useRef(null);
  const clear   = () => { timers.current.forEach(clearTimeout); timers.current = []; clearInterval(otpInt.current); };

  useEffect(() => {
    if (!isOpen) { clear(); setPhase('form'); setSimFailed(false); setOtpVal(''); setSimStep(0); setActiveLayer(1); return; }
    if (scenario?.method === 'upi') { setTab('upi'); setUpiId(scenario.prefill?.upiId || ''); }
    else { setTab('card'); setCardNumber(scenario?.prefill?.cardNumber || ''); setExpiry(scenario?.prefill?.expiry || ''); setCvv(scenario?.prefill?.cvv || ''); setCardName(customer?.name || ''); }
  }, [isOpen]);

  const handlePay = () => {
    setPhase('processing');
    const steps = buildSimSteps(scenario);
    setSimSteps(steps);
    setSimStep(0);
    setSimFailed(false);
    setActiveLayer(steps[0]?.layer || 1);
    let delay = 0;
    steps.forEach((s, i) => {
      delay += s.ms + (Math.random() * 60 - 30);
      const t = setTimeout(() => {
        setActiveLayer(s.layer);
        setSimStep(i);
        if (i === steps.length - 1) {
          if (scenario?.showOtp) {
            setTimeout(() => {
              setPhase('otp');
              setOtpTick(30);
              if (scenario.otpAutoFail) {
                let c = 30;
                otpInt.current = setInterval(() => {
                  c--;
                  setOtpTick(c);
                  if (c <= 0) { clearInterval(otpInt.current); triggerFail(); }
                }, 1000);
              }
            }, 500);
          } else if (scenario) {
            setSimFailed(true);
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setTimeout(() => { setPhase('failed'); setTimeout(() => onComplete('failed'), 1800); }, 700);
          } else {
            setPhase('success');
            setTimeout(() => onComplete('success'), 1400);
          }
        }
      }, delay);
      timers.current.push(t);
    });
  };

  const triggerFail = () => { setPhase('failed'); setTimeout(() => onComplete('failed'), 1800); };
  const handleOtpSubmit = () => { clearInterval(otpInt.current); triggerFail(); };

  if (!isOpen) return null;
  const brand = getCardBrand(cardNumber);
  const canPay = tab === 'card' ? (cardNumber.replace(/\s/g,'').length >= 12 && expiry.length >= 4 && cvv.length >= 3 && cardName.length >= 2) : (upiId.includes('@') && upiId.length >= 5);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 740, boxShadow: '0 32px 80px rgba(0,0,0,0.45)', overflow: 'hidden', animation: 'modalIn 0.22s ease-out' }}>

        {/* Test mode banner */}
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FCD34D', padding: '6px 18px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#92400E' }}>
          <span>⚠️</span><span><strong>Test Mode</strong> — Simulated gateway · No real money charged</span>
          <button onClick={() => { clear(); onClose(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#92400E', lineHeight: 1, opacity: 0.7 }}>×</button>
        </div>

        <div style={{ display: 'flex', minHeight: 460 }}>
          {/* Left — merchant panel */}
          <div style={{ width: 220, background: 'linear-gradient(165deg, #051E47 0%, #0A3580 55%, #1A4DC9 100%)', padding: '24px 20px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ width: 50, height: 50, background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.18)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: 'white', marginBottom: 14 }}>R</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 3 }}>Payment to</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15, marginBottom: 3 }}>Razorpay Demo Store</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 22, lineHeight: 1.4 }}>{productName}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 6 }}>Amount</div>
            <div style={{ color: 'white', fontSize: 30, fontWeight: 900, marginBottom: 20, animation: shake ? 'shake 0.5s ease' : 'none' }}>₹{Number(amount).toLocaleString('en-IN')}</div>

            {/* Live TCP/IP stack in left panel */}
            {phase === 'processing' && (
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Network Status</div>
                <TcpIpStack failLayer={scenario?.failLayer} activeLayer={activeLayer} done={false} failed={simFailed} dark />
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
              <span>🔒</span><span>Secured by Razorpay</span>
            </div>
          </div>

          {/* Right — payment UI */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {phase === 'form' && (
              <div style={{ display: 'flex', borderBottom: '1px solid #E8EDF2' }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '14px 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: tab === t.id ? '#2561E8' : '#8B94A5', borderBottom: tab === t.id ? '2px solid #2561E8' : '2px solid transparent', transition: 'all 0.12s' }}>
                    <div style={{ fontSize: 16, marginBottom: 2 }}>{t.icon}</div>{t.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* ── Card form ── */}
              {phase === 'form' && tab === 'card' && (<>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#586476', marginBottom: 6 }}>Card Number</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" placeholder="1234  5678  9012  3456" value={cardNumber} maxLength={19}
                      onChange={e => setCardNumber(fmtCard(e.target.value))}
                      style={{ width: '100%', padding: '11px 50px 11px 12px', border: '1.5px solid #E8EDF2', borderRadius: 7, fontSize: 15, fontFamily: 'Courier New, monospace', letterSpacing: '0.06em', outline: 'none', color: '#1A1F36', boxSizing: 'border-box', background: '#FAFBFF' }} />
                    {brand && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 800, color: brand.color, background: '#F0F4FF', padding: '2px 5px', borderRadius: 3 }}>{brand.name}</span>}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#586476', marginBottom: 6 }}>Name on Card</label>
                  <input type="text" placeholder="As printed on card" value={cardName}
                    onChange={e => setCardName(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #E8EDF2', borderRadius: 7, fontSize: 13, outline: 'none', color: '#1A1F36', boxSizing: 'border-box', fontFamily: 'inherit', background: '#FAFBFF' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#586476', marginBottom: 6 }}>Expiry</label>
                    <input type="text" placeholder="MM / YY" value={expiry} maxLength={5}
                      onChange={e => setExpiry(fmtExp(e.target.value))}
                      style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #E8EDF2', borderRadius: 7, fontSize: 13, outline: 'none', color: '#1A1F36', boxSizing: 'border-box', fontFamily: 'Courier New, monospace', background: '#FAFBFF' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#586476', marginBottom: 6 }}>CVV / CVC</label>
                    <input type="password" placeholder="•••" value={cvv} maxLength={4}
                      onChange={e => setCvv(e.target.value.replace(/\D/g,'').slice(0,4))}
                      style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #E8EDF2', borderRadius: 7, fontSize: 13, outline: 'none', color: '#1A1F36', boxSizing: 'border-box', fontFamily: 'Courier New, monospace', background: '#FAFBFF' }} />
                  </div>
                </div>
              </>)}

              {/* ── UPI form ── */}
              {phase === 'form' && tab === 'upi' && (<>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#586476', marginBottom: 6 }}>UPI ID</label>
                  <input type="text" placeholder="yourname@upi" value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #E8EDF2', borderRadius: 7, fontSize: 13, outline: 'none', color: '#1A1F36', boxSizing: 'border-box', fontFamily: 'inherit', background: '#FAFBFF' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                  {['@okicici','@ybl','@paytm','@upi','@oksbi','@okaxis'].map(s => (
                    <button key={s} onClick={() => setUpiId(v => v.split('@')[0] + s)} style={{ padding: '7px 4px', border: '1px solid #E8EDF2', borderRadius: 6, background: '#F8FAFB', fontSize: 11, color: '#586476', cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
                  ))}
                </div>
              </>)}

              {/* ── NetBanking ── */}
              {phase === 'form' && tab === 'netbanking' && (
                <div>
                  <div style={{ fontSize: 12, color: '#8B94A5', marginBottom: 10 }}>Popular banks</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {['HDFC Bank','ICICI Bank','State Bank of India','Axis Bank','Kotak Bank','Yes Bank'].map(b => (
                      <button key={b} style={{ padding: 12, border: '1px solid #E8EDF2', borderRadius: 6, background: '#F8FAFB', fontSize: 12, color: '#1A1F36', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>{b}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 11, color: '#8B94A5', textAlign: 'center', padding: '8px 0' }}>NetBanking not simulated in demo — use Card or UPI scenarios.</div>
                </div>
              )}

              {/* ── Wallets ── */}
              {phase === 'form' && tab === 'wallet' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {['💚 Paytm Wallet','💙 PhonePe','🟠 Amazon Pay','🔵 Mobikwik'].map(w => (
                      <button key={w} style={{ padding: 14, border: '1px solid #E8EDF2', borderRadius: 7, background: '#F8FAFB', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{w}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 11, color: '#8B94A5', textAlign: 'center' }}>Wallet failures not simulated — use Card or UPI scenarios.</div>
                </div>
              )}

              {/* ── Processing overlay ── */}
              {phase === 'processing' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ textAlign: 'center', padding: '4px 0' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1F36', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #2561E8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Processing payment securely…
                    </div>
                    <div style={{ fontSize: 11, color: '#8B94A5', marginTop: 4 }}>Do not refresh or close this window</div>
                  </div>
                  <NetworkLog steps={simSteps} current={simStep} failed={simFailed} />
                </div>
              )}

              {/* ── OTP screen ── */}
              {phase === 'otp' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'slideIn 0.2s ease-out' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1F36', marginBottom: 4 }}>Bank OTP Verification</div>
                    <div style={{ fontSize: 12, color: '#8B94A5' }}>OTP sent to {customer?.phone?.slice(0,-5).replace(/\d/g,'•') + customer?.phone?.slice(-5) || '+91-•••••12345'}</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#586476', marginBottom: 8, textAlign: 'center' }}>Enter 6-digit OTP</label>
                    <input type="text" placeholder="• • • • • •" value={otpVal} maxLength={6}
                      onChange={e => setOtpVal(e.target.value.replace(/\D/g,'').slice(0,6))}
                      style={{ width: '100%', padding: 14, border: '1.5px solid #E8EDF2', borderRadius: 8, fontSize: 26, textAlign: 'center', outline: 'none', letterSpacing: '0.35em', fontFamily: 'monospace', color: '#1A1F36', boxSizing: 'border-box', background: '#FAFBFF' }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: otpTick <= 8 ? '#E5484D' : '#C08B00' }}>
                    {scenario?.otpAutoFail ? `OTP expires in: ${otpTick}s${otpTick <= 8 ? ' ⚠️' : ''}` : 'Enter any 6-digit code to simulate failure'}
                  </div>
                  <button onClick={handleOtpSubmit}
                    disabled={otpVal.length < 6 && !scenario?.otpAutoFail}
                    style={{ width: '100%', padding: 14, background: '#2561E8', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: otpVal.length >= 6 || scenario?.otpAutoFail ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (otpVal.length >= 6 || scenario?.otpAutoFail) ? 1 : 0.5 }}>
                    Verify &amp; Pay ₹{Number(amount).toLocaleString('en-IN')}
                  </button>
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#8B94A5' }}>Didn't get OTP? <span style={{ color: '#2561E8', cursor: 'pointer' }}>Resend OTP</span></div>
                </div>
              )}

              {/* ── Failed ── */}
              {phase === 'failed' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, animation: 'slideIn 0.2s ease-out' }}>
                  <div style={{ fontSize: 44 }}>❌</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#E5484D' }}>Payment Failed</div>
                  <div style={{ fontSize: 12, color: '#8B94A5', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>{scenario?.failMsg}</div>
                  <div style={{ fontSize: 11, color: '#CBD5E1' }}>Closing automatically…</div>
                </div>
              )}

              {/* ── Success ── */}
              {phase === 'success' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, animation: 'slideIn 0.2s ease-out' }}>
                  <div style={{ fontSize: 44 }}>✅</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0EA371' }}>Payment Successful!</div>
                  <div style={{ fontSize: 12, color: '#8B94A5' }}>₹{Number(amount).toLocaleString('en-IN')} paid for {productName}</div>
                </div>
              )}

              {/* ── Pay button ── */}
              {phase === 'form' && (tab === 'card' || tab === 'upi') && (
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  <button onClick={handlePay} disabled={!canPay}
                    style={{ width: '100%', padding: '14px', background: canPay ? 'linear-gradient(135deg,#2561E8,#1A4DC9)' : '#CBD5E1', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: canPay ? 'pointer' : 'not-allowed', fontFamily: 'inherit', boxShadow: canPay ? '0 4px 14px rgba(37,97,232,0.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}>
                    🔐 Pay ₹{Number(amount).toLocaleString('en-IN')} Securely
                  </button>
                  <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: '#B0BAC9' }}>256-bit SSL · PCI DSS Level 1 · Secured by Razorpay</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Failure Analysis panel (shown after payment fails) ──────────────────────
function FailureAnalysis({ scenario, customer, amount, productName }) {
  const failLayer = TCPIP_LAYERS.find(l => l.id === scenario?.failLayer);
  if (!scenario) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Failure callout */}
      <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(229,72,77,0.2)', borderLeft: '4px solid var(--red)', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{scenario.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#9B1C1C', marginBottom: 4 }}>
              {scenario.label} — failed at <span style={{ background: '#FCA5A5', padding: '1px 6px', borderRadius: 3 }}>{failLayer?.name} Layer</span>
            </div>
            <div style={{ fontSize: 11, color: '#BE3131', fontFamily: 'Courier New, monospace', marginBottom: 8, lineHeight: 1.5 }}>{scenario.tcpStory}</div>
            <div style={{ fontSize: 11, lineHeight: 1.65, color: '#7F1D1D', background: 'rgba(229,72,77,0.05)', padding: '8px 10px', borderRadius: 5 }}>
              <strong>Root cause:</strong> {scenario.failReason}
            </div>
          </div>
        </div>
      </div>

      {/* TCP/IP stack analysis */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>TCP/IP Layer Analysis</div>
        <TcpIpStack failLayer={scenario.failLayer} activeLayer={0} done={false} failed />
      </div>

      {/* Recovery */}
      <RecoveryVisual scenario={scenario} customer={customer} amount={amount} productName={productName} />
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function PaymentSimulator() {
  const [customers,        setCustomers]        = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProduct,  setSelectedProduct]  = useState('prod_001');
  const [shouldFail,       setShouldFail]       = useState(true);
  const [selectedScenario, setSelectedScenario] = useState('CARD_DECLINED');
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError,   setCustomersError]   = useState('');
  const [loading,          setLoading]          = useState(false);
  const [currentOrder,     setCurrentOrder]     = useState(null);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [activeProfile,    setActiveProfile]    = useState(null);
  const [result,           setResult]           = useState(null); // null | { type, scenario }

  useEffect(() => {
    axios.get('/api/checkout/customers').then(r => {
      const list = r.data || [];
      setCustomers(list);
      if (list.length) { setSelectedCustomer(list[0]._id); }
    }).catch(() => setCustomersError('Could not load customers. Make sure the server is running and data is seeded.')).finally(() => setCustomersLoading(false));
  }, []);

  const product  = PRODUCTS.find(p => p.id === selectedProduct) || PRODUCTS[0];
  const customer = customers.find(c => c._id === selectedCustomer);
  const scenario = shouldFail ? ALL_SCENARIOS.find(s => s.id === selectedScenario) : null;

  const handlePayNow = async () => {
    if (!selectedCustomer || loading) return;
    setLoading(true);
    setResult(null);
    setCurrentOrder(null);
    try {
      const { data } = await axios.post('/api/checkout/create-order', { customerId: selectedCustomer, productId: selectedProduct });
      setCurrentOrder(data);
      setActiveProfile(scenario);
      setModalOpen(true);
    } catch (err) {
      setLoading(false);
      setResult({ type: 'error', msg: err.message });
    }
  };

  const handleModalComplete = async (outcome) => {
    setModalOpen(false);
    if (outcome === 'success') {
      await axios.post('/api/checkout/payment-success', { razorpay_order_id: currentOrder?.orderId, razorpay_payment_id: `pay_sim_${Date.now()}`, razorpay_signature: 'sim', internalId: currentOrder?.internalId }).catch(() => {});
      setResult({ type: 'success' });
    } else {
      const prof = activeProfile;
      await axios.post('/api/checkout/payment-failed', { razorpay_order_id: currentOrder?.orderId, internalId: currentOrder?.internalId, razorpayError: { code: prof?.errorCode || 'BAD_REQUEST_ERROR', description: prof?.failMsg || 'Payment failed' } }).catch(() => {});
      setResult({ type: 'failed', scenario: prof });
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @keyframes modalIn    { from { opacity:0; transform:scale(0.96) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes shake      { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes fadeInLine { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      <RazorpayModal isOpen={modalOpen} scenario={activeProfile} amount={product.amount} productName={product.name}
        customer={customer} onClose={() => { setModalOpen(false); setLoading(false); }} onComplete={handleModalComplete} />

      <div style={{ maxWidth: 1140, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* ── Left ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Success */}
          {result?.type === 'success' && (
            <div className="infobox infobox-green anim-in" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Payment authorized — order complete</div>
                <div style={{ fontSize: 11, marginTop: 2, color: 'inherit', opacity: 0.8 }}>All TCP/IP layers transmitted successfully · Issuer bank approved</div>
              </div>
              <button onClick={() => setResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button>
            </div>
          )}

          {/* Config card */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">🧪 Payment Simulator</div>
                <div className="card-subtitle">Configure a scenario → fill in card details → watch the TCP/IP transmission live</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Customer */}
              <div>
                <label className="label">Customer</label>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className="select" id="customer-select" disabled={customersLoading || !customers.length}>
                  <option value="">{customersLoading ? 'Loading…' : customers.length ? 'Choose a customer' : 'No customers'}</option>
                  {customers.map(c => <option key={c._id} value={c._id}>{c.name} · {c.email} · {c.segment}</option>)}
                </select>
                {customersError && <div className="form-error">{customersError}</div>}
                {customer && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>📱 {customer.phone || '—'}</span>
                    <span>💳 {customer.savedPaymentMethods?.length || 0} saved method(s)</span>
                    <span>📣 {customer.contactPreferences?.channel || 'whatsapp'}</span>
                    {(customer.savedPaymentMethods?.length || 0) > 1 && <span style={{ color: 'var(--green)', fontWeight: 500 }}>→ L1 alt-retry eligible</span>}
                  </div>
                )}
              </div>

              {/* Product */}
              <div>
                <label className="label">Product / Plan</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PRODUCTS.map(p => (
                    <button key={p.id} onClick={() => setSelectedProduct(p.id)}
                      style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', border: selectedProduct === p.id ? '2px solid var(--rzp-blue)' : '1px solid var(--border)', background: selectedProduct === p.id ? 'var(--rzp-blue-50)' : 'var(--surface)', transition: 'all 0.12s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.icon} {p.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: selectedProduct === p.id ? 'var(--rzp-blue)' : 'var(--text-primary)' }}>₹{p.amount.toLocaleString('en-IN')}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Outcome toggle */}
              <div className="payment-outcome-control">
                <div className="label" style={{ marginBottom: 2 }}>Simulation outcome</div>
                <div className="card-subtitle" style={{ marginBottom: 0 }}>What should this simulated payment do?</div>
                <div className="segmented-control" style={{ marginTop: 10 }}>
                  <button type="button" className={!shouldFail ? 'active' : ''} onClick={() => setShouldFail(false)}><span className="outcome-dot success" /> Payment succeeds</button>
                  <button type="button" className={shouldFail ? 'active failed' : ''} onClick={() => setShouldFail(true)}><span className="outcome-dot failed" /> Payment fails</button>
                </div>
              </div>

              {/* Scenario picker */}
              {shouldFail && (
                <div style={{ animation: 'slideIn 0.15s ease-out' }}>
                  <label className="label">Failure Scenario</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {SCENARIO_GROUPS.map(group => (
                      <div key={group.label}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>{group.label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {group.scenarios.map(sc => {
                            const layer = TCPIP_LAYERS.find(l => l.id === sc.failLayer);
                            const sel   = selectedScenario === sc.id;
                            return (
                              <button key={sc.id} onClick={() => setSelectedScenario(sc.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', border: sel ? `2px solid ${layer?.color}` : '1px solid var(--border)', background: sel ? layer?.bg : 'var(--surface)', transition: 'all 0.15s' }}>
                                <span style={{ fontSize: 16, flexShrink: 0 }}>{sc.icon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{sc.label}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{sc.desc}</div>
                                </div>
                                <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: layer?.color, background: layer?.bg, border: `1px solid ${layer?.color}30`, padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase' }}>{layer?.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pay button */}
              <div>
                {currentOrder?.orderId && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Order: <span className="order-id">{currentOrder.orderId}</span></div>}
                <button onClick={handlePayNow} disabled={loading || !selectedCustomer} className="btn-pay" id="pay-now-btn">
                  {loading
                    ? <><div className="spinner" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> Opening checkout…</>
                    : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> Pay ₹{product.amount.toLocaleString('en-IN')} — Open Checkout</>}
                </button>
              </div>
            </div>
          </div>

          {/* Failure Analysis */}
          {result?.type === 'failed' && result.scenario && (
            <div className="card anim-in" style={{ borderColor: 'rgba(229,72,77,0.2)' }}>
              <div className="card-header">
                <div>
                  <div className="card-title">🔬 Failure Analysis &amp; Recovery</div>
                  <div className="card-subtitle">TCP/IP layer diagnosis · AI recovery pipeline</div>
                </div>
                <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
              </div>
              <div className="card-body">
                <FailureAnalysis scenario={result.scenario} customer={customer} amount={product.amount} productName={product.name} />
              </div>
            </div>
          )}
        </div>

        {/* ── Right — TCP/IP reference ── */}
        <div>
          <div className="card">
            <div className="card-header"><div className="card-title">🌐 TCP/IP Layer Reference</div></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TCPIP_LAYERS.map(layer => (
                <div key={layer.id} style={{ padding: '9px 10px', borderRadius: 7, background: layer.bg, border: `1px solid ${layer.color}25` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: layer.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0 }}>{layer.id}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: layer.color }}>{layer.name} Layer</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{layer.proto}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="infobox infobox-blue" style={{ fontSize: 11, marginTop: 4 }}>
                Payment failures are pinpointed to the exact TCP/IP layer. Recovery strategy is chosen based on where in the stack the failure occurred.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
