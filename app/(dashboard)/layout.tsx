'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Monitor } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { getUser, logout } from '@/app/lib/auth'
import type { User } from '@/app/lib/auth'
import { useViewer, ViewerProvider, viewerRoleLabel } from '@/app/lib/viewer'
import { subjectsInScope, combosForSitting } from '@/app/lib/subject-directory'
import { seniorCombos, seniorGrades } from '@/app/lib/senior-scope'
import { useLoggedInStudent } from '@/app/lib/student-identity'
import { BreadcrumbProvider, useBreadcrumb } from '@/app/lib/breadcrumb'
import { AnalyticsFiltersProvider, useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { formatExamName, matchesAcademicYear } from '@/app/lib/filters'
import {
  SquareTerminal,
  BookOpen,
  FileSpreadsheet,
  Users,
  CircleHelp,
  Book,
  ChevronsUpDown,
  ChevronRight,
  PanelLeft,
  KeyRound,
  LogOut,
  Check,
  Compass,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFeatureFlag } from '@/components/config-provider'
import { AnalyticsTag } from '@/components/analytics-tag'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Figma's "Exams" nav icon — layer is named "Icons 24x24 / bot" but the
// actual path is a simplified custom glyph, not lucide's Bot icon (which
// has separate eyes/antenna). Inlined from the exact Figma path.
function ExamsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 3.33333C9.53976 3.33333 9.16667 3.70643 9.16667 4.16667C9.16667 4.6269 9.53976 5 10 5C10.4602 5 10.8333 4.6269 10.8333 4.16667C10.8333 3.70643 10.4602 3.33333 10 3.33333ZM7.5 4.16667C7.5 2.78595 8.61929 1.66667 10 1.66667C11.3807 1.66667 12.5 2.78595 12.5 4.16667C12.5 5.25518 11.8043 6.18121 10.8333 6.52441V8.33333H15.8333C17.214 8.33333 18.3333 9.45262 18.3333 10.8333V15.8333C18.3333 17.214 17.214 18.3333 15.8333 18.3333H4.16667C2.78595 18.3333 1.66667 17.214 1.66667 15.8333V10.8333C1.66667 9.45262 2.78595 8.33333 4.16667 8.33333H9.16667V6.52441C8.19567 6.18121 7.5 5.25518 7.5 4.16667ZM10 10H4.16667C3.70643 10 3.33333 10.3731 3.33333 10.8333V15.8333C3.33333 16.2936 3.70643 16.6667 4.16667 16.6667H15.8333C16.2936 16.6667 16.6667 16.2936 16.6667 15.8333V10.8333C16.6667 10.3731 16.2936 10 15.8333 10H10Z"
        fill="currentColor"
      />
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const teacherNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Exams', icon: SquareTerminal },
  { href: '/chapter', label: 'Chapter', icon: BookOpen },
  { href: '/student', label: 'Students', icon: Users },
  { href: '/question', label: 'Questions', icon: CircleHelp },
  { href: '/answer-scripts', label: 'Answer scripts', icon: FileSpreadsheet },
  { href: '/plans', label: 'Plans', icon: Book },
  // Leadership sees this list too, so one item covers both views.
  { href: '/tutorial', label: 'Tutorial', icon: Compass },
]

// Per Figma (node 884-39182): no "Students" roster item, "Exams" promoted to
// its own top-level item — a separate list rather than a filtered version of
// the one above.
const studentNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: SquareTerminal },
  { href: '/exams', label: 'Exams', icon: ExamsIcon },
  { href: '/chapter', label: 'Chapters', icon: BookOpen },
  { href: '/question', label: 'Questions', icon: CircleHelp },
  { href: '/plans', label: 'Plans', icon: Book },
  // In-app route that frames public/tutorial.html, so the sidebar stays
  // available while the student reads.
  { href: '/tutorial', label: 'Tutorial', icon: Compass },
]

// Leadership roles. "Grade book" waits until that page exists — /gradebook
// calls notFound() on purpose, so linking it 404s.
const leadershipNavItems: NavItem[] = [
  // Book, not BookOpen: the teacher group's "Chapter" already uses BookOpen.
  { href: '/subject', label: 'Subjects', icon: Book },
  // { href: '/answer-scripts', label: 'Answer scripts', icon: FileSpreadsheet },
]

// Dark logomark matching Figma — shared between the static and switcher variants below.
function SchoolLogomark() {
  return (
    <div className="size-8 rounded-[12px] bg-[#0c111d] shrink-0 relative overflow-hidden flex items-center justify-center"
      style={{ border: '1.333px solid rgba(255,255,255,0.12)', boxShadow: '0px 2px 2.667px -1px rgba(42,42,42,0.14), 0px 0.667px 0.667px 0px rgba(42,42,42,0.08)' }}>
      <div
        className="absolute inset-[-1.33px]"
        style={{ backgroundImage: 'linear-gradient(177.6deg, rgba(255,255,255,0) 2%, rgba(255,255,255,0.12) 98.167%)' }}
      />
      <div className="absolute inset-0 rounded-[12px] pointer-events-none"
        style={{ boxShadow: 'inset 0px 0px 0px 1px rgba(16,24,40,0.24), inset 0px 2px 2px 0px rgba(255,255,255,0.1), inset 0px -2px 2px 0px rgba(0,0,0,0.1)' }} />
      <span suppressHydrationWarning className="relative text-white text-[13px] font-bold leading-none">
        D
      </span>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewerProvider>
      <AnalyticsTag />
      <AnalyticsFiltersProvider>
        <BreadcrumbProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </BreadcrumbProvider>
      </AnalyticsFiltersProvider>
    </ViewerProvider>
  )
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const pathname = usePathname()
  const { viewer, availableRoles, activeRole, roleResolved, canSwitchRoles, setActiveRole } = useViewer()
  const breadcrumb = useBreadcrumb()
  // Student-role sidebar; the Questions item is hidden by default.
  const showQuestionsNavStudent = useFeatureFlag('show_questions_nav_student')
  // Tutorial item, every role — off where the only recording is another
  // school's (beaver#906). The /tutorial route reads the same flag.
  const showTutorial = useFeatureFlag('show_tutorial')
  const withoutTutorial = (items: NavItem[]) =>
    showTutorial ? items : items.filter((item) => item.href !== '/tutorial')
  // Driven by `navView`, not the role name, so a new role later is just a new
  // navView value.
  const navView = viewer?.navView ?? (activeRole === 'STUDENT' ? 'student' : 'teacher')
  const studentItems = withoutTutorial(
    showQuestionsNavStudent
      ? studentNavItems
      : studentNavItems.filter((item) => item.href !== '/question'),
  )
  const teacherItems = withoutTutorial(teacherNavItems)

  // Leadership sees both lists at once under headings, instead of switching —
  // hence no "Switch to teacher view" card. `label: undefined` keeps the
  // inferred shape uniform so the render can read it unannotated.
  const navGroups =
    navView === 'leadership'
      ? [
          
          { label: `${viewerRoleLabel(activeRole)} view`, items: leadershipNavItems },
          { label: 'Teachers view', items: teacherItems },
        ]
      : navView === 'student'
        ? [{ label: undefined, items: studentItems }]
        : [{ label: undefined, items: teacherItems }]

  // Flat list for the breadcrumb fallback and the count badges.
  const navItems = navGroups.flatMap((group) => group.items)
  // Where a role switch lands: leadership starts in its own group, not at the
  // teacher group's Home.
  const landingHref =
    navView === 'leadership' ? leadershipNavItems[0]?.href : navItems[0]?.href

  // Exams nested under Home (teacher role). Derived from the SAME combos and in
  // the SAME order as the dashboard's exam table (app/lib/dashboard.ts), because
  // the /exam/<n> route id is positional — a different ordering here would link
  // "Unit Test 1" to whatever exam happens to sit at that index instead.
  const { combos, filters } = useAnalyticsFilters()
  const [examsOpen, setExamsOpen] = useState(true)
  const homeExams =
    navView === 'student' || !combos || !filters
      ? []
      : Array.from(
          new Set(
            combos
              .filter(
                (c) =>
                  c.grade === filters.grade &&
                  c.subject === filters.subject &&
                  c.section === filters.section &&
                  matchesAcademicYear(c.exam, filters.year),
              )
              .map((c) => c.exam),
          ),
        ).map((exam, i) => ({
          exam,
          label: formatExamName(exam),
          href: `/exam/${i + 1}?${new URLSearchParams({
            grade: filters.grade,
            section: filters.section,
            subject: filters.subject,
            exam,
          }).toString()}`,
          path: `/exam/${i + 1}`,
        }))

  // Real count (Figma's "356" is placeholder): the number of cards /subject
  // will render, from combos already in memory. Null until known.
  const subjectCount = (() => {
    if (navView !== 'leadership' || !combos || !filters) return null
    // The grade and exam the directory will show: the selection when it sits
    // on a led grade, else the first led combo (the directory moves there).
    const led = seniorCombos(combos)
    const grades = seniorGrades(led)
    if (grades.length === 0) return 0
    const onLed = grades.includes(filters.grade)
    const grade = onLed ? filters.grade : grades[0]
    const exam = onLed ? filters.exam : led.find((c) => c.grade === grade)?.exam ?? filters.exam
    return subjectsInScope(combosForSitting(led, grade, exam)).length
  })()
  const navCounts: Record<string, number | null> = { '/subject': subjectCount }

  // A role switch changes no URL by itself, so move to the new view's landing
  // route. Guarded on a CHANGE so deep links still work on first load.
  const router = useRouter()
  const previousRole = useRef<typeof activeRole | null>(null)
  useEffect(() => {
    if (!roleResolved) return
    if (previousRole.current && previousRole.current !== activeRole && landingHref) {
      router.replace(landingHref)
    }
    previousRole.current = activeRole
  }, [activeRole, roleResolved, landingHref, router])

  // Student role: the sidebar header shows the student's own name + grade
  // instead of the school name (Teacher role keeps the school name).
  const loggedInStudent = useLoggedInStudent()
  const sidebarTitle =
    activeRole === 'STUDENT' && loggedInStudent
      ? loggedInStudent.name
      : user?.username === 'test.principal.4'
        ? 'Jai Hind International'
        : 'Delhi Public School'
  // Until the stored user is read, activeRole is only a TEACHER fallback — so
  // printing the label here would tell a student they have "Teacher Access"
  // for the whole of first paint and hydration (beaver#786).
  const sidebarSubtitle = !roleResolved
    ? 'Loading…'
    : activeRole === 'STUDENT'
      ? (loggedInStudent?.grade ? `Current Year: ${loggedInStudent.grade} ${loggedInStudent.section ?? ''}` : '')
      : viewerRoleLabel(activeRole)
  // Same student-name swap for the account footer at the bottom of the sidebar.
  const accountDisplayName = activeRole === 'STUDENT' && loggedInStudent
    ? loggedInStudent.name
    : user?.name || user?.username || ''

  useEffect(() => {
    setUser(getUser())
  }, [])

  return (
    <>
    <div className="flex min-h-screen items-center justify-center bg-background p-6 md:hidden">
  <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
      <Monitor className="h-7 w-7 text-muted-foreground" />
    </div>

    <h1 className="text-xl font-semibold text-foreground">
      Better viewed on desktop
    </h1>

    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Mobile view coming soon!
    </p>

    <p className="mt-4 text-sm leading-6 text-muted-foreground">
      We&apos;re working on a better experience for smaller screens.
    </p>
  </div>
</div>
    <div className="hidden md:flex h-screen overflow-hidden bg-background">
      {/* Sidebar — stays mounted, just narrows to icon-only when collapsed */}
      <aside className={cn(
        'shrink-0 flex flex-col border-r border-border bg-background shadow-sm transition-[width]',
        collapsed ? 'w-[48px]' : 'w-[244px]'
      )}>

        {/* School selector — becomes a role switcher only for an account
            holding every role (a test login). Collapsed: logomark only. */}
        <div className="p-2 shrink-0">
          {collapsed ? (
            <div className="flex items-center justify-center h-8">
              <SchoolLogomark />
            </div>
          ) : canSwitchRoles ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 h-12 px-2 rounded-md w-full hover:bg-sidebar-accent transition-colors">
                  <SchoolLogomark />
                  <div className="flex-1 min-w-0 flex flex-col gap-[2px] text-left">
                    <p className="text-[14px] font-medium tracking-[-0.084px] text-sidebar-foreground truncate leading-none">
                      {sidebarTitle}
                    </p>
                    <p className="text-[12px] font-normal tracking-[-0.072px] text-sidebar-foreground leading-none truncate">
                      {sidebarSubtitle}
                    </p>
                  </div>
                  <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[228px]">
                {availableRoles.map((role) => (
                  <DropdownMenuItem key={role} onClick={() => setActiveRole(role)}>
                    {viewerRoleLabel(role)}
                    {role === activeRole && <Check className="size-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2 h-12 px-2 rounded-md">
              <SchoolLogomark />
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <p className="text-[14px] font-medium tracking-[-0.084px] text-sidebar-foreground truncate leading-none">
                  {sidebarTitle}
                </p>
                <p suppressHydrationWarning className="text-[12px] font-normal tracking-[-0.072px] text-sidebar-foreground leading-none truncate">
                  {sidebarSubtitle}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-y-auto">
          {navGroups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className={cn('flex flex-col gap-1', groupIndex > 0 && 'mt-4')}>
            {/* Heading — hidden while collapsed, where there's no room for it */}
            {group.label && !collapsed && (
              <p className="px-2 pt-1 pb-0.5 text-[12px] font-normal leading-4 tracking-[-0.072px] text-muted-foreground">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href
              // Home carries the exam list; every other item is a plain link.
              // Row layout: the link and the chevron are siblings in one flex
              // row, so the chevron only ever expands/collapses and the label +
              // icon only ever navigate. The chevron is laid out in the row
              // rather than absolutely positioned — anchoring it to the wrapper
              // (which also holds the exam list) centred it across both and
              // dropped it below the row whenever the list was open.
              const collapsible = item.href === '/dashboard' && !collapsed && homeExams.length > 0
              return (
                <div key={item.href}>
                  <div
                    className={cn(
                      'flex items-center rounded-md text-[14px] leading-5 transition-colors',
                      active
                        ? collapsed
                          ? 'bg-sidebar-accent'
                          : 'bg-[#e0e7ff] text-[#312e81] font-medium tracking-[-0.084px]'
                        : 'text-sidebar-foreground font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center min-w-0 flex-1 rounded-md',
                        collapsed ? 'justify-center h-8' : 'gap-2 px-2 py-1.5'
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && navCounts[item.href] != null && (
                        <span className="shrink-0 text-[14px] font-medium leading-5 tracking-[-0.084px] text-right opacity-70">
                          {navCounts[item.href]}
                        </span>
                      )}
                    </Link>

                    {collapsible && (
                      <button
                        type="button"
                        onClick={() => setExamsOpen((v) => !v)}
                        aria-expanded={examsOpen}
                        aria-label={examsOpen ? 'Hide exams' : 'Show exams'}
                        className="shrink-0 self-stretch flex items-center pl-1 pr-2 rounded-md"
                      >
                        <ChevronRight
                          className={cn('size-4 transition-transform', examsOpen && 'rotate-90')}
                        />
                      </button>
                    )}
                  </div>

                  {collapsible && examsOpen && (
                    <ul className="mx-3.5 mt-1 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5">
                      {homeExams.map((exam) => (
                        <li key={exam.exam}>
                          <Link
                            href={exam.href}
                            title={exam.label}
                            className={cn(
                              'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-[14px] leading-5 transition-colors',
                              pathname === exam.path
                                ? 'bg-[#e0e7ff] text-[#312e81] font-medium tracking-[-0.084px]'
                                : 'text-sidebar-foreground font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                            )}
                          >
                            <span className="truncate">{exam.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
          ))}
        </nav>

        {/* The "Switch to teacher view" card lived here. It's gone: leadership
            now sees the teacher group and its own group in the same sidebar,
            so there is nothing to switch to. `alternateViewRole` on the viewer
            context is unused as a result. */}

        {/* User profile footer — collapsed: avatar only, dropdown still opens on click */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-2 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center h-12 rounded-md hover:bg-sidebar-accent transition-colors',
                        collapsed ? 'justify-center w-full' : 'gap-2 px-2 w-full'
                      )}
                    >
                      <Avatar className="size-8 rounded-lg shrink-0">
                        <AvatarFallback className="rounded-lg bg-amber-500 text-white text-[13px] font-semibold">
                          <span suppressHydrationWarning>
                            {accountDisplayName ? accountDisplayName.charAt(0).toUpperCase() : ''}
                          </span>
                        </AvatarFallback>
                      </Avatar>
                      {!collapsed && (
                        <>
                          <div className="flex-1 min-w-0 flex flex-col gap-[2px] text-left">
                            <p suppressHydrationWarning className="text-[14px] font-semibold tracking-[-0.084px] text-sidebar-foreground leading-none truncate">
                              {accountDisplayName}
                            </p>
                            <p suppressHydrationWarning className="text-[12px] font-normal tracking-[-0.072px] text-sidebar-foreground leading-none truncate">
                              {user?.email || ''}
                            </p>
                          </div>
                          <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
                        </>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-[228px]">
                    <DropdownMenuItem asChild>
                      <Link href="/account/password">
                        <KeyRound className="size-4" />
                        Change password
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => logout()}>
                      <LogOut className="size-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent side="right" sideOffset={8}>
                  {accountDisplayName}
                </TooltipContent>
              </div>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center h-16 px-4 border-b border-border bg-background shrink-0 gap-3">
          {/* Left group: sidebar toggle + divider */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="size-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="size-5 text-foreground" />
            </button>
            <div className="h-4 w-px bg-border" />
          </div>

          {/* Breadcrumb — detail pages register their own crumb via usePageBreadcrumb() */}
          <div className="flex-1 min-w-0 text-[18px] font-normal leading-7 tracking-[-0.108px] text-foreground">
            {/* Falls back to the view's own first nav item, not a hardcoded
                "Home" — leadership has no Home, so an unmatched path used to
                label the principal's screen "Home". */}
            {breadcrumb ?? (navItems.find((item) => pathname.startsWith(item.href))?.label ?? navItems[0]?.label ?? '')}
          </div>

          
        </header>

        {/* Keyed on the active role so switching views REMOUNTS the page rather
            than re-rendering it. A role switch changes no URL, so without this
            the page keeps its component instance — and therefore the previous
            role's fetched data — on screen until a new response lands, which on
            a slow page reads as "the switch didn't work". Remounting drops that
            state immediately, so every page falls back to its own loading
            skeleton. Cheap: <main> holds no state of its own. */}
        {/* scrollbar-gutter: content that shrinks past the viewport would drop
            the scrollbar and shift the whole page sideways (question page#collapse). */}
        <main key={activeRole} className="flex-1 overflow-auto [scrollbar-gutter:stable]">
          {children}
        </main>
      </div>
    </div>
    </>
  )
}
