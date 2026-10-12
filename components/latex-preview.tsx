'use client'

import type { ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import katex from 'katex'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Markdown tables (GFM pipe syntax) render as a plain <table> with no width
// cap — wide ones (e.g. OCR'd ledgers) then bleed past the card instead of
// scrolling, unlike the OCR-HTML-table branch below which already wraps in
// overflow-x-auto. Same fix here, via a table renderer override.
const MARKDOWN_COMPONENTS: Components = {
  p: ({ node, ...props }) => <span {...props} />,
  table: ({ node, ...props }) => (
    <span className="block w-full max-w-full overflow-x-auto my-2">
      <table {...props} />
    </span>
  ),
}

function renderKatex(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math.trim(), {
      throwOnError: false,
      displayMode,
      trust: true,
      strict: false,
    })
  } catch {
    return `<span>${math}</span>`
  }
}

// Detects bare LaTeX commands (no delimiters)
const LATEX_CMD = /\\(frac|sqrt|begin|end|left|right|quad|text|mathbf|boxed|implies|times|cdot|Rightarrow|aligned|array|textcircled|phantom|mathrm|pi|infty)/

// Detects a leading marker that should "hang-indent" the rest of the line —
// i.e. if it wraps, the wrapped part aligns under the text rather than back
// at the margin. Two shapes, checked in order:
//   1. A "Label: " prefix (Assertion/Reason/Note/Directions/...), either
//      already bold-marked ("**Assertion (A):**") or, just as often, plain
//      text straight from OCR/manual typing ("Assertion (A): ..."). Users
//      shouldn't need to know Markdown syntax for this to work, so plain
//      text is detected directly.
//   2. A lettered/numbered option or question marker ("(a) ...", "(A) ...",
//      "1. ...", "a) ..."), which gets the same hanging-indent treatment but
//      isn't bolded (matching how these normally print).
// Returns null if the line doesn't start with either shape.
function matchLeadingMarker(line: string): { label: string; rest: string; bold: boolean } | null {
  let m = line.match(/^\*\*([^*]+?)\*\*:?\s*([\s\S]*)$/)
  if (m) return { label: `${m[1].replace(/:$/, '')}:`, rest: m[2], bold: true }

  m = line.match(/^([A-Za-z][A-Za-z()\s]{0,40}?):\s+([\s\S]*)$/)
  if (m) return { label: `${m[1]}:`, rest: m[2], bold: true }

  m = line.match(/^(\([A-Za-z0-9]{1,3}\)|[A-Za-z0-9]{1,3}[.)])\s+([\s\S]*)$/)
  if (m) return { label: m[1], rest: m[2], bold: false }

  return null
}

export default function LatexPreview({ text, tex }: { text?: string; tex?: string }) {
  const content = text || tex || ''
  if (!content) return null

  // Split on all known delimiters + HTML tables
  const regex = /(\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|\$[^$]+?\$|<table[\s\S]*?<\/table>)/gi
  const parts = content.split(regex).filter(Boolean)

  // If no delimiters matched but text has LaTeX commands → render each line as its own math block
  if (parts.length === 1 && LATEX_CMD.test(content)) {
    // A \begin{...}...\end{...} environment (array/aligned/matrix/...) is one
    // LaTeX construct spanning multiple lines — \hline or a lone row only
    // parses inside its surrounding \begin/\end. Splitting it by line first
    // (like the per-line loop below does for standalone command lines) feeds
    // KaTeX invalid fragments that silently fail and fall back to raw text.
    // Render the whole environment as a single block instead.
    if (/^\\begin\{/.test(content.trim())) {
      return (
        <div className="max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderKatex(content, true) }} />
      )
    }
    const lines = content.split('\n')
    return (
      <div className="break-words overflow-x-auto">
        {lines.map((line, i) => {
          const trimmed = line.trim()
          if (!trimmed) return <div key={i} className="h-2" />
          return <div key={i} className="max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderKatex(trimmed, true) }} />
        })}
      </div>
    )
  }

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        // Block: \[...\] — wide arrays/matrices (KaTeX renders these as
        // absolutely-positioned nested spans, not an HTML <table>, so they
        // need their own overflow-x-auto — the OCR-table/Markdown-table
        // fixes elsewhere don't cover this render path at all.
        if (part.startsWith('\\[') && part.endsWith('\\]')) {
          return <div key={i} className="max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderKatex(part.slice(2, -2), true) }} />
        }
        // Block: $$...$$
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return <div key={i} className="max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderKatex(part.slice(2, -2), true) }} />
        }
        // Inline: \(...\) — same wide-array risk; inline-block so it can
        // still sit mid-line but cap+scroll like the block forms.
        if (part.startsWith('\\(') && part.endsWith('\\)')) {
          return <span key={i} className="inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: renderKatex(part.slice(2, -2), false) }} />
        }
        // Inline: $...$
        if (part.startsWith('$') && part.endsWith('$')) {
          return <span key={i} className="inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: renderKatex(part.slice(1, -1), false) }} />
        }
        // HTML table from OCR — capped to the container's own width (not just
        // shrink-to-fit) so a table wider than its card scrolls internally
        // instead of bleeding into whatever sits beside the card.
        if (/^<table/i.test(part) && /<\/table>/i.test(part)) {
          return (
            <div key={i} className="w-full max-w-full overflow-x-auto my-2">
              <div className="ocr-table" dangerouslySetInnerHTML={{ __html: part }} />
            </div>
          )
        }
        // Bare LaTeX (no delimiters but has commands) → render as math
        if (LATEX_CMD.test(part)) {
          return <div key={i} className="max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderKatex(part, true) }} />
        }
        // Plain text with basic Markdown (bold, lists, etc) inline.
        //
        // Text gets split around every LaTeX span above, so a fragment like
        // "If" (right before an inline \(x=...\)) or "(c) " (right before an
        // inline \(km/s^2\)) can end up as its own tiny chunk here — one that
        // MUST keep flowing on the same line as the math next to it. Markdown's
        // paragraph parser can't be used for line/paragraph spacing in that
        // situation (a block-level paragraph forces a line break around itself,
        // breaking the inline flow with the adjacent math), and single soft
        // breaks are collapsed to a space by default anyway. So: split this
        // chunk into lines ourselves and rejoin with literal "\n" characters,
        // which the container's `whitespace-pre-wrap` already renders correctly
        // (single \n → line break, \n\n → a blank-line gap) — Markdown is only
        // ever asked to format the inline content *within* one line.
        const lines = part.split('\n')
        const rendered: ReactNode[] = []
        lines.forEach((line, li) => {
          const trimmed = line.trim()
          if (!trimmed) {
            rendered.push(line)
            if (li < lines.length - 1) rendered.push('\n')
            return
          }

          // Leading marker ("Assertion (A): ..." or "(a) ...") — hanging
          // indent: render the marker as a fixed-width flex item and the
          // rest as a wrapping one, so a wrapped second line aligns under
          // the text (right after the marker) instead of back at the margin.
          const marker = matchLeadingMarker(trimmed)
          if (marker) {
            rendered.push(
              <span key={`${i}-${li}`} className="flex gap-1">
                <span className={`shrink-0 ${marker.bold ? 'font-bold' : ''}`}>{marker.label}</span>
                <span className="min-w-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {marker.rest}
                  </ReactMarkdown>
                </span>
              </span>
            )
            if (li < lines.length - 1) rendered.push('\n')
            return
          }

          const leadingWs = line.slice(0, line.length - line.trimStart().length)
          const trailingWs = line.slice(line.trimEnd().length)
          rendered.push(leadingWs)
          rendered.push(
            <ReactMarkdown
              key={`${i}-${li}`}
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {trimmed}
            </ReactMarkdown>
          )
          rendered.push(trailingWs)
          if (li < lines.length - 1) rendered.push('\n')
        })
        return <span key={i}>{rendered}</span>
      })}
    </div>
  )
}
