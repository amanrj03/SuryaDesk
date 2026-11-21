import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bars3Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { Avatar } from '../ui/Avatar.jsx'
import { Badge } from '../ui/Badge.jsx'
import { words } from '../../lib/format.js'

export function Header({ user, navigationOpen, onToggleNavigation, onLogout }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isMenuOpen) return
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [isMenuOpen])

  const onSearch = (event) => {
    event.preventDefault()
    const query = term.trim()
    if (!query) return
    navigate(`/leads?q=${encodeURIComponent(query)}`)
  }

  const canSearchLeads = user?.capabilities?.includes('leads:read')
  const canCreateLead = user?.capabilities?.includes('leads:write')
  const canAddPackage = user?.capabilities?.includes('catalog:manage')

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-black/5 bg-[#EFECE6]/90 px-3 py-2 backdrop-blur-sm sm:px-4 lg:px-6">
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center gap-3 lg:w-56">
        <button
          type="button"
          onClick={onToggleNavigation}
          aria-label={navigationOpen ? 'Hide navigation' : 'Open navigation'}
          aria-expanded={navigationOpen}
          aria-controls="workspace-navigation"
          className="rounded-full p-1.5 text-gray-600 transition hover:bg-white/60 lg:hidden"
        >
          <Bars3Icon className="size-5" />
        </button>

        <Link to="/workspace" className="flex items-center gap-1.5" aria-label="SuryaDesk Home">
          <img
            src="/logo.png"
            alt="SuryaDesk"
            width="222"
            height="195"
            className="h-8 w-auto object-contain sm:hidden"
          />
          <img
            src="/fulllogo.png"
            alt="SuryaDesk"
            width="866"
            height="288"
            className="hidden h-9 w-auto max-w-[170px] object-contain sm:block"
          />
        </Link>
      </div>

      {/* Global Search Pill */}
      {canSearchLeads && <form onSubmit={onSearch} className="mx-2 hidden max-w-md flex-1 sm:block">
        <div className="relative flex items-center">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 size-4 text-gray-400" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search enquiries"
            aria-label="Search enquiries from header"
            maxLength={120}
            className="w-full rounded-full border border-transparent bg-white/80 py-1.5 pl-10 pr-4 text-xs font-medium text-gray-800 placeholder-gray-400 backdrop-blur-sm transition-all focus:border-white focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-black/10"
          />
        </div>
      </form>}

      {/* Right User & Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* User avatar menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            className="flex items-center rounded-full bg-gradient-to-tr from-amber-300 via-orange-400 to-[#E62E6B] p-[1.5px] transition hover:opacity-90"
          >
            <span className="rounded-full bg-[#EFECE6] p-[1px]">
              <Avatar name={user?.name ?? 'User'} size="md" />
            </span>
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              className="animate-fade-in absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-white/60 bg-white p-2 shadow-xl"
            >
              <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className="truncate text-xs font-semibold text-gray-800">{user?.name}</p>
                <p className="truncate text-[11px] text-gray-500">{user?.email}</p>
                <div className="mt-1.5">
                  <Badge tone="accent">{words(user?.role)}</Badge>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  onLogout()
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <ArrowRightStartOnRectangleIcon className="size-4 text-gray-400" />
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Primary Action Button */}
        {canCreateLead ? (
          <Link
            to="/leads"
            aria-label="New enquiry"
            title="New enquiry"
            className="flex items-center gap-1.5 rounded-full bg-[#E62E6B] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#D0255E]"
          >
            <PlusIcon className="size-3.5 stroke-2" />
            <span className="hidden md:inline">Enquiries</span>
          </Link>
        ) : canAddPackage ? (
          <Link
            to="/packages"
            aria-label="Packages"
            title="Packages"
            className="flex items-center gap-1.5 rounded-full bg-[#E62E6B] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#D0255E]"
          >
            <PlusIcon className="size-3.5 stroke-2" />
            <span className="hidden md:inline">Packages</span>
          </Link>
        ) : null}
      </div>
    </header>
  )
}
