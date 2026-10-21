# AI Flashcard Generator

An automated study flashcard application with an industrial-grade CI/CD pipeline, containerized multi-stage deployments, and automated quality gates.

Built for **SWE40006 - Software Deployment and Evolution** (Group 3).

---

## 🌐 Deployed Environments (AWS EC2)

| Environment | URL | Internal Container Port | Health Check |
|---|---|---|---|
| **Staging** | [http://54.252.251.138:8080/](http://54.252.251.138:8080/) | `:8080` (Direct test stack) | `http://54.252.251.138:8080/healthz` |
| **Production** | [http://54.252.251.138/](http://54.252.251.138/) | `:80` (Promoted release) | `http://54.252.251.138/healthz` |

---

## 🏗️ Architecture Overview

The system follows a three-tier microservice architecture:
1. **Frontend (`/frontend`):** Single-page application built with React 18 and Vite. Containerized with multi-stage `node:20-alpine` and unprivileged Nginx (`nginxinc/nginx-unprivileged:1.27-alpine`).
2. **Backend API (`/backend`):** REST API built with FastAPI and Python 3.11. Exposes `/healthz`, `/api/generate`, `/api/cards`, and interactive OpenAPI docs at `/docs`. Built with deterministic fallback mock mode (`AI_MOCK_MODE=true`) and live OpenAI/Gemini support. Runs in a hardened, non-root container (`appuser`).
3. **E2E Smoke Suite (`/e2e`):** Playwright automated browser test suite that verifies the deployed Staging environment before production release.

---

## 🚀 Quick Start (Local Development)

### Option A: Run the Full Stack with Docker Compose (Recommended)
```bash
docker compose -f docker-compose.dev.yml up --build
```
Open [http://localhost:8080](http://localhost:8080) to interact with the application.

---

### Option B: Run Services Locally Without Docker

#### 1. Setup Environment
```bash
# Windows PowerShell
Copy-Item env.example .env

# macOS / Linux
cp env.example .env
```

#### 2. Start Backend API
```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\activate | Unix: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```
Open [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive Swagger UI.

#### 3. Start Frontend Client
```bash
cd frontend
npm ci
npm run dev
```
Open [http://localhost:5173](http://localhost:5173). The Vite dev server automatically proxies `/api` and `/healthz` to `http://localhost:8000`.

---

### Services & Configuration

- **Card generation:** Vite proxies `/api` and `/healthz` to `http://localhost:8000`.
- **Sign-in and saved decks:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root `.env`. To enable saved decks, run [`frontend/supabase-schema.sql`](frontend/supabase-schema.sql) against your Supabase project. The frontend can start without Supabase credentials, but account features will be unavailable.

`VITE_API_URL` defaults to `/api`; keep that value for the local Vite proxy unless you intentionally use a different API URL.

### Deploying & CI/CD Variables

The CD workflow builds one frontend image for both staging and production, so configure the shared Supabase project in the repository's **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These values are embedded into the static frontend at image-build time. The anon/publishable key is intended for browser use; never use a Supabase service-role key here. The workflow fails the frontend image build if either variable is missing.

---

## 🛡️ Automated Quality Gates & Testing

Every Pull Request must pass the mandatory status checks enforced by GitHub Actions and Branch Protection:

### 1. Frontend Quality Checks
```bash
cd frontend
npm run lint          # ESLint with --max-warnings=0 (zero warnings allowed)
npm run test:coverage # Vitest suite with >=80% line coverage enforcement (current: 92.8%)
npm run build         # Production asset compilation
```

### 2. Backend Quality Checks
```bash
cd backend
ruff check .          # Ruff static analysis
pytest --cov=app --cov-report=term-missing --cov-fail-under=80 # 35 tests, 100% coverage
```

### 3. Container & Dependency Security Scanning (Trivy)
Automated in `.github/workflows/ci.yml`:
- Scans repo dependencies for known vulnerabilities (`vuln`).
- Scans built Docker images for CVEs and misconfigurations (`DS-0002` non-root compliance).
- Fails the PR on any unresolved `HIGH` or `CRITICAL` severity findings.

### 4. End-to-End Browser Smoke Testing (Playwright)
```bash
cd e2e
npm ci
npx playwright install chromium
npm test              # Executes 6 live user journey tests against Staging
```

---

## 🔄 CI/CD Pipeline Workflow

```
[ Developer Branch ]
       │  (git push)
       ▼
[ Pull Request to main ] ───>  GitHub Actions: CI Quality Gate
                               ├── 1. Frontend: ESLint + Vitest (>=80%) + Build
                               ├── 2. Backend: Ruff + Pytest (>=80%)
                               └── 3. Security: Trivy Container & FS Scan
                                      │
                                      ▼ (All Checks Pass + Peer Approval)
                               [ Merge to main ]
                                      │
                                      ▼
                               GitHub Actions: CD Pipeline
                               ├── 1. Build immutable container images
                               ├── 2. Tag with commit SHA (sha-<short-sha>)
                               ├── 3. Push images to GHCR
                               ├── 4. Deploy to AWS EC2 Staging (:8080)
                               ├── 5. Automated Playwright Smoke Gate
                               │      │
                               │      ▼ (Manual GitHub Environment Gate)
                               └── 6. Promote exact image SHA to Production (:80)
```

---

## 📖 Presentation and Live Demonstration
For detailed step-by-step instructions for the 15-minute presentation demo (Phase A failing gate, Phase B staging deployment, Phase C production promotion), refer to [`docs/demo-guide.md`](docs/demo-guide.md).
