/*
 * SettleMate AI — In-Memory Token Bucket Rate Limiter
 */

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface ClientRecord {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private clients = new Map<string, ClientRecord>();

  constructor(private readonly options: RateLimitOptions = { windowMs: 60_000, maxRequests: 60 }) {}

  /**
   * Check if a client IP/token is rate-limited.
   * Returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(clientId: string, now: number = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    let record = this.clients.get(clientId);

    if (!record || record.resetAt <= now) {
      record = {
        count: 1,
        resetAt: now + this.options.windowMs,
      };
      this.clients.set(clientId, record);
      return { allowed: true, remaining: this.options.maxRequests - 1, resetAt: record.resetAt };
    }

    if (record.count >= this.options.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count++;
    return {
      allowed: true,
      remaining: this.options.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  reset(clientId: string): void {
    this.clients.delete(clientId);
  }

  clear(): void {
    this.clients.clear();
  }
}

export const authRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });
export const apiRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 120 });
