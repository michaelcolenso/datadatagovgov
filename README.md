# Recall Engine — Phases 1 & 2

Programmatic SEO engine that ingests NHTSA vehicle recall data into a structured PostgreSQL database.

## Architecture

```
NHTSA vPIC API ──→ Makes ──→ Models
                                  ↓
NHTSA Recalls API ──→ VehicleYear ──→ Recall
                                        ↓ (Phase 3)
                                   LLM Enrichment
                                        ↓ (Phase 4)
                                   Next.js Frontend
```

## Minimum required files

Create these files before running commands:

- `.env`
  - `DATABASE_URL` (required, PostgreSQL connection string used by Prisma)

You can bootstrap with:

```bash
cp .env.example .env
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your database URL
cp .env.example .env
# Edit .env with your Supabase/Vercel Postgres URL

# 3. Generate Prisma client + push schema to DB
npx prisma generate
npx prisma db push

# 4. Run the ingestion pipeline
npx tsx src/scripts/ingest.ts --makes-only          # Just sync ~35 popular makes
npx tsx src/scripts/ingest.ts --make "Toyota"        # Full pipeline for one make
npx tsx src/scripts/ingest.ts --year-start 2020      # All popular makes, 2020+
npx tsx src/scripts/ingest.ts --limit 5              # First 5 makes (alphabetical)
npx tsx src/scripts/ingest.ts --dry-run              # Preview without fetching recalls
```

## Database Schema (Phase 1)

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `makes` | name, slug, nhtsa_id | Top-level manufacturers |
| `models` | make_id, name, slug | Vehicle models per make |
| `vehicle_years` | model_id, year | Specific model-years |
| `recalls` | vehicle_year_id, campaign#, raw + enriched text | Individual recall campaigns |
| `ingestion_logs` | run_type, status, counts | Pipeline audit trail |

## Ingestion Engine (Phase 2)

The ingestion script (`src/scripts/ingest.ts`) handles:

- **Rate limiting**: 500ms minimum between requests, exponential backoff on 429/5xx
- **Retry logic**: 3 retries per request with 30s timeout
- **Idempotency**: All writes are upserts — safe to re-run
- **Severity classification**: Components auto-classified as CRITICAL/HIGH/MEDIUM/LOW
- **Audit logging**: Every run creates an `ingestion_logs` entry

## CLI Flags

| Flag | Description |
|------|-------------|
| `--makes-only` | Only sync makes, skip models/recalls |
| `--recalls` | Skip make sync, go straight to models+recalls |
| `--make "Ford"` | Process a single make |
| `--year-start N` | Start year (default: 2015) |
| `--year-end N` | End year (default: current year) |
| `--all-makes` | Include all 1,100+ NHTSA makes, not just popular |
| `--limit N` | Max number of makes to process |
| `--dry-run` | Sync makes+models but skip recall fetching |

## File Structure

```
recall-engine/
├── prisma/
│   └── schema.prisma          # Phase 1: Database schema
├── src/
│   ├── lib/
│   │   ├── nhtsa-client.ts    # NHTSA API wrapper + Zod validation
│   │   ├── rate-limiter.ts    # Throttle + retry + backoff
│   │   └── utils.ts           # Slugify, severity classifier, date parser
│   └── scripts/
│       └── ingest.ts          # Phase 2: Main ingestion orchestrator
├── .env.example
├── package.json
└── tsconfig.json
```

## Next Phases

- **Phase 3**: LLM enrichment pipeline (translate raw NHTSA text → human-readable)
- **Phase 4**: Next.js frontend with ISR + dynamic `/[make]/[model]/[year]` routes
- **Phase 5**: Technical SEO (metadata, JSON-LD, sitemap generation)
