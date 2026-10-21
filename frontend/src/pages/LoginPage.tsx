import { Loader2, PackageCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useRole } from '../auth/AuthContext'
import { Button } from '../components/ui/Controls'
import { DEMO, DEMO_EMAIL, DEMO_PASSWORD } from '../lib/demo'

export function LoginPage() {
  const { login } = useRole()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const field =
    'mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <PackageCheck size={22} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Sign in to Fulfill 3PL</h1>
          <p className="mt-1 text-sm text-slate-500">Inventory accuracy, synced from Odoo.</p>
        </div>

        {DEMO && DEMO_EMAIL && (
          <div className="mb-4 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">This is a read-only demo with sample data.</div>
            <button
              type="button"
              onClick={() => {
                setEmail(DEMO_EMAIL)
                setPassword(DEMO_PASSWORD)
              }}
              className="mt-2 font-medium text-amber-900 underline underline-offset-2 hover:no-underline"
            >
              Fill in the demo login
            </button>
          </div>
        )}

        <form
          onSubmit={submit}
          className="space-y-4 rounded-card border border-slate-200 bg-white p-6 shadow-card"
        >
          <div>
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            className="h-10 w-full"
            disabled={submitting || !email || !password}
            icon={submitting ? <Loader2 size={15} className="animate-spin" /> : undefined}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
