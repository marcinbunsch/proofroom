# Bootstrap: Proofroom — a GitHub review app on the Staffroom stack

This document stands up a new app — an agent that reviews GitHub pull
requests — using the same stack, layout and working rules as Staffroom. It is
written for whoever (or whatever) starts from this empty directory. It assumes
a Staffroom checkout sits next door at `../staffroom`; every "copy from" and
"crib from" below points into it.

## Open decisions — ask Marcin before building past the scaffold

1. **The name — settled: Proofroom** (the print shop's proofing room, where
   proofs are checked before the run). Package scope `@proofroom/*`, env
   prefix `PROOFROOM_*`, state directory `~/.proofroom`, repo
   `github.com/marcinbunsch/proofroom`. The npm name and GitHub namespace
   were checked free on 2026-10-23.
2. **Who it serves.** Staffroom is multi-tenant (a small team shares one
   server). A review app may be single-user per install. This decides whether
   the tenancy seam gets ported or skipped — the single biggest scope fork.
3. **What identity posts the reviews.** A GitHub App posting as its own bot
   user, or the operator's own account via OAuth. The App is the better
   default: it gets webhooks, fine-grained repo permissions, and reviews that
   are visibly from a bot.
4. **Where it runs.** A laptop (loopback, like the Staffroom desktop app) or a
   small always-on server. Webhooks need a reachable URL, which pushes toward
   the server — or toward polling instead of webhooks for the laptop case.

## The one rule that shapes everything: agents run unattended

A review agent is triggered by a pull request, not by a person sitting in a
chat. It must never stop mid-run to ask for permission — if it keeps asking,
the app does not work. So permissions are decided **once, at setup time**, not
per run:

1. The operator installs the GitHub App on chosen repositories. That is the
   repo allowlist.
2. The operator configures what the agent may do — comment, approve, request
   changes — per repository, in Settings.
3. At run time the agent gets exactly the tools those choices allow, and
   everything it may reach is pre-granted. Nothing in the webhook path is
   confirm-gated.

Staffroom's confirm gates (`docs/primers/confirm-gates.md`) still exist in the
toolbox, but only for an optional "draft the review and let me press send"
mode — never in the default path.

## The stack

Copy these versions; they are what Staffroom pins today and they are known to
work together. Exact pins on purpose (`save-exact=true`) — upgrades are
scheduled work, not drive-by changes.

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime | Node | 26+ (engines-pinned) |
| Package manager | pnpm workspace | 10.14.0 |
| Language | TypeScript, native ESM, strict | 7.0.2 |
| HTTP | Hono + `@hono/zod-validator`, typed RPC via `hc<Routes>` | 4.13.5 / 0.9.1 |
| Auth | better-auth (+ `@better-auth/api-key`) | 1.7.2 |
| Agents | Flue (`@flue/runtime`, `@flue/sdk`, `@flue/vite`, `@flue/react`) | 2.0.3 |
| Models | `@earendil-works/pi-ai` (under Flue) | 0.83.0 |
| Schemas | zod, `z.infer` as the only wire types | 4.4.3 |
| Storage | SQLite via better-sqlite3, kysely for migrations | 13.0.3 / 0.29.5 |
| Scheduling | croner | 10.0.1 |
| UI | React 19 + react-router 7 + MobX 6 + Tailwind 4 (vite) | see ui/package.json |
| Build | vite (server too, via `@flue/vite`) | 8.2.2 |
| Tests | vitest | 4.1.11 |
| Lint / format | oxlint / oxfmt | 1.80.0 / 0.65.0 |
| GitHub | octokit (new here — Staffroom has none) | latest at install |

## The workspace

Same shape as Staffroom, minus what a review app does not need on day one:

| Package | What it is |
| --- | --- |
| `packages/protocol` | zod schemas — the source of truth for every type that crosses the wire. No logic. |
| `packages/server` | The app: webhook intake, the review jobs, the agents, the HTTP API, serves the built UI. Most code lives here. |
| `packages/client` | Typed HTTP client over the Hono RPC types. The UI never touches a URL or status code. |
| `packages/ui` | React SPA: review history, per-repo settings, the agent's prompt and model. |

Skip for now: `cli`, `desktop`, `mobile`, `plugin-core`. Add them later if the
product earns them; each has a working reference in Staffroom when it does.

## Step-by-step bootstrap

Do these in order. Each step leaves the repo green (`pnpm check` passes).

1. **Scaffold the workspace.** Copy from `../staffroom`, verbatim:
   `tsconfig.base.json`, `.npmrc`, `pnpm-workspace.yaml` (keep
   `minimumReleaseAge: 4320` and the build allowlist — trim entries for
   packages you don't use), `.gitignore`, `.prettierignore` shape, and the
   root `package.json` scripts block (`dev`, `build`, `check`, `test`, `lint`,
   `format`, `release:*`). Rename everything `staffroom` → `proofroom`.
2. **Copy the working scripts.** `scripts/release.sh` and
   `scripts/setup-signing.sh` port as-is (they read the repo from the git
   remote). `.github/workflows/ci.yml` and `release.yml` too — drop
   `release.yml` until there is a desktop app to sign.
3. **protocol first.** Define the first schemas: a repository, a review job,
   a review verdict, the per-repo permission choices from the rule above.
   Crib the file layout from `../staffroom/packages/protocol/src`.
4. **server skeleton.** Port from `../staffroom/packages/server`, in this
   order: `core/config.ts` (the env + state-dir pattern — one directory owns
   the databases, the file bytes, the generated secrets), `core/auth.ts` +
   the sign-up gate in `create-app.ts` (first account is the admin, sign-up
   closes behind it; keep the `error` **and** `message` fields — better-auth's
   client only shows `message`), `coordinator/secrets.ts` (encrypted
   credentials at rest), the migrations pattern, and the Hono route shape
   (chained handlers, `zValidator`, relative paths, `export type XRoutes`).
5. **client + ui shells.** Copy `client/src/http.ts` and one domain as a
   template; copy the ui scaffold (vite config, Tailwind setup, the
   `lib/api.ts` re-export pattern, `lib/shortcuts.ts` if you want ⌘K). The
   design tokens and reference screens live in `../staffroom/design` — reuse
   the tokens, not the screens.
6. **The GitHub App.** New code, no Staffroom equivalent: register a GitHub
   App (webhooks: `pull_request`, `pull_request_review`; permissions: checks,
   contents read, pull requests write), store its private key with the
   secrets store from step 4, verify webhook signatures at the edge, and
   exchange installation tokens per repo. Staffroom's OAuth token refresh
   (`core/integrations.ts`, GitHub entry) shows the token-expiry handling —
   GitHub installation tokens expire after an hour, so mint per job, never
   store.
7. **The review loop.** Webhook → a row in a jobs table → a Flue agent run
   with the pre-granted tools (fetch the diff, read files, post the review).
   Staffroom's `coordinator/jobs.ts` and `events-and-schedules` primer are
   the model: an event comes in, a job is opened, the job runs a session, the
   outcome and cost land in columns. One Flue runtime per process — this is a
   Flue constraint, design around it from the start.
8. **Settings UI.** Repo list (from App installations), per-repo permission
   choices, the agent's prompt and model credential. Crib the Settings
   screens' shape from `../staffroom/packages/ui/src/screens/Settings`.

## What to read in the Staffroom repo

`docs/primers/README.md` is the index; `architecture.md` first. The primers
worth reading before porting each area: `tenancy.md` (only if decision 2 says
multi-tenant), `jobs.md`, `events-and-schedules.md`,
`tools-and-credentials.md`, `confirm-gates.md`. The docs culture ports too:
one primer per area, written in plain language, updated in the same commit as
the change that contradicts it.

## Traps already paid for — do not pay twice

1. pnpm: `pnpm --filter x pack` runs pnpm's own tarball command, not your
   `pack` script. Always `run pack`.
2. CI exports unset secrets as empty strings. `process.env.X ?? fallback`
   keeps the empty string; use `||` when empty must mean unset.
3. Hono registers static routes before `/:param` routes in the chain, or a
   slug can shadow them. Keep `/sandbox/status`-style routes above
   `/:name/...`.
4. Vite `?raw` imports need an ambient `declare module` in **every** package
   whose type-check compiles the importing file, not just the owner.
5. better-auth error bodies: the client surfaces `message`, not `error`.
   Return both.
6. pnpm `overrides` for `@better-auth/utils` (see `../staffroom/pnpm-workspace.yaml`)
   — without it a fresh resolution can install two `@better-auth/core` copies
   and the plugin types fall apart.
7. The release workflow's draft release is invisible under the tag until
   published — that is GitHub, not a bug.

## First milestone

The bootstrap is done when: a pull request opened on a test repository fires
the webhook, a job row appears, the agent reads the diff and posts one review
comment through the App installation token, the run's cost lands in a column,
and the whole thing shows up in the UI's history — with `pnpm check` green
and not one permission prompt along the way.
