import Markdown from "react-markdown"

// Text an agent wrote in Markdown: the guide's overview and its chapters.
// react-markdown never renders raw HTML, so nothing in the text can run in the
// page.
export function AgentText({
  markdown,
  className,
}: {
  readonly markdown: string
  readonly className: string
}) {
  return (
    <div className={`agent-text ${className}`}>
      <Markdown>{markdown}</Markdown>
    </div>
  )
}
