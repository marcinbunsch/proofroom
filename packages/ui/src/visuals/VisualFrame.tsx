import type { ReactNode } from "react"

// The card every visual sits in, with its title on top.
export function VisualFrame({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <figure className="my-5 overflow-hidden rounded-lg border border-stone-200 bg-white">
      <figcaption className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
        {title}
      </figcaption>
      {children}
    </figure>
  )
}
