import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Panel({
  title,
  step,
  subtitle,
  icon,
  actions,
  children,
  className = '',
}: {
  title: string;
  step?: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel rounded-2xl p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300">
              {icon}
            </span>
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              {step ? (
                <span className="num text-[10px] font-bold tracking-widest text-blue-300/80">{step}</span>
              ) : null}
              <h2 className="text-[15px] font-semibold tracking-tight text-term-text">{title}</h2>
            </div>
            {subtitle ? <p className="mt-1 text-xs leading-relaxed text-term-muted">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'info';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/5 text-term-muted border-white/10',
    good: 'bg-blue-400/10 text-blue-300 border-blue-400/25',
    warn: 'bg-amber-400/10 text-amber-300 border-amber-400/25',
    danger: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    info: 'bg-sky-400/10 text-sky-300 border-sky-400/25',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'danger';
}) {
  const valueTone: Record<string, string> = {
    neutral: 'text-term-text',
    good: 'text-blue-300',
    warn: 'text-amber-300',
    danger: 'text-rose-300',
  };
  return (
    <div className="rounded-xl border border-term-line bg-black/25 px-3 py-2.5">
      <div className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">{label}</div>
      <div className={`num mt-1 text-lg font-bold ${valueTone[tone]}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[10.5px] leading-snug text-term-muted">{hint}</div> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-term-line bg-black/25 px-3 py-2 text-left transition hover:border-blue-400/40"
      aria-pressed={checked}
    >
      <span>
        <span className="block text-xs font-semibold text-term-text">{label}</span>
        {hint ? <span className="mt-0.5 block text-[10.5px] text-term-muted">{hint}</span> : null}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? 'bg-blue-400' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#05130e] transition-all ${
            checked ? 'left-4.5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold tracking-widest text-term-muted uppercase">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-lg border border-term-line bg-black/35 px-2.5 py-1.5 focus-within:border-blue-400/50">
        {prefix ? <span className="num text-xs text-term-muted">{prefix}</span> : null}
        <input
          type="number"
          className="num w-full bg-transparent text-sm font-semibold text-term-text outline-none"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            onChange(Number.isFinite(next) ? Math.max(min, next) : 0);
          }}
        />
        {suffix ? <span className="num text-xs text-term-muted">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-[10.5px] leading-snug text-term-muted">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8">
      <div
        className={`panel w-full ${widths[size]} rounded-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start justify-between gap-4 border-b border-term-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-term-text">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-term-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-term-line p-1.5 text-term-muted transition hover:border-rose-400/40 hover:text-rose-300"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-term-line px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants: Record<string, string> = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-white/10 disabled:text-term-muted',
    outline:
      'border border-term-line text-term-text hover:border-blue-400/50 hover:text-blue-200 disabled:opacity-40',
    ghost: 'text-term-muted hover:text-term-text disabled:opacity-40',
    danger: 'border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
