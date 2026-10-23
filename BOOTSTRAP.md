# Bootstrap: Proofroom — understand a pull request without reading all of it

Proofroom is a desktop app for reviewing GitHub pull requests. It is for one
person, Marcin, and it runs on his laptop.

You are still the reviewer. Every comment, approval and label change goes to
GitHub as you, never as a bot. The AI's job is to help you understand the
change, not to review it for you.

The point of the app is the **guide**. When you open a pull request, the AI
writes a clear visual explanation of it. That way a 3,000-line pull request
can be reviewed by someone who will never read all 3,000 lines. The plain
diff is still there in its own tab, but the guide is where you spend your
time.

The AI runs through a command-line tool already installed on the laptop:
Claude Code (`claude`) or Codex (`codex`). Proofroom stores no API keys.

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
  as a whole. Comments wait in a draft review until you submit them all
  together, with a summary and a verdict. The author gets one notification
  with everything. Replies to existing threads can post right away.
- **Existing threads.** Other people's comment threads show next to the code,
  in both the guide and the Diff tab. You can reply, resolve and unresolve.
- **Reviewers and labels.** You can change them.
- **CI and checks.** You can see whether they passed, with a link to the logs.
  You can't change anything here.
- **Diff tab.** A complete, ordinary diff view, one click away.
- **Desktop app.** A Mac app with its own window and a dock icon. It starts
  at login so the inbox stays fresh. It sends notifications when a guide is
  ready and when someone asks for your review.

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

## Tech — not decided yet

The product above is settled. The technology hasn't been discussed yet. What
follows is a starting point to argue with, not a plan.

### Starting point: the Staffroom stack

Staffroom (`../staffroom`) is Marcin's other app. Its stack is known to work,
and it already has a Mac desktop shell (Electron, running a local server
inside the app). The versions it pins today:

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime | Node | 26+ (engines-pinned) |
| Package manager | pnpm workspace | 10.14.0 |
| Language | TypeScript, native ESM, strict | 7.0.2 |
| HTTP | Hono + `@hono/zod-validator`, typed RPC via `hc<Routes>` | 4.13.5 / 0.9.1 |
| Schemas | zod, `z.infer` as the only wire types | 4.4.3 |
| Storage | SQLite via better-sqlite3, kysely for migrations | 13.0.3 / 0.29.5 |
| UI | React 19 + react-router 7 + MobX 6 + Tailwind 4 (vite) | see ui/package.json |
| Desktop | Electron | 44.0.0 |
| Build | vite | 8.2.2 |
| Tests | vitest | 4.1.11 |
| Lint / format | oxlint / oxfmt | 1.80.0 / 0.65.0 |
| Diagrams | Pele | new here |
| GitHub | octokit | new here |

The workspace would likely follow the same layout: `protocol` (zod schemas
only), `server`, `client` (typed HTTP client), `ui`, `desktop`.

Some of Staffroom probably doesn't carry over, because Proofroom is
one person on one laptop, starts generating only when asked, and stores no
API keys. That would drop multi-user support, webhooks, sign-up and login,
the AI model library Staffroom uses (Flue), and scheduling. Each one gets
confirmed when we talk tech.

### Questions for the tech conversation

1. **Signing in to GitHub.** Borrow the token the `gh` command-line tool
   already has, or have Proofroom do its own GitHub sign-in?
2. **Running the AI tools.** How Proofroom starts `claude` and `codex`
   without a terminal, gets the guide back piece by piece so chapters can
   appear as they're written, and stops a run you cancel.
3. **What a guide is made of.** The exact data format the AI produces, and
   how the app checks it: valid visualization data, and every changed piece
   of code placed somewhere.
4. **The plugin format.** What a visualization plugin looks like on disk, how
   the app loads one without a new release, and how a proposed one gets a
   safe sample to show before you approve it.
5. **Local copies of repositories.** Where they live, how they're kept up to
   date, and how a guide gets the pull request's exact commit while another
   guide runs on the same repository.
6. **Comparing before and after, ignoring rebases.** How "what the pull
   request does overall" is computed for guides to changes since your last
   review.
7. **Keeping the inbox fresh.** How often to ask GitHub for updates without
   hitting its rate limits.

### Mistakes Staffroom already paid for

These apply if we stay on the same stack.

1. pnpm: `pnpm --filter x pack` runs pnpm's own tarball command, not your
   `pack` script. Always `run pack`.
2. CI exports unset secrets as empty strings. `process.env.X ?? fallback`
   keeps the empty string. Use `||` when empty must mean unset.
3. In a Hono route chain, put fixed routes like `/sandbox/status` above routes
   with a placeholder like `/:name/...`. Otherwise the placeholder can catch
   them first.
4. Vite `?raw` imports need an ambient `declare module` in **every** package
   whose type-check compiles the importing file, not just the owner.
5. Keep `save-exact=true` and `minimumReleaseAge: 4320` from Staffroom's
   `.npmrc` / `pnpm-workspace.yaml`. Version upgrades are planned work, not
   something done in passing.
