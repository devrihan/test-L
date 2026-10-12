'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getStoredToken, updateStoredUserEmail } from '@/app/lib/auth'

// Post-login email prompt (#773 phase 2). Shown by the login page when the
// account has no email claim. Deliberately OUTSIDE the dashboard shell and
// always skippable: capture is a prompt, never a wall — login never depends
// on having an address.

export default function AddEmailPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [bannerError, setBannerError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFieldError('')
    setBannerError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getStoredToken() ?? ''}`,
        },
        body: JSON.stringify({ email }),
      })
      if (res.status === 204) {
        updateStoredUserEmail(email.trim().toLowerCase())
        router.push('/')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.status === 400 || res.status === 409) {
        setFieldError(data.error || 'That email address can’t be used.')
      } else if (res.status === 401) {
        setBannerError('Your session has expired. Please sign in again.')
      } else {
        setBannerError('We couldn’t save your email right now. You can also add it later.')
      }
    } catch {
      setBannerError('We couldn’t save your email right now. You can also add it later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Add your email</h1>
          <p className="text-sm text-muted-foreground">
            for easier log-in
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {bannerError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <Terminal className="size-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{bannerError}</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldError ? 'border-destructive' : ''}
              autoComplete="email"
              required
            />
            {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Saving…' : 'Save email'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            size="lg"
            onClick={() => router.push('/')}
          >
            Skip for now
          </Button>
        </form>
      </div>
    </div>
  )
}
