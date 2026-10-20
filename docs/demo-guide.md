# SWE40006 - Presentation & Live Demonstration Guide

**Project:** AI Flashcard Generator  
**Team 3:** Andy (CI/Quality Gates), Patrick (Infra/CD), Khoa (Backend), Tri (Frontend)  
**Target Duration:** 15 Minutes (Demo Target: 7 Minutes)

---

## 1. Quick Reference: Live URLs & Commands

| Environment | URL | Port / Mapping | Health Endpoint |
|---|---|---|---|
| **Staging (AWS EC2)** | `http://54.252.251.138:8080/` | `:8080` (Direct test stack) | `http://54.252.251.138:8080/healthz` |
| **Production (AWS EC2)** | `http://54.252.251.138/` | `:80` (Promoted release) | `http://54.252.251.138/healthz` |

### Running Quality Gates Locally:
```bash
# Frontend: Lint & Unit Tests with >=80% coverage gate
cd frontend
npm run lint          # ESLint (--max-warnings=0)
npm run test:coverage # Vitest (92.8% line coverage)

# Backend: Static Analysis & Pytest with >=80% coverage gate
cd backend
ruff check .          # Ruff linter
pytest --cov=app --cov-report=term-missing --cov-fail-under=80  # 35 tests, 100% coverage

# E2E Smoke Tests: Live Browser Journey on Staging (Playwright)
cd e2e
npm test              # Runs 6 live user journey checks against Staging
```

---

## 2. 15-Minute Presentation Structure

```
[00:00 - 02:00]  1. Introduction & Problem Statement (Tri)
[02:00 - 05:00]  2. Architecture & Pipeline Topology (Andy & Patrick)
[05:00 - 12:00]  3. Live Demonstration (7 Minutes - Team)
                 ├── Phase A: Failing Gate (Andy)
                 ├── Phase B: Fix, Green Checks & Auto-Deploy to Staging (Andy & Khoa)
                 └── Phase C: Playwright Smoke Test & Production Release Gate (Patrick & Andy)
[12:00 - 15:00]  4. Monitoring, Trade-offs & Q&A (All)
```

---

## 3. Live Demonstration Script (Step-by-Step)

### Phase A: The Failing Gate Demo (Andy - ~2 mins)
**Objective:** Prove to examiners that GitHub Actions and Branch Protection **actively block bad code from being merged**.

1. **Explain the Setup:**
   - *"We enforce branch protection on `main`. Every pull request must pass 3 automated quality checks: Frontend (ESLint + Vitest $\ge 80\%$), Backend (Ruff + Pytest $\ge 80\%$), and Security (Trivy container scanning)."*
2. **Trigger the Failure:**
   - Open a pre-prepared PR or push a 1-line deliberate error to a test branch (e.g. an unused variable in `frontend/src/App.jsx` or an uncaught exception in `backend/app/main.py`).
3. **Show GitHub Actions Catching It:**
   - Open GitHub in the browser. Show the PR checks turn **RED ❌**.
   - Point out the status: **"Merging is blocked - At least 1 required check has failed"**.
   - Emphasize: *No developer can accidentally push broken code to Staging or Production.*

---

### Phase B: Fix, Green Checks & Automated Staging Deploy (Khoa & Andy - ~2.5 mins)
**Objective:** Show automated verification, immutable artifact building, and continuous delivery to Staging.

1. **Apply the Fix:**
   - Commit the clean fix and push.
2. **Watch the CI Quality Gates Pass:**
   - Show GitHub Actions executing:
     - `Frontend`: ESLint passes with 0 warnings; Vitest passes with $92.8\%$ coverage.
     - `Backend`: Ruff passes; Pytest passes 35 tests with $100\%$ coverage.
     - `Security (Trivy)`: Scans filesystem and Docker images; zero high/critical vulnerabilities.
   - Status turns **GREEN ✅**.
3. **Merge to `main`:**
   - Merge the pull request.
4. **Continuous Delivery Trigger:**
   - Switch to the **Actions $\rightarrow$ CD** tab.
   - Show the workflow build immutable images tagged with `sha-<commit>` and push to GitHub Container Registry (GHCR).
   - Show SSH automated deployment to AWS EC2 Staging (`:8080`).

---

### Phase C: Automated Playwright Smoke Gate & Production Promotion (Patrick & Andy - ~2.5 mins)
**Objective:** Show automated verification of the deployed environment and controlled zero-downtime release to Production.

1. **Automated Smoke Test Verification:**
   - Point to the CD workflow step: **"E2E smoke test staging (Playwright)"**.
   - Explain: *Before touching Production, Playwright opens a headless Chromium browser against `http://54.252.251.138:8080/`, fills a study topic, generates cards, tests the 3D card flip animation, and confirms `/healthz` reports the new SHA.*
2. **The Manual Production Gate:**
   - Show the workflow pausing at **"Deploy to production"** under GitHub Environments.
   - Highlight: *The release candidate is proven in Staging. Production release requires an authorized team member's approval.*
3. **Approve & Promote:**
   - Click **Review deployments $\rightarrow$ Approve and deploy**.
   - Watch the exact same container image SHA deploy to port `:80`.
4. **Live Verification:**
   - Open `http://54.252.251.138/` in the browser.
   - Hit `http://54.252.251.138/healthz` to show HTTP 200 and the updated commit SHA.

---

## 4. Key Questions Examiners Might Ask (Cheatsheet)

1. **Why do you have an `AI_MOCK_MODE`?**
   - *Answer:* Resilient deployment engineering. CI tests and automated smoke tests must be fast, deterministic, and free. Mock mode eliminates rate limits and token costs during automated testing, while Production can toggle live OpenAI `gpt-4o-mini` simply via environment variable.
2. **Why does Nginx listen on port 8080 inside the container?**
   - *Answer:* Security compliance with Trivy rule `DS-0002` (non-root execution). In Linux, non-root users cannot bind to privileged ports below 1024. We use `nginx-unprivileged` listening on 8080, and Docker maps host port 80 to container port 8080.
3. **How do you ensure environment parity between Staging and Production?**
   - *Answer:* Immutable artifacts. CI builds and publishes one container image tagged by commit SHA to GHCR. The exact same image SHA tested in Staging is promoted to Production—we never re-build containers between environments.
