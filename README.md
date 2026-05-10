# Creator Guild AI OS

A Next.js + TypeScript + Supabase AI operating system for managing a live-streaming creator guild.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Providers — only the key for providers you actually use is required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Optional: use a Gemini relay/proxy if Google APIs are blocked
# from your server network (for example in restricted regions).
GEMINI_BASE_URL=https://your-proxy-endpoint.com
```

A missing key for a provider only causes an error when that provider is selected for a task. Unused providers are completely ignored.
If Gemini requests fail with network errors such as `fetch failed` or `ENOTFOUND`, set `GEMINI_BASE_URL` to a reachable relay endpoint.

### 3. Run migrations

Apply all migrations in `supabase/migrations` in filename order to the same Supabase project referenced by `NEXT_PUBLIC_SUPABASE_URL`.

### 4. Seed data

```bash
# via Supabase CLI
supabase db seed
```

Or run `supabase/seed.sql` in the Supabase SQL editor.

### 5. Run the dev server

```bash
npm run dev
```

---

## Agent Model Configuration

Each agent can independently use a different AI provider and model.

### Model resolution priority

1. **Database config** — `agents.model_provider` + `agents.model_name` from the database row
2. **Code defaults** — role-based fallback defined in `src/lib/agents/model-config.ts`
3. **Error** — if still unresolved, execution throws a clear error (no silent fallback)

There is **no automatic failover** across providers. If a provider is selected but its API key is missing, the task fails with a clear error message.

### Supported providers

| Provider | Env var | Example models |
|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6`, `claude-opus-4-7` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| `gemini` | `GEMINI_API_KEY` + optional `GEMINI_BASE_URL` | `gemini-1.5-pro`, `gemini-2.0-flash` |

### Editing via the Team page

Navigate to `/team`. Each agent card has a **Model Configuration** section at the bottom with provider and model dropdowns. Changes are saved immediately to the database via `PATCH /api/agents/:id`.

---

## Architecture

- **Agents** are data-driven — behavior is defined by prompt templates in the database.
- **Executor** (`src/lib/agents/executor.ts`) is a single generic function for all agents.
- **Provider abstraction** (`src/lib/agents/providers.ts`) handles Anthropic / OpenAI / Gemini.
- **Model resolution** (`src/lib/agents/model-config.ts`) applies the DB-first fallback chain.
- Structured JSON output is enforced at the prompt level and via native `response_format` / MIME type where supported.
