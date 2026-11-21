import { useState } from 'react'
import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'

export function AppShell({ session, sections, onLogout, children }) {
  const user = session?.user
  const [navigationOpen, setNavigationOpen] = useState(true)

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#EFECE6] text-[#2D2D2E] antialiased">
      {/* Top Header */}
      <Header
        user={user}
        navigationOpen={navigationOpen}
        onToggleNavigation={() => setNavigationOpen((open) => !open)}
        onLogout={onLogout}
      />

      {/* Main layout: vertical stack on mobile, horizontal sidebar + content on desktop */}
      <div className="flex flex-1 flex-col items-start gap-3 p-2.5 sm:p-4 lg:flex-row lg:gap-4 lg:p-5">
        <div
          id="workspace-navigation"
          className={`w-full shrink-0 self-stretch lg:block lg:w-56 ${navigationOpen ? '' : 'hidden'}`}
        >
          <Sidebar user={user} sections={sections} onLogout={onLogout} />
        </div>

        <main className="flex min-w-0 flex-1 w-full flex-col gap-5 rounded-[22px] border border-white/60 bg-white/60 p-3 shadow-2xs backdrop-blur-md sm:rounded-panel sm:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
