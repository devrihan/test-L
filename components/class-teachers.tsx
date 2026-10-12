'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { useMaySeeClassTeachers } from '@/app/lib/caller-role'
import {
  fetchTeacherAllocations,
  shortTeacherName,
  type ClassTeacher,
  type TeacherAllocation,
  type TeacherAllocations,
} from '@/app/lib/teachers'

// Who takes the class currently in view (beaver#806). Read-only text: it
// filters nothing and changes nothing on the page. Each name opens a card
// giving that teacher's full name and classes — on hover for a mouse, on tap
// for a finger, and on Enter or Space for a keyboard.
//
// A class the roster affirmatively lists nobody for says so out loud —
// "Teacher assignment unknown" — so a data gap reads as a gap, not as the
// feature being absent. A roster that never arrived (`teachers` null: an older
// backend, a fetch still in flight or failed) renders nothing at all, because
// the absence of data is not a claim about the class. Callers whose role does
// not see staff names get nothing either way, and neither does a class the
// caller does not lead.

export function ClassTeachers({
  teachers,
  leads,
  leadingSeparator = false,
  className,
}: {
  /** null = no roster known for this class; [] = known to have nobody. */
  teachers: ClassTeacher[] | null
  /** Whether the viewer LEADS this class (head of department or above by the
   *  grant covering it). A class the viewer merely teaches shows no names and
   *  no "unknown" line, exactly as it reads for any teacher. */
  leads: boolean
  /** Puts a separator before the first name, for a line that already has text
   *  on it (the exam header's grade/section subtext). */
  leadingSeparator?: boolean
  className?: string
}) {
  const maySee = useMaySeeClassTeachers()
  if (!maySee || !leads || teachers === null) return null

  if (teachers.length === 0) {
    return (
      <span className={className}>
        {leadingSeparator && ' · '}
        <span className="text-muted-foreground">Teacher assignment unknown</span>
      </span>
    )
  }

  // The subject only earns its place once a class has more than one teacher —
  // with a single name there is nothing to tell apart.
  const withSubject = teachers.length > 1

  return (
    <span className={className}>
      {leadingSeparator && ' · '}
      {teachers.map((t, i) => (
        <span key={t.id}>
          {i > 0 && ' · '}
          <TeacherName teacher={t} />
          {withSubject && t.teaches.abbrev ? ` (${t.teaches.abbrev})` : ''}
        </span>
      ))}
    </span>
  )
}

// Pointer delays, carried over from the hover card this began as: long enough
// that sweeping across a line of names doesn't flash cards open, and a close
// delay so the card survives the pointer crossing the gap into it.
const OPEN_DELAY_MS = 200
const CLOSE_DELAY_MS = 300

/**
 * A name, and the card saying who it is.
 *
 * Built on Popover, not on the HoverCard this started as. HoverCard cannot
 * serve this content to everyone: its trigger renders an anchor with no href,
 * so it never takes focus, and it calls preventDefault on touchstart, so a tap
 * opens nothing — the card ends up mouse-only. That is not survivable here,
 * because the card is the ONLY thing telling two teachers apart when their
 * short names collide (both rendering as "Swapna A." is accepted, on the
 * grounds that the full name is one interaction away).
 *
 * A Popover trigger is a real button: click, tap, Enter and Space all open it,
 * Escape closes it, focus lands in the card and returns to the name afterwards,
 * and the primitive carries aria-haspopup="dialog" and aria-expanded for a
 * screen reader. Hovering is then added back on top of it, for pointers that
 * can hover, so nothing about the mouse behaviour changes.
 */
function TeacherName({ teacher }: { teacher: ClassTeacher }) {
  // Fetched on first open rather than with the row: only some names are ever
  // opened, and this is one request per teacher.
  const [detail, setDetail] = useState<TeacherAllocations | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  // Set while the card is open on hover ALONE. Focus follows a deliberate
  // action, never a pointer passing over: a card that opened under the pointer
  // must not pull focus out of whatever the user was doing, nor throw it back
  // at this name when it closes. Any explicit activation clears it.
  const pointerOnly = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => clearTimer(), [])

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  function load() {
    if (detail || failed) return
    fetchTeacherAllocations(teacher.id)
      .then(setDetail)
      .catch((err) => {
        console.error(`[class-teachers] allocations for teacher ${teacher.id} failed to load`, err)
        setFailed(true)
      })
  }

  function change(next: boolean) {
    if (next) load()
    setOpen(next)
  }

  /** Hover, for the pointers that have one — a touch is a tap, handled as a
   *  click by the trigger itself. */
  function hover(e: PointerEvent<HTMLElement>, next: boolean) {
    if (e.pointerType === 'touch') return
    clearTimer()
    timer.current = setTimeout(
      () => {
        // Only ever raised here, and cleared by an explicit activation — a
        // hover-driven CLOSE has to stay flagged until the card has gone, or
        // closing it would hand focus to a name nobody asked about.
        if (next) pointerOnly.current = true
        change(next)
      },
      next ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
    )
  }

  const short = shortTeacherName(teacher.name)

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger
        // The cursor stays the text default: with a mouse the card is already
        // there on hover, so nothing on this line is asking to be clicked. The
        // focus ring is the one components/ui/button.tsx uses.
        className="inline cursor-default rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onPointerEnter={(e) => hover(e, true)}
        onPointerLeave={(e) => hover(e, false)}
        onClick={() => {
          clearTimer()
          pointerOnly.current = false
        }}
      >
        {short}
        {/* A screen reader gets the visible short form first and then the full
            name. The short form alone is ambiguous by design, and dropping it
            would take the words on screen out of the accessible name, which is
            what someone driving the page by voice has to say. */}
        {teacher.name !== short && <span className="sr-only">, {teacher.name}</span>}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[380px] text-sm"
        aria-labelledby={titleId}
        onOpenAutoFocus={(e) => {
          if (pointerOnly.current) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          if (pointerOnly.current) e.preventDefault()
        }}
        onPointerEnter={(e) => {
          // Reading the card is not leaving the name.
          if (e.pointerType !== 'touch') clearTimer()
        }}
        onPointerLeave={(e) => hover(e, false)}
      >
        {/* The card's own copy of the name, once it arrives — the row above
            shows the short form, and the full name is what this is for. It
            names the dialog too, so opening it announces whose card it is. */}
        <PopoverTitle id={titleId} className="text-foreground">
          {detail?.name ?? teacher.name}
        </PopoverTitle>
        {/* The classes land after the card is open and, for a keyboard user,
            already focused — announced on arrival rather than quietly replacing
            "Loading…" under a reader that has moved on. */}
        <div aria-live="polite">
          {failed ? (
            // Said out loud: an empty card would read as "takes nothing".
            <p className="mt-1 text-muted-foreground">Could not load this teacher’s classes.</p>
          ) : detail ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {detail.allocations.map((a) => (
                <li key={`${a.teaches.name}|${a.subject}`}>{allocationLine(a)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">Loading…</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * One line of the card: what the teacher takes · the subject the paper is sat
 * under · their classes. The paper's subject is dropped when it is the same
 * word as what they take, which is every class outside the combined-paper
 * grades; a segment the data cannot fill is dropped rather than left empty.
 */
function allocationLine(a: TeacherAllocation): string {
  const classes = a.classes.map((c) => `${c.grade} ${c.section}`).join(', ')
  return [a.teaches.name, a.subject === a.teaches.name ? null : a.subject, classes]
    .filter((segment): segment is string => !!segment)
    .join(' · ')
}
