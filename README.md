# Proofroom

Understand a pull request without reading all of it.

Proofroom is a desktop app for reviewing GitHub pull requests. When you open
one, an AI writes a visual guide to it: a short overview, then chapters, one
per idea in the change, each with a diagram and the code that matters. You
still do the review. Every comment and approval goes to GitHub as you.

**Status:** early. The guide pipeline is being built; nothing is released yet.
[`BOOTSTRAP.md`](BOOTSTRAP.md) describes the product and the plan.

## What you need

Proofroom stores no API keys and no tokens. It uses tools you already have:

- [`gh`](https://cli.github.com), logged in (`gh auth login`)
- [Claude Code](https://claude.com/claude-code) (`claude`) or
  [Codex](https://github.com/openai/codex) (`codex`), logged in

## Development

```sh
pnpm install
pnpm dev     # server on :4790 and the UI on http://127.0.0.1:5790
pnpm check   # types, tests, lint, formatting

# Write a guide without the UI, and print it
pnpm --filter @proofroom/server generate-guide https://github.com/owner/repo/pull/123
```

## License

Apache-2.0
