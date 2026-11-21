import { cn } from '../../lib/cn.js'
import { words } from '../../lib/format.js'

const TONES = {
  neutral: 'bg-gray-100 text-gray-600',
  accent: 'bg-[#E62E6B] text-white',
  ink: 'bg-black text-white',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  muted: 'bg-white/80 text-gray-500 border border-gray-200',
}

export function Badge({ tone = 'neutral', children, className = '', icon }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold',
        TONES[tone] || TONES.neutral,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function Chip({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold',
        TONES[tone] || TONES.neutral,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function TrendBadge({ value, className = '' }) {
  const num = Number(value) || 0
  const isPositive = num >= 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
        className,
      )}
    >
      <span>{isPositive ? '↑' : '↓'}</span>
      <span>{Math.abs(num).toFixed(1)}%</span>
    </span>
  )
}

const STATUS_MAP = {
  NEW: 'accent',
  CONTACTED: 'warning',
  QUALIFIED: 'warning',
  SURVEY_SCHEDULED: 'warning',
  SURVEY_APPROVED: 'success',
  QUOTED: 'warning',
  WON: 'success',
  LOST: 'danger',
  SCHEDULED: 'warning',
  IN_PROGRESS: 'warning',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  DRAFT: 'neutral',
  SENT: 'warning',
  ACCEPTED: 'success',
  CONFIRMED: 'success',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  IN_STOCK: 'success',
  RESERVED: 'warning',
  DISPATCHED: 'warning',
  INSTALLED: 'success',
  UNDER_REPAIR: 'warning',
  REPLACED: 'neutral',
  ACTIVE: 'success',
  EXPIRED: 'danger',
  OPEN: 'accent',
  CLOSED: 'neutral',
  ISSUED: 'warning',
  PAID: 'success',
}

export function StatusBadge({ status, className = '' }) {
  const tone = STATUS_MAP[status] || 'neutral'
  return (
    <Badge tone={tone} className={className}>
      {words(status)}
    </Badge>
  )
}
