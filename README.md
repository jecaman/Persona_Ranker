# Throxy Persona Ranker

Given a list of sales leads, qualify and rank them against an ideal customer persona using AI — and surface the best-fit contacts per company.

**Live demo:** _[Vercel URL]_

---

## How to run locally

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local with your credentials (see below)

# 3. Load leads into the database (one-time)
npx tsx scripts/seed.ts

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then click **Run Ranking**.

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

---

## Architecture overview

```
leads.csv
    ↓
scripts/seed.ts    →    Supabase (leads table)
                              ↓
                    POST /api/rank  ↔  Claude AI
                              ↓
                        page.tsx (table)
```

The database is the shared source of truth between all stages. Each stage is independent: ingestion, ranking, and display can run separately.

**Key files:**

- `app/api/rank/route.ts` — ranking pipeline: reads persona spec, calls Claude in parallel batches, writes results back
- `app/api/ingest/route.ts` — receives a CSV upload, replaces all leads, resets ranking state
- `lib/ranking/` — prompt builder, response parser, batch splitter
- `data/persona_spec.md` — the persona definition injected into every Claude prompt. Edit this file to change ranking criteria without touching code
- `components/leads-table.tsx` — sortable TanStack Table

---

## Key decisions

### Batching leads instead of one call per lead

Sending all ~200 leads in a single API call risks hitting output token limits and produces less consistent results — the model loses coherence near the end of a long JSON array. Sending one lead per call would cost ~200x more in latency and money.

We batch 15 leads per call (~14 batches for 200 leads). Each batch gets the full persona spec in the system prompt so the model always has the complete context.

### Parallel batch processing

Initially batches ran sequentially, which took ~70 seconds for 200 leads and exceeded Vercel's 60-second serverless timeout. Switching to `Promise.all` runs all batches simultaneously and finishes in ~5–7 seconds.

The tradeoff is higher burst token usage, but Claude's rate limits are generous enough that 14 parallel requests isn't an issue in practice.

### Claude computes scores, we compute ranks

Claude returns `{ id, score (0–100), reasoning, is_relevant }` per lead. We deliberately don't ask Claude to assign rank positions — asking a model to produce consistent ordinal rankings across batches that never see each other is unreliable.

Instead, rank is computed deterministically server-side: sort by score descending, assign position 1, 2, 3... This gives two rank views:

- **Co. Rank** — position within the company (`ROW_NUMBER() OVER (PARTITION BY account_name ORDER BY score DESC)`). Directly answers "who is the best contact at this company?"
- **Global Rank** — position across all leads (`ROW_NUMBER() OVER (ORDER BY score DESC)`). Useful for cross-company comparison.

### Exclusion handling: hard vs soft

The persona spec defines two types of contacts to avoid, and we handle them differently:

**Hard exclusions** are roles that should never be contacted under any circumstances — CFO, CTO, HR, Legal, Customer Success, Product. These get `score = 0` and `is_relevant = false` immediately, regardless of any other signal.

Importantly, some exclusions are **context-dependent**. A CEO is the ideal contact at a startup (5/5 priority) but a hard exclusion at Enterprise — they're too far removed from outbound execution. The model evaluates title *in combination with company size*, which is why we send both fields in every batch.

**Soft exclusions** are roles that are deprioritized but not disqualified — BDRs, Account Executives, CMOs, Advisors. These leads receive a score penalty of 20–30 points. They may appear in the table but will rank low within their company, and are typically filtered out by the top-N export.

**`is_relevant`** is the binary gate that separates these two worlds: `true` if `score ≥ 30`, `false` otherwise. A lead can be ranked #1 at their company and still be irrelevant if they're the only contact available and happen to be in HR. The CSV export filters to `is_relevant = true`, ensuring that genuinely disqualified contacts are never surfaced in campaigns regardless of rank.

### persona_spec.md in the repo

The persona definition lives in `data/persona_spec.md` and is injected verbatim into the system prompt. This means ranking criteria can be updated by editing a markdown file — no code changes needed. It's also version-controlled, so changes are tracked.

### Model choice: claude-3-haiku-20240307

We tested newer models (claude-haiku-4-5) but ran into frequent 529 overload errors in production. Claude 3 Haiku is the most stable and cheapest option in the Claude lineup ($0.25/$1.25 per million tokens), and produces reliable structured JSON output for this task.

---

## Tradeoffs

**No streaming / real-time progress.** The ranking button shows a spinner until all batches complete. With parallel processing this is fast enough (~5–7s) that streaming wasn't necessary for the MVP. For a production system with thousands of leads, streaming progress would be the next step.

**No authentication.** This is an internal demo tool. Adding auth would be the obvious next step before any real deployment.

**Round scores from the model.** LLMs tend to produce scores in multiples of 5 or 10 (e.g., 75, 80, 65). This is a known characteristic of how language models output numbers, not a bug. The relative ordering is still meaningful.

**Single persona spec.** The app currently supports one persona spec at a time (the file in `data/`). Supporting multiple specs or per-run specs would require storing them in the database and letting the user select one at runtime.

**Fixed CSV format.** The CSV upload expects a specific set of columns (`account_name`, `lead_first_name`, `lead_last_name`, `lead_job_title`, `account_domain`, `account_employee_range`, `account_industry`). Uploading a CSV with different column names will fail validation. Supporting arbitrary column mappings would require a UI for the user to map their columns to the expected fields — a meaningful piece of work that was out of scope for the MVP.

---

## Bonus challenges

### From the proposed list

**Track cost per AI call + show statistics** *(Easy)*
Each Claude API response includes `usage.input_tokens` and `usage.output_tokens`. We accumulate these across all batches and compute the estimated cost using Claude 3 Haiku pricing ($0.25/$1.25 per million tokens). After ranking, the UI displays total tokens used and estimated cost — e.g., *"200 leads ranked · 48,231 tokens · ~$0.014"*.

**Export top N leads per company to CSV** *(Easy)*
A configurable N input and export button in the header. Filters to `is_relevant = true` and `rank ≤ N`, sorts by company then rank, and generates the CSV entirely client-side (no server round-trip). The download is triggered via a temporary Blob URL.

**Make the table sortable** *(Easy)*
Implemented with TanStack Table. All columns are sortable by clicking the header. Default view groups leads by company (sorted by account name + per-company rank), with a visual separator between companies. Sorting by any other column breaks the grouping intentionally, with a "Group by company" button to restore the default view.

**Add and rank new leads through CSV uploads** *(Medium)*
A `POST /api/ingest` endpoint accepts a multipart CSV upload, validates the column structure, truncates the leads table, and inserts the new rows. The frontend has an "Upload CSV" button that calls this endpoint without leaving the page. After upload, clicking "Run Ranking" processes the new leads against the same persona spec.

### Added beyond the spec

**Re-rank All**
A "Re-rank All" button resets `ranked_at`, `score`, `rank`, `global_rank`, `reasoning`, and `is_relevant` to null for all leads, then re-runs the full ranking pipeline. Useful when the persona spec changes or you want to re-evaluate with a different model.

**Global Rank**
In addition to per-company rank, each lead gets a global rank across all leads sorted by score. This makes it easy to identify top leads regardless of company, and gives a cross-company view that the per-company rank alone doesn't provide.
