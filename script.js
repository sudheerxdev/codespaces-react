const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

const MAX_REPO_PAGES = 3;
const MAX_DEEP_REPOS = 30;
const CONCURRENCY_LIMIT = 5;
const CACHE_TTL_MS = 10 * 60 * 1000;
const HISTORY_LIMIT = 8;

const STORAGE_KEYS = Object.freeze({
    history: "devdetective_history",
    theme: "devdetective_theme",
    token: "devdetective_token"
});

const CACHE_PREFIX = "devdetective_cache_v2_";

const WEIGHTS = Object.freeze({
    documentationQuality: 18,
    codeActivityConsistency: 17,
    projectPopularity: 15,
    repositoryCompleteness: 14,
    languageDiversity: 10,
    recentActivity: 14,
    impactSignals: 12
});

const SUBSCORE_ID_MAP = Object.freeze({
    documentationQuality: "subDocumentationQuality",
    codeActivityConsistency: "subCodeActivityConsistency",
    projectPopularity: "subProjectPopularity",
    repositoryCompleteness: "subRepositoryCompleteness",
    languageDiversity: "subLanguageDiversity",
    recentActivity: "subRecentActivity",
    impactSignals: "subImpactSignals"
});

const SCORING_EXPLAIN_ID_MAP = Object.freeze({
    documentationQuality: "explainDocumentationQuality",
    codeActivityConsistency: "explainCodeActivityConsistency",
    projectPopularity: "explainProjectPopularity",
    repositoryCompleteness: "explainRepositoryCompleteness",
    languageDiversity: "explainLanguageDiversity",
    recentActivity: "explainRecentActivity",
    impactSignals: "explainImpactSignals"
});

const state = {
    currentUsername: "",
    token: "",
    analysisResult: null,
    abortController: null,
    charts: {
        language: null,
        importance: null,
        subscoreRadar: null,
        activity: null
    },
    history: readJsonStorage(STORAGE_KEYS.history, [])
};

const ui = {
    profileInput: document.getElementById("profileInput"),
    tokenInput: document.getElementById("tokenInput"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    downloadReportBtn: document.getElementById("downloadReportBtn"),

    loadingState: document.getElementById("loadingState"),
    loadingText: document.getElementById("loadingText"),
    errorBanner: document.getElementById("errorBanner"),
    rateLimitBanner: document.getElementById("rateLimitBanner"),

    avatarImg: document.getElementById("avatarImg"),
    profileName: document.getElementById("profileName"),
    profileHandle: document.getElementById("profileHandle"),
    profileLink: document.getElementById("profileLink"),
    profileBio: document.getElementById("profileBio"),

    statRepos: document.getElementById("statRepos"),
    statFollowers: document.getElementById("statFollowers"),
    statFollowing: document.getElementById("statFollowing"),
    statLastPush: document.getElementById("statLastPush"),
    statPrCount: document.getElementById("statPrCount"),
    statIssueCount: document.getElementById("statIssueCount"),

    pinnedSourceBadge: document.getElementById("pinnedSourceBadge"),
    pinnedReposList: document.getElementById("pinnedReposList"),
    historyList: document.getElementById("historyList"),

    overallScoreRing: document.getElementById("overallScoreRing"),
    overallScore: document.getElementById("overallScore"),
    scoreGrade: document.getElementById("scoreGrade"),
    scoreSummary: document.getElementById("scoreSummary"),
    hireabilityScore: document.getElementById("hireabilityScore"),
    hireabilityHint: document.getElementById("hireabilityHint"),
    readinessLevel: document.getElementById("readinessLevel"),
    readinessHint: document.getElementById("readinessHint"),
    readinessBar: document.getElementById("readinessBar"),

    strengthsList: document.getElementById("strengthsList"),
    redFlagsList: document.getElementById("redFlagsList"),
    suggestionsList: document.getElementById("suggestionsList"),
    hiddenRisksList: document.getElementById("hiddenRisksList"),
    aiRecruiterVerdict: document.getElementById("aiRecruiterVerdict"),
    aiRecruiterSummary: document.getElementById("aiRecruiterSummary"),
    aiRecruiterSignals: document.getElementById("aiRecruiterSignals"),
    careerPathTitle: document.getElementById("careerPathTitle"),
    careerPathSummary: document.getElementById("careerPathSummary"),
    careerConfidence: document.getElementById("careerConfidence"),
    careerSkillsList: document.getElementById("careerSkillsList"),
    roadmapList: document.getElementById("roadmapList"),

    repoRankingTable: document.getElementById("repoRankingTable"),

    languageChart: document.getElementById("languageChart"),
    importanceChart: document.getElementById("importanceChart"),
    subscoreRadarChart: document.getElementById("subscoreRadarChart"),
    activityChart: document.getElementById("activityChart")
};

class GitHubError extends Error {
    constructor(type, message, details = {}) {
        super(message);
        this.name = "GitHubError";
        this.type = type;
        this.details = details;
    }
}

init();

function init() {
    bindEvents();

    state.token = localStorage.getItem(STORAGE_KEYS.token) || "";
    ui.tokenInput.value = state.token;

    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
    applyTheme(savedTheme);

    renderHistory();
    renderPinnedRepos({ source: "fallback", items: [] });

    renderInsightList(ui.strengthsList, ["No profile analyzed yet."], "neutral");
    renderInsightList(ui.redFlagsList, ["No profile analyzed yet."], "neutral");
    renderInsightList(ui.suggestionsList, ["No profile analyzed yet."], "neutral");
    renderInsightList(ui.hiddenRisksList, ["No hidden risk analysis yet."], "neutral");
    renderInsightList(ui.aiRecruiterSignals, ["Run an analysis to simulate recruiter feedback."], "neutral");
    renderRoadmap(["Roadmap will appear after analysis."]);
    renderCareerPath({
        title: "Run an analysis to generate role fit",
        confidence: 0,
        summary: "Career path recommendations are generated from your public GitHub portfolio signals.",
        nextSkills: ["Add repositories and analyze profile to unlock recommendations."]
    });
    ui.aiRecruiterVerdict.textContent = "Pending";
    ui.aiRecruiterVerdict.className = "chip chip-neutral";
    ui.aiRecruiterSummary.textContent = "Run an analysis to get recruiter-style interview feedback simulation.";
    ui.hireabilityScore.textContent = "--";
    ui.hireabilityHint.textContent = "Weighted recruiter-fit index";
    ui.readinessLevel.textContent = "--";
    ui.readinessHint.textContent = "Analyze a profile to classify readiness";
    ui.readinessBar.style.width = "0%";

    if (state.history[0]) {
        ui.profileInput.value = state.history[0];
    }
}

function bindEvents() {
    ui.analyzeBtn.addEventListener("click", handleAnalyze);

    ui.profileInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            handleAnalyze();
        }
    });

    ui.themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);

        if (state.analysisResult) {
            renderCharts(state.analysisResult);
        }
    });

    ui.downloadReportBtn.addEventListener("click", downloadMarkdownReport);

    const persistToken = () => {
        state.token = ui.tokenInput.value.trim();
        if (state.token) {
            localStorage.setItem(STORAGE_KEYS.token, state.token);
        } else {
            localStorage.removeItem(STORAGE_KEYS.token);
        }
    };

    ui.tokenInput.addEventListener("change", persistToken);
    ui.tokenInput.addEventListener("blur", persistToken);
}

async function handleAnalyze() {
    clearBanners();

    const parsed = parseProfileInput(ui.profileInput.value);
    if (!parsed.ok) {
        showError(parsed.error);
        return;
    }

    const username = parsed.username;
    state.currentUsername = username;
    ui.profileInput.value = username;

    state.token = ui.tokenInput.value.trim();
    if (state.token) {
        localStorage.setItem(STORAGE_KEYS.token, state.token);
    } else {
        localStorage.removeItem(STORAGE_KEYS.token);
    }

    if (state.abortController) {
        state.abortController.abort();
    }

    const controller = new AbortController();
    state.abortController = controller;

    setLoading(true, "Preparing analysis...");

    try {
        let analysis = getCachedAnalysis(username, Boolean(state.token));

        if (analysis) {
            setLoading(true, "Loaded cached analysis from the last 10 minutes...");
        } else {
            analysis = await runAnalysisPipeline(username, state.token, controller.signal);
            setCachedAnalysis(username, Boolean(state.token), analysis);
        }

        if (controller.signal.aborted) {
            return;
        }

        state.analysisResult = analysis;
        ui.downloadReportBtn.disabled = false;

        saveHistory(username);
        renderHistory();
        renderAnalysis(analysis);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        if (error instanceof GitHubError && error.type === "Unauthorized" && state.token) {
            showError("Token appears invalid. Retrying once without token.");
            try {
                const fallbackAnalysis = await runAnalysisPipeline(username, "", controller.signal);
                if (controller.signal.aborted) {
                    return;
                }

                state.analysisResult = fallbackAnalysis;
                ui.downloadReportBtn.disabled = false;

                saveHistory(username);
                renderHistory();
                renderAnalysis(fallbackAnalysis);
            } catch (fallbackError) {
                if (fallbackError.name !== "AbortError") {
                    handleAnalysisError(fallbackError);
                }
            }
        } else {
            handleAnalysisError(error);
        }
    } finally {
        if (state.abortController === controller) {
            state.abortController = null;
        }
        setLoading(false);
    }
}

function handleAnalysisError(error) {
    if (!(error instanceof GitHubError)) {
        showError("Unexpected error while analyzing the profile.");
        return;
    }

    if (error.type === "NotFound") {
        showError("Profile not found. Enter a valid GitHub username or GitHub profile URL.");
        return;
    }

    if (error.type === "RateLimited") {
        showError("GitHub API rate limit reached.");
        showRateLimit(error.details.resetAt || null);
        return;
    }

    if (error.type === "Unauthorized") {
        showError("GitHub token is invalid or expired. Update or clear the token and retry.");
        return;
    }

    if (error.type === "Network") {
        showError("Network issue while contacting GitHub. Please retry.");
        return;
    }

    showError(error.message || "GitHub API request failed.");
}

function parseProfileInput(rawInput) {
    const value = (rawInput || "").trim();

    if (!value) {
        return { ok: false, error: "Enter a GitHub username or profile URL to analyze." };
    }

    let candidate = value;

    if (/github\.com\//i.test(candidate) && !/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    if (/^https?:\/\//i.test(candidate)) {
        try {
            const url = new URL(candidate);
            const host = url.hostname.toLowerCase();
            if (host !== "github.com" && host !== "www.github.com") {
                return { ok: false, error: "URL must be a valid github.com profile URL." };
            }

            const segments = url.pathname.split("/").filter(Boolean);
            if (!segments.length) {
                return { ok: false, error: "GitHub URL is missing a username." };
            }

            candidate = segments[0];
        } catch {
            return { ok: false, error: "Invalid URL format. Use a username or a github.com profile URL." };
        }
    }

    candidate = candidate.replace(/^@+/, "").trim();

    if (candidate.endsWith(".git")) {
        candidate = candidate.slice(0, -4);
    }

    const isValid = /^[A-Za-z0-9-]{1,39}$/.test(candidate) && !candidate.startsWith("-") && !candidate.endsWith("-");

    if (!isValid) {
        return { ok: false, error: "Invalid GitHub username format." };
    }

    return { ok: true, username: candidate.toLowerCase() };
}

async function runAnalysisPipeline(username, token, signal) {
    setLoading(true, "Fetching profile...");
    const profileResponse = await githubRequest(`/users/${encodeURIComponent(username)}`, { token, signal });
    const profile = profileResponse.data;

    setLoading(true, "Fetching public repositories...");
    const allRepos = await fetchAllRepositories(profile.login, token, signal);
    const scorableRepos = allRepos.filter((repo) => !repo.fork);

    setLoading(true, "Collecting repository language and README data...");
    const deepEnrichment = await enrichTopRepositories(profile.login, scorableRepos, token, signal);
    const deepMap = new Map(deepEnrichment.items.map((item) => [item.id, item]));

    const enrichedScorableRepos = scorableRepos.map((repo) => {
        const extra = deepMap.get(repo.id);
        return {
            ...repo,
            _languageBytes: extra ? extra.languageBytes : null,
            _languageChecked: extra ? extra.languageChecked : false,
            _hasReadme: extra ? extra.hasReadme : null,
            _readmeChecked: extra ? extra.readmeChecked : false
        };
    });

    setLoading(true, "Fetching issue and PR contribution counts...");
    const contributions = await fetchContributionSignals(profile.login, token, signal);

    setLoading(true, "Checking pinned repositories...");
    const pinnedFromGraphql = token ? await fetchPinnedRepositories(profile.login, token, signal) : null;

    setLoading(true, "Calculating recruiter score and insights...");
    return buildAnalysisResult({
        profile,
        scorableRepos: enrichedScorableRepos,
        contributions,
        partial: deepEnrichment.partial,
        pinnedFromGraphql
    });
}

async function fetchAllRepositories(username, token, signal) {
    const repos = [];

    for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
        const path = `/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=100&page=${page}`;
        const response = await githubRequest(path, { token, signal });
        const data = Array.isArray(response.data) ? response.data : [];

        repos.push(...data);

        if (data.length < 100) {
            break;
        }
    }

    return repos;
}

async function enrichTopRepositories(owner, scorableRepos, token, signal) {
    const candidates = [...scorableRepos]
        .sort((a, b) => preRankImportanceScore(b) - preRankImportanceScore(a))
        .slice(0, MAX_DEEP_REPOS);

    const partial = {
        deepRepoCount: candidates.length,
        languageChecked: 0,
        readmeChecked: 0,
        languageFailures: 0,
        readmeFailures: 0
    };

    const items = await mapWithConcurrency(candidates, CONCURRENCY_LIMIT, async (repo) => {
        return fetchRepoDeepMeta(owner, repo, token, signal, partial);
    });

    return { items, partial };
}

async function fetchRepoDeepMeta(owner, repo, token, signal, partial) {
    const details = {
        id: repo.id,
        languageBytes: null,
        languageChecked: false,
        hasReadme: null,
        readmeChecked: false
    };

    try {
        const languagesResponse = await githubRequest(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}/languages`,
            { token, signal }
        );
        details.languageBytes = languagesResponse.data && typeof languagesResponse.data === "object" ? languagesResponse.data : {};
        details.languageChecked = true;
        partial.languageChecked += 1;
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }
        partial.languageFailures += 1;
    }

    try {
        await githubRequest(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}/readme`,
            { token, signal }
        );
        details.hasReadme = true;
        details.readmeChecked = true;
        partial.readmeChecked += 1;
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }

        if (error instanceof GitHubError && error.type === "NotFound") {
            details.hasReadme = false;
            details.readmeChecked = true;
            partial.readmeChecked += 1;
        } else {
            partial.readmeFailures += 1;
        }
    }

    return details;
}

async function fetchContributionSignals(username, token, signal) {
    const [prCount, issueCount] = await Promise.all([
        fetchSearchCount(`author:${username} type:pr`, token, signal),
        fetchSearchCount(`author:${username} type:issue`, token, signal)
    ]);

    return { prCount, issueCount };
}

async function fetchSearchCount(query, token, signal) {
    const path = `/search/issues?q=${encodeURIComponent(query)}&per_page=1`;
    const response = await githubRequest(path, { token, signal });
    return Number(response.data && response.data.total_count) || 0;
}

async function fetchPinnedRepositories(username, token, signal) {
    const query = `
        query ($login: String!) {
            user(login: $login) {
                pinnedItems(first: 6, types: REPOSITORY) {
                    nodes {
                        ... on Repository {
                            name
                            url
                            stargazerCount
                        }
                    }
                }
            }
        }
    `;

    try {
        const data = await githubGraphQL(query, { login: username }, token, signal);
        const nodes = data && data.user && data.user.pinnedItems ? data.user.pinnedItems.nodes : [];

        if (!Array.isArray(nodes)) {
            return null;
        }

        return nodes
            .filter((node) => node && node.name && node.url)
            .map((node) => ({
                name: node.name,
                url: node.url,
                stars: Number(node.stargazerCount) || 0
            }));
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }
        return null;
    }
}

function buildAnalysisResult({ profile, scorableRepos, contributions, partial, pinnedFromGraphql }) {
    const now = Date.now();
    const scorableCount = scorableRepos.length;

    const totalStars = scorableRepos.reduce((sum, repo) => sum + (Number(repo.stargazers_count) || 0), 0);
    const totalForks = scorableRepos.reduce((sum, repo) => sum + (Number(repo.forks_count) || 0), 0);
    const totalWatchers = scorableRepos.reduce((sum, repo) => sum + (Number(repo.watchers_count) || 0), 0);

    const descriptionCoverage = safeRatio(
        scorableRepos.filter((repo) => Boolean((repo.description || "").trim())).length,
        scorableCount
    );

    const readmeScannedRepos = scorableRepos.filter((repo) => repo._readmeChecked);
    const readmeCoverage = safeRatio(
        readmeScannedRepos.filter((repo) => repo._hasReadme === true).length,
        readmeScannedRepos.length
    );

    const nonEmptyRepoRatio = safeRatio(
        scorableRepos.filter((repo) => (Number(repo.size) || 0) > 0).length,
        scorableCount
    );

    const homepageRatio = safeRatio(
        scorableRepos.filter((repo) => Boolean((repo.homepage || "").trim())).length,
        scorableCount
    );

    const topicsRatio = safeRatio(
        scorableRepos.filter((repo) => Array.isArray(repo.topics) && repo.topics.length > 0).length,
        scorableCount
    );

    const pushedDays = scorableRepos
        .map((repo) => daysSinceDate(repo.pushed_at, now))
        .filter((days) => Number.isFinite(days));

    const reposUpdated30d = pushedDays.filter((days) => days <= 30).length;
    const reposUpdated90d = pushedDays.filter((days) => days <= 90).length;
    const reposInactive180d = pushedDays.filter((days) => days > 180).length;

    const activityBuckets = {
        updated30d: pushedDays.filter((days) => days <= 30).length,
        updated31to90d: pushedDays.filter((days) => days > 30 && days <= 90).length,
        updated91to180d: pushedDays.filter((days) => days > 90 && days <= 180).length,
        updated181plus: pushedDays.filter((days) => days > 180).length
    };

    const lastPushRepo = [...scorableRepos]
        .filter((repo) => repo.pushed_at)
        .sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime())[0] || null;

    const daysSinceLastPush = lastPushRepo ? daysSinceDate(lastPushRepo.pushed_at, now) : 9999;

    const activity = computeActivityInLastSixMonths(scorableRepos);
    const activeMonthsLast6Ratio = activity.ratio;

    const starsPerRepo = scorableCount ? totalStars / scorableCount : 0;
    const forksPerRepo = scorableCount ? totalForks / scorableCount : 0;
    const watchersPerRepo = scorableCount ? totalWatchers / scorableCount : 0;

    const languageTotals = aggregateLanguageTotals(scorableRepos);
    const languageEntries = Object.entries(languageTotals).sort((a, b) => b[1] - a[1]);
    const uniqueLanguages = languageEntries.length;
    const normalizedShannonEntropy = computeNormalizedEntropy(languageTotals);
    const totalLanguageBytes = languageEntries.reduce((sum, [, bytes]) => sum + (Number(bytes) || 0), 0);
    const dominantLanguage = languageEntries[0] ? languageEntries[0][0] : "Unknown";
    const dominantLanguageShare =
        totalLanguageBytes > 0 && languageEntries[0] ? cap01((Number(languageEntries[0][1]) || 0) / totalLanguageBytes) : 0;
    const topLanguages = languageEntries.slice(0, 5).map(([language]) => language);

    const topRepoByStars = [...scorableRepos].sort(
        (a, b) => (Number(b.stargazers_count) || 0) - (Number(a.stargazers_count) || 0)
    )[0] || null;

    const topRepoStars = topRepoByStars ? Number(topRepoByStars.stargazers_count) || 0 : 0;

    const reposUpdated90dRatio = safeRatio(reposUpdated90d, scorableCount);
    const reposUpdated30dRatio = safeRatio(reposUpdated30d, scorableCount);

    const recencyBucket = getRecencyBucket(daysSinceLastPush);

    const subscores = {
        documentationQuality: scoreFromRatio(0.75 * readmeCoverage + 0.25 * descriptionCoverage),
        codeActivityConsistency: scoreFromRatio(0.6 * activeMonthsLast6Ratio + 0.4 * reposUpdated90dRatio),
        projectPopularity: scoreFromRatio(
            0.6 * cap01(starsPerRepo / 50) +
            0.25 * cap01(forksPerRepo / 20) +
            0.15 * cap01(watchersPerRepo / 20)
        ),
        repositoryCompleteness: scoreFromRatio(
            0.5 * nonEmptyRepoRatio +
            0.3 * homepageRatio +
            0.2 * topicsRatio
        ),
        languageDiversity: scoreFromRatio(
            0.7 * cap01(uniqueLanguages / 8) +
            0.3 * normalizedShannonEntropy
        ),
        recentActivity: scoreFromRatio(0.7 * recencyBucket + 0.3 * reposUpdated30dRatio),
        impactSignals: scoreFromRatio(
            0.35 * cap01(topRepoStars / 300) +
            0.25 * cap01((Number(profile.followers) || 0) / 500) +
            0.25 * cap01(contributions.prCount / 200) +
            0.15 * cap01(contributions.issueCount / 100)
        )
    };

    const overallScore = clampToRange(
        Math.round(
            (subscores.documentationQuality * WEIGHTS.documentationQuality +
                subscores.codeActivityConsistency * WEIGHTS.codeActivityConsistency +
                subscores.projectPopularity * WEIGHTS.projectPopularity +
                subscores.repositoryCompleteness * WEIGHTS.repositoryCompleteness +
                subscores.languageDiversity * WEIGHTS.languageDiversity +
                subscores.recentActivity * WEIGHTS.recentActivity +
                subscores.impactSignals * WEIGHTS.impactSignals) / 100
        ),
        0,
        100
    );

    const rankedRepos = buildRankedRepositories(scorableRepos);

    const pinnedRepos = pinnedFromGraphql && pinnedFromGraphql.length
        ? {
            source: "graphql",
            items: pinnedFromGraphql
        }
        : {
            source: "fallback",
            items: rankedRepos.slice(0, 6).map((repo) => ({
                name: repo.name,
                url: repo.url,
                stars: repo.stars
            }))
        };

    const metrics = {
        scorableRepoCount: scorableCount,
        totalStars,
        totalForks,
        totalWatchers,
        readmeCoverage,
        reposUpdated30d,
        reposUpdated90d,
        daysSinceLastPush,
        authoredPRCount: contributions.prCount,
        authoredIssueCount: contributions.issueCount,
        uniqueLanguages,
        topLanguages,
        dominantLanguage,
        dominantLanguageShare,

        descriptionCoverage,
        descriptionlessRatio: cap01(1 - descriptionCoverage),
        activeMonthsLast6: activity.activeMonths,
        activeMonthsLast6Ratio,
        reposInactive180d,
        reposInactive180dRatio: safeRatio(reposInactive180d, scorableCount),
        emptyRepoRatio: cap01(1 - nonEmptyRepoRatio),
        nonEmptyRepoRatio,
        homepageRatio,
        topicsRatio,
        starsPerRepo,
        forksPerRepo,
        watchersPerRepo,
        reposUpdated30dRatio,
        reposUpdated90dRatio,
        recencyBucket,
        topRepoStars,
        normalizedShannonEntropy,
        readmeSampleSize: readmeScannedRepos.length,
        lastPushDate: lastPushRepo ? lastPushRepo.pushed_at : null,
        partialReadmeFailures: partial.readmeFailures,
        partialLanguageFailures: partial.languageFailures,
        deepRepoCount: partial.deepRepoCount,
        activityBuckets
    };

    const strengths = buildStrengths(subscores, metrics, rankedRepos);
    const redFlags = buildRedFlags(subscores, metrics);
    const suggestions = buildSuggestions(subscores, metrics, rankedRepos, pinnedRepos);
    const hiddenRisks = buildHiddenRisks(subscores, metrics, rankedRepos);
    const hireabilityScore = calculateHireabilityScore(subscores, overallScore, hiddenRisks);
    const readiness = classifyReadiness(hireabilityScore, overallScore);
    const careerPath = buildCareerPathRecommendation(metrics, rankedRepos, subscores);
    const improvementRoadmap = buildImprovementRoadmap(subscores, metrics, rankedRepos, careerPath, hiddenRisks);
    const recruiterSimulation = buildRecruiterSimulation({
        overallScore,
        hireabilityScore,
        readiness,
        subscores,
        metrics,
        strengths,
        redFlags,
        hiddenRisks,
        rankedRepos
    });

    const grade = scoreToGrade(overallScore);
    const scoreSummary = buildScoreSummary(overallScore, grade, subscores, metrics, hireabilityScore, readiness.label);

    return {
        profile: {
            login: profile.login,
            name: profile.name || profile.login,
            htmlUrl: profile.html_url,
            followers: Number(profile.followers) || 0,
            following: Number(profile.following) || 0,
            publicRepos: Number(profile.public_repos) || 0,
            avatarUrl: profile.avatar_url,
            bio: profile.bio || "No bio provided.",
            createdAt: profile.created_at,
            updatedAt: profile.updated_at
        },
        generatedAt: new Date().toISOString(),
        weights: WEIGHTS,
        subscores,
        overallScore,
        hireabilityScore,
        readiness,
        readinessLevel: readiness.label,
        metrics,
        strengths,
        redFlags,
        suggestions,
        hiddenRisks,
        recruiterSimulation,
        careerPath,
        improvementRoadmap,
        pinnedRepos,
        rankedRepos: rankedRepos.map((repo) => ({
            name: repo.name,
            url: repo.url,
            importance: repo.importance,
            stars: repo.stars,
            forks: repo.forks,
            watchers: repo.watchers,
            pushedAt: repo.pushedAt,
            hasReadme: repo.hasReadme,
            language: repo.language,
            homepage: repo.homepage,
            topicsCount: repo.topicsCount,
            hasDescription: repo.hasDescription,
            isEmpty: repo.isEmpty,
            readmeKnown: repo.readmeKnown
        })),
        languageTotals,
        grade,
        scoreSummary
    };
}

function aggregateLanguageTotals(repos) {
    const totals = {};

    repos.forEach((repo) => {
        let hasDetailedBreakdown = false;

        if (repo._languageBytes && typeof repo._languageBytes === "object") {
            const entries = Object.entries(repo._languageBytes);
            if (entries.length) {
                entries.forEach(([language, bytes]) => {
                    totals[language] = (totals[language] || 0) + (Number(bytes) || 0);
                });
                hasDetailedBreakdown = true;
            }
        }

        if (!hasDetailedBreakdown && repo.language) {
            totals[repo.language] = (totals[repo.language] || 0) + 1000;
        }
    });

    return totals;
}

function computeNormalizedEntropy(totals) {
    const values = Object.values(totals).filter((value) => value > 0);
    const total = values.reduce((sum, value) => sum + value, 0);

    if (total <= 0 || values.length <= 1) {
        return 0;
    }

    const entropy = values.reduce((sum, value) => {
        const p = value / total;
        return sum - p * Math.log2(p);
    }, 0);

    const maxEntropy = Math.log2(values.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

function buildRankedRepositories(repos) {
    if (!repos.length) {
        return [];
    }

    const ranked = repos.map((repo) => {
        const ageDays = daysSinceDate(repo.pushed_at);

        const recencyBoost = ageDays <= 30 ? 15 : ageDays <= 90 ? 8 : ageDays <= 180 ? 4 : 0;
        const readmeBoost = repo._hasReadme === true ? 8 : 0;
        const homepageBoost = (repo.homepage || "").trim() ? 4 : 0;
        const topicsBoost = Array.isArray(repo.topics) && repo.topics.length > 0 ? 3 : 0;
        const descriptionBoost = (repo.description || "").trim() ? 3 : 0;
        const sizeBoost = (Number(repo.size) || 0) > 0 ? 2 : 0;

        const rawImportance =
            (Number(repo.stargazers_count) || 0) * 4 +
            (Number(repo.forks_count) || 0) * 3 +
            (Number(repo.watchers_count) || 0) * 2 +
            recencyBoost +
            readmeBoost +
            homepageBoost +
            topicsBoost +
            descriptionBoost +
            sizeBoost;

        return {
            name: repo.name,
            url: repo.html_url,
            rawImportance,
            stars: Number(repo.stargazers_count) || 0,
            forks: Number(repo.forks_count) || 0,
            watchers: Number(repo.watchers_count) || 0,
            pushedAt: repo.pushed_at,
            hasReadme: repo._hasReadme === true,
            readmeKnown: Boolean(repo._readmeChecked),
            language: repo.language || "Unknown",
            homepage: (repo.homepage || "").trim(),
            topicsCount: Array.isArray(repo.topics) ? repo.topics.length : 0,
            hasDescription: Boolean((repo.description || "").trim()),
            isEmpty: (Number(repo.size) || 0) === 0
        };
    });

    const maxRaw = Math.max(...ranked.map((repo) => repo.rawImportance), 1);

    ranked.forEach((repo) => {
        repo.importance = clampToRange(Math.round((repo.rawImportance / maxRaw) * 100), 0, 100);
    });

    return ranked.sort((a, b) => b.importance - a.importance || b.stars - a.stars);
}

function buildStrengths(subscores, metrics, rankedRepos) {
    const strengths = [];

    if (subscores.codeActivityConsistency >= 70) {
        strengths.push(
            `Strong activity consistency with ${metrics.activeMonthsLast6}/6 active months and ${metrics.reposUpdated90d} repositories updated in the last 90 days.`
        );
    }

    if (subscores.projectPopularity >= 70) {
        const top = rankedRepos[0];
        strengths.push(
            `Good popularity signals: ${metrics.totalStars} total stars and ${top ? `${top.name} as a leading project` : "multiple visible projects"}.`
        );
    }

    if (subscores.languageDiversity >= 70) {
        strengths.push(`Diverse technical stack with ${metrics.uniqueLanguages} detected languages.`);
    }

    if (subscores.recentActivity >= 70) {
        strengths.push(`Recent contribution momentum: latest push was ${metrics.daysSinceLastPush} day(s) ago.`);
    }

    if (subscores.documentationQuality >= 70) {
        strengths.push(
            `Documentation quality is strong with ${(metrics.readmeCoverage * 100).toFixed(0)}% README coverage in sampled repositories.`
        );
    }

    if (subscores.impactSignals >= 70) {
        strengths.push(
            `Impact signals are healthy with ${metrics.authoredPRCount} authored PRs and ${metrics.authoredIssueCount} authored issues.`
        );
    }

    if (!strengths.length) {
        strengths.push(
            `Public portfolio is visible (${metrics.scorableRepoCount} non-fork repositories) but still needs stronger recruiter-facing signals.`
        );
    }

    return strengths.slice(0, 6);
}

function buildRedFlags(subscores, metrics) {
    const redFlags = [];

    if (metrics.readmeCoverage < 0.5) {
        redFlags.push(
            `Low README coverage (${(metrics.readmeCoverage * 100).toFixed(0)}%) in sampled repositories makes project intent harder to evaluate.`
        );
    }

    if (metrics.reposInactive180dRatio > 0.5) {
        redFlags.push(
            `${metrics.reposInactive180d} of ${metrics.scorableRepoCount} repositories have been inactive for more than 180 days.`
        );
    }

    if (metrics.emptyRepoRatio > 0.3) {
        redFlags.push(
            `${(metrics.emptyRepoRatio * 100).toFixed(0)}% of repositories look empty or near-empty based on repository size.`
        );
    }

    if (metrics.descriptionlessRatio > 0.4) {
        redFlags.push(
            `${(metrics.descriptionlessRatio * 100).toFixed(0)}% of repositories have missing descriptions, which weakens recruiter readability.`
        );
    }

    if (metrics.daysSinceLastPush > 90) {
        redFlags.push(`No recent pushes in the last 90 days (latest push was ${metrics.daysSinceLastPush} day(s) ago).`);
    }

    if (subscores.impactSignals < 40) {
        redFlags.push(
            `Impact signals are weak (${subscores.impactSignals}/100) due to low follower, PR, issue, or top-repo traction.`
        );
    }

    if (!redFlags.length) {
        redFlags.push("No major red flags detected from the available public signals.");
    }

    return redFlags.slice(0, 6);
}

function buildSuggestions(subscores, metrics, rankedRepos, pinnedRepos) {
    const suggestions = [];

    const missingReadmeRepos = rankedRepos
        .filter((repo) => repo.readmeKnown && !repo.hasReadme)
        .slice(0, 3)
        .map((repo) => repo.name);

    const staleRepos = rankedRepos
        .filter((repo) => daysSinceDate(repo.pushedAt) > 180)
        .slice(0, 3)
        .map((repo) => repo.name);

    const noHomepageRepos = rankedRepos
        .filter((repo) => !repo.homepage)
        .slice(0, 3)
        .map((repo) => repo.name);

    const emptyRepos = rankedRepos
        .filter((repo) => repo.isEmpty)
        .slice(0, 3)
        .map((repo) => repo.name);

    const missingDescriptionRepos = rankedRepos
        .filter((repo) => !repo.hasDescription)
        .slice(0, 3)
        .map((repo) => repo.name);

    if (missingReadmeRepos.length) {
        suggestions.push({
            priority: 120 - subscores.documentationQuality,
            text: `Add README files to ${joinRepoNames(missingReadmeRepos)} with problem statement, setup, usage, and outcomes.`
        });
    }

    if (staleRepos.length) {
        suggestions.push({
            priority: 120 - subscores.recentActivity,
            text: `Update or archive stale repositories (${joinRepoNames(staleRepos)}) so recruiters see a maintained portfolio.`
        });
    }

    if (noHomepageRepos.length) {
        suggestions.push({
            priority: 110 - subscores.repositoryCompleteness,
            text: `Add live demo or homepage links for ${joinRepoNames(noHomepageRepos)} to improve project completeness.`
        });
    }

    if (emptyRepos.length) {
        suggestions.push({
            priority: 108 - subscores.repositoryCompleteness,
            text: `Complete or archive near-empty repositories (${joinRepoNames(emptyRepos)}) to reduce noise in your public profile.`
        });
    }

    if (missingDescriptionRepos.length || metrics.descriptionlessRatio > 0.4) {
        const target = missingDescriptionRepos.length ? joinRepoNames(missingDescriptionRepos) : "your weakest repos";
        suggestions.push({
            priority: 109 - subscores.documentationQuality,
            text: `Improve project descriptions for ${target} with concise problem, stack, and outcomes so recruiters can scan faster.`
        });
    }

    if (subscores.codeActivityConsistency < 70) {
        suggestions.push({
            priority: 105 - subscores.codeActivityConsistency,
            text: `Improve commit consistency: target at least 1 meaningful commit per week for 8 weeks and aim for 4/6 active months.`
        });
    }

    if (subscores.impactSignals < 70) {
        suggestions.push({
            priority: 105 - subscores.impactSignals,
            text: `Increase impact signals by targeting 2 authored PRs and 2 authored issues per month on relevant repositories.`
        });
    }

    if (pinnedRepos.source === "fallback") {
        const suggestedPins = rankedRepos.slice(0, 3).map((repo) => repo.name);
        suggestions.push({
            priority: 102,
            text: `Pin your strongest repositories (${joinRepoNames(suggestedPins)}) so recruiters immediately see your best work.`
        });
    }

    if (metrics.topicsRatio < 0.5) {
        suggestions.push({
            priority: 95,
            text: "Add GitHub topics/tags to your key repositories to improve discovery and communicate stack relevance quickly."
        });
    }

    if (metrics.uniqueLanguages < 3) {
        suggestions.push({
            priority: 88,
            text: "Showcase at least one additional production-quality project in a different language or framework to broaden stack signals."
        });
    }

    const sorted = suggestions
        .sort((a, b) => b.priority - a.priority)
        .map((entry) => entry.text)
        .filter((text, index, arr) => arr.indexOf(text) === index);

    const defaults = [
        `Raise README coverage from ${(metrics.readmeCoverage * 100).toFixed(0)}% to at least 80% in your top repositories.`,
        `Set a monthly maintenance pass to close stale issues and refresh pinned projects with recent commits.`,
        `Improve repository completeness by ensuring every flagship repo has README, topics, and a demo/homepage link.`,
        `Create a monthly portfolio changelog in one pinned repository to highlight recent improvements and impact.`,
        `Publish measurable project outcomes (users, performance, business value) in your top README files.`
    ];

    while (sorted.length < 5 && defaults.length) {
        sorted.push(defaults.shift());
    }

    return sorted.slice(0, 7);
}

function buildHiddenRisks(subscores, metrics, rankedRepos) {
    const risks = [];

    if (metrics.dominantLanguageShare > 0.78 && metrics.uniqueLanguages >= 2) {
        risks.push(
            `Stack concentration risk: ${metrics.dominantLanguage} accounts for ${formatPercent(metrics.dominantLanguageShare)} of detected language volume.`
        );
    }

    const topWithoutHomepage = rankedRepos
        .slice(0, 5)
        .filter((repo) => !repo.homepage)
        .map((repo) => repo.name);

    if (topWithoutHomepage.length >= 3) {
        risks.push(
            `Conversion risk: ${topWithoutHomepage.length} of your top repositories lack demo/homepage links (${joinRepoNames(topWithoutHomepage.slice(0, 3))}).`
        );
    }

    const starConcentration = metrics.totalStars > 0 ? metrics.topRepoStars / metrics.totalStars : 0;
    if (starConcentration > 0.85 && metrics.totalStars >= 20 && rankedRepos.length >= 4) {
        risks.push(
            `Brand concentration risk: one repository drives ${formatPercent(starConcentration)} of total stars, so portfolio impact is overly dependent on a single project.`
        );
    }

    if (metrics.authoredPRCount < 5 && metrics.scorableRepoCount >= 10) {
        risks.push(
            `Collaboration signal risk: only ${metrics.authoredPRCount} authored PRs across a portfolio of ${metrics.scorableRepoCount} repositories.`
        );
    }

    if (metrics.reposUpdated90dRatio > 0.45 && metrics.reposUpdated30dRatio < 0.15) {
        risks.push(
            "Momentum decay risk: older recent activity exists, but updates in the last 30 days are sparse."
        );
    }

    if (subscores.repositoryCompleteness < 50 && metrics.topicsRatio < 0.35) {
        risks.push(
            "Discoverability risk: weak metadata coverage (topics and project links) can reduce recruiter confidence during quick profile scans."
        );
    }

    if (!risks.length) {
        risks.push("No hidden structural risks detected beyond the visible red flags.");
    }

    return risks.slice(0, 6);
}

function calculateHireabilityScore(subscores, overallScore, hiddenRisks) {
    const riskCount = hiddenRisks.filter((item) => !/^No hidden/i.test(item)).length;
    const penalty = Math.min(riskCount * 4, 16);

    const raw =
        overallScore * 0.45 +
        subscores.impactSignals * 0.2 +
        subscores.recentActivity * 0.15 +
        subscores.documentationQuality * 0.1 +
        subscores.repositoryCompleteness * 0.1;

    return clampToRange(Math.round(raw - penalty), 0, 100);
}

function classifyReadiness(hireabilityScore, overallScore) {
    const blended = clampToRange(Math.round((hireabilityScore + overallScore) / 2), 0, 100);

    if (blended >= 85) {
        return {
            label: "Recruiter-Ready",
            severity: "good",
            percent: blended,
            summary: "Portfolio can usually pass recruiter screens without major concerns."
        };
    }

    if (blended >= 70) {
        return {
            label: "Interview-Ready",
            severity: "good",
            percent: blended,
            summary: "Strong enough for interview pipelines with minor polish opportunities."
        };
    }

    if (blended >= 55) {
        return {
            label: "Emerging",
            severity: "warn",
            percent: blended,
            summary: "Promising portfolio that needs stronger consistency and presentation signals."
        };
    }

    return {
        label: "Foundation Stage",
        severity: "risk",
        percent: blended,
        summary: "Core work is visible, but recruiter confidence is currently limited."
    };
}

function buildRecruiterSimulation({
    overallScore,
    hireabilityScore,
    readiness,
    subscores,
    metrics,
    strengths,
    redFlags,
    hiddenRisks,
    rankedRepos
}) {
    let verdict = "Not Ready for Interview Loop";
    let level = "risk";

    if (hireabilityScore >= 82) {
        verdict = "Strong Consider";
        level = "good";
    } else if (hireabilityScore >= 68) {
        verdict = "Proceed to Technical Screen";
        level = "warn";
    } else if (hireabilityScore >= 52) {
        verdict = "Potential with Portfolio Polish";
        level = "warn";
    }

    const leadingRepo = rankedRepos[0];
    const summary = `${verdict}: overall ${overallScore}/100 and hireability ${hireabilityScore}/100. Current readiness is ${readiness.label}. ${
        leadingRepo ? `Top signal comes from ${leadingRepo.name} (${leadingRepo.importance}/100 importance).` : "No standout repository identified yet."
    }`;

    const signals = [];
    if (strengths[0]) {
        signals.push(`Positive signal: ${strengths[0]}`);
    }
    if (metrics.totalStars > 0) {
        signals.push(`Market traction: ${metrics.totalStars} total stars across ${metrics.scorableRepoCount} scored repositories.`);
    } else {
        signals.push("Market traction is minimal; add demos and visibility to increase external validation.");
    }
    const firstRedFlag = redFlags.find((item) => !/No major red flags/i.test(item));
    if (firstRedFlag) {
        signals.push(`Primary concern: ${firstRedFlag}`);
    }
    const firstHiddenRisk = hiddenRisks.find((item) => !/^No hidden/i.test(item));
    if (firstHiddenRisk) {
        signals.push(`Hidden concern: ${firstHiddenRisk}`);
    }
    if (subscores.impactSignals < 60) {
        signals.push("Interview risk: impact signals are below benchmark for competitive product roles.");
    }

    return {
        verdict,
        level,
        summary,
        signals: signals.slice(0, 6)
    };
}

function buildCareerPathRecommendation(metrics, rankedRepos, subscores) {
    const languages = (metrics.topLanguages || []).map((lang) => lang.toLowerCase());
    const hasAnyLanguage = (list) => list.some((lang) => languages.includes(lang));

    let title = "Generalist Software Engineer";
    let summary = "Your repositories indicate broad engineering capability across multiple project types.";
    let nextSkills = [
        "Create 2 case-study READMEs that highlight architecture decisions and measurable outcomes.",
        "Add live demos to your top projects to improve recruiter conversion.",
        "Contribute at least 2 PRs/month to repositories related to your target role."
    ];

    if (hasAnyLanguage(["javascript", "typescript"])) {
        title = "Full-Stack JavaScript Engineer";
        summary = "Your language mix and repository profile align best with product-focused full-stack roles.";
        nextSkills = [
            "Ship one end-to-end project with production deployment, auth, and monitoring.",
            "Document system architecture and tradeoffs for your top JavaScript/TypeScript repositories.",
            "Add test coverage and CI status badges to your top 3 repositories."
        ];
    } else if (hasAnyLanguage(["python"])) {
        title = "Data / AI Engineer";
        summary = "Python-heavy activity indicates strong alignment with data and AI engineering tracks.";
        nextSkills = [
            "Publish one reproducible ML/data project with dataset, metrics, and inference/demo endpoint.",
            "Add evaluation methodology and model limitations to README docs.",
            "Showcase pipeline automation and observability in at least one repository."
        ];
    } else if (hasAnyLanguage(["java", "kotlin", "scala"])) {
        title = "Backend Platform Engineer";
        summary = "JVM-oriented repositories and contribution signals fit backend and platform engineering roles.";
        nextSkills = [
            "Demonstrate API design quality with versioned contracts and load/performance notes.",
            "Add reliability signals: retries, circuit breakers, and structured logging.",
            "Publish a backend project with deployment and scalability benchmarks."
        ];
    } else if (hasAnyLanguage(["go", "rust", "c", "c++"])) {
        title = "Systems / Infrastructure Engineer";
        summary = "Your dominant languages suggest strongest fit for systems and infrastructure engineering paths.";
        nextSkills = [
            "Build one performance-focused project with clear latency/throughput benchmarks.",
            "Document low-level design choices and profiling evidence in README.",
            "Add automation scripts for build/test/release workflows."
        ];
    } else if (hasAnyLanguage(["swift", "objective-c", "dart"])) {
        title = "Mobile Application Engineer";
        summary = "Language signals indicate strongest fit for modern mobile development roles.";
        nextSkills = [
            "Publish a shipped-quality mobile app with store-ready documentation and screenshots.",
            "Add crash/error monitoring strategy and release notes cadence.",
            "Showcase offline support and performance considerations."
        ];
    }

    const confidence = clampToRange(
        Math.round(
            52 +
            metrics.dominantLanguageShare * 18 +
            Math.min(metrics.uniqueLanguages, 5) * 4 +
            (subscores.codeActivityConsistency >= 70 ? 6 : 0) +
            (subscores.impactSignals >= 60 ? 6 : 0)
        ),
        35,
        95
    );

    const weakestSubscore = Object.entries(subscores).sort((a, b) => a[1] - b[1])[0][0];
    const weakestAdviceMap = {
        documentationQuality: "Strengthen documentation quality to make your projects legible to non-engineers.",
        codeActivityConsistency: "Establish a visible weekly commit cadence to reduce perceived delivery risk.",
        projectPopularity: "Increase visibility through demos, developer posts, and open-source collaboration.",
        repositoryCompleteness: "Add project metadata (description, topics, demos) to boost portfolio clarity.",
        languageDiversity: "Add one adjacent-stack project to signal broader technical range.",
        recentActivity: "Prioritize recent updates in top repositories to maintain recruiter confidence.",
        impactSignals: "Increase authored PR and issue activity in relevant external repositories."
    };

    nextSkills.push(weakestAdviceMap[weakestSubscore]);

    if (rankedRepos[0] && rankedRepos[0].importance >= 80) {
        nextSkills.push(`Position \`${rankedRepos[0].name}\` as flagship project with a complete case-study README.`);
    }

    return {
        title,
        confidence,
        summary,
        nextSkills: dedupe(nextSkills).slice(0, 6)
    };
}

function buildImprovementRoadmap(subscores, metrics, rankedRepos, careerPath, hiddenRisks) {
    const roadmap = [];
    const missingReadmeRepos = rankedRepos
        .filter((repo) => repo.readmeKnown && !repo.hasReadme)
        .slice(0, 2)
        .map((repo) => repo.name);
    const noHomepageRepos = rankedRepos
        .filter((repo) => !repo.homepage)
        .slice(0, 2)
        .map((repo) => repo.name);
    const staleRepos = rankedRepos
        .filter((repo) => daysSinceDate(repo.pushedAt) > 180)
        .slice(0, 2)
        .map((repo) => repo.name);

    roadmap.push(
        "Week 1: Set portfolio baseline by updating profile bio, pinning top repositories, and documenting measurable outcomes."
    );

    const deficitOrder = Object.entries(subscores)
        .sort((a, b) => a[1] - b[1])
        .map(([key]) => key);

    deficitOrder.forEach((key) => {
        if (key === "documentationQuality" && missingReadmeRepos.length) {
            roadmap.push(
                `Week 1-2: Add structured README files to ${joinRepoNames(missingReadmeRepos)} with problem, architecture, setup, and results.`
            );
        } else if (key === "recentActivity" || key === "codeActivityConsistency") {
            roadmap.push(
                "Week 2-5: Maintain weekly commits (minimum 1 meaningful update/week) across at least 4 core repositories."
            );
        } else if (key === "repositoryCompleteness" && noHomepageRepos.length) {
            roadmap.push(
                `Week 2-3: Add demo/homepage links and GitHub topics for ${joinRepoNames(noHomepageRepos)}.`
            );
        } else if (key === "impactSignals") {
            roadmap.push(
                "Week 3-6: Target 8 authored PRs and 6 authored issues in repositories aligned to your target role."
            );
        } else if (key === "projectPopularity") {
            roadmap.push(
                "Week 4: Publish concise demo posts and architecture threads to improve repository discoverability and star velocity."
            );
        } else if (key === "languageDiversity" && metrics.uniqueLanguages < 4) {
            roadmap.push(
                "Week 5-7: Build one production-quality project in an adjacent stack to expand technical breadth signals."
            );
        }
    });

    if (staleRepos.length) {
        roadmap.push(`Week 3: Refresh or archive stale repositories (${joinRepoNames(staleRepos)}) to reduce portfolio noise.`);
    }

    const firstHiddenRisk = hiddenRisks.find((item) => !/^No hidden/i.test(item));
    if (firstHiddenRisk) {
        roadmap.push(`Week 4: Resolve hidden risk identified by analysis: ${firstHiddenRisk}`);
    }

    roadmap.push(
        `Week 8: Repackage top 3 projects for ${careerPath.title} positioning with recruiter-focused case studies and outcomes.`
    );

    const defaults = [
        "Set a monthly portfolio review reminder to keep all flagship repositories active and complete.",
        "Add short demo videos/GIFs to your top repositories for faster recruiter evaluation."
    ];

    const uniqueRoadmap = dedupe(roadmap);

    while (uniqueRoadmap.length < 5 && defaults.length) {
        uniqueRoadmap.push(defaults.shift());
    }

    return uniqueRoadmap.slice(0, 7);
}

function buildScoreSummary(overallScore, grade, subscores, metrics, hireabilityScore, readinessLabel) {
    const strongest = getNamedSubscore(Object.entries(subscores).sort((a, b) => b[1] - a[1])[0][0]);
    const weakest = getNamedSubscore(Object.entries(subscores).sort((a, b) => a[1] - b[1])[0][0]);

    let summary = `Score ${overallScore}/100 (${grade}), hireability ${hireabilityScore}/100 (${readinessLabel}). Strongest area: ${strongest}. Biggest gap: ${weakest}.`;

    if (metrics.partialLanguageFailures || metrics.partialReadmeFailures) {
        summary += ` Partial data warning: ${metrics.partialLanguageFailures + metrics.partialReadmeFailures} deep checks failed due to API limits or transient errors.`;
    }

    return summary;
}

function renderAnalysis(result) {
    renderProfile(result);
    renderScore(result);
    renderSubscores(result.subscores);
    renderScoringTransparency(result);
    renderPinnedRepos(result.pinnedRepos);
    renderRecruiterSimulation(result.recruiterSimulation);
    renderInsightList(ui.strengthsList, result.strengths, "good");
    renderInsightList(ui.redFlagsList, result.redFlags, "risk");
    renderInsightList(ui.suggestionsList, result.suggestions, "warn");
    renderInsightList(ui.hiddenRisksList, result.hiddenRisks, "risk");
    renderCareerPath(result.careerPath);
    renderRoadmap(result.improvementRoadmap);
    renderRepoRanking(result.rankedRepos);
    renderCharts(result);
}

function renderProfile(result) {
    const profile = result.profile;
    const metrics = result.metrics;

    ui.avatarImg.src = profile.avatarUrl || "Images/logo.png";
    ui.avatarImg.alt = `${profile.login} avatar`;

    ui.profileName.textContent = profile.name;
    ui.profileHandle.textContent = `@${profile.login}`;

    ui.profileLink.href = profile.htmlUrl;
    ui.profileLink.textContent = profile.htmlUrl;

    ui.profileBio.textContent = profile.bio || "No bio provided.";

    ui.statRepos.textContent = String(profile.publicRepos);
    ui.statFollowers.textContent = formatCompactNumber(profile.followers);
    ui.statFollowing.textContent = formatCompactNumber(profile.following);
    ui.statLastPush.textContent = metrics.lastPushDate ? formatDate(metrics.lastPushDate) : "No push data";
    ui.statPrCount.textContent = formatCompactNumber(metrics.authoredPRCount);
    ui.statIssueCount.textContent = formatCompactNumber(metrics.authoredIssueCount);
}

function renderScore(result) {
    const severity = getSeverity(result.overallScore);

    ui.overallScore.textContent = String(result.overallScore);
    ui.overallScoreRing.style.setProperty("--score-value", String(result.overallScore));
    ui.overallScoreRing.setAttribute("data-level", severity);
    ui.scoreGrade.textContent = `Grade ${result.grade}`;
    ui.scoreSummary.textContent = result.scoreSummary;

    const hireabilitySeverity = getSeverity(result.hireabilityScore);
    ui.hireabilityScore.textContent = `${result.hireabilityScore}/100`;
    ui.hireabilityScore.style.color = severityColor(hireabilitySeverity);
    ui.hireabilityHint.textContent = "Calibrated from score, impact, recency, and hidden-risk penalties.";

    ui.readinessLevel.textContent = result.readiness.label;
    ui.readinessLevel.style.color = severityColor(result.readiness.severity);
    ui.readinessHint.textContent = result.readiness.summary;
    ui.readinessBar.style.width = `${result.readiness.percent}%`;
}

function renderSubscores(subscores) {
    Object.entries(SUBSCORE_ID_MAP).forEach(([key, elementId]) => {
        const element = document.getElementById(elementId);
        const value = subscores[key];
        const severity = getSeverity(value);

        element.textContent = `${value}/100`;
        element.className = `chip ${severityToChipClass(severity)}`;
    });
}

function renderScoringTransparency(result) {
    const { subscores, metrics } = result;
    const details = {
        documentationQuality: `README ${formatPercent(metrics.readmeCoverage)}, Desc ${formatPercent(metrics.descriptionCoverage)}`,
        codeActivityConsistency: `${metrics.activeMonthsLast6}/6 months, ${formatPercent(metrics.reposUpdated90dRatio)} updated`,
        projectPopularity: `Stars ${metrics.starsPerRepo.toFixed(1)}/repo, Forks ${metrics.forksPerRepo.toFixed(1)}/repo`,
        repositoryCompleteness: `Non-empty ${formatPercent(metrics.nonEmptyRepoRatio)}, Topics ${formatPercent(metrics.topicsRatio)}`,
        languageDiversity: `${metrics.uniqueLanguages} langs, Entropy ${metrics.normalizedShannonEntropy.toFixed(2)}`,
        recentActivity: `${metrics.daysSinceLastPush}d last push, ${formatPercent(metrics.reposUpdated30dRatio)} updated`,
        impactSignals: `Top repo ⭐ ${metrics.topRepoStars}, PRs ${metrics.authoredPRCount}, Issues ${metrics.authoredIssueCount}`
    };

    Object.entries(SCORING_EXPLAIN_ID_MAP).forEach(([key, elementId]) => {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        const score = subscores[key];
        const severity = getSeverity(score);
        element.textContent = `${score}/100 • ${details[key]}`;
        element.className = `chip ${severityToChipClass(severity)}`;
    });
}

function renderRecruiterSimulation(simulation) {
    if (!simulation) {
        ui.aiRecruiterVerdict.textContent = "Pending";
        ui.aiRecruiterVerdict.className = "chip chip-neutral";
        ui.aiRecruiterSummary.textContent = "Run an analysis to get recruiter-style interview feedback simulation.";
        renderInsightList(ui.aiRecruiterSignals, ["No recruiter simulation available."], "neutral");
        return;
    }

    ui.aiRecruiterVerdict.textContent = simulation.verdict;
    ui.aiRecruiterVerdict.className = `chip ${severityToChipClass(simulation.level || "warn")}`;
    ui.aiRecruiterSummary.textContent = simulation.summary;
    renderInsightList(ui.aiRecruiterSignals, simulation.signals, simulation.level || "warn");
}

function renderCareerPath(careerPath) {
    if (!careerPath) {
        ui.careerPathTitle.textContent = "No career path recommendation";
        ui.careerPathSummary.textContent = "Run an analysis to unlock role fit recommendations.";
        ui.careerConfidence.textContent = "--";
        ui.careerConfidence.className = "chip chip-neutral";
        renderInsightList(ui.careerSkillsList, ["No recommendations yet."], "neutral");
        return;
    }

    ui.careerPathTitle.textContent = careerPath.title;
    ui.careerPathSummary.textContent = careerPath.summary;
    ui.careerConfidence.textContent = `${careerPath.confidence}% confidence`;
    ui.careerConfidence.className = `chip ${severityToChipClass(getSeverity(careerPath.confidence))}`;
    renderInsightList(ui.careerSkillsList, careerPath.nextSkills, "warn");
}

function renderRoadmap(roadmapItems) {
    clearChildren(ui.roadmapList);

    if (!Array.isArray(roadmapItems) || !roadmapItems.length) {
        const li = document.createElement("li");
        li.textContent = "No roadmap available.";
        ui.roadmapList.appendChild(li);
        return;
    }

    roadmapItems.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        ui.roadmapList.appendChild(li);
    });
}

function renderPinnedRepos(pinnedRepos) {
    clearChildren(ui.pinnedReposList);

    ui.pinnedSourceBadge.textContent = pinnedRepos.source;
    ui.pinnedSourceBadge.className = `chip ${pinnedRepos.source === "graphql" ? "chip-good" : "chip-warn"}`;

    if (!pinnedRepos.items.length) {
        appendEmptyState(ui.pinnedReposList, "No pinned repositories available.");
        return;
    }

    pinnedRepos.items.forEach((repo) => {
        const li = document.createElement("li");
        li.className = "repo-item";

        const left = document.createElement("div");
        const link = document.createElement("a");
        link.href = repo.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = repo.name;
        link.className = "repo-link";

        left.appendChild(link);

        const meta = document.createElement("div");
        meta.className = "repo-item-meta";
        meta.textContent = `Stars: ${formatCompactNumber(repo.stars)}`;

        li.appendChild(left);
        li.appendChild(meta);

        ui.pinnedReposList.appendChild(li);
    });
}

function renderInsightList(container, items, tone) {
    clearChildren(container);

    if (!items || !items.length) {
        appendEmptyState(container, "No insights available.");
        return;
    }

    items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;

        if (tone === "good") {
            li.classList.add("chip-good");
        } else if (tone === "warn") {
            li.classList.add("chip-warn");
        } else if (tone === "risk") {
            li.classList.add("chip-risk");
        }

        container.appendChild(li);
    });
}

function renderRepoRanking(rankedRepos) {
    clearChildren(ui.repoRankingTable);

    if (!rankedRepos.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = "No repositories available for ranking.";
        cell.className = "empty-state";
        row.appendChild(cell);
        ui.repoRankingTable.appendChild(row);
        return;
    }

    rankedRepos.slice(0, 15).forEach((repo) => {
        const row = document.createElement("tr");

        const repoCell = document.createElement("td");
        const link = document.createElement("a");
        link.href = repo.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = repo.name;
        link.className = "repo-link";

        const langMeta = document.createElement("div");
        langMeta.className = "repo-item-meta";
        langMeta.textContent = repo.language;

        repoCell.appendChild(link);
        repoCell.appendChild(langMeta);

        const importanceCell = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.className = "importance-wrap";

        const meter = document.createElement("div");
        meter.className = "importance-meter";
        const fill = document.createElement("span");
        fill.style.width = `${repo.importance}%`;
        meter.appendChild(fill);

        const importanceText = document.createElement("span");
        importanceText.textContent = String(repo.importance);

        wrap.appendChild(meter);
        wrap.appendChild(importanceText);
        importanceCell.appendChild(wrap);

        const statsCell = document.createElement("td");
        statsCell.textContent = `${repo.stars} / ${repo.forks} / ${repo.watchers}`;

        const pushedCell = document.createElement("td");
        pushedCell.textContent = repo.pushedAt ? formatDate(repo.pushedAt) : "Unknown";

        const readmeCell = document.createElement("td");
        const readmeChip = document.createElement("span");

        if (repo.readmeKnown && repo.hasReadme) {
            readmeChip.textContent = "Yes";
            readmeChip.className = "chip chip-good";
        } else if (repo.readmeKnown && !repo.hasReadme) {
            readmeChip.textContent = "No";
            readmeChip.className = "chip chip-risk";
        } else {
            readmeChip.textContent = "Unknown";
            readmeChip.className = "chip chip-neutral";
        }

        readmeCell.appendChild(readmeChip);

        row.appendChild(repoCell);
        row.appendChild(importanceCell);
        row.appendChild(statsCell);
        row.appendChild(pushedCell);
        row.appendChild(readmeCell);

        ui.repoRankingTable.appendChild(row);
    });
}

function renderCharts(result) {
    if (
        typeof Chart === "undefined" ||
        !ui.languageChart ||
        !ui.importanceChart ||
        !ui.subscoreRadarChart ||
        !ui.activityChart
    ) {
        return;
    }

    const chartColors = [
        getCssVar("--chart-1"),
        getCssVar("--chart-2"),
        getCssVar("--chart-3"),
        getCssVar("--chart-4"),
        getCssVar("--chart-5"),
        getCssVar("--chart-6")
    ];

    const axisColor = getCssVar("--muted");
    const borderColor = getCssVar("--border");

    const languageEntries = Object.entries(result.languageTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const languageLabels = languageEntries.map(([label]) => label);
    const languageValues = languageEntries.map(([, value]) => value);

    const hasLanguageData = languageLabels.length > 0;

    const languageData = {
        labels: hasLanguageData ? languageLabels : ["No data"],
        datasets: [{
            data: hasLanguageData ? languageValues : [1],
            backgroundColor: hasLanguageData ? chartColors : [borderColor],
            borderWidth: 1,
            borderColor
        }]
    };

    if (state.charts.language) {
        state.charts.language.destroy();
    }

    state.charts.language = new Chart(ui.languageChart, {
        type: "doughnut",
        data: languageData,
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: axisColor }
                }
            }
        }
    });

    const importanceRepos = result.rankedRepos.slice(0, 10);

    if (state.charts.importance) {
        state.charts.importance.destroy();
    }

    state.charts.importance = new Chart(ui.importanceChart, {
        type: "bar",
        data: {
            labels: importanceRepos.map((repo) => repo.name),
            datasets: [{
                label: "Importance",
                data: importanceRepos.map((repo) => repo.importance),
                backgroundColor: chartColors[0],
                borderColor: chartColors[1],
                borderWidth: 1
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: axisColor },
                    grid: { color: borderColor }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: axisColor },
                    grid: { color: borderColor }
                }
            },
            plugins: {
                legend: {
                    labels: { color: axisColor }
                }
            }
        }
    });

    const radarLabels = Object.keys(result.subscores).map((key) => getNamedSubscore(key));
    const radarValues = Object.values(result.subscores);

    if (state.charts.subscoreRadar) {
        state.charts.subscoreRadar.destroy();
    }

    state.charts.subscoreRadar = new Chart(ui.subscoreRadarChart, {
        type: "radar",
        data: {
            labels: radarLabels,
            datasets: [{
                label: "Portfolio Dimensions",
                data: radarValues,
                backgroundColor: `${chartColors[0]}40`,
                borderColor: chartColors[0],
                borderWidth: 2,
                pointBackgroundColor: chartColors[1]
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { color: axisColor, backdropColor: "transparent" },
                    angleLines: { color: borderColor },
                    grid: { color: borderColor },
                    pointLabels: { color: axisColor }
                }
            },
            plugins: {
                legend: {
                    labels: { color: axisColor }
                }
            }
        }
    });

    const bucketLabels = ["0-30d", "31-90d", "91-180d", "181d+"];
    const bucketValues = [
        result.metrics.activityBuckets.updated30d,
        result.metrics.activityBuckets.updated31to90d,
        result.metrics.activityBuckets.updated91to180d,
        result.metrics.activityBuckets.updated181plus
    ];

    if (state.charts.activity) {
        state.charts.activity.destroy();
    }

    state.charts.activity = new Chart(ui.activityChart, {
        type: "bar",
        data: {
            labels: bucketLabels,
            datasets: [{
                label: "Repo Count",
                data: bucketValues,
                backgroundColor: [chartColors[1], chartColors[2], chartColors[3], chartColors[4]],
                borderWidth: 1,
                borderColor
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: axisColor },
                    grid: { color: borderColor }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: axisColor, precision: 0 },
                    grid: { color: borderColor }
                }
            },
            plugins: {
                legend: {
                    labels: { color: axisColor }
                }
            }
        }
    });
}

function downloadMarkdownReport() {
    if (!state.analysisResult) {
        showError("Run an analysis before downloading a report.");
        return;
    }

    const markdown = buildMarkdownReport(state.analysisResult);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.analysisResult.profile.login}-portfolio-report.md`;
    anchor.click();

    URL.revokeObjectURL(url);
}

function buildMarkdownReport(result) {
    const lines = [];

    lines.push("# GitHub Portfolio Analysis Report");
    lines.push("");
    lines.push(`- Generated: ${new Date(result.generatedAt).toLocaleString()}`);
    lines.push(`- Profile: [${result.profile.name} (@${result.profile.login})](${result.profile.htmlUrl})`);
    lines.push(`- Overall Score: **${result.overallScore}/100 (${result.grade})**`);
    lines.push(`- Hireability Score: **${result.hireabilityScore}/100**`);
    lines.push(`- Portfolio Readiness: **${result.readiness.label}**`);
    lines.push("");
    lines.push("## Score Summary");
    lines.push(result.scoreSummary);
    lines.push("");

    lines.push("## Subscores");
    lines.push("| Category | Score | Weight |");
    lines.push("| --- | ---: | ---: |");

    Object.entries(result.subscores).forEach(([key, score]) => {
        lines.push(`| ${escapeMarkdown(getNamedSubscore(key))} | ${score} | ${result.weights[key]}% |`);
    });

    lines.push("");
    lines.push("## Scoring Inputs (Transparency)");
    lines.push(`- Documentation Quality Inputs: README coverage ${formatPercent(result.metrics.readmeCoverage)}, description coverage ${formatPercent(result.metrics.descriptionCoverage)}`);
    lines.push(`- Activity Inputs: active months ${result.metrics.activeMonthsLast6}/6, repos updated in 90 days ${formatPercent(result.metrics.reposUpdated90dRatio)}`);
    lines.push(`- Popularity Inputs: stars/repo ${result.metrics.starsPerRepo.toFixed(2)}, forks/repo ${result.metrics.forksPerRepo.toFixed(2)}, watchers/repo ${result.metrics.watchersPerRepo.toFixed(2)}`);
    lines.push(`- Completeness Inputs: non-empty ${formatPercent(result.metrics.nonEmptyRepoRatio)}, homepage ${formatPercent(result.metrics.homepageRatio)}, topics ${formatPercent(result.metrics.topicsRatio)}`);
    lines.push(`- Diversity Inputs: unique languages ${result.metrics.uniqueLanguages}, entropy ${result.metrics.normalizedShannonEntropy.toFixed(2)}`);
    lines.push(`- Recency Inputs: days since last push ${result.metrics.daysSinceLastPush}, repos updated in 30 days ${formatPercent(result.metrics.reposUpdated30dRatio)}`);
    lines.push(`- Impact Inputs: top repo stars ${result.metrics.topRepoStars}, followers ${result.profile.followers}, PRs ${result.metrics.authoredPRCount}, issues ${result.metrics.authoredIssueCount}`);
    lines.push("");
    lines.push("## Strengths");
    result.strengths.forEach((item) => lines.push(`- ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## Red Flags");
    result.redFlags.forEach((item) => lines.push(`- ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## Actionable Suggestions");
    result.suggestions.forEach((item) => lines.push(`- ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## AI Recruiter Simulation");
    lines.push(`- Verdict: **${escapeMarkdown(result.recruiterSimulation.verdict)}**`);
    lines.push(`- Summary: ${escapeMarkdown(result.recruiterSimulation.summary)}`);
    lines.push("- Signals:");
    result.recruiterSimulation.signals.forEach((item) => lines.push(`  - ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## Hidden Risks");
    result.hiddenRisks.forEach((item) => lines.push(`- ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## Career Path Recommendation");
    lines.push(`- Suggested Path: **${escapeMarkdown(result.careerPath.title)}**`);
    lines.push(`- Confidence: ${result.careerPath.confidence}%`);
    lines.push(`- Rationale: ${escapeMarkdown(result.careerPath.summary)}`);
    lines.push("- Next Skill Targets:");
    result.careerPath.nextSkills.forEach((item) => lines.push(`  - ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## Personalized Improvement Roadmap");
    result.improvementRoadmap.forEach((item, index) => lines.push(`${index + 1}. ${escapeMarkdown(item)}`));

    lines.push("");
    lines.push("## Top Ranked Repositories");
    lines.push("| Repo | Importance | Stars | Forks | Watchers | Last Push | README |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");

    result.rankedRepos.slice(0, 10).forEach((repo) => {
        lines.push(
            `| [${escapeMarkdown(repo.name)}](${repo.url}) | ${repo.importance} | ${repo.stars} | ${repo.forks} | ${repo.watchers} | ${formatDate(repo.pushedAt)} | ${repo.readmeKnown ? (repo.hasReadme ? "Yes" : "No") : "Unknown"} |`
        );
    });

    lines.push("");
    lines.push("## Pinned Repositories");
    lines.push(`- Source: ${result.pinnedRepos.source}`);

    result.pinnedRepos.items.forEach((repo) => {
        lines.push(`- [${escapeMarkdown(repo.name)}](${repo.url}) - ${repo.stars} stars`);
    });

    lines.push("");
    lines.push("## Key Metrics");
    lines.push(`- Scorable repositories: ${result.metrics.scorableRepoCount}`);
    lines.push(`- Total stars/forks/watchers: ${result.metrics.totalStars}/${result.metrics.totalForks}/${result.metrics.totalWatchers}`);
    lines.push(`- README coverage (sampled): ${(result.metrics.readmeCoverage * 100).toFixed(1)}%`);
    lines.push(`- Repositories updated in 30d/90d: ${result.metrics.reposUpdated30d}/${result.metrics.reposUpdated90d}`);
    lines.push(`- Days since last push: ${result.metrics.daysSinceLastPush}`);
    lines.push(`- Authored PRs/issues: ${result.metrics.authoredPRCount}/${result.metrics.authoredIssueCount}`);
    lines.push(`- Unique languages: ${result.metrics.uniqueLanguages}`);
    lines.push(`- Dominant language share: ${formatPercent(result.metrics.dominantLanguageShare)} (${result.metrics.dominantLanguage})`);
    lines.push(`- Activity buckets (0-30/31-90/91-180/181+ days): ${result.metrics.activityBuckets.updated30d}/${result.metrics.activityBuckets.updated31to90d}/${result.metrics.activityBuckets.updated91to180d}/${result.metrics.activityBuckets.updated181plus}`);

    return lines.join("\n");
}

function renderHistory() {
    clearChildren(ui.historyList);

    if (!state.history.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No recent searches yet.";
        ui.historyList.appendChild(empty);
        return;
    }

    state.history.forEach((username) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-chip";
        button.textContent = username;
        button.addEventListener("click", () => {
            ui.profileInput.value = username;
            handleAnalyze();
        });

        ui.historyList.appendChild(button);
    });
}

function saveHistory(username) {
    const clean = (username || "").trim().toLowerCase();
    if (!clean) {
        return;
    }

    state.history = [clean, ...state.history.filter((item) => item !== clean)].slice(0, HISTORY_LIMIT);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
}

function setLoading(isLoading, message = "") {
    ui.analyzeBtn.disabled = isLoading;

    if (isLoading) {
        ui.loadingState.classList.remove("hidden");
        ui.loadingText.textContent = message || "Analyzing profile...";
    } else {
        ui.loadingState.classList.add("hidden");
        ui.loadingText.textContent = "Analyzing profile...";
    }
}

function clearBanners() {
    ui.errorBanner.classList.add("hidden");
    ui.errorBanner.textContent = "";

    ui.rateLimitBanner.classList.add("hidden");
    ui.rateLimitBanner.textContent = "";
}

function showError(message) {
    ui.errorBanner.textContent = message;
    ui.errorBanner.classList.remove("hidden");
}

function showRateLimit(resetAt) {
    const when = resetAt ? new Date(resetAt).toLocaleString() : "the API reset window";
    ui.rateLimitBanner.textContent = `Rate limited by GitHub API. Retry after ${when}.`;
    ui.rateLimitBanner.classList.remove("hidden");
}

function applyTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", normalized);
    localStorage.setItem(STORAGE_KEYS.theme, normalized);
    ui.themeToggleBtn.textContent = normalized === "dark" ? "Switch to Light" : "Switch to Dark";
}

function getCachedAnalysis(username, tokenMode) {
    const key = `${CACHE_PREFIX}${username.toLowerCase()}`;
    const payload = readJsonStorage(key, null);

    if (!payload || typeof payload !== "object") {
        return null;
    }

    const isFresh = Number(payload.savedAt) && Date.now() - Number(payload.savedAt) <= CACHE_TTL_MS;
    const sameMode = Boolean(payload.tokenMode) === Boolean(tokenMode);

    const hasExpectedShape =
        payload.analysis &&
        typeof payload.analysis === "object" &&
        typeof payload.analysis.overallScore === "number" &&
        typeof payload.analysis.hireabilityScore === "number" &&
        payload.analysis.readiness &&
        payload.analysis.recruiterSimulation &&
        Array.isArray(payload.analysis.improvementRoadmap);

    if (!isFresh || !sameMode || !hasExpectedShape) {
        localStorage.removeItem(key);
        return null;
    }

    return payload.analysis;
}

function setCachedAnalysis(username, tokenMode, analysis) {
    const key = `${CACHE_PREFIX}${username.toLowerCase()}`;
    localStorage.setItem(
        key,
        JSON.stringify({
            savedAt: Date.now(),
            tokenMode: Boolean(tokenMode),
            analysis
        })
    );
}

async function githubRequest(path, options = {}) {
    const {
        token = "",
        method = "GET",
        signal,
        retry = 1,
        body,
        accept = "application/vnd.github+json"
    } = options;

    const url = path.startsWith("http") ? path : `${GITHUB_API_ROOT}${path}`;

    let attempt = 0;
    while (attempt <= retry) {
        attempt += 1;

        try {
            const response = await fetch(url, {
                method,
                signal,
                headers: {
                    Accept: accept,
                    "X-GitHub-Api-Version": "2022-11-28",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                ...(body ? { body: JSON.stringify(body) } : {})
            });

            const rateInfo = extractRateInfo(response.headers);
            const contentType = response.headers.get("content-type") || "";

            if (!response.ok) {
                let errorPayload = null;
                try {
                    errorPayload = contentType.includes("application/json")
                        ? await response.json()
                        : { message: await response.text() };
                } catch {
                    errorPayload = { message: `GitHub API error (${response.status})` };
                }

                const message =
                    (errorPayload && typeof errorPayload.message === "string" && errorPayload.message.trim()) ||
                    `GitHub API error (${response.status})`;

                if (response.status === 404) {
                    throw new GitHubError("NotFound", message, { status: response.status, rateInfo });
                }

                if (response.status === 401) {
                    throw new GitHubError("Unauthorized", message, { status: response.status, rateInfo });
                }

                const rateLimited =
                    response.status === 429 ||
                    (response.status === 403 && (rateInfo.remaining === 0 || /rate limit/i.test(message)));

                if (rateLimited) {
                    throw new GitHubError("RateLimited", message, {
                        status: response.status,
                        resetAt: rateInfo.resetAt,
                        rateInfo
                    });
                }

                throw new GitHubError("Api", message, { status: response.status, rateInfo });
            }

            if (response.status === 204) {
                return { data: null, headers: response.headers, rateInfo };
            }

            let data;
            if (contentType.includes("application/json")) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            return { data, headers: response.headers, rateInfo };
        } catch (error) {
            if (error.name === "AbortError") {
                throw error;
            }

            if (error instanceof GitHubError) {
                throw error;
            }

            if (attempt > retry) {
                throw new GitHubError("Network", "Failed to reach GitHub API.", { cause: error });
            }
        }
    }

    throw new GitHubError("Network", "Failed to reach GitHub API.");
}

async function githubGraphQL(query, variables, token, signal) {
    if (!token) {
        throw new GitHubError("Unauthorized", "GitHub token is required for GraphQL requests.");
    }

    let response;
    try {
        response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
            method: "POST",
            signal,
            headers: {
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify({ query, variables })
        });
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }
        throw new GitHubError("Network", "Failed to reach GitHub GraphQL API.", { cause: error });
    }

    const rateInfo = extractRateInfo(response.headers);
    const payload = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            throw new GitHubError("Unauthorized", "GitHub token is invalid for GraphQL API.", {
                status: response.status,
                rateInfo
            });
        }

        const message = (payload && payload.message) || `GitHub GraphQL error (${response.status})`;
        throw new GitHubError("Api", message, { status: response.status, rateInfo });
    }

    if (payload.errors && payload.errors.length) {
        throw new GitHubError("Api", payload.errors[0].message || "GraphQL query failed.", {
            errors: payload.errors,
            rateInfo
        });
    }

    return payload.data;
}

function extractRateInfo(headers) {
    const remaining = Number(headers.get("x-ratelimit-remaining"));
    const resetEpoch = Number(headers.get("x-ratelimit-reset"));

    return {
        remaining: Number.isFinite(remaining) ? remaining : null,
        resetAt: Number.isFinite(resetEpoch) && resetEpoch > 0 ? new Date(resetEpoch * 1000).toISOString() : null
    };
}

async function mapWithConcurrency(items, concurrency, worker) {
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

function preRankImportanceScore(repo) {
    const days = daysSinceDate(repo.pushed_at);
    const freshness = days <= 30 ? 10 : days <= 90 ? 6 : days <= 180 ? 3 : 0;

    return (
        (Number(repo.stargazers_count) || 0) * 3 +
        (Number(repo.forks_count) || 0) * 2 +
        (Number(repo.watchers_count) || 0) +
        freshness
    );
}

function computeActivityInLastSixMonths(repos) {
    const now = new Date();
    const monthKeys = [];

    for (let i = 0; i < 6; i += 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        monthKeys.push(`${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`);
    }

    const activeSet = new Set();

    repos.forEach((repo) => {
        if (!repo.pushed_at) {
            return;
        }

        const pushed = new Date(repo.pushed_at);
        const key = `${pushed.getUTCFullYear()}-${pushed.getUTCMonth() + 1}`;
        if (monthKeys.includes(key)) {
            activeSet.add(key);
        }
    });

    const activeMonths = activeSet.size;
    return {
        activeMonths,
        ratio: activeMonths / 6
    };
}

function getRecencyBucket(daysSinceLastPush) {
    if (daysSinceLastPush <= 7) {
        return 1;
    }
    if (daysSinceLastPush <= 30) {
        return 0.8;
    }
    if (daysSinceLastPush <= 90) {
        return 0.6;
    }
    if (daysSinceLastPush <= 180) {
        return 0.3;
    }
    return 0.1;
}

function getSeverity(score) {
    if (score >= 70) {
        return "good";
    }
    if (score >= 40) {
        return "warn";
    }
    return "risk";
}

function severityToChipClass(severity) {
    if (severity === "good") {
        return "chip-good";
    }
    if (severity === "warn") {
        return "chip-warn";
    }
    return "chip-risk";
}

function severityColor(severity) {
    if (severity === "good") {
        return getCssVar("--good");
    }
    if (severity === "warn") {
        return getCssVar("--warn");
    }
    return getCssVar("--risk");
}

function scoreToGrade(score) {
    if (score >= 90) {
        return "A+";
    }
    if (score >= 80) {
        return "A";
    }
    if (score >= 70) {
        return "B";
    }
    if (score >= 60) {
        return "C";
    }
    if (score >= 45) {
        return "D";
    }
    return "E";
}

function getNamedSubscore(key) {
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

function safeRatio(numerator, denominator) {
    if (!denominator) {
        return 0;
    }
    return numerator / denominator;
}

function scoreFromRatio(ratio) {
    return clampToRange(Math.round(cap01(ratio) * 100), 0, 100);
}

function cap01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}

function clampToRange(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatDate(value) {
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

function daysSinceDate(value, nowMs = Date.now()) {
    if (!value) {
        return Number.POSITIVE_INFINITY;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return Number.POSITIVE_INFINITY;
    }

    return Math.floor((nowMs - date.getTime()) / 86400000);
}

function formatCompactNumber(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

function formatPercent(value) {
    return `${Math.round(cap01(value) * 100)}%`;
}

function joinRepoNames(names) {
    if (!names.length) {
        return "target repositories";
    }
    return names.map((name) => `\`${name}\``).join(", ");
}

function dedupe(items) {
    return items.filter((item, index) => items.indexOf(item) === index);
}

function readJsonStorage(key, fallback) {
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

function clearChildren(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function appendEmptyState(container, text) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = text;
    container.appendChild(li);
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function escapeMarkdown(text) {
    return String(text).replace(/[|]/g, "\\|");
}
