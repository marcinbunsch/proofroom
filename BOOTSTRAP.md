# Bootstrap: Proofroom — understand a pull request without reading all of it

Proofroom is a desktop app for reviewing GitHub pull requests. Each install
is for one person, on their own laptop. It is open source (Apache-2.0) and
ships as a signed Mac app that updates itself.

You are still the reviewer. Every comment, approval and label change goes to
GitHub as you, never as a bot. The AI's job is to help you understand the
change, not to review it for you.

The point of the app is the **guide**. When you open a pull request, the AI
writes a clear visual explanation of it. That way a 3,000-line pull request
can be reviewed by someone who will never read all 3,000 lines. The plain
diff is still there in its own tab, but the guide is where you spend your
time.

The AI runs through a command-line tool already installed on the laptop:
Claude Code (`claude`) or Codex (`codex`). GitHub is reached through the
GitHub command-line tool (`gh`). Proofroom stores no API keys and no tokens.

The name: a proofroom is the room in a print shop where proofs get checked
before the print run. Package scope `@proofroom/*`, env prefix `PROOFROOM_*`,
state directory `~/.proofroom`, repo `github.com/marcinbunsch/proofroom`.

## How a review goes

1. You open Proofroom. The inbox shows pull requests waiting for your review,
   from the repositories you chose in Settings.
2. You open one and press Generate. The AI reads the pull request and the
   code around it.
3. Within a minute or so you see the overview and the list of chapters. The
   chapters fill in one by one while you start reading.
4. You read the guide. You comment on code right inside the chapters, ask
   questions about anything unclear, and tick chapters off as you go.
5. You submit the review: all your comments at once, with a summary and a
   verdict (comment, approve, or request changes).
6. The author pushes new commits. The pull request moves back into "Needs
   your review". You generate a guide to the changes since your review: it
   shows how each of your comments was handled, then anything new.

## The guide

### What it looks like

1. **The overview.** It opens with two sentences on what the pull request
   does and a diagram of the part of the system it touches.
2. **Chapters.** Below the overview come ordered chapters, one per idea in
   the change ("new rate limiter", "callers moved over to it", "old code
   path deleted"). Each chapter has a visual, a short explanation, and the
   code that matters.
3. You can read it top to bottom like a story, or jump from the diagram to a
   chapter.

### The code inside chapters

The code in a chapter is the real diff, not a copy of it. The AI picks which
lines matter and can fold away the boring middle. You can click any line and
leave a comment, the same as in the Diff tab. A whole review can happen
without leaving the guide.

### Nothing gets skipped quietly

On a big pull request the AI will not show every change in a chapter. To make
sure it hasn't left out something important:

1. Every changed piece of code has to end up somewhere. It is either shown in
   a chapter, or listed in a "routine changes" appendix grouped by kind:
   renames, generated files, lockfiles, mechanical updates where something
   is called, tests.
2. The app checks this itself, without trusting the AI.
3. Any change that wasn't placed anywhere shows up in a loud "unexplained
   changes" section.

So if the guide doesn't mention something, it really is routine.

### Flags

The guide mostly explains and stays neutral. On top of that it puts flags on
the spots worth a close look:

- risky logic
- a change in behaviour hidden inside a refactor
- missing tests
- code that contradicts the pull request's description

A flag tells you where to look, not what to think. The AI never writes review
comments for you.

### What the AI reads

1. The repository checked out at the pull request's latest commit, so it can
   see code that calls the changed code, the tests, and the code nearby, not
   just the diff. The app makes the local copy the first time it is needed.
2. The pull request's description, commit messages, linked issues, and
   existing comment threads.

### Steering it

- A general "how I review" note in Settings, e.g. "I care about data
  migrations and login code, skip styling".
- An optional note per repository, e.g. "the billing module is fragile,
  always flag payments code".
- An optional one-off instruction when you press Generate.

All of these go to the AI with every guide. They shape which chapters it
writes and what it flags.

### Asking questions

1. Select a chapter, a diagram, or a piece of code and ask about it ("why not
   reuse the existing cache?", "who else calls this?").
2. The answer appears right there, next to what you asked about. It can
   contain new diagrams and code.
3. The answer is saved with the guide.
4. A "go deeper" button on a chapter asks the AI to expand it.

### Keeping your place

You can mark each chapter, and each group in the routine-changes appendix, as
reviewed. The overview shows how far you are (4 of 7 chapters done). If new
commits change the code in a chapter you already ticked, the tick comes off.
This lives in Proofroom only and is not tied to GitHub's "viewed" checkbox on
files.

### When guides are made, and what happens to them

1. A guide is only made when you ask for one.
2. Every guide is saved on the laptop, tied to the exact commit it explains.
   Opening the pull request again shows it instantly.
3. If new commits arrived since, a banner says so ("this guide is for
   abc123, there are 3 new commits"). It offers a guide to just the changes,
   or a full new guide.
4. Old guides stay in a history, so you can always see what you reviewed
   against.
5. You choose Claude Code or Codex as the default in Settings, plus a model
   if the tool has a choice. You can switch for a single guide from the
   Generate button. Each guide records which tool and model wrote it.
6. You choose which account each tool runs as, per repository, in Settings:
   for example a work Claude account for work repositories and a personal one
   for your own. An account is the tool's config folder (`CLAUDE_CONFIG_DIR`
   for Claude Code, `CODEX_HOME` for Codex). Until Settings exists, the two
   environment variables set it for every repository.

### Changes since your last review

1. By default, "since your last review" means since the commit that was the
   latest one when you last submitted a review on GitHub. A picker lets you
   choose a different starting point, such as an earlier review or an
   earlier guide.
2. The guide opens with each comment thread you left and what the author did
   about it: fixed it (with the code that fixes it), pushed back, or left it
   alone.
3. Then come chapters on everything else that changed.
4. It compares what the pull request does overall, before and after. Rebasing
   onto main or merging main in does not show up as changes.

### Exporting

A guide can be exported as one self-contained HTML file to send to someone.
There is a switch to leave out the flags and your questions, since those
were written for you.

## Visualizations

### How they work

1. The app comes with a fixed set of visualization types, and it draws them
   itself. The AI never draws freehand.
2. For each chapter, the AI picks the type that fits and fills in the data.
   That way every guide looks consistent and clean, and a broken or ugly
   diagram can't happen.
3. Diagrams are written in Mermaid, a simple text format for diagrams. The
   app draws them with Pele (https://pele.run), using the app's own colours
   and fonts.
4. Other types are drawn by the app's own code: before/after comparisons,
   pieces of code, a map of which files changed how much.

### Adding new types

1. A visualization type is one self-contained plugin. It has a name, a
   description of the data it takes, the code that draws it, and a short
   "when to use this" note that gets sent to the AI.
2. The built-in types are plugins made the same way, so they double as
   examples.
3. Put a new plugin in a local folder and the next guide can use it. No new
   release of the app is needed.

### When the AI wants a type that doesn't exist

1. The guide never waits. The chapter uses the closest type that does exist.
2. The AI also writes a proposal for the new type, with a sample drawn from
   this pull request's real data.
3. Proposals wait in a Library screen. Approve one and it joins the set. You
   can then redraw that chapter with it. Reject one and it is gone.

## The rest of the review app

These are the basics any review tool needs.

- **Inbox.** It has three sections, and pull requests move between them on
  their own:
  1. **Needs your review**: you or your team were asked to review, or new
     commits arrived after your review.
  2. **Waiting on author**: you reviewed and nothing new has come in.
  3. **Done**: merged or closed, or you approved and nothing changed since.
- **Which repositories.** Only the ones you list in Settings. Nothing outside
  that list shows up.
- **Comments.** You can comment on a line, on a file, or on the pull request
  as a whole. Comments wait as drafts, saved in Proofroom only, until you
  submit them all together with a summary and a verdict, in one call to
  GitHub. The author gets one notification with everything. Drafts are not
  mirrored to a GitHub pending review, so a review started in Proofroom is
  finished in Proofroom. Replies to existing threads can post right away.
- **Existing threads.** Other people's comment threads show next to the code,
  in both the guide and the Diff tab. You can reply, resolve and unresolve.
- **Reviewers and labels.** You can change them.
- **CI and checks.** You can see whether they passed, with a link to the logs.
  You can't change anything here.
- **Diff tab.** A complete, ordinary diff view, one click away.
- **Desktop app.** A Mac app with its own window and a dock icon. It starts
  at login so the inbox stays fresh. It sends notifications when a guide is
  ready and when someone asks for your review.
- **First run.** A checklist makes sure `gh` is installed and logged in, and
  that `claude` or `codex` is installed. Each missing piece comes with the
  exact fix. Nothing personal is built in: your review notes, repository list
  and AI choice are all Settings.
- **Updates.** The app checks for a new version on launch and every few
  hours, downloads it in the background, and offers a restart.

**Not in the first version:** merging, assignees, switching drafts on and
off, closing or reopening pull requests. Everything else on GitHub stays on
github.com.

## Build order

The guide is the bet, so it comes first. The first version you would use
every day:

1. The inbox, for the repositories you listed.
2. Open a pull request and generate a full guide: the overview, the
   chapters, the built-in visualizations, code you can comment on, the
   routine-changes appendix, and the flags.
3. The Diff tab.
4. Submitting a review with a verdict.

Then, in this order:

5. Guides to the changes since your last review.
6. Asking questions about a spot in the guide, and "go deeper".
7. Ticking chapters off as reviewed.
8. HTML export.
9. AI-proposed visualization types and the Library screen.

## Tech

### The shape of the app

1. **A desktop window and a local server.** Electron opens the window. A
   Node server inside the app, reachable only from the laptop itself, does
   all the work: talking to GitHub, managing repository copies, running the
   AI tools, and storing everything. The desktop shell is borrowed from
   Staffroom (`../staffroom/packages/desktop`).
2. **Effect, end to end.** The server and the UI are both written with
   Effect 4. Schema describes every piece of data. RPC connects the UI to
   the server. Atoms hold the UI's state. Effect's own SQL, child-process
   and MCP modules do the rest.
3. **The UI talks to the server over Effect RPC.** Procedures are defined
   once and shared by both sides. A guide streams: the UI subscribes to
   `watchGuide`, gets the overview first, then each chapter as it is saved.

### How a guide gets written

1. The app runs `git diff` itself and splits the change into hunks. Each hunk
   gets a stable ID made from its file and a hash of its changed and context
   lines, not its position, so a hunk keeps its ID when edits above it move
   it down the file.
2. The app makes a `git worktree` at the pull request's exact latest commit,
   from its own clone in `~/.proofroom/repos`. Your own checkouts are never
   touched. The planner and the chapter runs of one guide share this
   worktree, since none of them can write to it. It is deleted when the
   guide is finished.
3. It starts the **planner run**: `claude` or `codex`, without a terminal,
   inside that worktree.
4. The planner reads the code and writes back through Proofroom's **MCP
   server**: the overview, the chapter outline, and which hunks (or line
   ranges of hunks) go in which chapter or the appendix.
5. The app checks that every changed line is placed exactly once. If not, it
   tells the planner what is missing and the planner fixes it.
6. The app starts the **chapter runs**, three at a time. Each one gets the
   outline and only its own hunks. It writes its chapter, picks its
   visualizations and adds flags through the same MCP server.
7. Every MCP call is checked against its Schema the moment it arrives. A bad
   call returns an error the agent can read and correct. A good call is
   saved and streamed to the UI.
8. "Go deeper" and questions about a spot in the guide reuse the chapter-run
   path.

**What the agents may do.** Read and search files, and call Proofroom's MCP
tools, which include reading the code's history (`git_log`, `git_show`,
`git_blame`). They may not write files, use the network, or install
anything. Claude Code gets no shell at all: an allow-list of shell commands
can't be made read-only, since `git log --output=<file>` writes any file and
`rg --pre` runs any program. So Proofroom runs git itself, with arguments it
chose, and the agent only names a commit or a file. The app sets this once,
through each tool's own controls (Claude Code's allowed-tools list and
Codex's read-only sandbox). So a run never stops to ask permission. The MCP
server listens on the laptop only and needs a secret that is new for every
run.

**Tested on 2026-10-23** (Claude Code 2.1.280, Codex 0.153.0). Both CLIs
called Proofroom's MCP tools over HTTP. Both refused, without a prompt, an
attempt to write a file and an attempt to reach the network. These are the
settings that made it work:

- **Claude Code:** `claude -p`, plus:
  - `--mcp-config <file>` and `--strict-mcp-config`: only Proofroom's MCP
    server is loaded.
  - `--setting-sources ""`: the user's own settings, hooks and allow-lists
    are left out.
  - `--tools "Read,Grep,Glob"`: no Bash.
  - `--allowedTools` listing the Proofroom MCP tools.
  - `--permission-mode dontAsk` and `--permission-prompts none`: anything
    not allowed is refused, never asked about.
  - `--no-session-persistence --output-format stream-json`.
  - `--bare` can't be used: it only accepts API keys, and we rely on the
    user's own login.
  - `CLAUDE_CONFIG_DIR` is passed on when set in Proofroom's environment, so
    guides can run as another account.
- **Codex:** `codex exec`, plus:
  - `--json --ephemeral --ignore-user-config --ignore-rules -s read-only`.
  - `-c approval_policy="never"`.
  - `-c mcp_servers.proofroom.url=...` and
    `-c mcp_servers.proofroom.default_tools_approval_mode="approve"`.
    Without the second one, every MCP call is refused.
  - `-c web_search="disabled"`, and `features.memories`, `features.hooks`,
    `features.plugins`, `features.apps` all set to false.
  - `HOME` pointed at an empty folder, with `CODEX_HOME` still pointing at
    the real `~/.codex` so the user's login works. `CODEX_HOME` set in
    Proofroom's environment picks another account instead. Without this, Codex
    loads the user's personal skills from `~/.agents/skills` even with
    `--ignore-user-config`.

Still to close before release:

- `git diff --output=<file>` and `git log --output=<file>` write files, so
  allowing a git command by name is not the same as allowing it to only
  read. Claude Code's sandbox setting (which blocks file writes and network
  at the operating-system level) would close this. Codex's read-only sandbox
  already does.
- Codex still lists its own built-in skills. Turn them off one by one with
  `skills.config`.

**The prompts** are TypeScript functions next to the runs that use them
(`guides/planning/planner-prompt.ts`, `guides/chapters/chapter-prompt.ts`).
Each prompt is built from the pull request's data, such as the list of hunks
and the outline, and a function keeps the text and that data in one place.

### Changes since your last review

1. Build the pull request's full diff as it was at your review: the old
   latest commit against where it branched from main.
2. Build it again as it is now: the new latest commit against where it
   branches from main now.
3. Compare the two diffs, hunk by hunk.

Whatever main brought in is in neither diff, so it cancels out. That works
the same whether the author added commits, rebased, or merged main in. The
result uses the same kind of hunk IDs, so the coverage check and
commentable code work unchanged.

### GitHub

- **Everything goes through `gh`.** Reads and writes use `gh api` (REST and
  GraphQL). Cloning and fetching use git with `gh` as the credential helper.
  Proofroom never sees or stores a token. No octokit.
- **The inbox** is one GraphQL query every 2 minutes, plus one whenever the
  window comes to the front. Around 30 points an hour, against GitHub's limit
  of 5,000.

### Storage

One SQLite file in `~/.proofroom`. Each piece of a guide is its own row:
guides, chapters, hunk placements, flags, questions and answers,
visualization data, review progress, and the inbox cache. Migrations run with
Effect's Migrator.

### Code display

`@pierre/diffs` draws all code, both the hunks inside chapters and the Diff
tab, so they look identical. Syntax colouring uses `@pierre/highlights`
(`preferredHighlighter: 'highlights'`).

### Visualization plugins

1. A plugin is a folder, `~/.proofroom/visualizations/<name>/`, with an
   `index.tsx`. It exports a name, a Schema for its data, a "when to use
   this" note for the AI, and a React component.
2. The app bundles plugins with esbuild when it starts and whenever the
   folder changes. No new release needed.
3. The built-in types live in `packages/ui/src/visualizations/` in exactly
   the same format. The Mermaid ones are drawn by Pele.
4. A plugin the AI proposes is unreviewed code. It only ever renders inside a
   sandboxed iframe until you approve it.
5. The server draws every Mermaid diagram with Pele the moment the MCP call
   arrives. AI-written Mermaid often breaks on small things, such as
   brackets inside a label that aren't in quotes. Pele reports the line,
   column and a snippet, and that goes straight back to the agent as the
   tool's error so it can fix it. A broken diagram never reaches the guide.

### The workspace

| Package             | What it is                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol` | Schemas, RPC procedure definitions, MCP tool definitions. No logic. Shared by server and UI.                                                  |
| `packages/server`   | Everything that does work, each part an Effect Layer: GitHub, repository copies, the agent runner, the MCP server, storage, the RPC handlers. |
| `packages/ui`       | React screens, atoms, the RPC client, the built-in visualizations.                                                                            |
| `packages/desktop`  | The Electron shell: window, notifications, start at login, updates.                                                                           |

Staffroom's `client` package has no equivalent here: the RPC client comes
straight from the shared definitions in `protocol`.

### Testing

1. The CLI agents sit behind one `AgentRunner` service (an Effect Layer).
2. Tests swap in a fake runner that replays a script of MCP tool calls: good
   calls, invalid calls, a chapter that never finishes, a run that gets
   cancelled.
3. Those scripts run against the real MCP server, a real SQLite database, and
   small real git repositories built by the tests, including rebases and
   merges from main.
4. `pnpm test:live` is opt-in and runs the real `claude` and `codex` on one
   small fixture pull request.

### Open source and releases

- **License:** Apache-2.0, the same as Staffroom, so files copied across
  keep their license. It is permissive and includes an explicit patent
  grant.
- **Repo:** public at `github.com/marcinbunsch/proofroom`, with a README that
  explains the "bring your own `gh` and `claude`/`codex`" model, and a
  `SECURITY.md`.
- **Releases:** push a version tag and GitHub Actions builds the Mac app,
  signs and notarizes it, and attaches it to a GitHub release. This comes
  from Staffroom's `release.yml`, `scripts/release.sh` and
  `scripts/setup-signing.sh`, which port almost as-is. Apple Silicon only,
  like Staffroom. Intel can be added later as a second build.
- **Updates:** `update-electron-app`, which uses the free
  `update.electronjs.org` service to read this repo's public GitHub releases.
  That service only works for public repos with signed apps, which this is.
  Each release also uploads the zip it needs.
- **CI:** Staffroom's `ci.yml`: `pnpm check` and tests on every push.

### Versions

Exact pins (`saveExact: true`) and pnpm's `minimumReleaseAge: 4320` (3 days:
a new release must be 3 days old before it can be installed), both in
`pnpm-workspace.yaml`. Both come from Staffroom. Upgrades are planned work,
not something done in passing.

New pieces are pinned to the newest version that clears the 3-day rule
**on the day they are installed**. As of 2026-10-23:

| Layer                   | Choice                                                          | Version                            |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------- |
| Runtime                 | Node                                                            | 26+ (engines-pinned)               |
| Package manager         | pnpm workspace                                                  | 11.28.6                            |
| Language                | TypeScript, native ESM, strict                                  | 7.0.2                              |
| Everything Effect       | `effect` (Schema, RPC, SQL, child processes, MCP server, atoms) | 4.0.5 (4.0.6 clears on 2026-10-25) |
| Node runtime for Effect | `@effect/platform-node`                                         | 4.0.5                              |
| Storage                 | `@effect/sql-sqlite-node`                                       | 4.0.5                              |
| UI state                | `@effect/atom-react`                                            | 4.0.5                              |
| UI                      | React 19 + react-router 7 + Tailwind 4 (vite)                   | Staffroom's pins                   |
| Code display            | `@pierre/diffs` + `@pierre/highlights`                          | 1.6.1 + 0.2.0                      |
| Diagrams                | `pele`                                                          | 1.7.0                              |
| Plugin bundling         | esbuild                                                         | 0.28.2                             |
| Desktop                 | Electron                                                        | 44.0.0 (Staffroom's)               |
| Updates                 | `update-electron-app`                                           | 3.3.0                              |
| Build                   | vite                                                            | 8.2.2                              |
| Tests                   | vitest + `@effect/vitest`                                       | 5.0.5 + 4.0.5                      |
| Lint / format           | oxlint / oxfmt                                                  | 1.80.0 / 0.65.0                    |

Gone compared to Staffroom: zod (Effect Schema), Hono (Effect RPC), kysely and
better-sqlite3 (Effect SQL), MobX (atoms), better-auth (no accounts), Flue
(the AI runs in the user's own CLI), croner (no schedules), webhooks, and
multi-user support.

### Building it, step by step

Each step leaves `pnpm check` passing.

1. **Scaffold the workspace.** Copy from `../staffroom`: `tsconfig.base.json`,
   `.npmrc`, `pnpm-workspace.yaml` (keep `minimumReleaseAge` and the build
   allowlist, trim what isn't used), `.gitignore`, and the root
   `package.json` scripts. Rename `staffroom` to `proofroom`. Add the
   Apache-2.0 `LICENSE` (copy Staffroom's), a README and `SECURITY.md`.
2. **CI and release.** Port `ci.yml`, `release.yml`, `scripts/release.sh` and
   `scripts/setup-signing.sh`. Cut an empty signed release early, so signing
   problems show up before there is an app to ship.
3. **protocol.** The first Schemas: a repository, a pull request, a hunk and
   its ID, a guide, a chapter, a placement, a flag. The RPC procedures for the
   inbox, and the MCP tools for the planner.
4. **server skeleton.** Config and the `~/.proofroom` directory, SQLite with
   migrations, the `gh` service, and the RPC server.
5. **desktop and ui shells.** The Electron shell from Staffroom, opening the UI
   from the local server. The first-run checklist for `gh` and
   `claude`/`codex`.
6. **The inbox.** The GraphQL query, the three sections, the repository list
   in Settings, notifications.
7. **Hunks and repository copies.** The app's own clone, a worktree per guide,
   the diff split into hunks with stable IDs, and the coverage check. All of
   it tested against real fixture repositories.
8. **The agent runner and MCP server.** The fake runner and its scripts come
   first. Then the real `claude` and `codex` runners with their permission
   settings.
9. **The guide.** Planner run, coverage check, chapter runs, streaming into
   the UI. The overview, chapters and hunks drawn with `@pierre/diffs`, the
   built-in visualizations, flags.
10. **The Diff tab and reviewing.** Draft review, comments from the guide and
    the Diff tab, existing threads, reviewers, labels, CI status, submit with
    a verdict.
11. **Updates.** `update-electron-app` wired in, tested against a real signed
    release.

After that, the later product features in the order listed in "Build
order" above.

### First milestone

Done when a signed build installed from a GitHub release does this, with no
permission prompts along the way:

1. It shows a real pull request from a listed repository in the inbox.
2. It generates a full guide for it with `claude`.
3. Every changed line of that pull request is either in a chapter or in the
   appendix.
4. A comment written on a hunk inside a chapter shows up on GitHub as part of
   a submitted review.

### Mistakes Staffroom already paid for

1. pnpm: `pnpm --filter x pack` runs pnpm's own tarball command, not your
   `pack` script. Always `run pack`.
2. CI exports unset secrets as empty strings. `process.env.X ?? fallback`
   keeps the empty string. Use `||` when empty must mean unset.
3. A GitHub Actions step's `if` can't read `secrets` (GitHub rejects the
   whole workflow file). Put the secret in `env` and test that instead, the
   way Staffroom's `release.yml` does.
4. The release workflow's draft release can't be seen under its tag until it
   is published. That is how GitHub works, not a bug.
5. Vite `?raw` imports need an ambient `declare module` in **every** package
   whose type-check compiles the importing file, not just the owner.

### Found in the spike

- **`@pierre/diffs` 1.6.0 can't load its themes in a browser.** Its code calls
  a `@pierre/theming` feature that only exists in theming 1.0.2, but it pins
  theming 1.0.1, so every diff renders empty, without an error. 1.6.1 (with
  theming 1.0.2 and `@pierre/highlights` 0.2.0) fixes it. Until 1.6.1 clears
  the 3-day rule, Proofroom used 1.5.2 with Shiki highlighting. On
  2026-10-24 Marcin chose to take 1.6.1 early, through a
  `minimumReleaseAgeExclude` list in `pnpm-workspace.yaml` pinned to exactly
  those three versions. **Remove that list after 2026-10-24 18:05 UTC**, when
  all three are 3 days old.
- **pnpm 10.14.0 silently ignores `minimumReleaseAge`.** Staffroom pins that
  version, so its 3-day rule has never been active. With it, Proofroom
  installed a release of `@modelcontextprotocol/client` that was four hours
  old. The lockfile was re-resolved under a pnpm that enforces the rule, and
  Proofroom is now on pnpm 11. pnpm 11 also re-checks every lockfile entry on
  each install ("Lockfile passes supply-chain policies"). When bumping pnpm,
  check the rule still holds: `pnpm add effect@<a release from today>` must
  fail with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`.
- **pnpm 11 ignores `save-exact` in `.npmrc`**, without a warning, and saves
  ranges like `^7.0.0` again. The setting lives in `pnpm-workspace.yaml` as
  `saveExact: true`.
- The app never makes commits: its git work is clone, fetch, worktree,
  diff and merge-base. Only the tests do, when they build fixture
  repositories. A developer's global git config may sign every commit with
  gpg, so the test helpers pass `-c commit.gpgsign=false`, or the commit
  fails.
- `@pierre/diffs` draws a single hunk when given a patch that holds just the
  file header and that one `@@` section. Its `lineAnnotations` and
  `renderAnnotation` put comments and flags under any line. So chapters can
  show one hunk, or part of one, using the same component as the Diff tab.

### Effect-specific

- When unsure how Effect works, read its source instead of guessing. A
  reference copy of `github.com/Effect-TS/effect` lives in `./effect`, kept
  out of git, checked out at the tag of the version we pin
  (`effect@4.0.5`). `effect/LLMS.md` and `effect/ai-docs/` are written for
  agents. Move the checkout to the new tag whenever the pin changes:
  `git -C effect fetch --tags && git -C effect checkout effect@<version>`.
- Use the atoms built into `effect` 4 (`effect/reactivity`) and
  `@effect/atom-react`. The older `@effect-atom/*` packages are still on
  Effect 3 and won't work with it.
- `@effect/vitest` 4 needs vitest 5, not Staffroom's vitest 4.
- The MCP server is `McpServer.layerHttp` with
  `protocols: [McpProtocol.v2025_06_18, McpProtocol.v2025_03_26]`, mounted
  with `HttpRouter.serve` on `NodeHttpServer.layer`. Tools are
  `Tool.make` + `Toolkit.make`, with handlers from `toolkit.toLayer`, and
  their parameters are checked against their Schema before the handler
  runs. Read `effect/packages/effect/MCP.md`.
