import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

export function BackToHome({ className = '' }) {
  return (
    <Link to="/" className={'inline-flex w-fit items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-700 hover:text-emerald-800 ' + className}>
      <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
      Back to home
    </Link>
  )
}
