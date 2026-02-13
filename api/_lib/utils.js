export function mapWithConcurrency(items, concurrency, worker) {
  if (!items.length) {
    return Promise.resolve([]);
  }

  const results = new Array(items.length);
  let currentIndex = 0;

  const runner = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await worker(items[index], index);
    }
  };

  const workers = [];
  const count = Math.min(concurrency, items.length);
  for (let i = 0; i < count; i += 1) {
    workers.push(runner());
  }

  return Promise.all(workers).then(() => results);
}

export function withTimeout(signal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return "unknown";
}
