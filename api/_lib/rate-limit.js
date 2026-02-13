import { getClientIp } from "./utils.js";

const memoryBuckets = new Map();

const DEFAULT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30);

export async function enforceRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();

  const windowMs = Number.isFinite(DEFAULT_WINDOW_MS) ? DEFAULT_WINDOW_MS : 60_000;
  const maxRequests = Number.isFinite(DEFAULT_MAX_REQUESTS) ? DEFAULT_MAX_REQUESTS : 30;

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      return await enforceKvRateLimit({ kvUrl, kvToken, ip, now, windowMs, maxRequests });
    } catch {
      // fall through to memory limiter
    }
  }

  return enforceMemoryRateLimit({ ip, now, windowMs, maxRequests });
}

async function enforceKvRateLimit({ kvUrl, kvToken, ip, now, windowMs, maxRequests }) {
  const windowId = Math.floor(now / windowMs);
  const key = `rl:${ip}:${windowId}`;
  const resetAt = new Date((windowId + 1) * windowMs).toISOString();

  const response = await fetch(`${kvUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, windowMs]
    ])
  });

  if (!response.ok) {
    throw new Error("KV rate limit request failed.");
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.result) ? payload.result : [];
  const first = results[0];
  const count = Number(first?.result ?? first ?? 0);

  return {
    allowed: count <= maxRequests,
    count,
    maxRequests,
    resetAt,
    source: "kv"
  };
}

function enforceMemoryRateLimit({ ip, now, windowMs, maxRequests }) {
  const bucket = memoryBuckets.get(ip);

  if (!bucket || now >= bucket.expiresAt) {
    const next = {
      count: 1,
      expiresAt: now + windowMs
    };
    memoryBuckets.set(ip, next);
    return {
      allowed: true,
      count: next.count,
      maxRequests,
      resetAt: new Date(next.expiresAt).toISOString(),
      source: "memory"
    };
  }

  bucket.count += 1;
  memoryBuckets.set(ip, bucket);

  return {
    allowed: bucket.count <= maxRequests,
    count: bucket.count,
    maxRequests,
    resetAt: new Date(bucket.expiresAt).toISOString(),
    source: "memory"
  };
}
