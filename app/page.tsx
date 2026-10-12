import { redirect } from 'next/navigation'

// Fallback only. middleware.ts routes "/" by role before this renders; this
// covers the paths that skip it — NEXT_PUBLIC_REQUIRE_AUTH=false in local
// design-preview, chiefly. Server-side, so "/" still costs no JavaScript.
export default function RootPage() {
  redirect('/dashboard')
}
