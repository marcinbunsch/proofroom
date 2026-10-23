// A diff touching every kind of file change: a file modified in two places,
// an added file, a deleted file, a rename with an edit, and a path with a
// space and no newline at the end.
//
// Written the way Proofroom's own `git diff` call prints it: a/ b/ prefixes,
// rename detection, three lines of context.
export const checkoutDiff = `diff --git a/src/cart/total.ts b/src/cart/total.ts
index 3f1c2aa..8b0d9e1 100644
--- a/src/cart/total.ts
+++ b/src/cart/total.ts
@@ -1,6 +1,7 @@
 import type { LineItem } from "./line-item.ts"
 
-export function cartTotal(items: LineItem[]): number {
+export function cartTotal(items: LineItem[], discountPercent = 0): number {
   let sum = 0
   for (const item of items) sum += item.priceCents * item.quantity
-  return sum
+  const discounted = sum * (1 - discountPercent / 100)
+  return Math.round(discounted)
 }
@@ -20,3 +21,4 @@ export function formatTotal(cents: number): string {
   return (cents / 100).toFixed(2)
 }
+export const FREE_SHIPPING_THRESHOLD_CENTS = 50_00
diff --git a/src/cart/coupons.ts b/src/cart/coupons.ts
new file mode 100644
index 0000000..c4a71f0
--- /dev/null
+++ b/src/cart/coupons.ts
@@ -0,0 +1,2 @@
+export const WELCOME_COUPON = "WELCOME10"
+export const WELCOME_DISCOUNT_PERCENT = 10
diff --git a/src/legacy/price.ts b/src/legacy/price.ts
deleted file mode 100644
index 77aa001..0000000
--- a/src/legacy/price.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const legacyPrice = (cents: number) => cents / 100
diff --git a/src/checkout/summary.ts b/src/checkout/order-summary.ts
similarity index 91%
rename from src/checkout/summary.ts
rename to src/checkout/order-summary.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/checkout/summary.ts
+++ b/src/checkout/order-summary.ts
@@ -2,2 +2,2 @@ import { cartTotal } from "../cart/total.ts"
-export const summaryTitle = "Summary"
+export const summaryTitle = "Order summary"
 export const showTaxes = true
diff --git a/docs/checkout flow.md b/docs/checkout flow.md
index 0a1b2c3..4d5e6f7 100644
--- a/docs/checkout flow.md
+++ b/docs/checkout flow.md
@@ -1 +1 @@
-Checkout has three steps.
+Checkout has four steps.
\\ No newline at end of file
`
