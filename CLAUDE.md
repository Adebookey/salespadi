@AGENTS.md

# SalesPadi

Multi-tenant SaaS that runs AI sales assistants for Nigerian small businesses on WhatsApp and Instagram. The operator (a solo developer) onboards vendors; the system answers their customers, takes orders, confirms payments and follows up. See README.md for setup.

## Stack
- Next.js 16 App Router, TypeScript strict, Tailwind v4, hand-rolled UI kit in `src/components/ui.tsx`. Mobile-first.
- `proxy.ts` (not middleware) refreshes the Supabase session. Request APIs (`params`, `searchParams`, `cookies`) are async.
- Supabase Postgres/Auth/Storage. RLS on every tenant table via `can_access_vendor(vendor_id)`; operators (`profiles.is_operator`) see all.
- Background work: `jobs` table + `claim_jobs()`; `/api/worker` runs handlers from `src/lib/services/handlers.ts`. Webhooks only store + enqueue + `after()`.
- Claude: `src/lib/ai/agent.ts` manual tool loop on `client.beta.messages`. Models from env (`AI_MODEL_ROUTINE` = claude-haiku-5-5, `AI_MODEL_HARD` = claude-sonnet-5-5). Sonnet calls send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). A `refusal` stop reason hands off to a human.
- Paystack per-vendor keys (encrypted), webhook at `/api/webhooks/paystack/[vendorId]`, verified again via the API before marking paid.

## Conventions
- Money in kobo (integers); format with `formatNaira`. Timezone Africa/Lagos.
- Never hard-code secrets; every env var is listed in `.env.example` and read through `src/lib/env.ts`.
- The service-role client (`adminClient()`) bypasses RLS: only in webhooks, jobs, cron, and in server actions *after* `getVendorForUser()` confirms access. Always filter by `vendor_id`.
- The agent must not state facts that didn't come from a tool. New facts the agent needs = a new tool in `src/lib/ai/tools.ts` + `AgentStore` method (both the Supabase and Memory stores).
- Job dedupe keys: `slot:` = one at a time (released on completion), `once:` = exactly once forever.
- Keep the system prompt free of time-varying content (it is prompt-cached); the current time goes in the user turn.
- Files with `"use server"` export only async functions.
- Orders are created only through the `place_order` SQL function: it reserves stock and numbers orders per vendor. Paying does not touch stock; cancelling restores it (trigger). Unpaid non-COD orders auto-cancel after 48h (`order.expire`).
- Updating the `vendors` row from the dashboard goes through `updateVendor()` in `_actions/vendor.ts`, which reports when RLS blocked a staff member instead of pretending it saved.
- AI replies are guarded by a per-vendor daily budget (`vendors.ai_daily_budget_usd`) and a per-chat hourly cap; when hit, the chat is handed to a person.

## Checks
- `npm run check` (typecheck, lint, vitest), `npm run test:db` (migrations + RLS on scratch Postgres), `npm run eval:agent` (needs ANTHROPIC_API_KEY), `npx next build`.

## Phase plan and status
1. Foundation: auth, vendors + members, RLS, operator shell, seed (Kicks by Tolu, 10 products) — done
2. Catalog and onboarding: wizard, product CRUD, photos, variants, stock — done
3. AI agent + prompt studio + 20-message eval — done (eval not yet run against the live API)
4. WhatsApp: webhook, worker, AI replies with photos, unified inbox, handoff/resume — done
5. Orders and payments: Paystack link + webhook, transfer proof + one-tap confirm, reminders, Sheets sync — done
6. Instagram DMs into the same inbox — done
7. Vendor daily summary, delivery updates, rider link — done
8. Growth: comment-to-DM, enquiry follow-ups, opt-in broadcasts, weekly report, AI cost per vendor, restock alerts, IG import, vendor WhatsApp commands, voice-note hook — done
Not yet verified end-to-end against real Supabase, Meta, Paystack and Google accounts.
