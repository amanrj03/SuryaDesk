import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ChevronUpIcon,
  ArrowRightStartOnRectangleIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline'
import { cn } from '../../lib/cn.js'
import { Avatar } from '../ui/Avatar.jsx'
import { words } from '../../lib/format.js'

export function Sidebar({ user, sections = [], onLogout }) {
  const hasReports = user?.capabilities?.includes('reports:view')
  const allowed = sections.filter((section) =>
    (section.capabilities ?? [section.capability]).some((cap) =>
      user?.capabilities?.includes(cap),
    ),
  )

  const [collapsed, setCollapsed] = useState({})

  const toggleGroup = (id) => {
    setCollapsed((cur) => ({ ...cur, [id]: !cur[id] }))
  }

  const navGroups = [
    {
      id: 'crm',
      title: 'CRM & Sales',
      paths: ['leads', 'customers', 'surveys', 'packages', 'products', 'quotes', 'orders'],
    },
    {
      id: 'inventory',
      title: 'Inventory & Dispatch',
      paths: ['inventory', 'assets', 'dispatches', 'suppliers', 'purchases'],
    },
    {
      id: 'operations',
      title: 'Field & Service',
      paths: ['installations', 'warranties', 'tickets'],
    },
    {
      id: 'finance',
      title: 'Finance & Staff',
      paths: ['invoices', 'subsidies', 'payments', 'users'],
    },
  ]

  return (
    <aside className="sidebar flex w-full flex-col justify-between py-1 px-1 lg:h-full lg:max-h-full lg:py-1 lg:px-1">
      <div className="flex w-full min-w-0 flex-1 items-center justify-between gap-2 lg:flex-col lg:items-stretch lg:min-h-0">
        {/* Primary Workspace Navigation */}
        <nav
          aria-label="Workspace"
          className="flex min-w-0 flex-1 flex-row items-center gap-1.5 overflow-x-auto scrollbar-thin py-1 text-xs font-medium text-gray-600 lg:flex-col lg:items-stretch lg:space-y-3 lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1"
        >
          {/* Quick link: Overview */}
          {hasReports && (
            <NavLink
              to="/overview"
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors lg:rounded-lg lg:px-2 lg:py-1.5',
                  isActive
                    ? 'bg-black text-white font-semibold shadow-2xs'
                    : 'bg-white/60 text-gray-700 hover:bg-white hover:text-black lg:bg-transparent',
                )
              }
            >
              <ChartBarSquareIcon className="size-4 shrink-0" />
              <span className="truncate">Overview</span>
            </NavLink>
          )}

          {/* On Mobile (< 1024px): Render allowed links directly as horizontal scroll pills */}
          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            {allowed.map(({ path, title, icon: Icon }) => (
              <NavLink
                key={path}
                to={'/' + path}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    isActive
                      ? 'bg-black text-white shadow-2xs'
                      : 'bg-white/70 text-gray-700 hover:bg-white hover:text-black',
                  )
                }
              >
                <Icon className="size-3.5 shrink-0 opacity-70" />
                <span className="whitespace-nowrap">{title}</span>
              </NavLink>
            ))}
          </div>

          {/* On Desktop (>= 1024px): Render collapsible categorized groups */}
          <div className="hidden space-y-3.5 lg:block">
            {navGroups.map((group) => {
              const groupSections = allowed.filter((s) => group.paths.includes(s.path))
              if (groupSections.length === 0) return null

              const isCollapsed = collapsed[group.id] ?? false

              return (
                <div key={group.id} className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400 transition hover:text-gray-700 px-1 py-0.5"
                  >
                    <span>{group.title}</span>
                    <ChevronUpIcon
                      className={cn(
                        'size-3 text-gray-400 transition-transform duration-150',
                        isCollapsed && 'rotate-180',
                      )}
                    />
                  </button>

                  {!isCollapsed && (
                    <div className="mt-1 space-y-0.5 border-l border-gray-300/80 pl-2 text-gray-600">
                      {groupSections.map(({ path, title, icon: Icon }) => (
                        <NavLink
                          key={path}
                          to={'/' + path}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
                              isActive
                                ? 'font-bold text-[#E62E6B] bg-white/70 shadow-2xs'
                                : 'hover:bg-white/50 hover:text-black',
                            )
                          }
                        >
                          <Icon className="size-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{title}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </nav>

        {/* On Mobile (< 1024px): compact sign-out button right next to navigation bar */}
        <div className="flex shrink-0 items-center lg:hidden">
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            className="flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white/80 p-1 text-gray-500 shadow-2xs transition hover:bg-white hover:text-black"
          >
            <ArrowRightStartOnRectangleIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* On Desktop (>= 1024px): Account Profile strip at bottom of sidebar */}
      <div className="hidden shrink-0 pt-3 mt-2 border-t border-gray-200/60 lg:block">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/60 p-2 shadow-2xs backdrop-blur-xs">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={user?.name ?? 'User'} size="sm" tone="soft" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-900">{user?.name}</p>
              <p className="truncate text-[10px] text-gray-500">{words(user?.role)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-900 cursor-pointer"
          >
            <ArrowRightStartOnRectangleIcon className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
