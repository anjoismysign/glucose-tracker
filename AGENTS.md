# AGENTS.md

## Commands

```bash
npm run dev      # Start backend only (tsx server.ts → Express + Telegraf + Socket.IO)
npm run build    # Build frontend to dist/ for Netlify deploy
npm run preview  # Preview built frontend (npx vite preview)
npm run lint     # Type-check only (tsc --noEmit) — NOT a linter, NOT ESLint
```

There is no test suite.

## Architecture

- **`server.ts`** is the **entire backend** — Express, Telegraf bot, Socket.IO, SQLite, Anthropic API, Groq Whisper. There are no route files, controllers, or middleware directories. Everything is in one file.
- **`src/`** is the React frontend (Vite + Tailwind CSS v4 + `motion/react`), deployed to Netlify; API calls proxied via `netlify.toml` to Oracle Cloud.
- **SQLite** (`history.db`): tables `audios`, `glycemias`, `messages` — created via `CREATE TABLE IF NOT EXISTS` on startup. No migration system.
- The `@` path alias maps to the **project root** (`.`), not `src/`.

## Environment & Config

- `.env` and `frontend.env` are **gitignored**. Use `.env.example` as reference.
- `VITE_API_URL` and `VITE_TOKEN_KEY` are loaded by Vite from `frontend.env` and injected as `process.env.*` defines.
- `DISABLE_HMR=true` disables Vite HMR (used in AI Studio to prevent flickering during agent edits). Do not remove from `vite.config.ts`.
- `WHITELIST.txt`: one Telegram user ID per line. Only whitelisted users can interact with the bot. Denied users are shown their own ID for adding.

## Key Backend Details

- **System prompt** (`SYSTEM_PROMPT.txt`) is in Spanish. Placeholders `%timestamp%` and `%audioId%` are replaced at runtime.
- **Meal type auto-detection**: BREAKFAST 4-9, LUNCH 11-14, DINNER 17-21, OTHER otherwise (local server time).
- **History**: max 60 messages per chat. Consecutive same-role messages merged. `tool_use` blocks stripped from stored assistant messages. `tool_result`-only user messages skipped. `is_transaction_end` marks conversation boundaries.
- **Socket.IO**: emits `glycemia_updated` when a new reading is registered via the bot's `register_glycemia` tool call.
- **Audio processing**: voice messages are transcribed via Groq Whisper, writing a temp file `temp_<fileId>.ogg` to disk, then deleted after transcription.
- **JWT auth**: `/api/login` returns a 30d token. `/api/health` and `/api/glycemias` are protected.

## Deploy

- Frontend: `npm run build` → Netlify serves `dist/`. API calls `/api/*` proxied to Oracle Cloud backend via `netlify.toml`.
- Backend: run `npm run dev` on the OCI instance (port 3000).
