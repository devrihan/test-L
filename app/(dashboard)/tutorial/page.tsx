'use client'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  SquareTerminal,
  BookOpen,
  Users,
  CircleHelp,
  FileSpreadsheet,
  Book,
  ArrowRight,
} from 'lucide-react'
import { useViewer } from '@/app/lib/viewer'
import { useFeatureFlag } from '@/components/config-provider'

// One route, two audiences. Students get the self-contained guide in
// public/tutorial.html (framed, so the sidebar stays put); teachers and
// leadership get the staff walkthrough recorded on Loom. Both start playing
// as soon as the page opens.

const STAFF_VIDEO_ID = '99a4aa6ae20a4919b89f306de1e1758d'
// Loom's documented embed flags: autoplay, and drop the owner/share/title
// chrome so the frame reads as part of the page rather than a Loom widget.
const STAFF_VIDEO_SRC =
  `https://www.loom.com/embed/${STAFF_VIDEO_ID}` +
  '?autoplay=1&hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true'
const STAFF_VIDEO_SHARE = `https://www.loom.com/share/${STAFF_VIDEO_ID}`

export default function TutorialPage() {
  const { viewer, activeRole, roleResolved } = useViewer()
  // The same flag that hides the sidebar item also gates the route, so the
  // page is not reachable by typed URL or history once a school turns it off
  // (beaver#906 — the recording is DPS-specific).
  const showTutorial = useFeatureFlag('show_tutorial')
  if (!showTutorial) notFound()
  // Same derivation as the sidebar, so the page and the nav never disagree
  // about which audience this is. Held until the role is read: activeRole
  // reports TEACHER before that, which would flash the staff video at a student.
  if (!roleResolved) return <div className="min-h-full bg-stone-50" />
  const navView = viewer?.navView ?? (activeRole === 'STUDENT' ? 'student' : 'teacher')
  return navView === 'student' ? <StudentTutorial /> : <StaffTutorial leadership={navView === 'leadership'} />
}

function StudentTutorial() {
  // `allow="autoplay"` delegates the permission on to the Drive player nested
  // inside the static page; without it the walkthrough video would not start.
  return (
    <div className="h-full min-h-full flex flex-col bg-[#FAFBF8]">
      <iframe
        src="/tutorial.html"
        title="Reading your LOAM dashboard"
        allow="autoplay; fullscreen; picture-in-picture"
        className="flex-1 w-full border-0"
      />
    </div>
  )
}

// Where the walkthrough sends people next. Mirrors the sidebar, in the same
// order, with the one-line "why" the video will have just explained.
const STAFF_PAGES = [
  { href: '/dashboard', label: 'Exams', icon: SquareTerminal, blurb: 'Every exam for a class: scores, the spread, and where marks were lost.' },
  { href: '/chapter', label: 'Chapter', icon: BookOpen, blurb: 'Performance chapter by chapter, with the concepts inside each one.' },
  { href: '/student', label: 'Students', icon: Users, blurb: 'One student at a time: their exams, chapters, and recurring mistakes.' },
  { href: '/question', label: 'Questions', icon: CircleHelp, blurb: 'Question-level review with the scanned answers beside each one.' },
  { href: '/answer-scripts', label: 'Answer scripts', icon: FileSpreadsheet, blurb: 'The marked papers themselves, as they were scanned.' },
  { href: '/plans', label: 'Plans', icon: Book, blurb: 'Revision plans built from what the analysis found.' },
]
const LEADERSHIP_PAGES = [
  { href: '/subject', label: 'Subjects', icon: Book, blurb: 'The whole school at a glance, one card per subject.' },
]

function StaffTutorial({ leadership }: { leadership: boolean }) {
  const pages = leadership ? [...LEADERSHIP_PAGES, ...STAFF_PAGES] : STAFF_PAGES
  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      <div className="max-w-[1040px] space-y-sp-4xl">
        <div className="space-y-1">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Getting started with LOAM
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            A short walkthrough of the dashboard, from the exam overview down to a single answer.
          </p>
        </div>

        {/* 16:9 so the frame is sized before Loom's script reports in; black
            behind it so the letterbox matches the player rather than flashing
            white. */}
        <div className="border border-border rounded-lg bg-black overflow-hidden shadow-sm">
          <div className="relative w-full aspect-video">
            <iframe
              src={STAFF_VIDEO_SRC}
              title="LOAM walkthrough for teachers"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        </div>
        <p className="text-[14px] leading-5 text-muted-foreground -mt-4">
          The video starts on its own. If your browser holds it back, press play in the frame, or{' '}
          <a href={STAFF_VIDEO_SHARE} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
            open it on Loom
          </a>{' '}
          to watch full-size.
        </p>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold leading-7 tracking-[-0.108px] text-foreground">
            Where to go next
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pages.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="group border border-border rounded-lg bg-white px-4 py-4 flex flex-col gap-2 hover:border-foreground/30 hover:shadow-sm transition-colors"
              >
                <div className="flex items-center gap-2">
                  <page.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-[16px] font-medium leading-6 text-foreground flex-1">{page.label}</span>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[14px] leading-5 text-muted-foreground">{page.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
