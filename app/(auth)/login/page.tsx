'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, Eye, EyeOff, Mic, Terminal, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, refreshSession } from '@/app/lib/auth'
import { SHOW_LOGIN_CHAT_WIDGET } from '@/app/lib/feature-flags'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [bannerError, setBannerError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [loading, setLoading] = useState(false)

  // Silent re-entry. The middleware bounces here whenever the cookie's access
  // token is expired — but an expired access token is NOT a dead session if a
  // refresh token is still live. Try one silent renewal; on success rejoin the
  // app with a full load so the middleware sees the fresh cookie. On failure
  // the form just renders — the session really is over.
  useEffect(() => {
    let cancelled = false
    void refreshSession().then((token) => {
      if (token && !cancelled) window.location.replace('/')
    })
    return () => { cancelled = true }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setBannerError('')
    setFieldError('')
    try {
      const user = await login(email, password)
      // No email on the account -> one skippable prompt to add it. Never a
      // wall: the prompt page's "Skip for now" goes straight to the dashboard.
      //
      // Full document load, deliberately not router.push. The root layout
      // resolves the school from the session cookie and hands that school's
      // config to ConfigProvider — but the layout mounted on the way IN to
      // /login, before any token existed, so it resolved no school. A
      // client-side push keeps that render alive, and the whole signed-in
      // session would then run on config resolved for nobody.
      window.location.assign(user.email ? '/' : '/account/email')
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : '').toLowerCase()
      // Keycloak returns "Invalid user credentials" for both wrong password and
      // unknown username/email — it intentionally doesn't distinguish the two.
      // Show the inline field error for credential failures; banner for everything else.
      if (msg.includes('invalid user credentials') || msg.includes('invalid_grant')) {
        setFieldError('Username or password is incorrect')
      } else {
        setBannerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen grid md:grid-cols-[55fr_45fr] p-2 gap-2 overflow-hidden">
      {/* Left — image panel */}
      <div className="hidden md:flex items-center justify-center min-h-0">
        <div className="relative w-full h-full min-h-0 rounded-2xl overflow-hidden">
          <img
            src="/onboarding.jpg"
            alt="Classroom"
            className="w-full h-full object-cover object-top"
          />
 
          {SHOW_LOGIN_CHAT_WIDGET && (
            <>
              {/* Volume icon */}
              <div className="absolute top-4 left-4 z-10">
                <button className="p-2 rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 transition-colors">
                  <Volume2 className="size-4" />
                </button>
              </div>

              {/* Chatbar + caption */}
              <div className="absolute bottom-4 left-40 right-40 z-10 flex flex-col gap-4">
                <div className="bg-white rounded-2xl px-4 py-4 flex items-center gap-3 shadow-lg">
                  <input
                    className="flex-1 text-sm outline-none text-zinc-700 placeholder:text-zinc-400 bg-transparent"
                    placeholder="Ask questions"
                    readOnly
                  />
                  <Mic className="size-4 text-zinc-400 shrink-0" />
                  <button className="p-2 bg-zinc-900 rounded-xl text-white hover:bg-zinc-700 transition-colors shrink-0">
                    <ArrowUp className="size-4" />
                  </button>
                </div>
                <p className="text-center text-sm text-white/80">
                  Try Inferentics for free
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex flex-col items-center justify-between py-12 px-8">
        {/* Top spacer */}
        <div />

        {/* Form content */}
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Login</h1>
            <p className="text-sm text-muted-foreground">
              Enter your username or email below to login to your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            {bannerError && (
              <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Terminal className="size-4 text-destructive mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-destructive">
                      We couldn&apos;t sign you in
                    </p>
                    <p className="text-sm text-destructive">{bannerError}</p>
                  </div>
                </div>
              </div>
            )}
            <Input
              type="text"
              placeholder="Username or email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldError ? 'border-destructive' : ''}
              required
            />
            <div className="space-y-1">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`pr-10${fieldError ? ' border-destructive' : ''}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldError && (
                <p className="text-sm text-destructive">{fieldError}</p>
              )}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>

        {/* Bottom terms */}
        <p className="text-center text-xs text-muted-foreground max-w-xs leading-relaxed">
          By clicking logging in, you agree to our{' '}
          <a href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
