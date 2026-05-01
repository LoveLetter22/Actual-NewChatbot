# Project Overview

ClarIT — an IT Help Desk AI chatbot web app.

## Architecture

- **Frontend**: React 18 + Vite + Tailwind + shadcn-style components in `src/`
- **Frontend server**: Thin Express layer (`server/index.ts`) that serves the Vite dev server and proxies all `/api/*` requests to the Python backend
- **Python backend** (`python_server/main.py`): Flask server on port 8000 — handles all API routes (conversations, messages, AI chat) using psycopg2 for PostgreSQL and the OpenAI Python SDK for AI
- **Database**: Replit PostgreSQL; schema defined in `server/schema.ts` (Drizzle); tables: `conversations`, `chat_messages`
- **AI**: OpenAI GPT-4.1 via `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` (Replit managed)
- **Knowledge Base**: `knowledge_base.md` (project root) — full IT support ruleset loaded at server startup and injected into every AI session's system prompt

## Key Files

| File | Purpose |
|------|---------|
| `python_server/main.py` | Python Flask API server — all business logic and AI |
| `server/index.ts` | Express proxy: Vite dev server + `/api/*` proxy to Python |
| `server/schema.ts` | Drizzle ORM schema (PostgreSQL) |
| `knowledge_base.md` | Full ClarIT diagnostic ruleset (G, D, H, S, N, GT rules) |
| `src/lib/api.ts` | Frontend API client |
| `src/components/ChatInterface.tsx` | Main chat UI component |

## Development

- **Start (both servers)**: `npm run dev`
  - Frontend (Express+Vite) runs on port 5000 (webview)
  - Python API runs on port 8000 (console)
- **Database sync**: `npm run db:push`
- **Production build**: `npm run build`

## AI System Prompt

The Python server builds the system prompt at startup by combining:
1. ClarIT identity and scope enforcement rules
2. Safety and escalation rules
3. The **full contents of `knowledge_base.md`** (17,500+ characters of structured IT diagnostic rules)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (Replit managed)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key (Replit managed)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI API base URL (Replit managed)
- `PYTHON_PORT` — Port for Python backend (default: 8000)
- `PORT` — Port for Express frontend server (default: 5000)
