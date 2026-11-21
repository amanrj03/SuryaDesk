import { useState } from 'react'
import { Header } from './Header.jsx'
import { Sidebar } from './Sidebar.jsx'

export function AppShell({ session, sections, onLogout, children }) {
  const user = session?.user
  const [navigationOpen, setNavigationOpen] = useState(true)

  return (
    <div className="flex min-h-screen justify-center bg-[#E5E3E0] p-2 text-[#2D2D2E] antialiased sm:p-4 lg:p-6">
      <div className="flex w-full max-w-[1440px] flex-col gap-3 rounded-[24px] border border-white/40 bg-[#EFECE6] p-2.5 shadow-2xl sm:rounded-shell sm:p-4">
        {/* Top Header */}
        <Header user={user} navigationOpen={navigationOpen} onToggleNavigation={() => setNavigationOpen(open => !open)} onLogout={onLogout} />

        {/* Main layout: vertical stack on mobile, horizontal sidebar + content on desktop */}
        <div className="flex flex-col lg:flex-row flex-1 items-start gap-3 lg:gap-4">
          <div id="workspace-navigation" className={`w-full shrink-0 self-stretch lg:block lg:w-56 ${navigationOpen ? '' : 'hidden'}`}>
            <Sidebar user={user} sections={sections} onLogout={onLogout} />
          </div>

          <main className="flex min-w-0 flex-1 w-full flex-col gap-5 rounded-[22px] border border-white/60 bg-white/60 p-3 shadow-2xs backdrop-blur-md sm:rounded-panel sm:p-5 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
