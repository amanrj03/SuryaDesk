import { useId } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { formatDateTime, words } from '../../lib/format.js'

export function ProjectTimeline({ timeline, cancelled, title = 'Order timeline' }) {
  const headingId = useId()
  const latest = timeline.findLastIndex(event => event.at)
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-semibold">{title}</h2>
      <ol className="mt-5">
        {timeline.map(({ stage, at }, index) => {
          const recorded = Boolean(at)
          const current = index === latest && !cancelled
          return (
            <li key={stage} aria-current={current ? 'step' : undefined} className="relative flex gap-3 pb-5 last:pb-0">
              {index < timeline.length - 1 && <span aria-hidden="true" className="absolute top-6 bottom-0 left-3 w-px bg-gray-200" />}
              <span aria-hidden="true" className={`relative grid size-6 shrink-0 place-items-center rounded-full border
                ${recorded ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300 bg-white'}`}>
                {recorded && <CheckIcon className="size-4" />}
              </span>
              <div>
                <p className="text-sm font-semibold">{words(stage)}</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {recorded ? <time dateTime={at}>{formatDateTime(at)}</time>
                    : index < latest ? 'Date unavailable' : cancelled ? 'Not reached' : 'Pending'}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
