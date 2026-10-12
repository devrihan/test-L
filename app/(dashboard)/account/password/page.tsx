'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getStoredToken } from '@/app/lib/auth'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'

// Native change-password form (#773). The current password is verified and
// the change applied by user-registry through /api/auth/password — the new
// password never touches loam's own storage or logs.

function PasswordField({
  placeholder,
  value,
  onChange,
  error,
  autoComplete,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  error?: boolean
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`pr-10${error ? ' border-destructive' : ''}`}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export default function ChangePasswordPage() {
  usePageBreadcrumb('Change password', [])

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentError, setCurrentError] = useState('')
  const [newError, setNewError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [bannerError, setBannerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCurrentError('')
    setNewError('')
    setConfirmError('')
    setBannerError('')

    if (newPassword.length < 8) {
      setNewError('Your new password must be at least 8 characters.')
      return
    }
    if (confirmPassword !== newPassword) {
      setConfirmError("The passwords don't match.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getStoredToken() ?? ''}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.status === 204) {
        setDone(true)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.status === 403) {
        setCurrentError('Your current password is incorrect.')
      } else if (res.status === 400) {
        setNewError(data.error || 'That password isn’t allowed — please choose another.')
      } else if (res.status === 423) {
        setBannerError('Too many failed attempts. Please wait a few minutes and try again.')
      } else if (res.status === 401) {
        setBannerError('Your session has expired. Please sign in again and retry.')
      } else {
        setBannerError('We couldn’t change your password right now. Please try again.')
      }
    } catch {
      setBannerError('We couldn’t change your password right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex justify-center pt-16 px-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="size-10 mx-auto text-[#0F7A3C]" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Password changed</h1>
            <p className="text-sm text-muted-foreground">
              Use your new password the next time you sign in.
            </p>
          </div>
          <Button asChild className="w-full" size="lg">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-center pt-16 px-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Change password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your current password, then choose a new one.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {bannerError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <Terminal className="size-4 text-destructive mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-destructive">
                    We couldn&apos;t change your password
                  </p>
                  <p className="text-sm text-destructive">{bannerError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <PasswordField
              placeholder="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              error={!!currentError}
              autoComplete="current-password"
            />
            {currentError && <p className="text-sm text-destructive">{currentError}</p>}
          </div>

          <div className="space-y-1">
            <PasswordField
              placeholder="New password"
              value={newPassword}
              onChange={setNewPassword}
              error={!!newError}
              autoComplete="new-password"
            />
            {newError
              ? <p className="text-sm text-destructive">{newError}</p>
              : <p className="text-sm text-muted-foreground">At least 8 characters.</p>}
          </div>

          <div className="space-y-1">
            <PasswordField
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              error={!!confirmError}
              autoComplete="new-password"
            />
            {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
