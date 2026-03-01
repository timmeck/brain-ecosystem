// ── Rate Limiter ────────────────────────────────────────

export interface RateLimitConfig {
  windowMs?: number;        // time window in ms, default 60000 (1 min)
  maxRequests?: number;     // max requests per window, default 100
  keyExtractor?: (req: { socket: { remoteAddress?: string } }) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxRequests: number;
  private keyExtractor: (req: { socket: { remoteAddress?: string } }) => string;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config?: RateLimitConfig) {
    this.windowMs = config?.windowMs ?? 60_000;
    this.maxRequests = config?.maxRequests ?? 100;
    this.keyExtractor = config?.keyExtractor ?? ((req) => req.socket.remoteAddress ?? 'unknown');
    // Cleanup expired entries every minute
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Check if a request is allowed. Returns { allowed, remaining, resetAt }.
   */
  check(req: { socket: { remoteAddress?: string } }): { allowed: boolean; remaining: number; resetAt: number } {
    const key = this.keyExtractor(req);
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: now + this.windowMs };
    }

    entry.count++;
    if (entry.count > this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: this.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  /** Reset a specific key (for testing) */
  reset(key: string): void {
    this.store.delete(key);
  }

  /** Clear all entries */
  clear(): void {
    this.store.clear();
  }

  /** Stop cleanup timer */
  stop(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// ── Request Size Limiter ────────────────────────────────

export interface SizeLimitConfig {
  maxBodyBytes?: number;  // default 102400 (100KB)
}

/**
 * Read request body with size limit enforcement.
 * Returns the body string or null if the limit is exceeded.
 */
export function readBodyWithLimit(
  req: import('node:http').IncomingMessage,
  config?: SizeLimitConfig,
): Promise<{ body: string; error?: undefined } | { body?: undefined; error: string }> {
  const maxBytes = config?.maxBodyBytes ?? 102_400;

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        aborted = true;
        req.destroy();
        resolve({ error: `Request body exceeds limit of ${maxBytes} bytes` });
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      resolve({ body: Buffer.concat(chunks).toString('utf8') });
    });

    req.on('error', () => {
      if (aborted) return;
      resolve({ error: 'Request read error' });
    });
  });
}

// ── Security Headers ────────────────────────────────────

export interface SecurityHeadersConfig {
  cors?: {
    origins?: string[];      // allowed origins, default ['*']
    methods?: string[];      // default ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    headers?: string[];      // default ['Content-Type', 'Authorization', 'X-API-Key']
  };
  hsts?: boolean;            // Strict-Transport-Security, default false (enable in production with HTTPS)
}

/**
 * Apply security headers to an HTTP response.
 */
export function applySecurityHeaders(
  res: import('node:http').ServerResponse,
  config?: SecurityHeadersConfig,
): void {
  // CORS
  const origins = config?.cors?.origins ?? ['*'];
  const methods = config?.cors?.methods ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const headers = config?.cors?.headers ?? ['Content-Type', 'Authorization', 'X-API-Key'];

  res.setHeader('Access-Control-Allow-Origin', origins.join(', '));
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', headers.join(', '));

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (only when explicitly enabled — requires HTTPS)
  if (config?.hsts) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}
