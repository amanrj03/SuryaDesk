import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn.js'

const VARIANTS = {
  primary: 'bg-black text-white hover:bg-gray-800 shadow-xs',
  accent: 'bg-[#E62E6B] text-white hover:bg-[#D0255E] shadow-xs',
  outline: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-xs',
  ghost: 'bg-transparent text-gray-600 hover:bg-white/70',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 shadow-xs',
}

const SIZES = {
  xs: 'text-[10px] font-medium px-2.5 py-1 gap-1',
  sm: 'text-xs font-medium px-3 py-1.5 gap-1.5',
  md: 'text-sm font-medium px-4 py-2 gap-2',
}

const BASE =
  'inline-flex items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap'

export function Button({
  variant = 'primary',
  size = 'sm',
  icon,
  children,
  className = '',
  isLoading = false,
  disabled = false,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  state,
  variant = 'primary',
  size = 'sm',
  icon,
  children,
  className = '',
  ...props
}) {
  return (
    <Link
      to={to}
      state={state}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {icon}
      {children}
    </Link>
  )
}

export function IconButton({ label, children, className = '', tone = 'default', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full p-1.5 transition-colors',
        tone === 'accent'
          ? 'bg-[#E62E6B]/10 text-[#E62E6B] hover:bg-[#E62E6B]/20'
          : 'text-gray-500 hover:bg-white/70 hover:text-black',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
