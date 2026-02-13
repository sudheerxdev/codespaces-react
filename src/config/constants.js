export const CACHE_TTL_MS = 10 * 60 * 1000;
export const HISTORY_LIMIT = 8;
export const ANALYZE_ENDPOINT = "/api/analyze";

export const STORAGE_KEYS = Object.freeze({
  history: "devdetective_history",
  theme: "devdetective_theme"
});

export const CACHE_PREFIX = "devdetective_cache_v4_";

export const WEIGHTS = Object.freeze({
  documentationQuality: 18,
  codeActivityConsistency: 17,
  projectPopularity: 15,
  repositoryCompleteness: 14,
  languageDiversity: 10,
  recentActivity: 14,
  impactSignals: 12
});

export const SUBSCORE_ID_MAP = Object.freeze({
  documentationQuality: "subDocumentationQuality",
  codeActivityConsistency: "subCodeActivityConsistency",
  projectPopularity: "subProjectPopularity",
  repositoryCompleteness: "subRepositoryCompleteness",
  languageDiversity: "subLanguageDiversity",
  recentActivity: "subRecentActivity",
  impactSignals: "subImpactSignals"
});

export const SCORING_EXPLAIN_ID_MAP = Object.freeze({
  documentationQuality: "explainDocumentationQuality",
  codeActivityConsistency: "explainCodeActivityConsistency",
  projectPopularity: "explainProjectPopularity",
  repositoryCompleteness: "explainRepositoryCompleteness",
  languageDiversity: "explainLanguageDiversity",
  recentActivity: "explainRecentActivity",
  impactSignals: "explainImpactSignals"
});

export function getNamedSubscore(key) {
  const labels = {
    documentationQuality: "Documentation Quality",
    codeActivityConsistency: "Code Activity / Consistency",
    projectPopularity: "Project Popularity",
    repositoryCompleteness: "Repository Completeness",
    languageDiversity: "Language Diversity",
    recentActivity: "Recent Activity",
    impactSignals: "Impact Signals"
  };

  return labels[key] || key;
}
