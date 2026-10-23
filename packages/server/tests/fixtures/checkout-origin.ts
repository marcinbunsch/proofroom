import { Effect, Layer } from "effect"
import { GitHubService, type PullRequestDetails } from "../../src/pull-requests/GitHubService.ts"
import { OriginRepository } from "./OriginRepository.ts"

// Pull request 482 on acme/checkout: the fixture most tests share. It adds a
// discount to cart totals and a first coupon code.

export const pullRequestUrl = "https://github.com/acme/checkout/pull/482"

export const discountDetails: PullRequestDetails = {
  title: "Add percentage discounts to cart totals",
  body: "Lets checkout apply a coupon's percentage to the cart total.",
  baseRefName: "main",
  commits: [{ messageHeadline: "Add discountPercent to cartTotal", messageBody: "" }],
}

// GitHubService is the one part that talks to the network, so tests replace it.
export const fakeGitHub = Layer.succeed(
  GitHubService,
  GitHubService.of({ fetchPullRequest: () => Effect.succeed(discountDetails) }),
)

// The repository as GitHub would hold it for pull request 482:
//
//   main:          "Add cart totals" ── "Document shipping"
//                          \
//   add-discounts:          "Add discountPercent to cartTotal"   (refs/pull/482/head)
//
// "Document shipping" landed on main after the branch was cut, so it must not
// show up in the pull request's diff.
export function createCheckoutOrigin(path: string) {
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

export type CheckoutOrigin = ReturnType<typeof createCheckoutOrigin>
