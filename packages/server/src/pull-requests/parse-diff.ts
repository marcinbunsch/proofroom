import { createHash } from "node:crypto"
import { HunkId, type FileStatus, type Hunk, type HunkLine } from "@proofroom/protocol"

// Splits the output of `git diff` into hunks.
//
// It expects the format Proofroom's own git call produces: `a/` and `b/`
// prefixes, no colour, renames detected, and `core.quotePath=false`, so paths
// are only quoted when they hold a quote, a backslash, a tab or a newline.
//
// Files without hunks are skipped: a rename with no content change, a mode
// change, a binary file. They have no changed lines to place.
export function parseUnifiedDiff(diffText: string): Array<Hunk> {
  const fileSections = splitBefore(diffText.split("\n"), isFileHeader)
  return fileSections.flatMap(parseFileSection)
}

function parseFileSection(sectionLines: ReadonlyArray<string>): Array<Hunk> {
  const firstHunkIndex = sectionLines.findIndex(isHunkHeader)
  if (firstHunkIndex === -1) return []

  const file = parseFileHeader(sectionLines.slice(0, firstHunkIndex))
  const hunks = splitBefore(sectionLines.slice(firstHunkIndex), isHunkHeader)
  const hunkId = hunkIdsFor(file.path)
  return hunks.map((hunkLines) => parseHunk(file, hunkLines, hunkId(hunkLines)))
}

// --- the file header -------------------------------------------------------------

interface DiffFile {
  readonly path: string
  readonly oldPath: string | null
  readonly fileStatus: FileStatus
}

function parseFileHeader(headerLines: ReadonlyArray<string>): DiffFile {
  const oldPath = findPath(headerLines, "--- ", "a/")
  const newPath = findPath(headerLines, "+++ ", "b/")
  const isRename = headerLines.some((line) => line.startsWith("rename from "))

  if (newPath === null) {
    if (oldPath === null) throw new Error(`diff section without file paths: ${headerLines[0]}`)
    return { path: oldPath, oldPath: null, fileStatus: "deleted" }
  }
  if (oldPath === null) return { path: newPath, oldPath: null, fileStatus: "added" }
  if (isRename) return { path: newPath, oldPath, fileStatus: "renamed" }
  return { path: newPath, oldPath: null, fileStatus: "modified" }
}

// The path from the `---` or `+++` line. `/dev/null` means the file doesn't
// exist on that side, which comes back as null. git ends the line with a tab
// when the path holds a space, so patch tools can tell where the path ends.
function findPath(
  headerLines: ReadonlyArray<string>,
  marker: string,
  prefix: string,
): string | null {
  const line = headerLines.find((headerLine) => headerLine.startsWith(marker))
  if (line === undefined) return null
  const rawPath = line.slice(marker.length).replace(/\t$/, "")
  if (rawPath === "/dev/null") return null
  const path = rawPath.startsWith('"') ? unquotePath(rawPath) : rawPath
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

// With core.quotePath=false, git only quotes a path to escape these four
// characters, so they are the only escapes to undo.
function unquotePath(quotedPath: string): string {
  const escapes: Record<string, string> = { '\\"': '"', "\\\\": "\\", "\\t": "\t", "\\n": "\n" }
  return quotedPath.slice(1, -1).replace(/\\["\\tn]/g, (escape) => escapes[escape] ?? escape)
}

// --- a hunk ----------------------------------------------------------------------

function parseHunk(file: DiffFile, hunkLines: ReadonlyArray<string>, id: HunkId): Hunk {
  const [headerLine = "", ...bodyLines] = hunkLines
  const header = parseHunkHeader(headerLine)
  return {
    id,
    path: file.path,
    oldPath: file.oldPath,
    fileStatus: file.fileStatus,
    ...header,
    lines: numberLines(bodyLines, header.oldStart, header.newStart),
  }
}

const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

// "@@ -12,5 +12,7 @@ export function cartTotal" — a missing count means 1.
function parseHunkHeader(headerLine: string) {
  const match = hunkHeaderPattern.exec(headerLine)
  if (match === null) throw new Error(`malformed hunk header: ${headerLine}`)
  const [, oldStart, oldLineCount = "1", newStart, newLineCount = "1", sectionHeading = ""] = match
  return {
    oldStart: Number(oldStart),
    oldLineCount: Number(oldLineCount),
    newStart: Number(newStart),
    newLineCount: Number(newLineCount),
    sectionHeading,
  }
}

// Gives every line its line numbers in the old and the new file. Context lines
// exist on both sides, deletions only in the old file, additions only in the
// new one.
function numberLines(
  bodyLines: ReadonlyArray<string>,
  oldStart: number,
  newStart: number,
): Array<HunkLine> {
  const lines: Array<HunkLine> = []
  let oldLineNumber = oldStart
  let newLineNumber = newStart
  for (const bodyLine of bodyLines) {
    const marker = bodyLine.charAt(0)
    const text = bodyLine.slice(1)
    if (marker === " ") {
      lines.push({ kind: "context", text, oldLineNumber, newLineNumber })
      oldLineNumber += 1
      newLineNumber += 1
    } else if (marker === "-") {
      lines.push({ kind: "deletion", text, oldLineNumber, newLineNumber: null })
      oldLineNumber += 1
    } else if (marker === "+") {
      lines.push({ kind: "addition", text, oldLineNumber: null, newLineNumber })
      newLineNumber += 1
    }
    // Anything else is "\ No newline at end of file" or the empty string after
    // the diff's final newline; neither is a line of the file.
  }
  return lines
}

// The same hunk gets the same id in every diff it appears in, which is how a
// delta guide recognises the hunks you already reviewed. The id is a hash of
// the path and the hunk's lines, without its `@@` header: lines added higher
// up the file move a hunk and change its header, but it is the same change.
//
// A file can hold the same change twice, e.g. one import removed from two
// places. The second gets the count of earlier copies in its hash, so ids stay
// unique within a diff.
//
// The empty string that follows the very last hunk of a diff is left out, so
// that hunk's id doesn't depend on whether another file comes after it. (An
// empty line of the file is " ", never "".)
//
// 10 hex characters (40 bits): a pull request has thousands of hunks at most,
// so a collision is vanishingly unlikely, and the id stays short enough for an
// agent to copy without mistakes.
//
// Returns a function that gives each of one file's hunks its id, in diff order.
function hunkIdsFor(path: string): (hunkLines: ReadonlyArray<string>) => HunkId {
  const copiesSeen = new Map<string, number>()
  return ([, ...bodyLines]) => {
    const body = bodyLines.filter((line) => line !== "").join("\n")
    const copy = copiesSeen.get(body) ?? 0
    copiesSeen.set(body, copy + 1)
    const digest = createHash("sha256")
      .update(path)
      .update("\0")
      .update(body)
      .update(copy === 0 ? "" : `\0${copy}`)
      .digest("hex")
    return HunkId.make(`h${digest.slice(0, 10)}`)
  }
}

// --- splitting -------------------------------------------------------------------

const isFileHeader = (line: string) => line.startsWith("diff --git ")
const isHunkHeader = (line: string) => line.startsWith("@@ ")

// Cuts the lines into groups, starting a new group at every line that matches.
// Lines before the first match belong to no group.
function splitBefore(
  lines: ReadonlyArray<string>,
  startsGroup: (line: string) => boolean,
): Array<Array<string>> {
  const groups: Array<Array<string>> = []
  for (const line of lines) {
    if (startsGroup(line)) groups.push([line])
    else groups.at(-1)?.push(line)
  }
  return groups
}
