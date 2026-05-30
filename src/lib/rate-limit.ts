/**
 * Simple in-memory rate limiter for API routes.
 * Note: This is per-instance. For multi-instance deployments,
 * use Redis or a distributed rate limiter.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 10_000;

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: 60,
  windowMs: 60_000, // 1 minute
};

export const STRICT_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 60_000, // 1 minute
};

export const GENERATE_RATE_LIMIT: RateLimitConfig = {
  limit: 5,
  windowMs: 60_000, // 1 minute
};

export function rateLimit(
  ip: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

export function getClientIp(request: Request): string {
  // Check common headers for proxy/load balancer setups
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // Fallback for local development
  return "127.0.0.1";
}

export function withRateLimit<T>(
  handler: (request: Request, context: T) => Promise<Response>,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
) {
  return async (request: Request, context: T): Promise<Response> => {
    const ip = getClientIp(request);
    const { allowed, remaining, resetAt } = rateLimit(ip, config);
    
    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      return Response.json(
        { error: "Too many requests. Please try again later.", retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": resetAt.toString(),
          },
        }
      );
    }
    
    const response = await handler(request, context);
    
    // Add rate limit headers to response
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-RateLimit-Remaining", remaining.toString());
    newHeaders.set("X-RateLimit-Reset", resetAt.toString());
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

// Cleanup expired entries and enforce max map size (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipMap.entries()) {
      if (now > entry.resetAt) {
        ipMap.delete(ip);
      }
    }
    // If still over cap after expiry cleanup, evict oldest entries
    if (ipMap.size > MAX_ENTRIES) {
      const excess = ipMap.size - MAX_ENTRIES;
      const iter = ipMap.keys();
      for (let i = 0; i < excess; i++) {
        const oldest = iter.next().value;
        if (oldest !== undefined) ipMap.delete(oldest);
      }
    }
  }, 5 * 60 * 1000);
}
