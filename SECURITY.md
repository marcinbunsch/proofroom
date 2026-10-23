# Security

## Reporting a vulnerability

Report privately through GitHub's **[Report a vulnerability][advisories]**
button on the Security tab. It opens a private advisory that only the
maintainers can see. Please don't open a public issue for anything exploitable.

Include what you did, what happened, and what an attacker gets out of it. A
proof of concept helps, even a rough one.

Expect a first reply within a week. This is a small project, not a company with
a rota — if a fix needs time, you'll be told where it stands rather than left
waiting.

[advisories]: https://github.com/marcinbunsch/proofroom/security/advisories/new

## What Proofroom assumes

Proofroom runs on one person's laptop, for that person. It has no accounts and
listens only on the laptop itself.

- **It holds no secrets of its own.** GitHub is reached through the `gh`
  command-line tool, and the AI through the user's own `claude` or `codex`.
  Proofroom never reads or stores their tokens.
- **The code under review is untrusted.** The AI agents that read a pull
  request run with read-only permissions: they can read files and run
  read-only git commands, and they cannot write files or reach the network.
  A way for a pull request's contents to make an agent write, run, or send
  something is the thing to report fastest.
- **Each agent run gets its own tool server**, on a random path that only
  that run knows. Another program on the same laptop that finds and calls it
  could add text to a guide being written; it gains nothing else.
