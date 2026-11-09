# Changelog

## Fix: the ticket filters show the module picked on the dashboard (2026-11-09)

- Clicking a module on the dashboard filtered the ticket list, but the Module filter could still show the earlier
  choice (often "All modules"). Every filter field now shows what the address says, after any link, tab or Back.
- **Filters that are on stand out:** a filter or search box that is narrowing the list gets an accent border and
  tint (Tickets, Users, Team, My inbox, and the phone filter sheet). A stage or person a tab set by itself stays plain.

## Temporary access: lend admin features for a few hours (2026-11-09)

One database change: a new `TempAccess` table (migration `20261109000100_temp_access`, RLS on). Run `npm run db:deploy`.

- **Admin → Users → Temporary access** (the timer icon, admins only): give a QA tester or developer chosen admin
  features for 1–72 hours: **Sign-ups & password requests**, **Team & modules** or **All tickets**.
- It ends by itself when the time is up, with no cron needed: an ended grant is ignored at once, and the daily
  clean-up deletes it. **End now** stops it early. The person's row shows *Temp access* and when it ends.
- Managing accounts and roles is never lent, so nobody can make themselves a permanent admin. Someone lent sign-ups
  sees only the Approval and Password reset tabs, and can reset only passwords that were asked for, never an admin's.
- New permission `users.requests` (approve and reject sign-ups, handle password requests); admins have it as before.

## Assign people to many modules at once (2026-11-09)

No database change.

- **Team & modules → Assign to modules** (admins and Team Leads): tick the people (QA, developers, a lead, UI/UX), then
  every module and sub-module they work on, and assign them all in one go. **All inside** ticks everything in a module.
- It only adds people. Whoever is already in a module stays there. A lead picked here replaces each module's current lead,
  and the old lead stays on as a member. To remove someone, use the module's **Members** button as before.

## My DAR fills itself from tickets, with day statuses and pasted attendance (2026-11-06)

One database change: `DarReport.days` and `DarReport.autoCells` (migration `20261106000500_dar_days`). Run `npm run db:deploy`.

- **One entry per ticket**, for QA testers and developers: "Filed & replied on #123 PDS layout; verified and closed #118
  NSC form", three tickets then "+2 more". It replaces "QA - BCA / CRM".
- **Rows linked to modules (My details):** a row ticked "Fill this row's days from my ticket work" picks the modules whose
  tickets fill it, at any level, everything inside a module included. Work goes to the row linked to the nearest module
  (Purchase Requisition before Procurement); a fill row with no modules takes the rest. Old set-ups keep working.
- **Never over what you typed:** new ticket work is merged in each time My DAR opens. A "-" cell gets the entry, a REST DAY
  cell becomes "REST DAY · …", and a cell with your own text gets the entry after it. QA Hub's own earlier entry is
  updated in place, never added twice. "Add latest ticket work" does the same and saves.
- **After hours:** ticket work outside your work hours and days (My account → Notifications) is written as "After hours:
  …", on screen, in the print and in the Excel file.
- **Day statuses:** under each date on the sheet: Present, Remote (crisis), Leave, Absent, Rest day, Holiday. They start
  from your work days and the holiday calendar; days still to come are "Not yet". "Actual No. of Days Attended" counts
  Present days only. Turning a day into a day off swaps its untouched "-" cells for REST DAY, and back. On screen only:
  the paper form has no row for them.
- **Paste attendance:** copy your rows from the ERP's attendance log inquiry (linked in the window) and paste. QA Hub reads
  each day's first time-in and last time-out and where, repeated taps once, and shows a preview. Apply sets those days
  Present; a work day with no time-in becomes Absent, to change to Leave or Remote. Read in the browser; only the
  statuses and times are kept. Names, employee numbers and device codes aren't.
- Code: `lib/dar/attendance.ts`, `autoCells` / `describe` / `mergeCell` / `verbFor` in `lib/dar/autofill.ts` (tested),
  `app/(main)/dar/paste-attendance.tsx`.

## Fewer ticket moves, Won't fix reasons, no admins as assignees (2026-11-06)

No database changes. Tickets already Verified or Rejected keep their status.

- **Verify and close:** QA closes a fixed ticket in one move (was Mark as verified, then Close). Undo verify is gone;
  Reopen covers it. A ticket already Verified closes the same way. The board's Verified column, the Verified step on each
  ticket's progress tracker and the module report's Verified stage fold into Fixed.
- **Won't fix asks why:** *It can't be fixed* (Won't fix), *It isn't a bug* (Rejected; the separate Reject button is
  gone), or *Another developer should take it*: the ticket goes back to the QA tester, unassigned and still open (In
  progress goes back to New), with the developer they recommend (optional) and why, in the log and in a notification. QA
  assigns it. Developers still can't assign tickets.
- **Assigning:** only developers can be picked; admins are no longer in the list (the server refuses them too). Tickets
  already with an admin keep them until someone reassigns.
- Code: `within` moves and `canHandBack` in `lib/tickets/workflow.ts`, `ticketStore.handBack`, `handBackTicket`, the
  `handedBack` notification (all tested).

## Team Leads and a UI/UX column (2026-11-06)

Two database changes: `User.teamLead` (migration `20261106000300_user_team_lead`) and `AreaMember.asDesigner`
(`20261106000400_area_member_designer`). Run `npm run db:deploy`.

- **Team Lead tick-box:** in Users, next to Designer. A QA tester or developer with it manages Team & modules like an
  admin: add, edit, hide and delete modules and sub-modules at every level, and set each area's members and lead. Users
  (accounts, roles, sign-ups, passwords) stays admin-only. Shown as a "Team Lead" pill in Users and in the "Show
  modules for" list. One rule in `lib/auth/permissions.ts` (`FLAG_GRANTS`: `areas.manage` ← `teamLead`, tested).
- **UI/UX per module:** in a module's Members window, anyone with the Designer tick-box has a **UI/UX** option next to
  their name. Ticked, they work on that module as its UI/UX designer and are listed in the new **UI/UX** column instead of
  Developers or QA; in other modules they stay under their role. A lead who designs for it stays in Lead with a UI/UX tag.
  Saving checks that only people with the Designer tick-box are marked UI/UX.

## Modules three levels deep (2026-11-06)

No database changes (an area already pointed at its parent; only the two-level rule was in the code).

- **A sub-module can have its own sub-modules:** Procurement › Purchase Requisition › Approval. On Team & modules, each
  sub-module row has an add button for the level under it; the "Inside" picker lists modules and sub-modules by their
  full path. Three levels at most (`MAX_DEPTH` in `lib/areas/tree.ts`); moving an area somewhere that would go deeper, or
  inside its own sub-module, is refused with a reason. Adding, renaming, hiding and deleting work at every level, as before.
- **Everywhere a module shows:** dropdowns list the third level indented under its sub-module; tickets, the inbox, the
  dashboard and Users name an area by its whole path.
- **Filtering by a module or sub-module** includes everything inside it, at every level. Module progress, the module
  report and "my modules" count a third-level area towards its top-level module. Assigning suggests the developers of the
  area and of every module it sits inside.
- **DAR:** an area with no Code takes the nearest Code above it.
- Code: `buildTree`, `flatten`, `pathTo`, `depthOf`, `rootOf`, `descendantIds`, `AREA_PATH_SELECT` in `lib/areas/tree.ts`
  (tested). The module import file (`lib/areas/import.ts`) still reads two levels.

## DAR import from Excel, period days, markup fit, softer dark mode (2026-11-06)

One database change: `DarProfile.periodScheme` (migration `20261106000200_dar_period_scheme`). Run `npm run db:deploy`.

- **Import your DAR from Excel:** My DAR → My details → **Import from Excel** (also a button on My DAR). Pick the workbook
  you already keep (one DAR sheet per period). QA Hub reads your name, position, office, signatories, duties and MFOs,
  your period days, and what you wrote on each day, and shows it to check. Tick the periods to bring in (ones you already
  saved here stay unticked) and Import. It opens the newest period in My DAR, editable, to add tasks you didn't write down.
  The file is read in the browser and never uploaded or stored; only what was read is saved.
- **Your period days:** My details has a choice of **1st–15th and 16th–end** (as before) or **3rd–17th and 18th–2nd of the
  next month**, as on Job Order DARs. The list, the sheet, the printout and the Excel file follow it. The import sets it.
- **Several MFOs per duty:** a row can be "another MFO of the duty above", with its own days. The sheet, printout and
  Excel file merge the duty and its number down those rows, like the paper form. Up to 20 rows per section, and a day's
  entry can be up to 500 characters.
- **Markup:** on laptops the image area is sized to the room the window has left, so **Use image**, **Use original** and
  **Remove** always stay on screen (short windows, browser zoom, tools on two lines). If the window is very short, the
  dialog scrolls instead.
- **DAR defaults:** an empty day now starts as **-** on work days and **REST DAY** on Saturdays, Sundays and holidays
  (Philippine national holidays, Holy Week and Araw ng Dabaw; holidays proclaimed each year, like Eid, aren't known in
  advance). Every cell can still be typed over. "-" doesn't count as a day attended. Imported blank days get the same defaults.
- **Light/dark toggle:** one button left of the bell (laptops in the top bar, phones on Home) switches light and dark. The
  new look grows out of the button in a circle, like Magic UI's animated theme toggler (instant for people who turn motion
  off, and in browsers without View Transitions). Settings → Appearance keeps Light / Dark / System; the profile menu now
  only has the theme colour.
- **Dark mode colours:** a softer slate instead of near-black, with each layer a step apart and a breath of your theme
  colour; text slightly off-white to cut glare. Lines are lighter.
- **Preloader in your theme colour:** the loading screen after sign-in (background, rings, waves, water, emblem and chip)
  takes the theme colour picked in the profile menu, in light and dark, from the very first frame. The default indigo looks
  as before.
- **Sign-in page:** the brand panel follows the theme colour too, and the page has a palette button (the colours open in
  a small pop-up) and the light/dark toggle, top right, remembered in the browser and kept after signing in.
- **Fixed:** the sign-in panel's and preloader's waves were stretched to twice their width, so a crest was wider than the
  panel and they showed as a flat slope, and each loop jumped: the wave's shape repeats every rise and fall, but the
  animation slid only half that before starting over. They're drawn at true scale now and slide one full repeat (800 px).
- **Cards:** a quiet border with a touch of the theme colour and a faint highlight along the top edge, in both modes.
- Code: `lib/dar/import.ts` (tested), `lib/dar/period.ts` (schemes), `dutyLayout` in `lib/dar/template.ts`,
  `app/(main)/dar/setup/import-dar.tsx`, `useThemeSwitch` in `components/theme.tsx`, `--card-border` / `--card-highlight`
  in `app/globals.css`.

## All tickets for everyone, more filters, module report (2026-11-06)

No database changes.

- **All tab = every ticket:** QA testers and developers now see every ticket from every QA tester, with its developer, on the
  Tickets page's **All** tab (list and board). Their other tabs and the dashboard stay their own tickets. Anyone can open any
  ticket, see its files and reply; status moves, edit, assign, category and delete stay with its reporter, its developer or an
  admin. Notifications and unread dots still come only from your own tickets.
- **More filters:** Status, QA tester, Severity, Priority and Filed from / to (Manila days), next to Type, Module, Category and
  Developer. Testers and developers pick a QA tester or developer on the All tab; admins everywhere.
- **Module report:** a button on the Tickets page opens every module's score, closed % per category and tickets per stage as a
  page to print or **Save as PDF**. Numbers and module names only, for everyone signed in.
- Code: `canReadTicket` / `canAssignTicket` in `lib/tickets/workflow.ts`, `readWhere` in `lib/tickets/store.ts`,
  `lib/tickets/report.ts` (tested), `app/(main)/tickets/report/route.ts`, `components/filter-date.tsx`.

## Tickets: open a ticket in a panel (2026-11-06)

No database changes.

- **On a laptop, a ticket opens in a panel over the board or the list**, so you keep your place: the column you were
  scrolling, the view and the filters. Esc, the ✕, a click outside or the browser's Back closes it; Forward opens it
  again.
- Everything on the ticket page works in the panel: replying, moving, assigning, editing, deleting and the screenshots.
  What you change shows on the board behind it straight away, and an unread ticket stops being bold once you close it.
- **Open full page** at the top of the panel, and in each card's ⋯ menu, goes to the ticket page. Ctrl/Cmd-click or a
  middle click opens the ticket page in a new tab, as before.
- Closing the panel with a reply you haven't sent asks first.
- **Phones** keep opening the ticket page, as before.
- While the panel is open the address is `/tickets/N/peek`. Loaded on its own (a refresh, a pasted link) it goes to the
  ticket page. To share a ticket, use its page's address, `/tickets/N`, as before.
- Code: `lib/tickets/peek.ts` (tested), `app/(main)/tickets/ticket-peek.tsx`, the `@peek` slot in
  `app/(main)/tickets/layout.tsx`. The ticket itself moved to `tickets/[number]/ticket-view.tsx`, shared by the page and
  the panel. It's `/tickets/N/peek` and not `/tickets/N` because Next intercepts a route before its normal routing:
  intercepting `/tickets/N` would also catch New ticket and the links between ticket pages.

## Tickets: move a ticket back a step (2026-11-04)

A move made by mistake can now be taken back on the same ticket, instead of filing a new one. Each asks for a note,
which shows in the history and in the notification, so the other side knows why.

| Button            | From → to                                      | Who                        |
| ----------------- | ---------------------------------------------- | -------------------------- |
| **Stop work**     | In progress → New (To do)                      | the assigned developer     |
| **Not fixed yet** | Fixed → In progress (before QA verifies it)    | the assigned developer     |
| **Undo verify**   | Verified → Fixed                               | the QA tester who filed it |
| **Take back**     | Rejected, Won't fix or Duplicate → In progress | the assigned developer     |

- Admins can make all of them, as with every other move. **Reopen** (QA, back to To do) is unchanged.
- On the board, drag the card back a column (In progress to To do, Fixed to In progress…); the ⋯ menu and the ticket
  page have them as buttons, never as the main one.
- Taking back a duplicate clears its "Duplicate of #…" link.
- Each move's note box now says what to write; **Withdraw** no longer shows "Optional." on a required note.
- Code: the rules in `lib/tickets/workflow.ts` (tested); `Transition` has `back` and `hint`.

## Tickets: Board view (2026-11-04)

- **List or Board:** a switch beside **New ticket** shows the tickets as the usual list or as a board, like ClickUp or
  Planner. Each browser remembers the last choice, so Tickets opens the same way next time.
- **Same views and filters as the list:** Open, Assigned to me, Reported by me, Needs info, Waiting for retest, Done
  and All, plus search, type, module and developer. Switching between List and Board keeps them. Columns the view
  leaves empty (Done under Open) stay on the board as places to drop a card.
- **Columns** follow the workflow: **To do** (new and reopened), **In progress**, **Needs info**, **Fixed**,
  **Verified** and **Done** (closed, rejected, duplicate, won't fix), each with its count. A column shows its 50 most
  recently active tickets and links to the rest in the list.
- **Cards** show the number, module, title, type, severity, P1/P2 priority, a reopened or rejected status, replies,
  last activity, and the developer (on a developer's board, who filed it). Unread tickets are bold with the red dot.
  Click a card to open the ticket (on a laptop, in a panel over the board: see 2026-11-06).
- **Drag a card to another column to move it.** Only the columns you may move it to light up; the rest fade.
  - A move without a note (Start work, Info added, Mark fixed, Verified, Close) happens at once, with **Undo** for 5
    seconds. It is saved, and people are notified, only when that message closes. Closing the tab before then asks
    first.
  - A move that needs a note (Ask for info, Reopen, Reject, Won't fix, Withdraw, Duplicate) asks for it, as the ticket
    page does. Done asks how it ends when there's more than one way.
- **The ⋯ menu on each card** opens its full page, makes any move it allows (through the note dialog, so you can add one), and
  assigns or reassigns the developer (QA testers and admins). On a phone, where there's no dragging, the columns swipe
  sideways with tabs to jump between them.
- Code: `lib/tickets/board.ts` (columns, which move lands where, which columns a view fills; tested),
  `ticketStore.board()`, `app/(main)/tickets/board.tsx`, `view-switch.tsx`. The ticket page's move and assign forms are
  shared with the board. Toasts (sonner) are now mounted in `app/(main)/layout.tsx`.

## Install as an app (Phase 3.7c, 2026-11-03)

No database changes. It keeps no copy of pages or tickets, so offline it shows the browser's normal "no connection" page.

- **Icons:** 192 and 512 px icons, a maskable one for Android and a solid one for iPhone, all with the seal on white.
- **Install QA Hub:** My account → Notifications has a one-tap button on Android, Chrome and Edge, and the steps on iPhone. Windows also gets a tip
  to start it with the PC. The sign-in prompt offers it too. Hidden once QA Hub runs from its own icon.
- **Unread count on the icon:** updated when the bell checks and when a push arrives, even with the app closed. A push carries the number, no ticket text.
  Cleared on sign-out; a device with notifications still on gets it back at its next push.
- **Share → QA Hub (Android):** a screenshot or recording shared from the gallery opens New ticket with it attached, through the normal markup, upload and
  checks. If you aren't signed in, it's still waiting after you sign in, and New ticket collects it whenever it's next opened. Not collected within a
  day, it's deleted the next time the app opens or a notification arrives. Sign-out deletes it too.
- **Service worker:** now registered on every signed-in page, not only when notifications are turned on.
- Code: `lib/pwa.ts`, `lib/tickets/shared-files.ts` (tested), `hooks/use-install-prompt.ts`, `components/pwa-setup.tsx`, `account/install-card.tsx`,
  `app/share-target/route.ts`, `public/sw.js`, `app/manifest.ts`.

## Bug fixes, photos, DAR periods and ticket tabs (Phase 3.7a follow-up, 2026-11-03)

The look stays as on the live site. The phone redesign tried on 2026-11-03 is kept only on the branch `phase-3.7a-mobile-look`, for
reference, while the user designs the new UI in the Claude Design canvas.

- **Fixed:** a long module name no longer pushes a phone's page and tab bar sideways. A grid's default column now fits the page on
  phones, and anything too wide is cut off rather than moving the page.
- **Fixed:** Back after filing a ticket goes to the ticket list, not the finished form. The gallery reminder is gone.
- **Fixed:** every page stays the same centered width; visiting My inbox or My DAR used to widen the pages after them.
- **Fixed:** Ctrl+Z, Ctrl+Y and the other markup shortcuts stopped working after clicking on the screenshot.
- **Removed:** the customer-data note on New ticket, on every device.
- **Profile photo:** the avatar is the upload. Tap your picture on Settings or My account → Profile; with a photo already there it offers
  Change and Remove. On a laptop, they're also in the account menu at the top. It's cropped to a centred square and saved small.
  Everyone signed in sees it. Included in backups and in Delete user.
- **Each person's colours:** without a photo, a person's initials show in one of 16 colour pairs that is theirs, in conversations too.
- **My DAR periods:** My details asks for the first period (a month, then 1st or 2nd half). The list starts from it and adds each next 15
  days by itself. Saved DARs always stay listed. Someone who hasn't chosen starts from their earliest saved DAR.
- **Ticket page on phones:** two tabs, **Details & logs** and **Conversation**, by tapping or swiping. A half-written reply survives switching.
- **Markup on phones:** full screen, with the screenshot taking all the free height. On a phone under 768 px wide held sideways, the tools sit beside it; wider ones get the laptop dialog, as before.
- **Setup:** migrations `user_avatar` and `dar_first_period` (`npm run db:deploy`). Run them before this code goes live.
- Code: `lib/avatar.ts` and `lib/users/avatar.ts`, `components/user-avatar.tsx`, `components/avatar-upload.tsx`, `files/avatar/[userId]`,
  `periodsFrom` in `lib/dar/period.ts`, `tickets/[number]/ticket-tabs.tsx`, `lib/tickets/swipe.ts` (tested), and the `short:` variant in `app/globals.css`.

## Filing tickets from a phone (Phase 3.7b, 2026-11-03)

- **Device type:** a dropdown for bugs (Computer, Android phone, iPhone, Tablet), filled in with the last choice on that
  device or a guess from the browser. Shown in the ticket's Details and editable.
- **Take photo** and **Choose from gallery** on touch screens. HEIC photos get a clear message.
- **Drafts:** New ticket keeps its text, choices and uploaded files in that browser, so switching apps to take more
  screenshots loses nothing. Cleared when the ticket is filed, on **Clear** or on signing out, and unusable after 24 hours.
- **Uploads:** a failed image or video stays on screen with **Retry**, and the ticket or reply waits until it's retried
  or removed. A video over 10 MB on mobile data asks first (Android Chrome).
- **Markup with a finger:** two fingers zoom and move, and larger tool buttons on phones.
- **After filing with files on a phone:** a one-time reminder to delete the screenshot from the gallery.
- **Admin → Users: Sign out all devices**, for a lost phone: ends their sessions and stops device notifications. The
  person's password stays.
- **Setup:** migration `ticket_device_type` (`npm run db:deploy`).
- Code: `lib/tickets/draft.ts` (tested), `hooks/use-touch-screen.ts`, `pinchZoom` in `lib/markup/view.ts`.
- **Phone fixes found while getting ready to test:** Home no longer scrolls sideways and pushes the tab bar off screen.
  My inbox and conversations fit the screen, including long titles and long unbroken text. On a touch screen, Enter in a
  reply starts a new line, and the conversation scrolls with the page. Unread counts no longer make a page rebuild as
  it loads.

## Delete user and the Designer tick-box (2026-11-01)

- **Delete user** (Admin → Users, red bin): deletes the account and everything it made: tickets they filed with every
  reply on them, their replies and timeline entries elsewhere, their files in Storage, DAR and devices. Tickets
  assigned to them stay, unassigned. The dialog counts what goes and asks for their email. Not yourself, not the last
  admin. Turning an account off is still the way to keep history.
- **Designer:** a tick-box on any account, shown as a badge in Admin → Users and on the Team page. It will let that
  person send UI/UX designs for approval (Design reviews, next).
- **Setup:** migration `user_designer` (`npm run db:deploy`).
- Code: `lib/users/delete.ts` (tested), `lib/auth/permissions.ts` (`FLAG_GRANTS`), `app/(main)/admin/users/`.
  `removeObjects` now deletes in batches of 100.

## Notifications: each status change, kept for 3 days, a choice outside work hours (2026-11-01)

- **Each status change is its own notification**, so "Fixed" and then "Closed" both stay in the phone or PC's list and
  show what the developer did. Replies, edits and assignment still share one notification per ticket. Opening the
  ticket clears all of them.
- **Missed notifications wait up to 3 days** (was 12 hours) for a device that's off or offline, so changes from the
  evening or a weekend are there in the morning.
- **Outside my work hours and days** (My account → Work hours) replaces _Only notify me during work hours_: **Notify
  me with sound** (default), **Notify me silently** (no sound or vibration, still in the list; iPhones still ring), or
  **Don't notify me**. The hours and days can always be edited. People who had the old switch on get _Don't notify
  me_, so nothing changes for them.
- Database: `User.offHoursPush` (`SOUND`/`SILENT`/`NONE`) replaces `pushWorkHoursOnly`
  (migration `20261101000400_off_hours_push`).

## Screenshot markup: more QA tools, Select, zoom and shortcuts (2026-11-01)

- **New tools:** Circle, Highlight (see-through yellow, under the other marks), Steps (numbered 1, 2, 3… circles) and
  Callout (a note in a box with an arrow to the thing).
- **Select:** click any mark to move it, resize it from its handles (text, steps and callouts change size), recolour
  it or delete it; double-click a note or callout to retype it; arrow keys nudge. Each change is one Undo step.
- **Text:** works with a single click (it used to need the mouse button held), S / M / L / XL sizes (Medium is 1.6×
  the old size), typed in place in its real colour and size, and kept when you press Use image while still typing.
- **Zoom:** Ctrl + mouse wheel zooms the screenshot at the cursor instead of the whole page; − / + / Fit buttons,
  Ctrl+= / Ctrl+− / Ctrl+0; Space + drag or the wheel button to move around.
- **Shortcuts** on every tool (V B E A P M T N K H C), colours 1–4, [ ] text size, Delete, Ctrl+Enter, and a list
  under **Shortcuts** or **?**.
- Code: `lib/markup/` (`shapes`, `geometry`, `draw`, `view`, tested) and `app/(main)/tickets/markup/`.

## UI polish: DAR set-up page, type colours, preloader, account tabs, styled controls (2026-11-01)

- **My DAR → My details** opens a full **My DAR set-up** page, laid out like the old DAR template page (Header,
  Signatories, Duties and MFOs), instead of a pop-up. Each person still has their own.
- **Ticket types have colours:** Bug red, Suggestion amber, Improvement blue: a coloured chip on every ticket, a stripe
  down the left of each row in the list, and coloured choices on the new-ticket form.
- **QA Hub preloader:** once per browser session, when QA Hub opens or after signing in, a full-screen preloader in the
  style of the DCWD ERP's Module preloader: the QA Hub emblem filling with water as it loads, rippling rings and waves.
- **Loading skeletons:** while a page loads it shows grey shapes like the page itself (ticket rows, the conversation,
  the DAR sheet) with a soft shimmer, instead of "Loading…".
- **My account in sections:** tabs on the left (a row on phones) for Profile, Password, Notifications, Sound and Work
  hours. `/account?tab=sound` opens one directly.
- **No more browser-default controls:** every dropdown is QA Hub's own (animated list, tick on the choice, type to
  jump), the DAR's date submitted opens a calendar, work hours are picked from half-hour lists, checkboxes and radios
  are restyled, and scrollbars are thin and quiet.
- **Motion:** pages rise in gently, lists come in one after another, dialogs and menus grow in, dashboard tiles lift
  on hover, unread dots pop. All of it stops when the computer or phone is set to reduce motion.
- **Minimise the sidebar** (the toggle in the top bar, or Ctrl+B): it springs down to a centred rail of icons; the
  brand text and labels slide away in turn, the seal stays still, counts become red dots, and each icon shows its name on
  hover.
- **Sized for big screens:** the whole interface is in rem and grows with the screen past 1920 px wide, so a
  2560 × 1440 monitor shows it at the same proportions as 1920 × 1080 (up to twice the size on 4K). Phones and laptops
  are unchanged. The sign-in and preloader waves now loop without a gap at any width.
- **A ticket's conversation keeps its look but stops growing:** past a set height the messages scroll on their own,
  opened at the newest one like Messenger, so the reply box, Add images and Send stay in place. Messages are chat
  bubbles: yours on the right in a tinted bubble marked "You", everyone else's on the left (also in My inbox). The
  **Activity log** scrolls in its own box too and keeps the newest entry at the top.
- **Reassign:** on a ticket, Developer shows who has it and a **Reassign** button: pick another developer and, if you
  like, a reason ("Ben is on leave"). The timeline reads "reassigned it from Ben to Cy" with the reason, and the new
  developer's notification includes it (when previews are on). This also fixes the developer picker, which had
  stopped showing its Save button with the new dropdowns.
- Code: `components/preloader.tsx`, `app-splash.tsx`, `skeletons.tsx`, `select-field.tsx`, `date-picker.tsx`,
  `components/ui/select.tsx`; `lib/calendar.ts`, `lib/time-options.ts`, `lib/splash.ts`; `app/(main)/dar/setup/`,
  `app/(main)/account/account-tabs.tsx`; `app/globals.css`.

## My DAR for everyone, each set up their own (2026-11-01)

- **Developers have My DAR too.** Everyone (QA testers, developers, admins) gets it in the sidebar. A developer's days
  read "DEV - BCA / CRM"; QA testers' and admins' still read "QA - …".
- **No more shared DAR template.** Admin → DAR template is gone. Each person sets up their whole report once under
  **My details**: full name, position, department, unit, the Confirmed by and Noted by signatories, and their core and
  support duties with MFOs. A new account starts empty with a **Set up my DAR** button.
- **Nothing changes for people already using it:** the migration copies the template's values into the details of
  everyone who had a DAR, wherever they hadn't set their own, so their reports look the same. Restoring an older
  backup does the same.
- **Setup:** migration `dar_own_details` (`npm run db:deploy`), run **before** merging (the new code reads the new
  columns; the old code ignores them).
- Code: `lib/dar/template.ts`, `lib/dar/store.ts`, `lib/dar/autofill.ts`, `lib/backup.ts`,
  `app/(main)/dar/dar-editor.tsx`; removed `app/(main)/admin/dar/`.

## Lighter on the free plan (2026-11-01)

Supabase's logs showed about 945 MB of file downloads in one day, almost all from one video loaded again on every
visit. The free plan allows 5 GB a month.

- **Videos load only when someone presses Play.** Before, browsers fetched most of a phone recording each time a
  ticket opened.
- **Screenshots are saved smaller before upload:** same size (2560×1440 stays 2560×1440, so ERP text stays readable),
  as WebP at high quality, or JPEG in browsers that can't write WebP. PNG is kept when it's smaller, and small images
  and GIFs are left alone. Typically a 2–3 MB PNG becomes a few hundred KB. Marked-up screenshots are saved the same
  way.
- **Files are reused for 5 minutes:** going back to a ticket takes its screenshots from the browser instead of
  downloading them again.
- **The new-activity check is every 30 seconds again** (it was briefly 15); notifications refresh pages at once
  anyway.
- **Removed:** uploading your own notification sound (anyone using theirs is back on Tone 1; Tone 1–11 and Silent
  stay), and the photo inside device notifications (every device downloaded it; the 📷 count stays in the text).
- **Setup:** migration `drop_custom_tone` (`npm run db:deploy`). Restoring an older backup still works: the removed
  column is skipped.
- Code: `lib/markup/export.ts` and `lib/markup/encode.ts` (conversion), `app/(main)/tickets/[number]/conversation.tsx`,
  `app/(main)/files/[id]/route.ts`, `lib/push/`, `lib/backup.ts`.

## Notification sound and live updates fixed (2026-10-31)

- **Pages update the moment a notification arrives:** the bell, the sidebar counts, My inbox and an open ticket no
  longer wait for the next check (which also went from every 30 to every 15 seconds, and now also runs when you switch
  back to the window).
- **The tone is reliable:** only a QA Hub tab that is on screen is asked to play it. A tab in the background (asleep on
  a PC, or on a phone) used to hold the notification back or, on Android, swallow the sound; now the device's own sound
  plays straight away instead.
- **Preview builds:** the database client is created on first use, so Vercel Preview builds no longer fail without
  `DATABASE_URL`.
- Code: `public/sw.js`, `app/(main)/tone-listener.tsx`, `components/notifications.tsx`, `lib/db.ts`.

## Device notifications (2026-10-31)

- **Notifications on this device** (My account): Windows, Mac, Android and iPhone notifications for a new or assigned
  ticket, a reply, a status change or an edit, even with QA Hub closed. **Turn on** once per device; **Send test** and
  **Turn off** are there too. Clicking one opens the ticket.
  - **Asked after sign-in:** on a device where they're off, a **Turn on notifications?** dialog offers them (Not now
    hides it there for 14 days). On an iPhone not yet on the Home Screen it shows how to add it.
  - **Notification sound:** pick Tone 1–11 (default Tone 1), Silent, or upload your own MP3/WAV (5 s, 500 KB), with
    ▶ to preview, in My account or the sign-in question. An open QA Hub tab plays it and the system notification stays
    silent; with QA Hub closed the device's own sound plays. Own tones are checked by their real bytes and length,
    stored under generated names in the private bucket, played only through `/tones/mine` (session-checked) and
    backed up. Migration `notification_tones`; code in `lib/push/tones.ts` and `lib/uploads/audio.ts`.
  - They lead with the message: the ticket's title, `Ana: <message>` (cut at about 120 characters, with 📷/🎥 when
    something is attached), `Module: Billing`, and the reply's first photo on Windows and Android (through a link that
    expires after 10 minutes). A status change shows its note. Replies on one ticket stack ("3 new replies"); opening
    the ticket clears it.
  - **Show message previews** (on by default, My account → Sound and previews): off gives only
    `#12 · Bug / New reply from Ana / Module: Billing`, with no ticket text or photo. The guide shows how to hide
    previews on locked phones and PCs. Migration `push_previews`.
  - **Work hours:** _Only notify me during work hours_ keeps devices quiet outside the chosen hours and days
    (Philippine time). The bell and My inbox still show everything.
  - iPhone and iPad: iOS 16.4+ and QA Hub added to the Home Screen first. Windows and Mac: the browser must be running.
    Details and the firewall list for IT: `docs/OPERATIONS.md` §5b.
- **Install QA Hub:** a web app manifest, so phones can add it to the Home Screen with the DCWD seal.
- **Setup:** three new settings, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (make the keys
  with `npx web-push generate-vapid-keys`). Migration `push_subscriptions` (RLS on). Without the keys nothing is sent.
- Code: `lib/push/` (message text, recipients and work hours, device store, sending and clean-up of dead devices; unit
  tested with a fake push service), `public/sw.js`, `app/manifest.ts`, and the card in `app/(main)/account/`. The
  server only accepts push addresses of the real browser push services, so nobody can make it call another URL.

## My inbox, Messenger-style (2026-10-31)

- **My inbox** is back in the sidebar, for everyone: the conversations on your tickets on the left (newest first, last message preview, red dot, unread reply count), the selected ticket's messages on the right with the description as the first message, and a reply box (Enter sends; images go through the markup tools). Search, an Unread filter and Show more. On a phone it shows the list, then the conversation with a back link. **Open ticket** leads to the full page for status changes and editing.
- **Sidebar counts split:** **My inbox ● N** counts unread replies from others; **Tickets ● N** counts new tickets you haven't opened (developers: newly assigned; admins: newly filed). The bell still shows all activity and links to the inbox.
- Live: the inbox refreshes by itself when something new arrives, like the ticket pages.
- **Site icon:** the browser tab and phone home-screen icon are the DCWD seal instead of the Next.js logo; the unused template images are gone.
- Code: `lib/tickets/inbox.ts` (conversation list and previews) and `counts` / `unreadMessages` in `lib/tickets/notifications.ts`, with tests. The ticket page's conversation moved to `app/(main)/tickets/[number]/conversation.tsx` so the inbox shows messages exactly the same way.

## Screenshot markup (2026-10-31)

- **Mark up screenshot:** every image added to a ticket or reply (paste, Add images, drop) opens in a markup editor before it uploads: **Box**, **Arrow**, **Pen**, **Text**, **Hide** (a solid black box) and **Crop**, four colours, undo and redo, keys B/A/P/T/H/C and Ctrl+Z/Ctrl+Y. Several images go through it one after another ("2 of 3").
  - **Use image** uploads only the marked-up copy (PNG, or JPEG if the PNG would be over 10 MB), so hidden data never leaves the PC. **Use original** and **Remove** are there too, and the pencil on a thumbnail reopens it.
  - Hide is a black box, not a blur: blurred or pixelated text can be recovered by de-pixelation tools.
- **Capture screen** (Chrome and Edge on a PC): pick a tab or window, such as the ERP; one frame is taken, sharing stops at once, and it opens in the editor.
- **Paste goes to Screenshots:** Ctrl+V pastes a screenshot into the **Screenshots** box (click it, or just paste anywhere on the page outside a text box). The Description box no longer takes images. In a reply, pasting into the message still works.
- **Sidebar:** the red count on Tickets and Users is centred on the row.
- Code: `lib/markup/` (shapes, undo history, export rules; unit-tested) and `app/(main)/tickets/markup/markup-editor.tsx` (canvas). The image picker queues images for the editor. Next: a Chrome/Edge extension that captures the ERP in one click and opens this editor (Phase 3.9).

## Notifications, forgot password, clearer sign-up, admin's own DAR (2026-10-31)

- **Notifications:** a bell in the top bar with the number of tickets that have something new for you and a list of the newest, a red count on **Tickets** in the sidebar, and a red dot plus bold title on unread rows in the ticket list and the dashboard. "New" is anything someone else did on a ticket you can see; your own actions never count. Opening a ticket marks it read; **Mark all as read** clears all.
  - The app polls `GET /api/notifications` every 30 s while the tab is visible (and at once when you return), and refreshes ticket lists and the open ticket by itself when something new arrives. No reload needed.
  - Data: `Ticket.lastActivityById` (who acted last, set on every change) and a `TicketRead` table (when each person last opened each ticket), migration `notifications_reset_requests`, RLS on. Logic in `lib/tickets/notifications.ts`, with tests.
  - The disabled "My inbox" sidebar item is gone; the bell replaces it.
- **Forgot password:** a **Forgot your password?** link on the sign-in page sends a request to **Admin → Users → Password reset requests** (no email is sent). The admin resets it there and hands over the temporary password, or dismisses it. Limited to 5 per email and 30 in total per hour. Admins also see a count on **Users** in the sidebar and on the dashboard.
- **Sign-up:** an email that already has an account, or a request waiting for approval, now says so instead of pretending to send a new request.
- **Admin's own DAR:** admins have **My DAR** too, with buttons to switch between it and the DAR template. Each person still sees only their own DAR.
- **Dashboard per role:** developers and QA testers see only their own work: their three ticket counts, their tickets and **My modules** (full width). The team counts and **Not in any module** are now for admins only.
- **Replies send on Enter:** in a ticket's reply box, Enter sends and Shift+Enter starts a new line (it was Ctrl+Enter). Enter waits while an image or video is still uploading.

## QA Hub moves to Vercel + Supabase (2026-10-31)

- **Hosting:** QA Hub now runs on Vercel (HTTPS, region `sin1`) with a Supabase database and Storage in Singapore, so it no longer depends on the QA laptop being on. IT/DPO approved putting ticket data in the cloud.
- **Removed:** the paused AI workbench (pages, `lib/ai` and the other workbench code, its tables and packages), the DAR **PDF** download (Print and Excel stay; _Save as PDF_ in the print dialog still makes a PDF), the LAN scripts and the old SQLite database (`prisma/dev.db`). We started fresh in Supabase; no old data was copied.
- **Database:** Postgres through Prisma's `adapter-pg` (`lib/db-client.ts`). Row Level Security is on for every table with no policies, so Supabase's public API reads nothing. Sign-in limits are counted in the database (`RateLimitHit`), because serverless functions share no memory. Tests run on PGlite, an in-memory Postgres.
- **Uploads:** the browser uploads straight to the private `attachments` bucket with a signed URL (Vercel caps requests at 4.5 MB). The server then checks the real type, size and video length before a ticket can use the file. Files open through `/files/[id]`, which checks access and redirects to a 1-hour signed URL. Videos: up to 3 min / **50 MB** on the free plan.
- **Daily clean-up:** `/api/cron/daily` (02:00 Manila, protected by `CRON_SECRET`) removes unsent uploads, expired sessions and old sign-in counters.
- **Backups:** `npm run backup` now pulls from Supabase into **Documents\QA Hub Backups** (`Database\QA Hub database <date> <time>.json`, last 14 kept, plus `Files\`). New `npm run restore` loads one into an empty project. Logic in `lib/backup.ts`, with a round-trip test.
- **Also:** an image gallery on tickets (← → keys and buttons across every image on the ticket), the sign-in page's brand panel in dark mode, a sidebar fix for narrow windows, and `scripts/reset-password.ts` for a locked-out admin.
- **Docs:** `CLAUDE.md` rules rewritten for the cloud, `docs/OPERATIONS.md` rewritten, `.env.example` added.

## DAR on long bond paper, in the form's own colours (2026-10-29)

- **8.5 × 13 in (long bond), landscape, one page:** Print, the PDF and the Excel download all use the office's long bond paper.
  - The Excel file is set to Folio 8.5 × 13 in (Excel paper size 14), landscape, "fit to 1 page wide by 1 tall" (`longBondOnOnePage` in `lib/dar/excel.ts`). I checked it in Excel, which reports 1 page.
  - Its duty and MFO rows are sized to their text, so nothing is clipped.
- **Even 0.5 in margins, no browser headers:** the page margin is 0 and the HTML pads 0.5 in on every side, so the browser has no room to print its date, title, URL and page number in the corners. Only the sheet shrinks to fit, never the margins.
- **Colours kept when printing:** `print-color-adjust: exact`, so the fills print even with the browser's "Background graphics" off.
- **Exact colours** from the DCWD DAR workbook's styles (`DAR_COLORS` in `lib/dar/html.ts`):
  - **#FFCC99:** header labels, the MFO header, the day headers and "B.) SUPPORT FUNCTION".
  - **#FBD4B4:** "A.) CORE FUNCTIONS".
  - **#808000 (olive):** the address line.
  - The title is in **Book Antiqua**, bold.
  - The same colours are used on screen, in print, in the PDF and in Excel.

## My DAR looks like the paper form, and prints (2026-10-29)

- **My DAR is now the form itself:** a white sheet laid out like the DCWD _Project-Based Employee Daily Accomplishment Report_.
  - It has the seal and agency banner, the orange-labelled header table, the date submitted and days attended, and the DAYS grid with core and support functions and MFOs. The signatories are at the bottom.
  - **Editing:** click any day cell to type in it. Click the date submitted to pick another date.
  - The DAR page uses the full width of the screen (other pages keep the 1320px cap). The sheet keeps its paper proportions and zooms to fill it, shrinking on small screens and growing on wide ones. The separate preview is gone, since the page is the preview.
- **Print** button: prints the sheet as it is now, saved or not, scaled to one landscape Legal page. It uses the same layout as the PDF (`lib/dar/html.ts`, `PRINT_PAGE`).

## My DAR: Daily Accomplishment Report generator (2026-10-29)

- **My DAR** (QA testers only) builds the DCWD _Project-Based Employee Daily Accomplishment Report_ for a half-month period (1–15, or 16 to the end of the month).
  - **Days filled from ticket work:** each day lists the modules of the tickets the tester filed, replied on or moved that day, by their **Code** from Team & modules, e.g. "QA - BCA / CRM".
  - A day with nothing is **REST DAY**, and every cell can be edited.
  - Days attended are counted live.
  - Drafts are saved per period. **Refill from tickets** redoes the auto-filled rows and keeps the others.
  - **Download Excel or PDF** in the form's layout: seal, header table, the days grid, core and support functions with MFOs, and the three signatories.
  - The PDF is printed from the same HTML as the on-screen preview and scaled to one landscape Legal page.
  - **My details:** the tester's full name for the form (accounts only hold a nickname), their position, and optionally their own duties and MFOs.
  - **Private:** a DAR is visible only to the tester who made it (`dar.use`, QA only). The export route returns only the caller's own report.
- **Admin → DAR template** (`dar.template`): department, unit, default position, signatories, and the core and support duties and MFOs. Admins choose which rows are filled from ticket work.
- **Code:**
  - `lib/dar/`: `period`, `autofill`, `template`, `store`, `html`, `excel` (`write-excel-file`, with the seal) and `pdf` (Playwright's Chromium).
  - Models `DarProfile` and `DarReport` (migration `dar_reports`).
  - No AI is involved (rule 12).

## Ticket progress tracker, full-width forms (2026-10-29)

- **Progress tracker** at the top of every ticket, the same for QA and the developer: Filed → In progress → Fixed → Verified → Closed.
  - Done steps get a tick and the current one a ring, and each shows when it was reached.
  - **Needs info** and **Reopened** appear on the In progress step. **Rejected**, **Duplicate** and **Won't fix** end the flow early, and the steps they skipped are struck through.
  - A "Waiting on …" line names whose move it is and what to do, e.g. "Waiting on Ana (QA) to retest the fix."
  - The logic is `ticketFlow` in `lib/tickets/flow.ts`, with unit tests.
- **Forms use the full width:**
  - **New ticket:** on wide screens, the main fields sit on the left and a Details panel (module, severity, priority, developer, File ticket) on the right. The edit dialog keeps one column.
  - **My account:** the profile and Change password sit side by side.
  - **Admin → Workspace:** the card fills the width.

## Phase 3.5b, slice 2: videos on tickets (2026-10-29)

- **Add video** on the new-ticket form and in the reply box: one MP4 or WebM per post, up to **3 min and 150 MB**.
  - The video uploads as soon as it's picked or dropped, with a progress bar and Cancel. The form then sends only its id, so a big video never goes through a Server Action.
  - Send and File ticket wait until the upload is done, and the browser asks before you leave mid-upload.
  - The browser checks the type, size and length first, so a too-long or too-big file is refused before it uploads.
- **Upload route** `POST /uploads/video` (`app/(main)/uploads/video/route.ts`):
  - It checks the session itself; `proxy.ts` skips this path so the proxy doesn't buffer or cut off 150 MB.
  - The body streams straight to `UPLOAD_DIR` as a `.part` file and never sits in memory.
  - The type comes from the first bytes (`sniffVideo`): MP4 or WebM. QuickTime `.mov`, Matroska and anything else are refused.
  - The size is counted as it arrives. The length is read from the MP4 `mvhd` box or the WebM `Duration`, without decoding (`lib/uploads/video-meta.ts`).
  - A refused, failed or cancelled upload leaves no file behind.
  - Uploads wait in `PendingUpload` until a ticket or reply claims them, and only the uploader can claim one. Unclaimed ones are removed after 24 h.
- **Playback with Range requests:** `/files/[id]` answers `Range` with `206` / `416` and `Accept-Ranges: bytes` (`lib/uploads/range.ts`), so a developer can scrub a recording without downloading all of it.
  - Videos play inline in the description and the thread, with name, length and size.
- **Activity log:** names videos too, e.g. "Attached 1 screenshot and a video" or "Posted a video". The delete dialog counts screenshots and videos.
- **Data:** a new `PendingUpload` model and `Attachment.durationSec` (migration `ticket_videos`).

## Tickets per person, delete, activity log (2026-10-29)

- **Each person sees their own tickets:**
  - QA testers see the tickets they filed, and developers the tickets assigned to them. Admins see everything (`tickets.viewAll`).
  - The rule is `ticketScope` in `lib/tickets/workflow.ts`. It applies to the list, the ticket page, the dashboard, attachment downloads (`/files/[id]`) and every change.
  - Anyone else's ticket looks like it doesn't exist. List filters can narrow a person's scope but never widen it.
  - Reassigning a ticket takes it off the previous developer's list.
- **Only QA testers (their own tickets) and admins** can file, edit and delete tickets. Developers have no "New ticket" button, and `/tickets/new` is not found for them.
  - Verify, close and reopen now belong to the QA tester who filed the ticket, since other testers can't see it.
- **Delete, permanently:** a red Delete button on the ticket, for the filing QA tester or an admin.
  - The dialog lists what will be removed: the ticket, its replies, its log and its screenshots.
  - The red "Delete this ticket" button stays disabled until the exact title is typed, as on GitHub. The server checks the title too.
  - Screenshot files are removed from `UPLOAD_DIR`.
  - Ticket numbers are never reused after a delete (`tickets.lastNumber` in `Setting`).
- **Activity log** on every ticket (`lib/tickets/log.ts`): every movement with its exact date and time, newest first.
  - It covers filing, status moves (with notes), assignments, edited fields, replies and attachments.
  - It is built from existing data, so older tickets have a full log too.
- **Dashboard per person:**
  - **QA:** My open tickets, Developer needs info, and Ready for my retest.
  - **Developers:** Assigned to me, Not started, and Waiting for QA retest.
  - **Admins:** the totals.
  - Each dashboard also lists that person's most recent tickets.
- **Ticket list:** titled "My tickets" or "All tickets", with views for each role. The Developer filter is hidden for developers.
- **Sub-modules:** the add/edit form no longer has a Sort order field. New sub-modules go after their siblings, and top-level modules keep the field.
- **Dark mode:** red (destructive) buttons use dark text, so they stay readable.

## Light/dark mode and theme colours (2026-10-29)

- **Mode:**
  - A sun/moon button in the topbar switches between light and dark.
  - The account menu has **Appearance → Mode**: Light, Dark, or System (follows Windows; the default).
  - Built on `next-themes` with the existing dark tokens. The choice is remembered per browser.
- **Theme colour:** six accents in the account menu: DCWD indigo (default), Ocean blue, Teal, Green, Violet and Rose.
  - Everything accent-coloured follows the choice: buttons, the active sidebar item, tabs and links.
  - It is one CSS value (`--acc-base`, set by `data-accent` on `<html>`).
  - A tiny script in `<head>` applies the saved colour before the page paints, so there's no flash.
  - Every accent keeps white button text at WCAG AA contrast in light mode (checked by `tests/unit/theme.test.ts`). Dark mode lightens it and uses dark button text.
- **Dark-mode fixes:** inactive sidebar links were nearly invisible, and white text on accent-coloured surfaces now uses the theme's button-text colour.
- **Sidebar:** removed the "Office network only / Ticket data never goes to an AI model" footer.

## Sign-up with admin approval, and the account menu in the topbar (2026-10-29)

- **Sign in / Sign up switch** at the top of both screens (`app/login/auth-tabs.tsx`), after the CRM portal's AuthTabs: a segmented control whose tabs are links, with the active pill popping in (off under reduced motion).
- **Create an account** (`/login?mode=signup`):
  - Choose QA tester or Developer, then enter a nickname (2–40 characters; shown on tickets and replies) and email. There is **no password field**.
  - When an admin approves, QA Hub creates a one-time **temporary password** (shown once, like Reset password). The person must choose their own at first sign-in.
  - Until then the account has a random password nobody knows, so it can't be signed into.
  - Nobody can sign up as an admin.
  - Only `@davao-water.gov.ph` addresses are accepted, here and when an admin adds or edits a user (`EMAIL_DOMAIN` in `lib/schemas/user.ts`). Subdomains and look-alikes such as `…gov.ph.example.com` are refused.
  - The account is saved turned off and **pending** (`User.pending`) until an admin approves it.
  - The form answers "Request sent" whether or not the email already has an account, so it can't be used to look people up. An existing account is never changed.
  - Sign-ups are limited to 20 per hour across the office.
- **Admin → Users** has a "Waiting for approval" list with Approve and Reject.
  - Reject deletes the request, and the person can sign up again.
  - Approve is the only way to turn a request on, because it creates the password.
- **Nickname everywhere:**
  - Admin → Users' New user / Edit user dialog and the users table say **Nickname** (2–40 characters), matching sign-up.
  - Both forms use the same rule (`NICKNAME_MAX` in `lib/schemas/user.ts`).
- **Temporary password box** (Approve, New user and Reset password):
  - The password starts hidden. **Show/Hide** toggles it, and **Copy** works either way, with a fallback for plain-HTTP LAN browsers.
  - Closing before copying or showing it, by Done, X, Esc or a click outside, asks first: "You haven't copied the password yet", with **Close anyway** or **Go back**. The shared guard is `components/close-guard.tsx`.
  - The Approve dialog lives at page level (`ApprovalHost`), so it stays open when the approved request leaves the list.
  - The dashboard tells admins how many requests are waiting.
- **Account menu:**
  - The large profile block is gone from the sidebar.
  - The signed-in person now shows at the right of the topbar (initials avatar, name, role). Clicking it opens **My account** and **Sign out**.
- **Migration:** `user_signup` adds `User.pending`.

## Phase 3.5b, slice 1: Tickets (2026-10-29)

QA and developers can now file and work tickets in QA Hub instead of Messenger.

- **Tickets** (`/tickets`):
  - Each ticket is a bug, suggestion or improvement, numbered #1, #2…
  - Fields: title, description, module or sub-module, severity (bugs only, S1–S4), priority (P1–P4), "found in" and the assigned developer.
  - Anyone signed in can see and comment on every ticket. Developers can file suggestions too.
- **Workflow** (`lib/tickets/workflow.ts`):
  - The assigned developer moves a ticket to In progress, Needs info, Fixed, Rejected, Duplicate or Won't fix.
  - Any QA tester can verify, close or reopen. The reporter can resume a ticket after adding info, or withdraw a new one.
  - Admins can do both sides.
  - Needs info, Rejected, Won't fix, Reopen and Withdraw require a note. Duplicate requires the other ticket's number.
  - A move is refused if someone else changed the status in the meantime.
- **Picking the developer:** QA and admins pick the developer. People who work on the chosen module are listed first, with the lead marked.
- **Ticket page** (`/tickets/[number]`):
  - Status buttons with a note dialog, and a details panel with the developer picker.
  - One conversation that mixes comments with a timeline of every change (status, developer, edited fields).
  - The reporter or an admin can edit the ticket.
- **Images:**
  - Paste a screenshot (Ctrl+V), pick files or drop them: up to 6 images of 10 MB each, on new tickets and on replies.
  - The type is checked from the file's bytes (PNG, JPEG, WebP or GIF).
  - Files are stored in `UPLOAD_DIR/YYYY/MM/<random>.<ext>` and served only through the signed-in route `/files/[id]`, with `nosniff` and a sandbox CSP.
- **List:** quick views (Open, Assigned to me, Reported by me, Waiting for retest, Done, All), filters by type, module (including its sub-modules) and developer, and a search on text or `#number`. 50 tickets per page.
- **Dashboard:** counts for open tickets, tickets assigned to me and tickets waiting for retest. These replace the "coming next" banner.
- **Config:** `serverActions.bodySizeLimit` and `proxyClientMaxBodySize` are raised to 64 MB. Without the second, `proxy.ts` would cut uploads off at 10 MB without an error.
- **Build fix:** `npm run build` had been failing on `/test-design/[id]` since 3.5a.
  - The layout's Suspense fallbacks read `usePathname()`, which the prerendered shell of a `[param]` route can't know.
  - The fallbacks are now `AppSidebarShell` and `AppTopbarShell`, which don't read the path.
- **Migration:** `qa_hub_tickets` adds the `Ticket`, `TicketComment`, `TicketEvent` and `Attachment` tables.
- **Tests:** workflow, ticket store (numbering, timeline, filters, the full loop), uploads (magic bytes, limits, path traversal), ticket schemas and formatting.

## Phase 3.5a: QA Hub foundation (2026-10-28)

The app's focus moves to a QA ticket hub for the 5 QA testers and the developers, on the office LAN. The AI workbench
is hidden behind an admin toggle while it waits for a major revision; none of it was deleted.

- **Accounts:**
  - Admin / QA tester / Developer roles, created by an admin. There is no sign-up.
  - New accounts get a 12-character temporary password and must change it at first sign-in.
  - Passwords are hashed with Node's built-in scrypt, so no native modules are needed.
  - Sessions are DB rows keyed by the SHA-256 of a random token in an httpOnly `qa_session` cookie. They last 14 days and slide while in use.
  - Failed logins are rate-limited (5 per email per 15 minutes) and get one generic error message.
  - `?next=` is limited to same-site paths.
- **Access checks:**
  - `lib/auth/session.ts` (`requireUser`, `requireAction`, `getCurrentUser`) runs in every page, Server Action and route handler.
  - `proxy.ts` only redirects visitors with no cookie and keeps the cookie fresh.
  - All permissions live in one matrix in `lib/auth/permissions.ts`.
- **Admin → Users:**
  - Create users, edit name, email and role, turn an account off (signs it out everywhere), and reset passwords.
  - Admins can't turn off their own account, and the last active admin can't be removed.
- **Admin → Workspace:** the AI workbench toggle, off by default.
  - When on, a separate "AI workbench" menu group appears for admins only.
  - Its pages moved to `app/(main)/(ai)/` behind `requireAiWorkbench()`. Their actions and routes check it too, and return 404 otherwise.
- **Team & modules** (`/team`): the who's-who directory.
  - It is an admin-editable module → sub-module tree (`ErpArea`, kept to two levels) with a lead, developers and QA per area (`AreaMember`).
  - Anyone can view it and filter by person. The dashboard flags developers and QA who aren't in any module.
  - The seed loads 4 placeholder modules from `data/erp-areas.json`, to be replaced with the real ERP module list.
- **Navigation:**
  - The sidebar now has three groups: Tickets (Dashboard, Tickets and Inbox are marked "Next", Team), Admin, and AI workbench.
  - The app is renamed QA Hub. The topbar shows the signed-in user and a sign-out button.
- **LAN operations** (`docs/OPERATIONS.md`):
  - New scripts: `npm run serve` (port 3000 on all interfaces), `npm run lan:dev` (with `LAN_ORIGINS`), `npm run user:create` and `npm run backup`.
  - `npm run backup` writes a `VACUUM INTO` snapshot, keeps the last 14 and mirrors `UPLOAD_DIR`.
  - SQLite now runs in WAL mode with a 5-second busy timeout.
- **Real ERP modules:**
  - `data/erp-areas.json` now holds the 11 DCWD ERP modules from the portal, with sub-modules for Human Resource (7) and Billing and Collection (2).
  - `npm run areas:import` re-syncs the file. It matches by code, so renames keep their members. `--prune` removes only areas that nobody is assigned to.
- **Show/hide password** button on every password field (`components/password-input.tsx`).
- **DCWD Careers design**, copied from the Careers prototype:
  - **Sign-in page** (split screen):
    - A brand pane with the DCWD seal (`public/dcwd-seal.png`), rings, a ripple and drifting waves. The motion turns off under reduced-motion settings.
    - The form has leading icons, 48 px fields and an eye toggle, with a footer bar below.
    - On phones the brand pane collapses to a small seal header.
  - **Sidebar:**
    - The seal with "DCWD / QA HUB", a centered profile block (initials avatar with an accent ring, name, role) that opens My account, and 40 px menu items.
    - The topbar now holds a labeled Sign out button.
- `proxy.ts` no longer intercepts `.png`, `.svg` and `.ico` files from `public/`, so the seal loads before sign-in.
- **Rules:** CLAUDE.md rule 6 now means "office LAN, behind login". New rules 12–14 cover ticket data never going to an LLM, uploads outside the repo, and the AI workbench gate.

## Phase 3: Test design studio (2026-10-26)

- **Requirements** at `/test-design`: paste, or upload `.md`, `.txt`, `.docx` (mammoth) or text-layer `.pdf` (unpdf). Limits are 5 MB and 60k characters. Uploaded text is shown for review before saving.
  - A requirement can be linked to a module and a business process. The process steps go into the prompt.
  - A **Sensitive** flag routes the text through redaction. "Preview what the cloud sees" shows the masked text on this machine only.
- **AI drafts** (`testcase_generation`, `claude-sonnet-5-5`):
  - The job is queued in `GenerationJob`, runs after the response through `after()`, and the page polls `/test-design/jobs/[id]`. A job cut off by a restart is marked failed after 10 minutes.
  - The prompt (`lib/ai/prompts/testcase-generation.ts`) sends the glossary and process steps, and asks for ≥ 15 cases with technique labels, ±1 boundaries, negatives and state transitions.
  - The model must write "unknown" plus an open question instead of inventing a rule, and must **never compute money**: amount expectations name the oracle or recon check.
  - Output is validated per case (`lib/test-design/normalize.ts`), so one bad case is dropped instead of failing the run.
  - Error messages never echo the requirement text or the SDK request body.
- **Editable grid:** expand a row to edit it, or add a case by hand. Bulk actions: approve, back to draft, mark obsolete, delete drafts.
  - Editing an approved case sends it back to draft. Automated cases are read-only.
  - A coverage strip shows counts by technique and warns below 15 cases or when boundary or negative cases are missing.
- **Traceability matrix** at `/test-design/traceability`: requirement → cases → latest result → defects, filterable by module. Uncovered requirements are flagged.
- **Export:** XLSX (`write-excel-file`, chosen over exceljs, which pulled in 94 packages including a flagged `uuid`) and CSV with a UTF-8 BOM. CSV cells that start with `=`, `+`, `-` or `@` are escaped, so tags like `@critical` are never run as formulas.
- **Seed catalog** in `data/seed-catalog.json`: 21 areas and 86 cases from PLAN §6.4 plus the BCA workflows (meter-reading books, JMS sequence gate, MCR, NSC, Order of Payment, BAM/DM/CM). The import is idempotent.
- **Reference docs:** `docs/erp/bca-api-process-flow.md`, a new `docs/glossary.md` (sent with every generation prompt) and a `docs/roles.md` stub to fill in.
- **Seed:** six new BILLING processes from the BCA document.
- **Schema:**
  - `Requirement` gets a title, module, process, source file and open questions.
  - `TestCase` gets open questions, a process step, a sort order and an approval time.
  - New `GenerationJob` table.
- **Next 16 note:** with Cache Components on, route handlers always run on Node.js and a `runtime` export is rejected, so CLAUDE.md rule 5 is met without the export line.

## Phase 2: AI layer (2026-10-26)

- **One router** in `lib/ai/` with entry point `runTask` (`lib/ai/index.ts`). ESLint blocks importing `ai`, `@ai-sdk/*`, the providers or the raw router from anywhere else.
- **Privacy per task:** `localOnly`, `redactThenCloud` or `public`.
  - Sensitive input never reaches the cloud unredacted.
  - Local-only tasks can't be rerouted, even from Settings.
  - If Ollama is down, the call fails instead of falling back to the cloud.
  - `OLLAMA_BASE_URL` must be a loopback address.
- **Redaction** (`lib/ai/redact.ts`), deterministic, with 57 tests:
  - email, PH mobile and landline numbers, TIN, SSS, PhilHealth, Pag-IBIG and GSIS numbers
  - labeled account, meter and OR numbers
  - peso amounts and long digit runs
  - a names list matched in any letter case, with or without accents or ñ, and in "Surname, Given" order
  - extra ID formats as regexes
  - an optional second pass with the local model, which refuses the cloud call if Ollama is down
- **Audit log:** every call (local and cloud, including `BLOCKED` and `ERROR`) records task, model, tokens, cost in integer micro-dollars, duration and redaction count. Prompt and response text are never stored.
- **Budget:** a $10/month cloud cap by default, checked before every cloud call, plus a limit on output tokens per call. Prices live in `data/model-prices.json`.
- **Settings page:**
  - provider health with "Test" buttons
  - models per task
  - budget and spend meter
  - redaction settings with an offline "Try redaction" preview
  - audit-log viewer with filters
- **AI SDK v7 note:** `generateObject` is deprecated, so structured output uses `generateText` with `output: Output.object({ schema })`, and `system` is now called `instructions`.
- **Dev fix:** `lib/db.ts` rebuilds its cached Prisma client after `prisma generate`, so migrations no longer require restarting the dev server.

## Phase 1 — Foundation and domain model (2026-10-26)

- Prisma 7 + SQLite (better-sqlite3 driver adapter) with the full PLAN §5 data model; first migration `init`.
  List fields are `Json` because SQLite has no scalar lists. The client is generated to `lib/generated/prisma` (git-ignored).
- Idempotent seed (`npm run db:seed`): 1 project, a placeholder staging environment, 4 modules, 4 business processes and 12 example risks.
- `lib/guard/allowlist.ts`: exact-origin + normalized path-prefix URL guard. It refuses production environments, userinfo, non-http(s) URLs, lookalike hosts and dot-segment escapes. Covered by 30+ unit tests.
- `lib/risk/score.ts` (L×I score, bands, 5×5 heat map) and zod input schemas in `lib/schemas/`.
- App shell with a sidebar, plus pages for Dashboard, Projects, Environments (with a "Test a URL" box that runs the real guard), Modules, Processes (ordered step editor with hand-offs) and Risk register (heat map + filters).
- Removing the production flag from an environment requires typing its name.
- UI follows the DCWD ERP/HRMS design patterns:
  - indigo accent `#4f56d3`, Geist type, and a solid-indigo active item in the sidebar
  - breadcrumb top bar and centered footer
  - cards with a header bar, uppercase table headers, and status pills with a dot
  - underline tabs with count chips, step timelines, icon-box stat tiles and inline alerts
  - a confirm dialog before every delete
  - tokens live in `app/globals.css`, with dark-mode values ready.
- `dev`/`start` bind to 127.0.0.1. `allowedDevOrigins` allows both loopback names.
- Note: with Cache Components enabled, Next 16 forbids `export const runtime = "nodejs"`. Node is the only runtime, so it is omitted.
  DB reads call `await connection()` inside `<Suspense>`, so pages are never prerendered with stale data.
