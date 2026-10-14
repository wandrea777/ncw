import { describe, expect, it } from "vitest";
import { isStripeRedirect } from "../src/lib/api";

describe("doorsturen naar Stripe", () => {
  it("staat alleen https naar de exacte Stripe-host toe", () => {
    expect(isStripeRedirect("https://checkout.stripe.com/c/pay/cs_test_123", "checkout.stripe.com")).toBe(true);
    expect(isStripeRedirect("https://billing.stripe.com/p/session/test_123", "billing.stripe.com")).toBe(true);
    for (const bad of [
      "http://checkout.stripe.com/c/pay/x",
      "https://checkout.stripe.com.evil.example/c/pay/x",
      "https://evil.example/checkout.stripe.com",
      "https://user:pw@checkout.stripe.com/x",
      "https://checkout.stripe.com:8443/x",
      "javascript:alert(1)",
      "https://billing.stripe.com/p/session/x",
      "geen url",
    ]) {
      expect(isStripeRedirect(bad, "checkout.stripe.com"), bad).toBe(false);
    }
  });
});
