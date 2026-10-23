import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer } from "effect"
import { AppPaths } from "../src/AppPaths.ts"
import { GitHubService, type PullRequestDetails } from "../src/pull-requests/GitHubService.ts"
import { GitRemoteUrl } from "../src/pull-requests/GitRemoteUrl.ts"
import { InvalidPullRequestUrl } from "../src/pull-requests/pull-request-url.ts"
import { PullRequestService } from "../src/pull-requests/PullRequestService.ts"
import { OriginRepository } from "./fixtures/OriginRepository.ts"

const pullRequestUrl = "https://github.com/acme/checkout/pull/482"

const discountDetails: PullRequestDetails = {
  title: "Add percentage discounts to cart totals",
  body: "Lets checkout apply a coupon's percentage to the cart total.",
  baseRefName: "main",
  commits: [{ messageHeadline: "Add discountPercent to cartTotal", messageBody: "" }],
}

// GitHubService is the one part that talks to the network, so tests replace it.
const fakeGitHub = Layer.succeed(
  GitHubService,
  GitHubService.of({ fetchPullRequest: () => Effect.succeed(discountDetails) }),
)

// The real PullRequestService and real git, cloning from a repository on disk
// into a Proofroom home folder of its own.
function pullRequestLayer(home: string, origin: OriginRepository) {
  return PullRequestService.layer.pipe(
    Layer.provide(fakeGitHub),
    Layer.provide(Layer.succeed(GitRemoteUrl, () => origin.path)),
    Layer.provide(AppPaths.fromHome(home)),
    Layer.provide(NodeServices.layer),
  )
}

// The repository as GitHub would hold it for pull request 482:
//
//   main:          "Add cart totals" ── "Document shipping"
//                          \
//   add-discounts:          "Add discountPercent to cartTotal"   (refs/pull/482/head)
//
// "Document shipping" landed on main after the branch was cut, so it must not
// show up in the pull request's diff.
function createCheckoutOrigin(path: string) {
  const origin = OriginRepository.create(path)
  const branchPointSha = origin.commit("Add cart totals", {
    "src/cart/total.ts": [
      "export function cartTotal(prices: number[]): number {",
      "  return prices.reduce((sum, price) => sum + price, 0)",
      "}",
      "",
    ].join("\n"),
  })
  origin.switchTo("add-discounts", { create: true })
  const pullRequestSha = origin.commit("Add discountPercent to cartTotal", {
    "src/cart/total.ts": [
      "export function cartTotal(prices: number[], discountPercent = 0): number {",
      "  const sum = prices.reduce((total, price) => total + price, 0)",
      "  return Math.round(sum * (1 - discountPercent / 100))",
      "}",
      "",
    ].join("\n"),
    "src/cart/coupons.ts": 'export const WELCOME_COUPON = "WELCOME10"\n',
  })
  origin.publishPullRequest(482, pullRequestSha)
  origin.switchTo("main")
  origin.commit("Document shipping", { "docs/shipping.md": "Orders over 50 ship free.\n" })
  return { origin, branchPointSha, pullRequestSha }
}

type CheckoutOrigin = ReturnType<typeof createCheckoutOrigin>

describe("PullRequestService", () => {
  let workspace = ""
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "proofroom-pull-requests-"))
  })
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  // Runs a test against a fresh checkout origin, with a Proofroom home folder
  // of its own.
  function withCheckoutOrigin<A, E>(
    test: (fixture: CheckoutOrigin) => Effect.Effect<A, E, PullRequestService>,
  ) {
    const fixture = createCheckoutOrigin(join(workspace, "origin"))
    return test(fixture).pipe(
      Effect.provide(pullRequestLayer(join(workspace, "home"), fixture.origin)),
    )
  }

  it.effect(
    "pull request loaded -> its own changes since the branch point, not main's later ones",
    () =>
      withCheckoutOrigin(({ branchPointSha, pullRequestSha }) =>
        Effect.gen(function* () {
          const pullRequests = yield* PullRequestService

          const loaded = yield* pullRequests.load(pullRequestUrl)

          assert.deepStrictEqual(loaded.pullRequest, {
            owner: "acme",
            repo: "checkout",
            number: 482,
          })
          assert.strictEqual(loaded.title, "Add percentage discounts to cart totals")
          assert.deepStrictEqual(loaded.commitMessages, ["Add discountPercent to cartTotal"])
          assert.strictEqual(loaded.headSha, pullRequestSha)
          assert.strictEqual(loaded.mergeBaseSha, branchPointSha)
          assert.deepStrictEqual(
            loaded.hunks.map((hunk) => [hunk.path, hunk.fileStatus]),
            [
              ["src/cart/coupons.ts", "added"],
              ["src/cart/total.ts", "modified"],
            ],
          )
        }),
      ),
  )

  it.effect(
    "new commit pushed to the pull request -> next load fetches it into the same clone",
    () =>
      withCheckoutOrigin(({ origin }) =>
        Effect.gen(function* () {
          const pullRequests = yield* PullRequestService
          const firstLoad = yield* pullRequests.load(pullRequestUrl)

          origin.switchTo("add-discounts")
          const followUpSha = origin.commit("Cap discounts at 100%", {
            "src/cart/coupons.ts":
              'export const WELCOME_COUPON = "WELCOME10"\nexport const MAX_DISCOUNT_PERCENT = 100\n',
          })
          origin.publishPullRequest(482, followUpSha)
          const secondLoad = yield* pullRequests.load(pullRequestUrl)

          assert.strictEqual(secondLoad.repositoryPath, firstLoad.repositoryPath)
          assert.strictEqual(secondLoad.headSha, followUpSha)
          const couponLines = secondLoad.hunks
            .filter((hunk) => hunk.path === "src/cart/coupons.ts")
            .flatMap((hunk) => hunk.lines.map((line) => line.text))
          assert.include(couponLines, "export const MAX_DISCOUNT_PERCENT = 100")
        }),
      ),
  )

  it.effect("head checked out -> the pull request's files are there until the scope closes", () =>
    withCheckoutOrigin(() =>
      Effect.gen(function* () {
        const pullRequests = yield* PullRequestService
        const loaded = yield* pullRequests.load(pullRequestUrl)

        const worktreePath = yield* Effect.scoped(
          Effect.gen(function* () {
            const path = yield* pullRequests.checkOutHead(loaded)
            const coupons = readFileSync(join(path, "src/cart/coupons.ts"), "utf8")
            assert.strictEqual(coupons, 'export const WELCOME_COUPON = "WELCOME10"\n')
            return path
          }),
        )

        assert.isFalse(existsSync(worktreePath))
      }),
    ),
  )

  it.effect("not a pull request URL -> InvalidPullRequestUrl, before anything is cloned", () =>
    withCheckoutOrigin(() =>
      Effect.gen(function* () {
        const pullRequests = yield* PullRequestService
        const issueUrl = "https://github.com/acme/checkout/issues/482"

        const exit = yield* Effect.exit(pullRequests.load(issueUrl))

        assert.deepStrictEqual(
          exit,
          Exit.fail(
            new InvalidPullRequestUrl({
              message: `${issueUrl} is not a GitHub pull request URL. Expected https://github.com/owner/repo/pull/123.`,
            }),
          ),
        )
        assert.isFalse(existsSync(join(workspace, "home", "repos")))
      }),
    ),
  )
})
