/* eslint-disable react-refresh/only-export-components */
import { ethers } from 'ethers';

export const WEI = 10n ** 18n;

export function formatEther(wei) {
  if (wei === undefined || wei === null) return '0';
  const n = typeof wei === 'bigint' ? wei : BigInt(wei);
  const full = ethers.formatEther(n);
  const [w, f = ''] = full.split('.');
  const trimmed = f.slice(0, 4).replace(/0+$/, '');
  return trimmed ? `${w}.${trimmed}` : w;
}

// Full-precision formatter for amounts a user is about to act on (withdraw,
// settle, deposit). Trailing zeros trimmed but no truncation — every wei
// shown so 0.00000123 is visible instead of rounding to 0.
export function formatEtherExact(wei) {
  if (wei === undefined || wei === null) return '0';
  const n = typeof wei === 'bigint' ? wei : BigInt(wei);
  const full = ethers.formatEther(n);
  if (!full.includes('.')) return full;
  return full.replace(/0+$/, '').replace(/\.$/, '');
}

export function parseEther(str) {
  if (!str) return 0n;
  return ethers.parseEther(String(str));
}

export function shortAddr(a) {
  if (!a) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function Card({ children, className = '', style }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function CardHead({ title, sub, actions }) {
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

export function Button({ children, variant = 'default', size, disabled, onClick, type = 'button', style }) {
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

export function Field({ label, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function Input(props) { return <input className="input" {...props} />; }
export function Select({ children, ...props }) { return <select className="select" {...props}>{children}</select>; }

export function Badge({ children, tone }) {
  return <span className={'badge ' + (tone ? 'badge-' + tone : '')}>{children}</span>;
}

export function Kpi({ label, value, unit, hint }) {
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

export function SectionRule({ title }) {
  return (
    <div className="section-rule">
      <h2>{title}</h2>
      <div className="line" />
    </div>
  );
}

export function Avatar({ name, size = 28 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {initials(name)}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function TxStatus({ msg, tone }) {
  return <div className={'tx-status' + (tone ? ' ' + tone : '')}>{msg || ' '}</div>;
}

export function Progress({ value, threshold }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const t   = Math.max(0, Math.min(100, Number(threshold) || 0));
  return (
    <div className="progress" aria-label={`approval ${pct.toFixed(1)}% of ${t}%`}>
      <span style={{ width: pct + '%' }} />
      {threshold !== undefined && <div className="threshold" style={{ left: t + '%' }} />}
    </div>
  );
}
