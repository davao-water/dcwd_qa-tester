# QA Hub — project rules for Claude Code

**QA Hub is the ticket hub for the DCWD ERP.** 5 QA testers and the developers file and discuss ERP bugs, suggestions
and improvements here (marked-up screenshots, videos, a conversation per ticket, and a who's-who directory of module
owners) instead of Messenger. QA testers also make their Daily Accomplishment Report (My DAR) here.

It runs on **Vercel** (hosting, HTTPS, region `sin1`) with **Supabase** (Postgres database and Storage for files,
region `ap-southeast-1`), behind QA Hub's own login. Operations are in `docs/OPERATIONS.md`, the roadmap in
`docs/PLAN.md`, domain terms in `docs/glossary.md`.
Build **one phase at a time**, start in plan mode, and stop for review at the end of each phase.

## Stack (do not swap without asking)
- Next.js 16 App Router (Cache Components on), React 19, TypeScript strict, Tailwind 4. No `src/` dir; code lives in
  `app/` and `lib/`.
- DB: Prisma 7 + Supabase Postgres through `@prisma/adapter-pg`. Every client comes from `lib/db-client.ts`.
  - `DATABASE_URL`: the transaction pooler (port 6543, `?pgbouncer=true`), used by the app and scripts.
  - `DIRECT_URL`: the session pooler (port 5432), used by `prisma migrate` (`prisma.config.ts`).
  - Never run `npx prisma init` or paste the Supabase dashboard's Prisma snippets; they overwrite this setup.
- Files: a private Supabase Storage bucket (`attachments`), reached only with the service-role key on the server
  (`lib/uploads/storage.ts`). Browsers upload straight to it with a signed URL, because Vercel caps request bodies at 4.5 MB.
- Tests: Vitest on PGlite (`tests/unit/helpers/test-db.ts`), an in-memory Postgres; tests never touch Supabase.
- Validation: `zod`. Package manager: npm.

## Hard rules
1. **Ticket data never goes to an LLM.** Ticket text, screenshots and videos show customer names, account numbers and
   amounts. No AI feature reads tickets unless the user approves a local-only design first.
   - The Supabase MCP server (`.mcp.json`) is read-only and leaves out the `database` features (no SQL, no table
     reads), so ticket data can't reach Claude. Don't widen it; schema changes go through migrations.
2. **Behind login.** Every page, Server Action and route handler checks the session through `lib/auth/session.ts`
   (`requireUser`, `requireAction`, `getCurrentUser`). `proxy.ts` is only an optimistic redirect. Permissions live in
   one matrix in `lib/auth/permissions.ts`. Accounts are QA Hub's own (not Supabase Auth), only `@davao-water.gov.ph`
   emails, and sign-ups wait for an admin's approval.
3. **Secrets live only in `.env.local`** (git-ignored) and in Vercel's project settings. Never hard-code, log or paste
   them in chat. `SUPABASE_SERVICE_ROLE_KEY` is server-only and never gets a `NEXT_PUBLIC_` prefix.
4. **Uploads** go to the private bucket under generated names (`YYYY/MM/<random>.<ext>`), never the uploader's file
   name. Their real type, size and video length are checked after upload. They are served only through
   `app/(main)/files/[id]`, which checks the session and ticket scope and then redirects to a short-lived signed URL.
   Profile photos belong to no ticket, so they go through `app/(main)/files/avatar/[userId]`, which checks the session
   and redirects the same way: everyone signed in may see them.
5. Server code that touches Node APIs uses the Node.js runtime (with Cache Components that is the default; don't add a
   `runtime` export).
6. **RLS stays on** for every table, with no policies, so Supabase's public API can read nothing. Only Prisma (the
   table owner) reaches the data. A new table's migration must enable RLS too.
7. **Free-tier limits** (until the plan is upgraded): 50 MB per file (`NEXT_PUBLIC_VIDEO_MAX_MB`), 1 GB of Storage,
   500 MB of database, one Vercel cron run per day. Supabase Free has no backups: `npm run backup` runs nightly on the
   QA laptop.

## Conventions
- `lib/` holds framework-free logic (auth, areas, tickets, uploads, dar, backup, cron). `app/` holds UI and route
  handlers only.
- Route groups: `app/login` (no chrome), `app/(main)` (sidebar; tickets, team, DAR, admin).
- With Cache Components on, read the session only inside a `<Suspense>` boundary. Put a page's header inside its guarded
  component when the whole page is role-restricted.
- Server Actions for form mutations. Route handlers for uploads, file redirects, exports and the cron job.
- The daily clean-up is `GET /api/cron/daily` (`vercel.json`), protected by `CRON_SECRET`.
- Write a Vitest unit test for every `lib/` module.
- Commands: `npm run dev`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run db:deploy` (apply
  migrations), `npm run backup`, `npm run restore`.
  - In PowerShell, `npm run x -- --flag` loses the `--`, so run scripts with flags directly:
    `npx tsx scripts/create-user.ts --admin --name "…" --email …`, `npx tsx scripts/reset-password.ts --email …`.
  - Before saying a phase is done, run lint, the type check and the tests.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- graphify-out/ is local only (git-ignored): each machine builds its own graph with `graphify update .`. Never commit it.
