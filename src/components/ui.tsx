import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Project, Status, Verdict } from '../types'
import type { Tab } from '../ctx'
import { stLabel, vLabel, type T } from '../i18n'

/* ---------- Цвета статусов (ТЗ, раздел 6): зелёный / жёлтый / оранжевый / красный / серый ---------- */

export const ST_CLS: Record<Status, string> = {
  ok: 'bg-green-50 text-green-800 border-green-300',
  partial: 'bg-yellow-50 text-yellow-800 border-yellow-300',
  unconfirmed: 'bg-orange-50 text-orange-800 border-orange-300',
  fail: 'bg-red-50 text-red-800 border-red-300',
  review: 'bg-slate-100 text-slate-700 border-slate-300',
}
export const ST_DOT: Record<Status, string> = {
  ok: 'bg-green-500',
  partial: 'bg-yellow-400',
  unconfirmed: 'bg-orange-500',
  fail: 'bg-red-500',
  review: 'bg-slate-400',
}
/** Цветная левая граница для строки таблицы / карточки пункта (вместе с `border-l-4`). */
export const ST_BORDER_L: Record<Status, string> = {
  ok: 'border-l-green-500',
  partial: 'border-l-yellow-400',
  unconfirmed: 'border-l-orange-500',
  fail: 'border-l-red-500',
  review: 'border-l-slate-400',
}
/** HEX-цвета статусов — для SVG-диаграмм и печати. */
export const ST_HEX: Record<Status, string> = {
  ok: '#22c55e',
  partial: '#facc15',
  unconfirmed: '#f97316',
  fail: '#ef4444',
  review: '#94a3b8',
}
export const V_CLS: Record<Verdict, string> = {
  ready: 'border-green-500 bg-green-50 text-green-900',
  needs_work: 'border-amber-400 bg-amber-50 text-amber-900',
  risk: 'border-red-500 bg-red-50 text-red-900',
}
const V_ICON: Record<Verdict, IconName> = { ready: 'check', needs_work: 'alert', risk: 'x' }

/* ---------- Иконки (inline SVG, без зависимостей) ---------- */

const ICONS = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  report: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  clipboard: 'M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6',
  compare: 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
  gauge: 'M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  play: 'M7 4.5v15l12-7.5z',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  chevronRight: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3',
  key: 'M15.5 7.5 19 4m2-2-2 2 3 3-3.5 3.5-3-3M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5',
  flag: 'M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v11s-1 1-4 1-5-2-8-2-4 1-4 1',
  square: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l4 2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
} as const
export type IconName = keyof typeof ICONS

/** Иконка 24×24 в стиле outline. Размер и цвет задаются классами (`h-4 w-4 text-slate-500`). */
export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const filled = name === 'play'
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

/** Вращающийся индикатор загрузки. */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 animate-spin ${className}`} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/* ---------- Бейджи ---------- */

export function StatusBadge({ s, t, small }: { s: Status; t: T; small?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${ST_CLS[s]} ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ST_DOT[s]}`} aria-hidden="true" />
      {stLabel(t, s)}
    </span>
  )
}

export function VerdictBadge({ v, t, large }: { v: Verdict; t: T; large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${V_CLS[v]} ${large ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'}`}>
      <Icon name={V_ICON[v]} className={large ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {vLabel(t, v)}
    </span>
  )
}

/* ---------- Контейнеры ---------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`}>{children}</div>
}

/** Заголовок страницы/экрана: слева заголовок и подзаголовок, справа действия. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Показатель (KPI). `cls` — цвета рамки/фона для акцента, напр. `border-blue-500 bg-blue-50`. */
export function Stat({ label, value, sub, cls = '' }: { label: string; value: ReactNode; sub?: ReactNode; cls?: string }) {
  return (
    <div className={`min-w-0 rounded-xl px-4 py-3 ${cls ? `border-2 ${cls}` : 'border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]'}`}>
      <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold leading-tight tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

/** Информационная плашка. tone: info (синий), warn (жёлтый), success (зелёный), danger (красный). */
export function Notice({ tone = 'info', children, action, icon }: { tone?: 'info' | 'warn' | 'success' | 'danger'; children: ReactNode; action?: ReactNode; icon?: IconName }) {
  const c = {
    info: ['border-blue-200 bg-blue-50 text-blue-900', 'text-blue-600', 'info'],
    warn: ['border-amber-300 bg-amber-50 text-amber-900', 'text-amber-600', 'alert'],
    success: ['border-green-200 bg-green-50 text-green-900', 'text-green-600', 'check'],
    danger: ['border-red-200 bg-red-50 text-red-900', 'text-red-600', 'alert'],
  }[tone] as [string, string, IconName]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm ${c[0]}`}>
      <Icon name={icon ?? c[2]} className={`h-5 w-5 ${c[1]}`} />
      <div className="min-w-0 flex-1 basis-56">{children}</div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  )
}

/* ---------- Кнопки и фильтры ---------- */

export function Btn({
  children, onClick, kind = 'default', disabled, className = '', title, type, size = 'md', icon, ariaLabel,
}: {
  children: ReactNode; onClick?: () => void; kind?: 'default' | 'primary' | 'ghost' | 'danger'; disabled?: boolean; className?: string; title?: string; type?: 'submit' | 'button'
  size?: 'sm' | 'md' | 'lg'; icon?: IconName; ariaLabel?: string
}) {
  const k = {
    default: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50',
    primary: 'border border-blue-600 bg-blue-600 text-white shadow-sm hover:border-blue-700 hover:bg-blue-700',
    ghost: 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[kind]
  const s = { sm: 'px-2.5 py-1 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-5 py-2.5 text-base' }[size]
  return (
    <button
      type={type ?? 'button'}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${k} ${s} ${className}`}
    >
      {icon && <Icon name={icon} className={size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {children}
    </button>
  )
}

export function Chip({ active, children, onClick, count }: { active?: boolean; children: ReactNode; onClick?: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-blue-500 bg-blue-50 font-semibold text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}
    >
      {children}
      {count !== undefined && <span className={`rounded-full px-1.5 text-[11px] font-semibold ${active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{count}</span>}
    </button>
  )
}

/* ---------- Модальное окно ---------- */

// Стек открытых модалок: Escape закрывает только верхнюю
const modalStack: string[] = []

export function Modal({ title, onClose, children, wide, footer, closeLabel = 'Close' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; closeLabel?: string }) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    modalStack.push(id)
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) {
        e.preventDefault()
        close.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      modalStack.splice(modalStack.indexOf(id), 1)
      prev?.focus?.()
    }
  }, [id])
  return (
    <div
      className="anim-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-[2px] sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        className={`anim-pop my-auto w-full rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 focus:outline-none ${wide ? 'max-w-5xl' : 'max-w-xl'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h3 id={`${id}-t`} className="min-w-0 truncate text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={closeLabel} title={closeLabel}>
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Загрузка файлов ---------- */

export function DropZone({ onFiles, label, hint, disabled, accept, compact }: { onFiles: (f: File[]) => void; label: string; hint?: string; disabled?: boolean; accept?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const pick = () => !disabled && ref.current?.click()
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={hint ? `${label}. ${hint}` : label}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          pick()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) onFiles(Array.from(e.dataTransfer.files))
      }}
      className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ${compact ? 'px-4 py-4' : 'px-4 py-7'} ${over ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/40'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <span className={`flex items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 transition-transform group-hover:-translate-y-0.5 ${compact ? 'h-8 w-8' : 'h-11 w-11'}`}>
        <Icon name="upload" className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>
      <div className="mt-2 text-sm font-medium text-slate-800">{label}</div>
      {hint && <div className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{hint}</div>}
      <input
        ref={ref}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function Highlighted({ text, range }: { text: string; range: [number, number] | null }) {
  if (!range) return <>{text}</>
  return (
    <>
      {text.slice(0, range[0])}
      <mark data-hl className="rounded bg-yellow-200 px-0.5">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  )
}

/* ---------- Прогресс ---------- */

export function Bar({ value, cls = 'bg-blue-600', label, thick }: { value: number; cls?: string; label?: string; thick?: boolean }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-slate-100 ${thick ? 'h-3' : 'h-2'}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${cls}`} style={{ width: `${v}%` }} />
    </div>
  )
}

export const scoreColor = (n: number) => (n >= 90 ? 'bg-green-500' : n >= 70 ? 'bg-yellow-400' : 'bg-red-500')

/* ---------- Пустое состояние ---------- */

export function Empty({ children, icon, title, action }: { children: ReactNode; icon?: IconName; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
      {icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      {title && <div className="mb-1 text-base font-semibold text-slate-800">{title}</div>}
      <div className="max-w-md">{children}</div>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

/* ---------- Пошаговый поток ---------- */

export interface Step {
  label: string
  done?: boolean
  onClick?: () => void
}

/** Горизонтальный степпер. Текущий шаг — первый невыполненный. На узких экранах прокручивается внутри себя. */
export function Stepper({ steps, label }: { steps: Step[]; label?: string }) {
  const cur = steps.findIndex((s) => !s.done)
  return (
    <nav aria-label={label} className="no-scrollbar -mx-1 overflow-x-auto px-1">
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((s, i) => {
          const state = s.done ? 'done' : i === cur ? 'current' : 'todo'
          const inner = (
            <>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  state === 'done' ? 'bg-green-600 text-white' : state === 'current' ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'border border-slate-300 bg-white text-slate-500'
                }`}
              >
                {state === 'done' ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`whitespace-nowrap text-sm ${state === 'current' ? 'font-semibold text-slate-900' : state === 'done' ? 'text-slate-700' : 'text-slate-500'}`}>{s.label}</span>
            </>
          )
          return (
            <li key={i} className="flex items-center gap-1" aria-current={state === 'current' ? 'step' : undefined}>
              {i > 0 && <span className={`mx-1 h-px w-5 sm:w-8 ${steps[i - 1].done ? 'bg-green-500' : 'bg-slate-300'}`} aria-hidden="true" />}
              {s.onClick ? (
                <button type="button" onClick={s.onClick} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100">{inner}</button>
              ) : (
                <span className="flex items-center gap-2 py-1 pl-1 pr-2">{inner}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Сквозной поток проверки: документация → требования → утверждение → заявка → проверка → результат. */
export function FlowSteps({ project, t, go }: { project: Project; t: T; go: (tab: Tab) => void }) {
  const steps: Step[] = [
    { label: t('customerDocs'), done: project.customerFiles.length > 0, onClick: () => go('upload') },
    { label: t('runExtraction'), done: project.requirements.length > 0, onClick: () => go('upload') },
    { label: t('approve'), done: project.checklistApproved, onClick: () => go('checklist') },
    { label: t('participantDocs'), done: project.participants.some((p) => p.files.length > 0), onClick: () => go('upload') },
    { label: t('runMatching'), done: project.participants.some((p) => Object.keys(p.matches).length > 0), onClick: () => go('upload') },
    { label: `${t('tab_compare')} / ${t('tab_summary')}`, onClick: () => go('compare') },
  ]
  return <Stepper steps={steps} label={t('pipeline')} />
}
