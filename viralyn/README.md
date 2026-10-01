# Viralyn

**Your AI co-writer for LinkedIn.** Plan. Create. Publish. Grow.

Viralyn learns your voice, turns what actually happened to you into posts, reviews every draft, and never publishes anything without your approval.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth (email + password), PostgreSQL, app shell, My Voice | ✅ |
| 2 | Ask Viralyn chat, LinkedIn-style preview, Review | ✅ |
| 3 | Experience Inbox: text and voice notes (browser transcription), pillar tagging, "Draft a post", weekly prompt | ✅ |
| 4 | LinkedIn OAuth (OpenID + `w_member_social`), Publish now, publish-on-schedule, Published only with a LinkedIn post id | ✅ (tested against a local API stub, not real LinkedIn) |
| 5 | Posting settings, Calendar (month/week, drag to reschedule), Planned slots by pillar weight, background worker with retries and time zones | ✅ |
| 6 | Analytics: CSV import, manual entry, totals, charts by format/pillar/time, insights with sample size and confidence | ✅ |
| 7 | Autonomous mode | ⛔ Deliberately not built (see below) |
| 8 | In-app notifications, activity log, pause/resume, chat confirmation cards | ✅ partial: no email/browser push, no Demo Mode, no OAuth login |

**Why no Autonomous mode:** publishing under someone's name without per-post approval is the riskiest feature and contradicts the product's promise. Scheduling approved posts covers the convenience.

**Chat tools:** `draft_post`, `edit_draft`, `save_experience`, `submit_for_review`, `get_post_history`, `get_analytics`, `update_settings` and `update_schedule` (both shown as confirmation cards, applied only on Confirm), and `research_topic` (returns "unavailable": no search API is wired in, so the model is told not to state current facts).

**Not live-tested:** AI output quality. The NVIDIA path (tool loop, structured JSON with retry, write → review → auto-revise) was tested end to end against a local OpenAI-compatible stub, not real models.

## How honesty is enforced

- **Personal formats** (storytelling, personal lesson, mistake/lesson, Personal Journey pillar) are rejected in code unless the draft is tied to an Inbox experience (`lib/ai/formats.ts`, `lib/ai/pipeline.ts`).
- **Review** runs on every draft: an LLM check covers Accuracy, Relevance, Voice, Readability, Spam, Safety and Privacy, and a **deterministic** Originality check catches 8-word phrases copied from your samples and overlap with past posts (`lib/ai/similarity.ts`). If a critical check fails (Accuracy, Originality, Safety, Privacy), the draft is revised automatically up to 2 times, then marked *Needs revision* with the reason.
- **Approve** is only possible from the post card, and only for posts with no critical failures. The chat has no publish tool.
- With no research sources attached yet, the writer is told not to state statistics, and the reviewer fails any unsupported factual claim.
- No `ANTHROPIC_API_KEY`: AI features return "AI is unavailable", never placeholder output.

## LinkedIn API findings (Phase 4 prep)

- **Posting to a personal profile:** available through the self-serve *Share on LinkedIn* product (`w_member_social`, with OpenID Connect `openid profile email`) via the Posts API. This is enough for manual publishing and publish-on-approval.
- **Reading post analytics for a personal profile:** `r_member_social` and member post analytics are restricted to approved partners. Plan on LinkedIn's analytics **export import (CSV/XLSX)** and manual entry. Show API metrics as *Unavailable* unless access is granted.
- **Out-of-sync detection** needs the same restricted read access, so it will likely ship as *Unavailable* for personal accounts.

Re-verify these on LinkedIn's developer portal before building Phase 4, because access tiers change.

## LinkedIn setup

1. Create an app at developer.linkedin.com and add the products **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
2. Register the redirect URL `$APP_URL/api/linkedin/callback`.
3. Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` and `ENCRYPTION_KEY`.

Access tokens last about 60 days, and self-serve apps get no refresh token. When a token expires, Viralyn pauses publishing, marks the post Failed with LinkedIn's reason, and asks you to reconnect.

## AI provider

All AI calls go through `src/lib/ai/client.ts`. Set `AI_PROVIDER` and `AI_API_KEY`:

| `AI_PROVIDER` | Default model | Host to allow in the network policy |
|---|---|---|
| `gemini` (default) | `gemini-flash-latest` | `generativelanguage.googleapis.com` |
| `nvidia` | `meta/llama-3.3-70b-instruct` | `integrate.api.nvidia.com` |
| `groq` | `llama-3.3-70b-versatile` | `api.groq.com` |
| `openrouter` | `google/gemini-flash-latest` | `openrouter.ai` |
| `openai` | `gpt-5-mini` | `api.openai.com` |
| `openai-compatible` | set `AI_MODEL` and `AI_BASE_URL` | your endpoint |
| `anthropic` | `claude-opus-5-5` (uses `ANTHROPIC_API_KEY`) | `api.anthropic.com` |

`AI_MODEL` overrides any default, and the model must support tool calling. Non-Claude providers use JSON mode (schema-guided decoding on NVIDIA), with the schema stated in the prompt, Zod validation and one corrective retry.

Free tiers (Gemini, Groq, NVIDIA) are fine for testing. Gemini's free tier may use your prompts to improve Google's products, so use a paid tier for private data.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · PostgreSQL + Drizzle ORM · NVIDIA-hosted models or the Claude API (JSON outputs validated with Zod) · bcrypt session auth with hashed session tokens in the DB · AES-256-GCM for OAuth tokens at rest.

The AI pipeline is **Write → Review** (Plan+Research comes later), with each step returning schema-validated JSON. The chat is a manual tool-use loop. Token usage and cost are logged per user and post in `usage`.

## Run locally

```bash
./scripts/dev-setup.sh             # cloud/Linux: starts Postgres, creates the DB, installs, migrates
cp .env.example .env.local        # set DATABASE_URL, ANTHROPIC_API_KEY, ENCRYPTION_KEY
npm install
npm run db:migrate
npm run dev                        # http://localhost:3000
npm run worker                     # scheduler: publishes due posts every minute (needs CRON_SECRET, APP_URL)
npm test                           # unit tests
npm run typecheck
```

Schema changes: edit `src/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`.

## Security notes

- Every API route goes through `authed()`: session check, per-user rate limit, Zod validation, and ownership checks on every post query.
- Users can export all their data (Settings → Your data) and delete their account, which cascades to all rows.
- The rate limiter is in-memory. Move it to Redis before running more than one instance.
