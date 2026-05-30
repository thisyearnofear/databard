import { test, expect } from "@playwright/test";

test.describe("API Routes", () => {
  test.describe("Rate Limiting", () => {
    test("should return 429 after exceeding generation rate limit", async ({ request }) => {
      // The GENERATE_RATE_LIMIT is 5 requests per minute.
      // Send 10 rapid requests; the 6th should be rejected.
      let hitRateLimit = false;

      for (let i = 0; i < 10; i++) {
        const response = await request.post("/api/synthesize", {
          data: { schemaFqn: "test.schema", source: "openmetadata" },
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
      });

      expect([400, 422]).toContain(response.status());
    });

    test("should reject empty schemaFqn in /api/synthesize", async ({ request }) => {
      const response = await request.post("/api/synthesize", {
        data: { schemaFqn: "", source: "openmetadata" },
      });

      expect([400, 422]).toContain(response.status());
    });
  });

  test.describe("Error Format", () => {
    test("should return JSON error with error field", async ({ request }) => {
      const response = await request.post("/api/connect", {
        data: { source: "non-existent-source" },
      });

      expect(response.headers()["content-type"]).toContain("application/json");

      const body = await response.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });
});
