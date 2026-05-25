// UI primitives + helpers, v2 console.

const { useState } = React;

const WEI = 1_000_000_000_000_000_000n;

function formatEther(wei) {
  if (wei === undefined || wei === null) return '0';
  const n = typeof wei === 'bigint' ? wei : BigInt(wei);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / WEI;
  const frac = abs % WEI;
  if (frac === 0n) return (neg ? '-' : '') + whole.toString();
  const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (fracStr ? '.' + fracStr : '');
}

function parseEther(str) {
  if (!str) return 0n;
  const [whole, frac = ''] = String(str).split('.');
  const fracPadded = (frac + '000000000000000000').slice(0, 18);
  return BigInt(whole || '0') * WEI + BigInt(fracPadded || '0');
}

function shortAddr(a) {
  if (!a) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// --- primitives ---------------------------------------------------------

function Card({ children, className = '', style }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

function CardHead({ title, sub, actions }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

function Button({ children, variant = 'default', size, disabled, onClick, type = 'button', style }) {
  const cls = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    size === 'sm' ? 'btn-sm' : '',
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

function Field({ label, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

function Input(props) { return <input className="input" {...props} />; }
function Select({ children, ...props }) { return <select className="select" {...props}>{children}</select>; }

function Badge({ children, tone }) {
  return <span className={'badge ' + (tone ? 'badge-' + tone : '')}>{children}</span>;
}

function Kpi({ label, value, unit, hint }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function SectionRule({ title }) {
  return (
    <div className="section-rule">
      <h2>{title}</h2>
      <div className="line" />
    </div>
  );
}

function Avatar({ name, size = 28 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {initials(name)}
    </span>
  );
}

function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

function TxStatus({ msg, tone }) {
  return <div className={'tx-status' + (tone ? ' ' + tone : '')}>{msg || '\u00a0'}</div>;
}

// Progress bar used by proposals — width is share %, threshold marker
// is the approval threshold to make it obvious where the proposal stands.
function Progress({ value, threshold }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const t   = Math.max(0, Math.min(100, Number(threshold) || 0));
  return (
    <div className="progress" aria-label={`approval ${pct.toFixed(1)}% of ${t}%`}>
      <span style={{ width: pct + '%' }} />
      {threshold !== undefined && <div className="threshold" style={{ left: t + '%' }} />}
    </div>
  );
}

Object.assign(window, {
  Card, CardHead, Button, Field, Input, Select, Badge, Kpi, SectionRule,
  Avatar, Empty, TxStatus, Progress,
  formatEther, parseEther, shortAddr, initials, WEI,
});
