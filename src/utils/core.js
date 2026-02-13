export function cap01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampToRange(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeRatio(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}

export function scoreFromRatio(ratio) {
  return clampToRange(Math.round(cap01(ratio) * 100), 0, 100);
}

export function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function daysSinceDate(value, nowMs = Date.now()) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((nowMs - date.getTime()) / 86400000);
}

export function formatCompactNumber(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

export function formatPercent(value) {
  return `${Math.round(cap01(value) * 100)}%`;
}

export function joinRepoNames(names) {
  if (!names.length) {
    return "target repositories";
  }
  return names.map((name) => `\`${name}\``).join(", ");
}

export function dedupe(items) {
  return items.filter((item, index) => items.indexOf(item) === index);
}

export function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function appendEmptyState(container, text) {
  const li = document.createElement("li");
  li.className = "empty-state";
  li.textContent = text;
  container.appendChild(li);
}

export function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function escapeMarkdown(text) {
  return String(text).replace(/[|]/g, "\\|");
}

export function getSeverity(score) {
  if (score >= 70) {
    return "good";
  }
  if (score >= 40) {
    return "warn";
  }
  return "risk";
}

export function severityToChipClass(severity) {
  if (severity === "good") {
    return "chip-good";
  }
  if (severity === "warn") {
    return "chip-warn";
  }
  return "chip-risk";
}

export function severityColor(severity) {
  if (severity === "good") {
    return getCssVar("--good");
  }
  if (severity === "warn") {
    return getCssVar("--warn");
  }
  return getCssVar("--risk");
}

export async function mapWithConcurrency(items, concurrency, worker) {
  if (!items.length) {
    return [];
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

  await Promise.all(workers);
  return results;
}
