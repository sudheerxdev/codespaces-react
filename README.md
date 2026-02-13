# DevDetective - GitHub Portfolio Analyzer & Enhancer

DevDetective is a production-oriented static web app that evaluates a GitHub profile like a recruiter.
It fetches GitHub data, computes weighted category scores, highlights strengths and red flags,
and generates actionable portfolio improvement suggestions.

## Features

- Accepts a GitHub username or profile URL
- Supports optional GitHub PAT for higher rate limits and GraphQL pinned repositories
- Fetches public repositories, stars, forks, watchers, README presence, language signals, and recency
- Estimates activity consistency using `pushed_at` timestamps
- Fetches authored PR and issue counts via GitHub Search API
- Computes a weighted `GitHub Portfolio Score (0-100)`
- Computes `Hireability Score` and `Portfolio Readiness Level`
- Returns 7 sub-scores: Documentation Quality, Code Activity / Consistency, Project Popularity, Repository Completeness, Language Diversity, Recent Activity, Impact Signals
- Shows transparent scoring inputs and formula context in UI and report output
- Generates recruiter-style insights: Strengths, Red Flags, Actionable Suggestions (minimum 5)
- Adds AI Recruiter Simulation verdict and feedback signals
- Detects hidden portfolio risks (concentration, conversion, collaboration, momentum)
- Recommends a career path with confidence score and next-skill targets
- Generates a personalized multi-week improvement roadmap
- Includes language, repository-importance, subscore radar, and activity-bucket charts
- Includes pinned repository panel and ranked repository table
- Supports light/dark mode persistence
- Exports a downloadable recruiter-ready Markdown report
- Supports offline shell caching through service worker

## Optional GitHub Token Setup

Token is optional, but recommended for better API limits and pinned repositories.

1. Go to GitHub Settings > Developer settings > Personal access tokens.
2. Create a token with minimal read access for public data.
3. Paste it into the app's token input.

Token handling:

- Stored in browser localStorage key: `devdetective_token`
- No backend storage is used in this project

## Run Locally

This project is plain HTML/CSS/JS. Serve the repository root with any static server.

### Option 1: Python

```bash
python3 -m http.server 5500
```

Open:

```text
http://localhost:5500
```

### Option 2: VS Code Live Server or any static server

Serve the repository root and open `index.html`.

## Rate Limits and Reliability

- Handles GitHub API errors with clear user-facing messages
- Shows rate-limit reset time when available
- Aborts in-flight requests when a new analysis starts
- Retries once on transient network failures
- Caches completed analyses for 10 minutes in `devdetective_cache_{username}`

## Scoring Model Summary

Overall score combines these weighted categories:

- Documentation Quality (18%)
- Code Activity / Consistency (17%)
- Project Popularity (15%)
- Repository Completeness (14%)
- Language Diversity (10%)
- Recent Activity (14%)
- Impact Signals (12%)

Each sub-score is normalized to `0-100`, then combined by weight.

## Known Limitations

- Commit frequency is approximated using repository `pushed_at` (not full commit history traversal)
- README and language deep checks are limited to top repositories for API efficiency
- Pinned repo retrieval via GraphQL requires token; fallback ranking is used otherwise
- Output quality depends on public GitHub metadata completeness
