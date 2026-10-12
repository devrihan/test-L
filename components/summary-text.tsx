// A generated summary: either a plain paragraph, or newline-separated "- "
// bullets that a single <p> would render with the dashes as literal text.
//
// Not react-markdown: model copy would also get *, _, # and backticks parsed.

import { cn } from '@/lib/utils'

type Block =
  | { kind: 'ul'; items: string[] }
  | { kind: 'p'; lines: string[] }

// Trailing space required, so "- 5 marks" mid-sentence isn't read as a list.
const BULLET = /^\s*[-*•]\s+/

// Runs of bullets and runs of prose, in source order — an intro sentence
// followed by points becomes a <p> then a <ul>.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  // A blank line ends the current block, so blank-line-separated paragraphs
  // stay separate <p>s instead of collapsing into one.
  let open = true
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) { open = false; continue }
    const last = open ? blocks[blocks.length - 1] : undefined
    open = true
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '')
      if (last?.kind === 'ul') last.items.push(item)
      else blocks.push({ kind: 'ul', items: [item] })
    } else {
      if (last?.kind === 'p') last.lines.push(line)
      else blocks.push({ kind: 'p', lines: [line] })
    }
  }
  return blocks
}

// className carries the typography, so prose renders exactly as the <p> did.
export function SummaryText({ text, className }: { text: string; className?: string }) {
  const blocks = toBlocks(text)
  return (
    // Renders even when empty, so nothing below it shifts.
    <div className={cn('space-y-3', className)}>
      {blocks.map((block, i) =>
        block.kind === 'ul' ? (
          <ul key={i} className="list-disc pl-5 space-y-1">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          // pre-line keeps soft line breaks inside a prose run.
          <p key={i} className="whitespace-pre-line">
            {block.lines.join('\n')}
          </p>
        ),
      )}
    </div>
  )
}
