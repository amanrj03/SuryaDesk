import { Link } from 'react-router-dom'
import { ArrowRightIcon, TruckIcon } from '@heroicons/react/24/outline'
import { Brand } from '../../components/ui/Brand.jsx'

export default function LandingPage({ signedIn }) {
  return (
    <main className="min-h-screen bg-[#FAF9F6] text-gray-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
        <Link className="secondary" to={signedIn ? '/workspace' : '/login'}>
          {signedIn ? 'Open workspace' : 'Staff sign in'}
        </Link>
      </header>
      <section className="mx-auto grid max-w-6xl gap-7 px-4 py-14 sm:px-8 sm:py-24 lg:grid-cols-[1.5fr_1fr] lg:items-center">
        <div>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">Rooftop solar for homes and businesses</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-gray-600">
            Request a quote for a new solar installation or check the progress and equipment warranties for an existing order.
          </p>
          <Link className="primary mt-6" to="/enquiry">
            Request a quote <ArrowRightIcon aria-hidden="true" className="ml-2 size-4" />
          </Link>
        </div>
        <div className="rounded-3xl bg-gray-900 p-6 text-white sm:p-8">
          <TruckIcon aria-hidden="true" className="mb-5 size-8 text-pink-300" />
          <h2 className="text-2xl font-semibold">Already have an order?</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">Use the private tracking link from your SuryaDesk team to see delivery, installation, and warranty updates.</p>
          <Link className="secondary mt-5" to="/track">
            Track order <ArrowRightIcon aria-hidden="true" className="ml-2 size-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}
