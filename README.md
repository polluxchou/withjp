# Creator Network AI OS / WithJP

WithJP is an internal operating system for a live-streaming creator network. It combines creator operations, PMO workflows, cost management, finance forecasting, venue planning, asset tracking, competitor monitoring, team collaboration, notifications, and the foundation for future LangGraph-based agents.

The internal workspace is not a public SaaS surface. It is an internal business workspace for operations, finance, venue management, PMO, and leadership. The repository additionally serves the EchoAmp public website (`/site`, ja/en/zh).

## Current Product Scope

| Area | Capability | Status |
| --- | --- | --- |
| Dashboard | Business and operations overview | Implemented |
| Creators | Creator list, detail, lifecycle, pipeline context | Implemented |
| Timeline / Tasks | Milestones, work tasks, execution tracking | Implemented |
| Expenses | Cost and expense records, saved views, discussions | Implemented |
| Finance Forecast | Forecast views, lifecycle inputs, currency-aware display | Implemented |
| Items | Asset ledger, expense binding, placement, photos, status logs, item value | Implemented |
| Guild Venue | Multi-venue/floor layout, 2D/3D canvas, view bookmarks, collaborators | Implemented |
| Discussions | Subject-based business discussions | Implemented |
| Notifications | In-app notification bell, panel, read/read-all APIs, `createNotification()` | Implemented |
| Knowledge | Team knowledge content | Implemented |
| Competitors | TikTok competitor monitoring: weekly profile metrics, live-shot archive, common live-slot inference, conversational ask panel | Implemented |
| Public Site | EchoAmp public website (ja/en/zh): news, vision, recruit application forms, in-app content management | Implemented |
| Intent / NL operations | Global chat bubble (⌘K): natural-language queries and guarded write operations, multi-turn, DeepSeek-first with cross-provider fallback | Implemented |
| Workspace Chat | Agent conversation entry point | Implemented |
| Agent Service | FastAPI safety skeleton, auth middleware, run records, checkpointer setup | In progress |
| Withflows data intake | TikTok account, live tracking, short video and revenue data integration | Planned |
| Finance / Ops Agents | Read-only analysis, approval loop, dispatch, memory and observability | Planned |

## Core Cost Management Domain

Venue and Items are formal core modules, not temporary feature experiments. They are maintained as part of the Cost Management domain:

```text
Cost Management
  - Expenses
  - Items
  - Guild Venue
  - Finance Forecast
```

- Expenses records cost facts and payment context.
- Items records asset objects, status, ownership, photos, value, expense binding, and venue placement.
- Guild Venue records properties, floors, spatial components, 2D/3D layouts, view bookmarks, and collaborators.
- Finance Forecast records planning and forecasting views.

## Recent Product Direction

The recent product work moved WithJP from an operations dashboard toward a business asset management system:

1. Traditional Web UI captures structured and non-standard business data, including finance, expenses, people, venue layouts, items, work scripts, and knowledge content.
2. Natural-language querying and editing is being introduced on top of those data models. High-risk write operations should remain protected by preview, confirmation, permissions, and future approval flows.
3. Withflows live-streaming and short-video tracking data will be integrated later so TikTok account, revenue, and content performance data can become reusable company data assets.

## Main Application

### Install

```bash
npm install
```

### Configure Environment

Create `.env.local` in the project root. Keep real secrets out of Git.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI providers used by the Next.js app
DEEPSEEK_API_KEY=sk-...   # primary for intent parsing / competitor ask (cost-effective)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...    # fallback tier of the intent-parsing model ladder

# Optional Gemini relay/proxy
GEMINI_BASE_URL=https://your-proxy-endpoint.com

# Optional bridge to the Python agent-service
AGENT_SERVICE_URL=http://localhost:8000
AGENT_SERVICE_SECRET=shared_service_token
```

Unused provider keys are ignored until that provider is selected. If Gemini requests fail with network errors such as `fetch failed` or `ENOTFOUND`, set `GEMINI_BASE_URL` to a reachable relay endpoint.

### Database

Apply all migrations in `supabase/migrations` in filename order to the same Supabase project referenced by `NEXT_PUBLIC_SUPABASE_URL`.

```bash
# optional, when using Supabase CLI
supabase db seed
```

Or run `supabase/seed.sql` in the Supabase SQL editor.

### Run

```bash
npm run dev
```

The app runs on port `3001`.

```bash
npm run build
npm test
npm run test:copy
```

## Agent Model Configuration

The Next.js app supports configurable agent models through the Team page and agent API.

### Resolution Priority

1. Database config: `agents.model_provider` + `agents.model_name`
2. Code defaults in `src/lib/agents/model-config.ts`
3. Clear error if no model can be resolved

Agent model selection (Team page) has no automatic failover across providers: if a selected provider is missing its API key, the task fails with a clear error. Intent parsing and the competitor ask panel are different — they run on a cross-provider model ladder (`src/lib/llm/models.ts`, DeepSeek-first with Gemini fallback) and switch providers automatically when one is rate-limited or down.

### Supported Next.js Providers

| Provider | Env var | Example models |
| --- | --- | --- |
| `deepseek` | `DEEPSEEK_API_KEY` + optional `DEEPSEEK_BASE_URL` | `deepseek-chat` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6`, `claude-opus-4-7` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| `gemini` | `GEMINI_API_KEY` + optional `GEMINI_BASE_URL` | `gemini-2.5-pro`, `gemini-2.5-flash` |

Navigate to `/team`. Each agent card has a model configuration section with provider and model dropdowns. Changes are saved through `PATCH /api/agents/:id`.

## Agent Service

`agent-service/` is a separate Python FastAPI service that provides the W1 safety skeleton for future LangGraph agents.

Current scope:

- `/health`
- `/agent/chat` stub
- service-token authentication
- `X-User-Id` validation
- conversation existence validation
- idempotent `agent_runs`
- completed W1 stub responses
- LangGraph Postgres checkpointer setup
- tool registry metadata

It does not yet implement the W2+ business graphs, Finance Agent, Approval Loop, Ops Dispatch, or Agent Memory.

### Agent Service Environment

Use `agent-service/.env.example` as the template:

```env
AGENT_SERVICE_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=
```

### Run Agent Service Locally

```bash
cd agent-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Important Routes

| Route | Purpose |
| --- | --- |
| `/` / `/zh` | Dashboard |
| `/creators` | Creator management |
| `/pipeline` | Pipeline |
| `/timeline` | Timeline and milestones |
| `/tasks` | Team tasks |
| `/expenses` | Expense management |
| `/items` | Item and asset management |
| `/devices` | Device cost management |
| `/guild-venue` | Venue layout and 2D/3D planning |
| `/finance-forecast` | Finance forecast |
| `/competitors` | TikTok competitor monitoring board |
| `/workspace` | Agent workspace chat |
| `/team` | Team and agent model configuration |
| `/knowledge` | Knowledge base |
| `/recruit-applications` | Public-site recruit application inbox |
| `/site-content` | Public-site content management |
| `/config` | System configuration |
| `/site` | EchoAmp public website (ja/en/zh, own locale order) |

## Architecture

- `src/app/[locale]/(app)` contains authenticated pages.
- `src/app/api` contains API routes.
- `src/lib` contains business services, Supabase access, finance, items, venue, notifications, and agent utilities.
- `src/components` contains shared UI, layout, sidebar, notifications, and domain components.
- `src/venue` contains the venue canvas, 3D scene, layout data model, and inspector.
- `supabase/migrations` contains database migrations.
- `agent-service` contains the Python FastAPI agent-service skeleton.
- `docs` contains product requirements, design notes, and current product overview.

## Documentation

In the repo:

- `docs/design-system.md` for the design-token contract (enforced by CI).
- `docs/copy-glossary.md` for i18n copy conventions.
- `docs/competitors.md` for the competitor monitoring module.
- `docs/public-site.md` for the EchoAmp public website.
- `docs/venue-3d-design.md` and `docs/venue-window.md` for Guild Venue internals.
- `docs/pmo-agent-design.md` for the PMO agent design.
- `docs/superpowers/` for feature specs, implementation plans, and wrap-up records.

Local working documents, not yet checked in (kept in the maintainer's working tree):

- `docs/current-product-overview.md`, `docs/navigation-and-user-guide.md`
- `docs/items.md`, `docs/venue.md`, `docs/notifications-requirements.md`
- `docs/agent-service-design.md` and `docs/w1-requirements.md` / `w2` / `w3` for the staged agent-service plan.

## Status Notes

- Notifications are implemented as in-app notifications, not email, Slack, realtime push, or a full message center.
- Agent Service W1 is implemented as infrastructure. W2-W5 are still planned work.
- Withflows and TikTok data integration is planned and should define master-data relationships before implementation.
- Real `.env.local` files and service keys must remain local or in deployment-platform secrets only.
