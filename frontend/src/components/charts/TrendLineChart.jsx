import { useId, useState } from 'react'
import { cn } from '../../lib/cn.js'
import { formatCompactCurrency } from '../../lib/format.js'

const VIEW_WIDTH = 500
const VIEW_HEIGHT = 120
const PADDING_Y = 14

export function TrendLineChart({
  data = [],
  title = 'Trend chart',
  baselineLabel = 'Average',
  height = 128,
  className = '',
}) {
  const [activeIndex, setActiveIndex] = useState(null)
  const chartId = useId()

  if (!data || data.length === 0) return null

  const values = data.map((point) => Number(point.value) || 0)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const average = values.reduce((sum, value) => sum + value, 0) / values.length

  const x = (index) =>
    data.length === 1 ? VIEW_WIDTH / 2 : (index / (data.length - 1)) * VIEW_WIDTH
  const y = (value) =>
    VIEW_HEIGHT - PADDING_Y - ((value - min) / span) * (VIEW_HEIGHT - PADDING_Y * 2)

  const points = data.map((point, index) => ({
    ...point,
    x: x(index),
    y: y(Number(point.value) || 0),
  }))

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')
  const areaPath = `${linePath} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`
  const averageY = y(average)

  const active = activeIndex === null ? null : points[activeIndex]
  const gradientId = `trend-fill-${chartId.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <figure className={cn('m-0 flex flex-col gap-2', className)}>
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={title}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E62E6B" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#E62E6B" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.5, 1].map((step) => (
            <line
              key={step}
              x1={0}
              x2={VIEW_WIDTH}
              y1={PADDING_Y + step * (VIEW_HEIGHT - PADDING_Y * 2)}
              y2={PADDING_Y + step * (VIEW_HEIGHT - PADDING_Y * 2)}
              stroke="rgba(0,0,0,0.06)"
              strokeWidth={1}
            />
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Average baseline */}
          <line
            x1={0}
            x2={VIEW_WIDTH}
            y1={averageY}
            y2={averageY}
            stroke="rgba(0,0,0,0.2)"
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* Main trend line */}
          <path
            d={linePath}
            fill="none"
            stroke="#E62E6B"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive hover targets */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={12}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setActiveIndex(index)}
            />
          ))}

          {/* Active dot */}
          {active && (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={PADDING_Y}
                y2={VIEW_HEIGHT}
                stroke="#E62E6B"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle cx={active.x} cy={active.y} r={5} fill="#E62E6B" />
              <circle cx={active.x} cy={active.y} r={2.5} fill="#ffffff" />
            </g>
          )}
        </svg>

        {/* Tooltip on hover */}
        {active && (
          <div
            className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black px-2 py-0.5 text-[10px] font-bold text-white shadow-md transition-all"
            style={{ left: `${(active.x / VIEW_WIDTH) * 100}%` }}
          >
            {active.label}: {formatCompactCurrency(active.value)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-[10px] text-gray-400">
        <span>{data[0]?.label}</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400">
          <span className="inline-block h-px w-3 border-b border-dashed border-gray-400" />
          {baselineLabel} ({formatCompactCurrency(average)})
        </span>
        <span>{data.at(-1)?.label}</span>
      </div>
    </figure>
  )
}
