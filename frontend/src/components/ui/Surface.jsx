import { cn } from '../../lib/cn.js'

export function Panel({ className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/60 bg-white/40 p-4 backdrop-blur-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-100 bg-white p-4 shadow-xs',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function InkCard({ className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-black p-4 text-white shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function AccentCard({ className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-[#E62E6B] p-4 text-white shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function ListRow({ className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border border-gray-100 bg-white/80 p-2.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function Section({ title, subtitle, action, children, className = '', bodyClassName = '' }) {
  return (
    <Panel className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-700">{title}</div>
          {subtitle && <div className="mt-0.5 text-[11px] text-gray-400">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
    </Panel>
  )
}
