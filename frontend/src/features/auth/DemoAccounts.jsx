import { useEffect, useState } from 'react'

function DemoAccounts({ onSelect, disabled }) {
  const [demo, setDemo] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/__suryadesk/demo-accounts', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(setDemo)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  if (!demo) return null

  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white/60 p-3" aria-labelledby="demo-accounts-title">
      <h2 id="demo-accounts-title" className="text-sm font-semibold text-gray-900">Quick sign-in</h2>
      <p className="mt-1 text-xs text-gray-600">Choose a role to fill in its email and password.</p>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 min-[410px]:grid-cols-4">
        {demo.accounts.map(({ role, email }) => (
          <button
            key={role}
            type="button"
            disabled={disabled}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium capitalize text-gray-800 hover:border-[#E62E6B] hover:text-[#A81C4C]"
            onClick={() => onSelect(email, demo.password)}
          >
            {role}
          </button>
        ))}
      </div>
    </section>
  )
}

export default DemoAccounts
