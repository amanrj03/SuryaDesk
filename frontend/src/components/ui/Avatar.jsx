import { cn } from '../../lib/cn.js'
import { initials } from '../../lib/format.js'

const SIZES = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
}

const TONES = {
  neutral: 'bg-gray-100 text-gray-700',
  soft: 'bg-amber-100/80 text-amber-900',
  accent: 'bg-[#E62E6B] text-white',
  ink: 'bg-black text-white',
}

export function Avatar({ name, size = 'sm', tone = 'neutral', className = '' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase select-none',
        SIZES[size] || SIZES.sm,
        TONES[tone] || TONES.neutral,
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
