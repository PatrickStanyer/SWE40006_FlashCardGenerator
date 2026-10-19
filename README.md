# Flashcard Generator

A React and Vite frontend for creating and studying flashcards.

## Prerequisites

- Node.js 20.19+ or 22.12+, and npm
- A running API service for card generation
- A Supabase project for sign-in and saved decks

## Run Locally

From the repository root, copy the example environment file to `.env`:

```bash
# macOS / Linux
cp env.example .env
```

```powershell
# Windows PowerShell
Copy-Item frontend/env.example .env
```

Edit `.env` and replace the Supabase placeholder values with your project's URL and anon/publishable key. The anon/publishable key is intended for browser use; do not put a Supabase service-role key in the frontend environment.

Then install dependencies and start Vite:

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>.

The root `.env` file is read by Vite and is ignored by Git. Restart the dev server after changing environment values.

## Services

- **Card generation:** Vite proxies `/api` and `/healthz` to `http://localhost:8000`. Start the project's API service separately on port 8000. The API service is not included in this repository.
- **Sign-in and saved decks:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root `.env`. To enable saved decks, run [`frontend/supabase-schema.sql`](frontend/supabase-schema.sql) against your Supabase project. The frontend can start without Supabase credentials, but account features will be unavailable.

`VITE_API_URL` defaults to `/api`; keep that value for the local Vite proxy unless you intentionally use a different API URL.

## Other Commands

Run the frontend tests:

```bash
cd frontend
npm test
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```
# trigger ci
