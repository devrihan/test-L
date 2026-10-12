'use client'

import { useEffect } from 'react'

// Last-resort boundary. Catches errors thrown by the ROOT layout itself, which
// a route-level error.tsx cannot — and the root layout is where config is
// resolved, so a config fault lands here.
//
// It must render its own <html>/<body>: when the root layout is the thing that
// threw, Next has no layout left to render this inside.
//
// The user is shown a plain message and a reference id, nothing more. What
// actually failed (a missing config key, an unresolvable school) is an
// operator's problem, not something to put in front of a teacher or a student.
// The detail is reported to the server instead — see the useEffect below.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server-thrown errors are already in the container log, with this digest
    // to correlate against. Client-thrown ones — which includes every config
    // throw from useFeatureFlag — are not, so send them.
    // Path only, never the full URL: loam's routes carry student identity in
    // the query string.
    void fetch('/api/internal/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
      }),
      keepalive: true, // survive the navigation if the user leaves immediately
    }).catch(() => {
      /* reporting must never make a broken page worse */
    })
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafaf9' }}>
        <div style={{ maxWidth: 560, margin: '15vh auto', padding: '0 24px', color: '#1c1917' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Server error</h1>
          <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6, color: '#57534e' }}>
            Something went wrong and this page couldn’t load. The problem has been reported.
          </p>

          {/* The one piece of detail worth showing: it is what lets support
              find this exact failure in the logs. Present only for
              server-thrown errors. */}
          {error.digest && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#78716c' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button onClick={reset} style={BTN}>Try again</button>
            {/* Clears the session here rather than calling the logout route,
                which is POST-only. Signing out has to work from this page above
                all others: an account whose token can't resolve a school is
                otherwise stuck, because middleware redirects a valid token away
                from /login. */}
            <button onClick={signOut} style={BTN}>Sign out</button>
          </div>
        </div>
      </body>
    </html>
  )
}

function signOut() {
  document.cookie = 'token=; path=/; max-age=0; SameSite=Strict'
  try {
    sessionStorage.clear()
    localStorage.clear()
  } catch {
    /* storage unavailable — the cookie is what the middleware gates on */
  }
  window.location.assign('/login')
}

const BTN: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  color: '#1c1917',
  background: '#fff',
  border: '1px solid #d6d3d1',
  borderRadius: 8,
  cursor: 'pointer',
}
