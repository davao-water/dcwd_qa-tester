# Your folders, explained like you're ten

Think of QA Hub as a **school building**. Each folder is a room with one job.

| Folder | The room | What lives there |
|---|---|---|
| `app/` | **The classrooms** ("pages") | Every screen you can visit. A folder name becomes part of the web address: `app/(main)/tickets` is the `/tickets` screen, `app/(main)/team` is `/team`. A file called `page.tsx` is the screen itself. |
| `app/(main)/` | Classrooms with a hallway | Screens that show the sidebar (tickets, team, My DAR, admin, settings). The brackets mean "group these, but don't put `main` in the address". |
| `app/login/` | The front door | The sign-in screen, with no sidebar. |
| `app/api/` | The back office | Jobs a computer calls, not a person: the daily clean-up and notifications. |
| `components/` | **The toy box** (shared pieces) | Buttons, pickers, dialogs, the sidebar: pieces two or more screens share. `components/ui/` holds the store-bought blocks (from shadcn) we don't edit much. |
| `hooks/` | Little helpers for the toys | Small tricks screens reuse, like "is this a phone?" or "is the keyboard open?". |
| `lib/` | **The filing cabinet** ("data") | Saving and loading: reading and writing the database, uploads, logins and permissions, the rules for tickets and DAR. No screens here, only the brains. |
| `data/` | The bookshelf | Fixed lists that don't change while the app runs, like `erp-areas.json` (the ERP modules). |
| `prisma/` | The cabinet's blueprint | `schema.prisma` describes every table in the database; `migrations/` is the history of every change to it. |
| `public/` | The noticeboard | Pictures, icons and sounds anyone's browser can fetch directly. |
| `scripts/` | The janitor's tools | Commands you run by hand: make a user, reset a password, back up, restore. |
| `tests/` | The exam room | Automatic checks that prove the filing cabinet (`lib/`) still works. `npx vitest run` runs them all. |
| `docs/` | The library | Guides: how to run things (`OPERATIONS.md`), the plan (`PLAN.md`), word meanings (`glossary.md`), and this page. |

## The house rules

1. **Screens go in `app/`, shared pieces in `components/`, saving and loading in `lib/`.**
2. **One job per file.** If you need the word "and" to describe a file, it should be two files.
3. **No file longer than 300 lines.** Long files get split into smaller ones that sit side by side.
4. **Look before you build.** Before making something new, check `components/`, `hooks/` and `lib/`: it may exist.

## Inside a screen folder

A screen folder keeps its own small pieces right next to it. For example `app/(main)/tickets/`:

- `page.tsx` is the tickets screen.
- `new/page.tsx` is the "new ticket" screen; `[number]/page.tsx` is one ticket (the `[number]` is filled in from the
  address, like `/tickets/42`).
- `actions.ts` holds the buttons' "save this" jobs (Server Actions), which hand the work to `lib/tickets/`.
- Other files are pieces only the tickets screens use. If another screen ever needs one, it moves to `components/`.
