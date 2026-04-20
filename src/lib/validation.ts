/**
 * Input validation helpers for API routes.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateUrl(url: string): void {
  if (!url) {
    throw new ValidationError("URL is required");
  }
  try {
    new URL(url);
  } catch {
    throw new ValidationError("Invalid URL format");
  }
}

export function validateToken(token: string): void {
  if (!token) {
    throw new ValidationError("Token is required");
  }
  if (token.length < 10) {
    throw new ValidationError("Token appears invalid (too short)");
  }
}

export function validateSchemaFqn(fqn: string): void {
  if (!fqn) {
    throw new ValidationError("Schema FQN is required");
  }
  if (!fqn.includes(".")) {
    throw new ValidationError("Schema FQN must be in format: database.schema");
  }
}

export function validateDbtConfig(config: { accountId: string; projectId: string; token: string }): void {
  if (!config.accountId) {
    throw new ValidationError("dbt Cloud Account ID is required");
  }
  if (!config.projectId) {
    throw new ValidationError("dbt Cloud Project ID is required");
  }
  if (!config.token) {
    throw new ValidationError("dbt Cloud API token is required");
  }
}

export function validateManifestPath(path: string): void {
  if (!path) {
    throw new ValidationError("Manifest path is required");
  }
  if (!path.endsWith(".json")) {
    throw new ValidationError("Manifest path must point to a .json file");
  }
}

/**
 * Validate API secret for mutation endpoints.
 * Skipped if DATABARD_API_SECRET is not configured (open access).
 */
export function validateApiSecret(req: { headers: { get(name: string): string | null } }): void {
  const secret = process.env.DATABARD_API_SECRET;
  if (!secret) return;
  const provided = req.headers.get("x-api-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (provided !== secret) {
    throw new ValidationError("Unauthorized — invalid or missing API secret");
  }
}

/**
 * Simple in-memory rate limiter by IP.
 * Limits synthesis calls to prevent credit burn.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  req: { headers: { get(name: string): string | null } },
  { maxRequests = 5, windowMs = 3600000 } = {}
): void {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    throw new ValidationError(`Rate limit exceeded — max ${maxRequests} episodes per hour. Try again later.`);
  }
}
