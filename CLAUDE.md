# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Perfil del desarrollador

El desarrollador es programador junior con experiencia en ingeniería de datos, Python, SQL y bases de datos. JavaScript/TypeScript y el ecosistema frontend (Next.js, React) son áreas más nuevas para él.

Por eso:
- Explica siempre los conceptos de Next.js, React y TypeScript que no son obvios viniendo de Python/SQL
- Cuando escribas código nuevo, explica brevemente qué hace cada parte y por qué se hace así
- Conecta conceptos nuevos con equivalentes conocidos cuando sea posible (ej: "esto es como un JOIN en SQL", "esto es como un decorador en Python")
- No asumas familiaridad con patrones frontend como hooks, server components, o el App Router
- Avanza paso a paso, un concepto a la vez

## Project Overview

This is the **Throxy Persona Ranker** — a Next.js full-stack app that ingests a CSV of ~200 sales leads, runs an AI ranking process against an ideal customer persona spec, and surfaces the best-fit contacts per company in a results table.

## Tech Stack

- **Framework**: Next.js with TypeScript (App Router)
- **Database**: Supabase (Postgres)
- **UI**: shadcn/ui + TanStack Table
- **AI**: Anthropic Claude (preferred) or OpenAI
- **Deployment**: Vercel

## Development Commands

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## Architecture

### Data Flow

1. **Ingestion** (script/seed, no frontend needed): Parse `leads.csv` → insert rows into Supabase `leads` table.
2. **Ranking** (triggered from frontend): Read persona spec → batch leads → call AI API → write `rank`, `score`, `reasoning` back to each lead row.
3. **Display**: Frontend fetches ranked leads from Supabase and renders them in a TanStack Table.

### Key Design Decisions

- **Persona spec** lives in `persona_spec.md` (checked into repo). The AI prompt is built by concatenating the spec with batched lead data.
- **Relevance gate**: Leads that don't match the persona at all should receive a score indicating disqualification, not just a low rank — this distinction matters for filtering irrelevant contacts.
- **Batching**: AI calls should batch multiple leads per request (not one call per lead) to control cost and latency. Track token usage per call.
- **Reusability**: The ranking pipeline should accept any CSV + persona spec, not be hardcoded to the provided assets. Design the ingestion and ranking as reusable flows so new CSVs can be added from the frontend later.

### Database Schema (Supabase)

```sql
-- leads: columnas del CSV + resultados del ranking
id, account_name, lead_first_name, lead_last_name, lead_job_title,
account_domain, account_employee_range, account_industry,
score, rank, reasoning, is_relevant, ranked_at
```

### API Routes (Next.js App Router)

- `POST /api/rank` — trigger AI ranking; lee leads sin rankear, llama a Claude en batches, escribe resultados
- `GET /api/leads` — devuelve leads rankeados para el frontend

### AI Ranking Strategy

Prompt pide al modelo un array JSON: `[{ id, score (0-100), rank, reasoning, is_relevant }]`. Parseo determinista, sin regex. Si un batch falla, se loguea y se continua con el siguiente.

## Estructura

```
app/                     # Next.js App Router
  page.tsx               # Pagina principal
  api/rank/route.ts      # Endpoint de ranking
lib/
  supabase.ts            # Clientes Supabase (server + browser)
  types.ts               # Tipos compartidos (Lead, RankingResult)
  ranking/               # Logica de IA (prompt, parser, batcher)
components/
  leads-table.tsx        # Tabla TanStack
scripts/
  seed.ts                # Ingesta CSV → Supabase
data/
  leads.csv              # ~200 leads a rankear
  eval_set.csv           # 50 leads pre-rankeados (bonus)
  persona_spec.md        # Especificacion de la persona ideal
docs/
  ARCHITECTURE.md        # Decisiones de diseño
  ROADMAP.md             # Plan de tareas
```

## Assets

- `data/leads.csv` — columnas: `account_name`, `lead_first_name`, `lead_last_name`, `lead_job_title`, `account_domain`, `account_employee_range`, `account_industry`
- `data/eval_set.csv` — columnas: `Full Name`, `Title`, `Company`, `LI`, `Employee Range`, `Rank`
- `data/persona_spec.md` — fuente de verdad del prompt de ranking

## Bonus Features (in scope)

- **Cost tracking**: store token counts + estimated USD cost per ranking run; display stats in UI
- **Sortable table**: TanStack Table column sorting by rank, score, company
- **CSV export**: export top N leads per company
- **CSV upload UI**: allow uploading new `leads.csv` from frontend (calls `/api/ingest`)
- **Real-time progress**: use Vercel AI SDK streaming or Server-Sent Events to show ranking progress row-by-row
