# Viralyn

**Your AI co-writer for LinkedIn.** Plan. Create. Publish. Grow.

Viralyn learns your voice, turns what actually happened to you into posts, reviews every draft, and never publishes anything without your approval.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth (email + password), PostgreSQL, app shell, My Voice | ✅ Live |
| 2 | Ask Viralyn chat (`draft_post`, `edit_draft`, `save_experience`, `submit_for_review`, `get_post_history`), LinkedIn-style preview, Review | ✅ Live |
| 3 | Experience Inbox (full UI, voice notes) | Partial: experiences are saved via chat and listed in Inbox |
| 4 | LinkedIn OAuth + publishing | Unavailable |
| 5 | Scheduling + calendar | Unavailable |
| 6 | Analytics import + insights | Unavailable |
| 7 | Autonomous mode | Deliberately deferred |
| 8 | Demo Mode, notifications, hardening | Not started |

Every page that isn't built says **Unavailable**. Nothing is simulated.

Not done yet: OAuth login (email/password only for now), confirmation cards for settings changes made through chat (the chat simply has no settings tools yet), and the voice-profile auto-update prompt.

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

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · PostgreSQL + Drizzle ORM · Claude API (`@anthropic-ai/sdk`, structured JSON outputs validated with Zod) · bcrypt session auth with hashed session tokens in the DB · AES-256-GCM for OAuth tokens at rest.

The AI pipeline is **Write → Review** (Plan+Research comes later), with each step returning schema-validated JSON. The chat is a manual tool-use loop. Token usage and cost are logged per user and post in `usage`.

## Run locally

```bash
cp .env.example .env.local        # set DATABASE_URL, ANTHROPIC_API_KEY, ENCRYPTION_KEY
npm install
npm run db:migrate
npm run dev                        # http://localhost:3000
npm test                           # unit tests
npm run typecheck
```

Schema changes: edit `src/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`.

## Security notes

- Every API route goes through `authed()`: session check, per-user rate limit, Zod validation, and ownership checks on every post query.
- Users can export all their data (Settings → Your data) and delete their account, which cascades to all rows.
- The rate limiter is in-memory. Move it to Redis before running more than one instance.
