import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function getApiSecret() {
  if (process.env.DATABARD_API_SECRET) return process.env.DATABARD_API_SECRET;
  try {
    const env = readFileSync(resolve(".env"), "utf-8");
    const match = env.match(/^DATABARD_API_SECRET=(.+)$/m);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

const API_SECRET = getApiSecret();
const synthesizeHeaders = (ip: string) => {
  const headers: Record<string, string> = { "X-Forwarded-For": ip };
  if (API_SECRET) headers["X-Api-Secret"] = API_SECRET;
  return headers;
};

test.describe("API Routes", () => {
  test.describe("Rate Limiting", () => {
    test("should return 429 after exceeding generation rate limit", async ({ request }) => {
      // The GENERATE_RATE_LIMIT is 5 requests per minute.
      // Send 10 rapid requests; the 6th should be rejected.
      let hitRateLimit = false;

      for (let i = 0; i < 10; i++) {
        const response = await request.post("/api/synthesize", {
          data: { schemaFqn: "test.schema", source: "openmetadata" },
          headers: synthesizeHeaders("rate-limit-test"),
        });

        if (response.status() === 429) {
          hitRateLimit = true;
          // Verify the response includes proper rate limit headers
          const body = await response.json();
          expect(body.error).toContain("Too many");
          expect(response.headers()["retry-after"]).toBeDefined();
          break;
        }
      }

      expect(hitRateLimit).toBe(true);
    });

    test("should include rate limit headers on successful requests", async ({ request }) => {
      const response = await request.post("/api/connect", {
        data: { source: "openmetadata", url: "http://localhost:8585", token: "test" },
        headers: { "X-Forwarded-For": "rate-limit-headers-test" },
      });

      // Regardless of success/failure, rate limit headers should be present
      const remaining = response.headers()["x-ratelimit-remaining"];
      const reset = response.headers()["x-ratelimit-reset"];
      expect(remaining).toBeDefined();
      expect(reset).toBeDefined();
    });
  });

  test.describe("Validation", () => {
    test("should reject invalid source in /api/connect", async ({ request }) => {
      const response = await request.post("/api/connect", {
        data: { source: "invalid-source" },
        headers: { "X-Forwarded-For": "invalid-source-test" },
      });

      expect([400, 422]).toContain(response.status());
    });

    test("should reject empty schemaFqn in /api/synthesize", async ({ request }) => {
      const response = await request.post("/api/synthesize", {
        data: { schemaFqn: "", source: "openmetadata" },
        headers: synthesizeHeaders("empty-schema-test"),
      });

      expect([400, 422]).toContain(response.status());
    });
  });

  test.describe("Error Format", () => {
    test("should return JSON error with error field", async ({ request }) => {
      const response = await request.post("/api/connect", {
        data: { source: "non-existent-source" },
        headers: { "X-Forwarded-For": "error-format-test" },
      });

      expect(response.headers()["content-type"]).toContain("application/json");

      const body = await response.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });
});
