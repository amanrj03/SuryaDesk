import { cn } from '../../lib/cn.js'

export function PageHeader({ title, subtitle, action, children, className = '' }) {
  return (
    <header className={cn('page-header flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs font-medium text-gray-500">{subtitle}</p>}
      </div>
      {(action || children) && (
        <div className="flex items-center gap-2">
          {action}
          {children}
        </div>
      )}
    </header>
  )
}

export function Toolbar({ children, className = '' }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-full border border-white/60 bg-white/70 p-1 shadow-2xs backdrop-blur-xs',
        className,
      )}
    >
      {children}
    </div>
  )
}
