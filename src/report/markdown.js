import { formatDate, formatPercent, escapeMarkdown } from "../utils/core.js";
import { getNamedSubscore } from "../config/constants.js";

export function buildMarkdownReport(result) {
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
