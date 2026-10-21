import {
  ClipboardCheck,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  PackageCheck,
  ScanSearch,
  ShoppingCart,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useRole } from '../auth/AuthContext'
import { DEMO, STATIC_DEMO } from '../lib/demo'
import { ROLE_LABELS } from '../lib/roles'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  permission?: string
}

const INVENTORY_NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/exceptions', label: 'Exceptions', icon: TriangleAlert },
  { to: '/accuracy', label: 'Accuracy', icon: ScanSearch },
  { to: '/receiving', label: 'Receiving & counts', icon: ClipboardCheck, permission: 'receiving:read' },
]

const FULFILLMENT_NAV: NavItem[] = [{ to: '/orders', label: 'Orders', icon: ShoppingCart }]

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  const { can } = useRole()
  items = items.filter((item) => !item.permission || can(item.permission))
  return (
    <div>
      <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm lg:py-2 font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon size={17} strokeWidth={1.9} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AppLayout() {
  const { user, logout } = useRole()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer after navigating, and on Escape.
  useEffect(() => setNavOpen(false), [location.pathname])
  useEffect(() => {
    if (!navOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [navOpen])

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900">
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          aria-expanded={navOpen}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        >
          <Menu size={20} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
          <PackageCheck size={15} />
        </div>
        <span className="text-[15px] font-semibold text-slate-900">Fulfill 3PL</span>
      </header>

      {navOpen && (
        <div
          className="fixed inset-0 z-30 animate-fade-in bg-slate-900/30 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:z-30 lg:w-60 lg:translate-x-0 ${
          navOpen ? 'translate-x-0 shadow-drawer' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <PackageCheck size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-900">Fulfill 3PL</div>
            <div className="text-xs text-slate-500">Odoo inventory sync</div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Main">
          <NavGroup title="Inventory" items={INVENTORY_NAV} />
          <NavGroup title="Fulfillment" items={FULFILLMENT_NAV} />
        </nav>

        <div className="flex items-center gap-3 border-t border-slate-100 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-slate-900">{user?.name}</div>
            <div className="truncate text-xs text-slate-500">
              {user && (user.client ?? ROLE_LABELS[user.role])}
            </div>
          </div>
          {!STATIC_DEMO && (
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <LogOut size={16} />
          </button>
          )}
        </div>
      </aside>

      <main className="lg:pl-60">
        {(DEMO || STATIC_DEMO) && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] text-amber-900">
            <b>Demo</b> · read-only snapshot of sample Odoo data. Nothing here is real.
          </div>
        )}
        <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
