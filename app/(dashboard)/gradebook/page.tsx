import { notFound } from 'next/navigation'

// Hidden from the sidebar and the URL until Gradebook actually ships.
export default function GradebookPage() {
  notFound()
}
