# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glucose Tracker is a diabetes management system with a Telegram bot interface and React admin dashboard. Users register glucose readings via Telegram (voice or text), and an AI assistant (Claude) processes and stores them. Administrators view data and export to Excel via the web dashboard.

## Commands

```bash
npm run dev      # Run backend server (tsx server.ts)
npm run build    # Build Vite frontend to dist/
npm run preview  # Preview built frontend
npm run lint     # TypeScript type checking (no emit)
npm run clean    # Remove dist/ folder
```

## Architecture

### Backend (`server.ts`)
- **Express server** on port 3000 with CORS and JSON parsing
- **Telegram bot** (Telegraf) — primary user interface for glucose registration via voice or text
- **AI Processing pipeline**:
  - Groq Whisper for speech-to-text transcription of voice messages
  - Anthropic Claude for natural language understanding and tool execution
- **SQLite database** (`history.db`) with 3 tables:
  - `audios` — Telegram voice message blobs
  - `glycemias` — Glucose readings (glucose_level, meal_type, timestamp, note)
  - `messages` — Chat history for LLM context (keeps last 60 messages per user)
- **Socket.IO** — Emits `glycemia_updated` event when new readings are registered (dashboard auto-refreshes)
- **JWT authentication** — Protects `/api/health` and `/api/glycemias` endpoints

### Frontend (`src/App.tsx`)
- **React 19** with TypeScript and Tailwind CSS v4 (via Vite plugin)
- **Login screen** — Admin authentication with JWT stored in localStorage
- **Dashboard** — Displays glucose history, system status, period averages; exports to styled Excel via xlsx-js-style
- **Socket.IO client** — Listens for `glycemia_updated` to auto-refresh data

### System Prompt (`SYSTEM_PROMPT.txt`)
- Loaded at server startup and injected into Claude API calls
- Contains user identity context and glucose registration rules
- Timestamp and audio ID placeholders (`%timestamp%`, `%audioId%`) are replaced at runtime

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (required for bot) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `ANTHROPIC_BASE_URL` | — | Anthropic base URL (optional) |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20240620` | Anthropic model name |
| `GROQ_API_KEY` | — | Groq API key for speech transcription |
| `JWT_SECRET` | `caravana-rosa-secret-2026` | JWT signing secret |
| `ADMIN_USER` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `kadjo5-davjar-Borkyd` | Admin password |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | CORS origin |
| `VITE_API_URL` | — | API base URL for frontend |
| `VITE_TOKEN_KEY` | `glucose_token` | localStorage key for JWT |

### Whitelist (`WHITELIST.txt`)
- One Telegram user ID per line
- Only whitelisted users can interact with the bot (checked via Telegraf middleware)

## Key Implementation Details

- **LLM tool**: `register_glycemia` — Claude calls this to record readings (meal_type: BREAKFAST/LUNCH/DINNER/OTHER)
- **History merging**: Consecutive same-role messages are merged; tool_use blocks are stripped from stored assistant messages
- **Transaction boundaries**: `is_transaction_end` flag marks the end of a conversation turn for context window management
- **Vite HMR**: Disabled when `DISABLE_HMR=true` env var is set (used in AI Studio to prevent flickering during agent edits)
