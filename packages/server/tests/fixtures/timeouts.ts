// Tests that run real git, real CLIs or a whole guide take a second or two
// each, and several times that when the machine is busy (a full `pnpm check`
// runs type checks alongside). 30s keeps them from failing for being slow
// while a real hang still fails.
export const realProcessesTimeout = { timeout: 30_000 }
