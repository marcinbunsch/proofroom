// Said next to a Save button when saving didn't work. What was typed stays in
// the box, so trying again is all it takes.
export function SaveFailed() {
  return (
    <span className="mr-auto text-xs text-red-700" data-testid="save-failed">
      Couldn't save. Try again.
    </span>
  )
}
