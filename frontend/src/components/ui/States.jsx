import { cn } from '../../lib/cn.js'
import { Button } from './Button.jsx'

export function EmptyState({ icon, title = 'Nothing to show yet', description, action, className = '' }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
      {icon && <div className="mb-2 text-gray-400">{icon}</div>}
      <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[11px] text-gray-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong', onRetry, className = '' }) {
  return (
    <div className={cn('rounded-2xl border border-red-200 bg-red-50/60 p-4 text-center', className)} role="alert">
      <p className="text-xs font-medium text-red-700">{message}</p>
      {onRetry && (
        <div className="mt-3">
          <Button variant="outline" size="xs" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

export function TableSkeleton({ rows = 6, columns = 4, className = '' }) {
  return (
    <div className={cn('animate-pulse space-y-3 p-4', className)}>
      <div className="flex gap-4 border-b border-gray-100 pb-2">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded-md bg-gray-200/70" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2 border-b border-gray-50">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="h-3 flex-1 rounded-md bg-gray-100" />
          ))}
        </div>
      ))}
    </div>
  )
}
