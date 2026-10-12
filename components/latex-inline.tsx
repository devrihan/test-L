'use client'

import { Fragment } from 'react'
import 'katex/dist/katex.min.css'
import katex from 'katex'

// A compact, SINGLE-LINE LaTeX preview for table cells (the Questions list).
// The detail page uses <LatexPreview>, which renders block-level math, tables
// and multi-line markdown — too tall for a one-line, truncated row. This
// renders just the question stem inline so a cell keeps its single-line height
// (and its `truncate` ellipsis) while `$…$` / `\(…\)` / `\frac…` still show as
// real math instead of raw source. The full text stays available in the row's
// hover tooltip via <LatexPreview>.

function renderKatex(math: string): string | null {
  try {
    return katex.renderToString(math.trim(), {
      throwOnError: false,
      displayMode: false,
      trust: true,
      strict: false,
    })
  } catch {
    return null
  }
}

// Same inline/block math delimiters LatexPreview splits on. Kept as its own
// pattern (not a shared export) so this compact path can't be perturbed by
// changes to the detail renderer.
const DELIM = /(\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|\$[^$]+?\$)/g

function stripToMath(part: string): string | null {
  if (part.startsWith('\\[') && part.endsWith('\\]')) return part.slice(2, -2)
  if (part.startsWith('$$') && part.endsWith('$$')) return part.slice(2, -2)
  if (part.startsWith('\\(') && part.endsWith('\\)')) return part.slice(2, -2)
  if (part.startsWith('$') && part.endsWith('$')) return part.slice(1, -1)
  return null
}

export default function LatexInline({ text }: { text: string }) {
  // Collapse a multi-line question (stem + options, and sometimes an OCR'd
  // HTML <table>) down to a single-line preview: drop table blocks and any
  // stray HTML tags, then take the first non-empty line — the stem. Options
  // and tables would only clutter a one-line cell; the tooltip shows it all.
  const cleaned = text
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<[^>]+>/g, '')
  const stem = cleaned.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  // A question that is ONLY a table (no stem) still needs a readable cell —
  // fall back to the table's text with tags stripped and whitespace collapsed,
  // rather than a blank cell.
  const preview =
    stem ?? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!preview) return null

  const parts = preview.split(DELIM).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        const math = stripToMath(part)
        if (math !== null) {
          const html = renderKatex(math)
          // KaTeX couldn't parse this span → show its raw source rather than
          // dropping it (graceful fallback; never crashes the row).
          if (html === null) return <Fragment key={i}>{part}</Fragment>
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
