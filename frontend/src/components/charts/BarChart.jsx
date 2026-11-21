import { useId, useState } from 'react'
import { cn } from '../../lib/cn.js'
import { formatCompactCurrency, formatNumber } from '../../lib/format.js'

export function BarChart({
  data = [],
  format = 'currency',
  tone = 'ink',
  height = 128,
  className = '',
  title = 'Bar chart',
}) {
  const [activeIndex, setActiveIndex] = useState(null)
  const chartId = useId()

  const max = Math.max(...data.map((entry) => Number(entry.value) || 0), 0)
  const formatValue = (value) =>
    format === 'currency' ? formatCompactCurrency(value) : formatNumber(value)

  const isInverse = tone === 'inverse'

  return (
    <figure className={cn('m-0 flex flex-col gap-2', className)}>
      <div
        className="relative flex items-end justify-between gap-1.5 px-1"
        style={{ height }}
        role="img"
        aria-label={title}
      >
        {data.map((entry, index) => {
          const val = Number(entry.value) || 0
          const ratio = max === 0 ? 0 : val / max
          const barHeight = Math.max(ratio * (height - 34), val > 0 ? 6 : 3)
          const isActive = activeIndex === index

          return (
            <button
              key={entry.label + index}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              aria-label={`${entry.label}: ${formatValue(val)}`}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-lg focus:outline-hidden"
            >
              <span
                className={cn(
                  'text-[9px] font-semibold transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                  isInverse ? 'text-white' : 'text-gray-600',
                )}
              >
                {formatValue(val)}
              </span>
              <span
                className={cn(
                  'w-full max-w-[26px] rounded-t-[4px] transition-colors',
                  isInverse
                    ? isActive
                      ? 'bg-white'
                      : 'bg-white/45'
                    : isActive
                      ? 'bg-[#E62E6B]'
                      : 'bg-gray-200',
                )}
                style={{ height: barHeight }}
              />
              <span
                className={cn(
                  'truncate text-[10px]',
                  isInverse ? 'text-white/80' : 'text-gray-400',
                  isActive && (isInverse ? 'text-white font-semibold' : 'text-gray-700 font-semibold'),
                )}
              >
                {entry.label}
              </span>
            </button>
          )
        })}
      </div>
    </figure>
  )
}
