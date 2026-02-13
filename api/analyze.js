import { enforceRateLimit } from "./_lib/rate-limit.js";
import { GitHubError, parseProfileInput, runAnalysisPipeline } from "./_lib/github.js";

export const config = {
  runtime: "nodejs"
};

const ANALYSIS_CACHE_TTL_MS = Number(process.env.ANALYSIS_CACHE_TTL_MS || 300_000);

const analysisCache = new Map();
const inflight = new Map();

export default async function handler(req, res) {
  setBaseHeaders(res);

  if (req.method !== "GET") {
    return sendJson(res, 405, {
      ok: false,
      error: {
        type: "MethodNotAllowed",
        message: "Only GET is supported."
      }
    });
  }

  const rate = await enforceRateLimit(req);
  res.setHeader("X-RateLimit-Limit", String(rate.maxRequests));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, rate.maxRequests - rate.count)));
  res.setHeader("X-RateLimit-Reset-At", rate.resetAt);

  if (!rate.allowed) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((new Date(rate.resetAt).getTime() - Date.now()) / 1000))));
    return sendJson(res, 429, {
      ok: false,
      error: {
        type: "RateLimited",
        message: "Too many requests. Please retry later.",
        resetAt: rate.resetAt
      }
    });
  }

  const rawInput = normalizeQueryValue(req.query?.username);
  const parsed = parseProfileInput(rawInput);

  if (!parsed.ok) {
    return sendJson(res, 400, {
      ok: false,
      error: {
        type: "Validation",
        message: parsed.error
      }
    });
  }

  const username = parsed.username;
  const cacheKey = username.toLowerCase();

  const cached = getAnalysisCache(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return sendJson(res, 200, { ok: true, data: cached });
  }

  const running = inflight.get(cacheKey);
  if (running) {
    try {
      const data = await running;
      res.setHeader("X-Cache", "INFLIGHT");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
      return sendJson(res, 200, { ok: true, data });
    } catch (error) {
      return handleError(error, res);
    }
  }

  const token = process.env.GITHUB_TOKEN || "";

  const runPromise = runAnalysisPipeline(username, token)
    .then((analysis) => {
      setAnalysisCache(cacheKey, analysis);
      return analysis;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, runPromise);

  try {
    const data = await runPromise;
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return sendJson(res, 200, { ok: true, data });
  } catch (error) {
    return handleError(error, res);
  }
}

function handleError(error, res) {
  if (error instanceof GitHubError) {
    if (error.type === "NotFound") {
      return sendJson(res, 404, {
        ok: false,
        error: {
          type: "NotFound",
          message: "GitHub profile not found."
        }
      });
    }

    if (error.type === "RateLimited") {
      const resetAt = error.details?.resetAt || null;
      if (resetAt) {
        res.setHeader("X-RateLimit-Reset-At", resetAt);
      }

      return sendJson(res, 429, {
        ok: false,
        error: {
          type: "RateLimited",
          message: "GitHub upstream API rate limit reached. Retry shortly.",
          resetAt
        }
      });
    }

    if (error.type === "Unauthorized") {
      return sendJson(res, 503, {
        ok: false,
        error: {
          type: "Unauthorized",
          message: "Server GitHub token is invalid or missing in deployment configuration."
        }
      });
    }

    if (error.type === "Network") {
      return sendJson(res, 502, {
        ok: false,
        error: {
          type: "Network",
          message: "Network error while fetching GitHub data."
        }
      });
    }

    return sendJson(res, 502, {
      ok: false,
      error: {
        type: "Upstream",
        message: error.message || "GitHub API request failed."
      }
    });
  }

  return sendJson(res, 500, {
    ok: false,
    error: {
      type: "Internal",
      message: "Unexpected server error while analyzing profile."
    }
  });
}

function setBaseHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function normalizeQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function getAnalysisCache(key) {
  const hit = analysisCache.get(key);
  if (!hit) {
    return null;
  }

  if (Date.now() > hit.expiresAt) {
    analysisCache.delete(key);
    return null;
  }

  return hit.value;
}

function setAnalysisCache(key, value) {
  analysisCache.set(key, {
    value,
    expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS
  });

  if (analysisCache.size > 300) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) {
      analysisCache.delete(oldestKey);
    }
  }
}
