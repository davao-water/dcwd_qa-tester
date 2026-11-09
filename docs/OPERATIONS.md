# Running QA Hub

QA Hub runs on **Vercel** (the website, with HTTPS) and **Supabase** (the database and the uploaded screenshots and
videos). Both are in Singapore. Nobody's laptop needs to stay on. The QA laptop only runs the nightly backup.

| Where | What is there |
|---|---|
| Supabase project **Quality-ai** (ap-southeast-1) | Postgres database (all tables, RLS on, no policies); Storage bucket `attachments` (private, 50 MB per file, images and videos only) |
| Vercel project (region `sin1`) | The app, built from GitHub; the daily clean-up cron |
| QA laptop | `.env.local`, the nightly backup in **Documents\QA Hub Backups** |

## 1. Settings (environment variables)

The same names go in `.env.local` on a developer's PC and in Vercel → Project → **Settings → Environment Variables**.
`.env.example` lists them without values. Never paste the values in chat, tickets or git.

| Name | Where to find it | Secret? |
|---|---|---|
| `DATABASE_URL` | Supabase → **Connect → ORM** tab, the first line (port 6543, ends `?pgbouncer=true`) | yes, holds the DB password |
| `DIRECT_URL` | Same tab, the second line (port 5432). Used only by migrations | yes |
| `SUPABASE_URL` | Supabase → Project Settings → **Data API** (`https://<ref>.supabase.co`) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → **API Keys** → the `sb_secret_…` key | **yes, full access**; never `NEXT_PUBLIC_` |
| `CRON_SECRET` | Any random text of 32+ characters you make up (e.g. a password manager's generator) | yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Run `npx web-push generate-vapid-keys` once; the **Public Key** line. Device notifications are off while any of the three VAPID settings is empty | no, public by design |
| `VAPID_PRIVATE_KEY` | The same command's **Private Key** line. Make the pair once and keep it: a new pair turns notifications off on every device until each person turns them on again | **yes**; never `NEXT_PUBLIC_` |
| `VAPID_SUBJECT` | `mailto:` and an admin's email, e.g. `mailto:you@davao-water.gov.ph` | no |
| `NEXT_PUBLIC_VIDEO_MAX_MB` | Optional. Leave unset on the free plan (50). Raise it only together with the bucket's file size limit | no |
| `BACKUP_DIR` | Optional, laptop only. Default is `Documents\QA Hub Backups` | no |

If the database password or the secret key ever leaks, reset it in Supabase, then update `.env.local` **and** Vercel,
and redeploy.

## 2. Working on the code (developer PC)

1. `npm install`
2. Fill `.env.local` (section 1).
3. `npm run dev` and open http://localhost:3000. This uses the real Supabase project, so test tickets you file are
   real. Delete them afterwards.

**Changing the database** (a new column or table): edit `prisma/schema.prisma`, then
`npx prisma migrate dev --create-only --name <what-changed>`, check the SQL (a new table also needs
`ALTER TABLE "<Name>" ENABLE ROW LEVEL SECURITY;`), and apply it with `npm run db:deploy`. Do this **before** pushing
code that needs the change, so the live site never runs against a database without it.

## 3. Deploying

- Pushing to the `master` branch on GitHub deploys to production automatically. Pushing any other branch makes a
  **preview** deployment with its own URL, using the same database.
- Watch a deploy in Vercel → **Deployments**. If the site breaks after a deploy, open the previous good deployment
  and choose **Promote to Production** (instant rollback); then fix the code.
- Vercel → **Cron Jobs** shows the daily clean-up (`/api/cron/daily`, 02:00 Manila). It deletes uploads nobody sent
  within a day, expired sessions and old sign-in counters. Its daily query also stops the free Supabase project from
  pausing after a week with no use.

### First-time setup of a new Supabase project
Only needed if QA Hub moves to a new project (or after a disaster, see section 4).
1. Create the project in **Southeast Asia (Singapore)**.
2. Storage → **New bucket** `attachments`: private, file size limit 50 MB, allowed types
   `image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm`.
3. Fill `.env.local` with the new project's values, then `npm run db:deploy` (creates the tables with RLS).
4. Either load a backup (section 4), **or** start empty: `npm run db:seed` (the module list) and create the first admin:
   ```
   npx tsx scripts/create-user.ts --admin --name "Your nickname" --email you@davao-water.gov.ph
   ```
   It prints a one-time temporary password. Run it yourself, in your own terminal.
5. Update the variables in Vercel and redeploy.

## 4. Backups

Supabase's free plan has **no backups**, so the QA laptop makes them:

```
npm run backup
```

It writes to **Documents\QA Hub Backups** (or `BACKUP_DIR`):
- `Database\QA Hub database <date> <time>.json`: every account, ticket, reply, timeline entry, attachment record,
  module, DAR and setting. The last 14 are kept.
- `Files\`: every screenshot and video, in the same `YYYY\MM\` folders as in Storage. Only new files are downloaded.
- `READ ME.txt`: what the folders are.

The backup holds ticket data (customer names, account numbers, amounts). Keep it on the laptop or an office drive;
never upload it anywhere.

**Every night, with Task Scheduler:** open Task Scheduler → **Create Basic Task** → name *QA Hub backup* → **Daily**,
12:30 AM → **Start a program**:
- **Program:** `cmd.exe`
- **Arguments:** `/c cd /d "C:\Users\VYKE\Documents\VS Code Projects\Quality-ai" && npm run backup >> "%USERPROFILE%\Documents\QA Hub Backups\backup.log" 2>&1`

Then open the task's **Properties → Settings** and tick *Run task as soon as possible after a scheduled start is
missed*, so a night with the laptop off is caught up the next morning. Check `backup.log` now and then.

**Restore** (into a new, empty Supabase project only; it refuses a database that has data):
1. Do steps 1–3 of *First-time setup* (section 3), but **not** the seed.
2. Run, with the backup you want:
   ```
   npx tsx scripts/restore.ts --file "C:\Users\VYKE\Documents\QA Hub Backups\Database\QA Hub database 2026-10-31 0030.json"
   ```
   It loads the database in one go (all or nothing), then uploads the files from the `Files` folder next to it.
3. Update Vercel's variables, redeploy. Everyone signs in again; passwords are unchanged.

## 5. Accounts

- **Office emails only:** every account must use an `@davao-water.gov.ph` address.
- **Can't remember an account's email?** Admin → Users lists every account with its email, role and status.
  Passwords are never stored in readable form, so nobody can look one up: use the key icon to reset it.
- **Sign-up requests:** people can request an account from the sign-in page as a QA tester or developer. The sign-in
  page is on the internet now, so the admin approval is the gate. Signing up with an email that already has an account
  (or a request waiting) says so on the form.
  - Requests wait in **Admin → Users → Waiting for approval**, and the dashboard shows how many are waiting.
  - Approve only people you know are on the team, because approved users can see every ticket.
  - **Approve** shows a one-time temporary password. Give it to the person in person or by office chat, together
    with their email. They choose their own password at first sign-in. If you lose it, use the key icon (Reset password).
  - Reject deletes the request. At most 20 sign-up requests per hour are accepted.
- **Forgotten password:** the person clicks **Forgot your password?** on the sign-in page and enters their email.
  No email is sent: the request appears in **Admin → Users → Password reset requests** (the dashboard and the sidebar's
  Users count show it too). Check it's really them, click **Reset password**, and give them the temporary password in
  person. **Dismiss** removes a request without resetting. You can also reset anyone any time with the key icon. A reset
  signs them out everywhere. At most 5 requests per email and 30 in total are accepted per hour.
- **The only admin is locked out:** on a PC with `.env.local`, run
  `npx tsx scripts/reset-password.ts --email you@davao-water.gov.ph`. It prints a temporary password once.
- **Someone leaves:** edit the user and untick *Account is active*. They are signed out at once, and their tickets and
  comments stay. This is the usual choice.
- **Deleting an account** (the red bin in Admin → Users): removes the account **and everything it made**, for good:
  the tickets they filed with every reply on them (other people's too), their replies and timeline entries on other
  tickets, their files in Storage, their DAR and devices. Tickets only assigned to them stay, unassigned. The dialog
  counts what goes; type their email to confirm. You can't delete yourself or the last admin. Only the laptop's
  nightly backup has a copy afterwards.
- **Designer:** a tick-box on any account (Admin → Users → edit). It lets that person send UI/UX designs for approval
  in **Design reviews**, on top of their role (e.g. a QA tester who also designs). Admins and the Team page show a
  *Designer* badge.
- **Temporary access** (the timer icon in Admin → Users, admins only): lend a QA tester or developer some admin
  features for 1 to 72 hours, for example while you're on leave. Tick what they get:
  - **Sign-ups & password requests:** the Approval and Password reset tabs. They can reset a password only for
    someone who asked for it, and never an admin's.
  - **Team & modules:** add modules and choose who works on each, like a Team Lead.
  - **All tickets:** every ticket shows in their tabs, as it does for admins.

  It ends by itself at the time shown on their row, with nothing to undo. **End now** stops it early, and giving it
  again replaces it. Adding, editing or deleting accounts and changing roles always stays with admins, so nobody can
  make themselves a permanent admin. The person sees what they've been lent, and until when, on their dashboard.
- **Handing the admin role over:** create the new admin's account (role Admin), let them sign in and change the
  temporary password, then they edit your account to your new role (e.g. QA tester, with Designer ticked).
- **Failed sign-ins:** after 5 failed sign-ins in 15 minutes, that email is locked out for the rest of the window.
- **Lock-out protection:** at least one active admin must always remain. The app refuses changes that would remove the last one.

### A lost phone
**Admin → Users → Sign out all devices** (the door icon on the person's row) ends all their sessions and stops device
notifications straight away. Their password stays, so also use **Reset password** if someone else may know it. They
turn notifications back on after signing in. An unfinished draft stays in that phone's browser until it's next opened;
it can't be removed from here.

### Drafts on a phone
**New ticket** keeps an unfinished ticket in that browser for 24 hours, per person: the text, the choices and the ids of
uploaded files. It's deleted when the ticket is filed, on **Clear**, and on signing out there. Files themselves stay in
Storage as pending uploads until then. If a phone loses signal while filing, QA Hub can't tell whether the ticket went
through, so it says so: check **Tickets** before trying again, or the same ticket can be filed twice.

## 5b. Notifications

- The **bell** in the top bar shows how many tickets have something new for you, and the newest ones, with a link to
  My inbox. New tickets have a red dot in the lists.
- **Sidebar counts:** **My inbox ● N** is how many replies from other people you haven't read yet. **Tickets ● N** is
  how many new tickets you haven't opened yet (developers: newly assigned to you; admins: newly filed; QA testers file
  their own, so it stays at 0). **Users ● N** (admins) is sign-ups and password resets waiting.
- **My inbox** works like Messenger: conversations on the left (newest first, with the last message, a red dot and the
  number of unread replies), the selected ticket's messages on the right with a reply box (Enter sends, images open in
  the markup tools). Search by title or #number, or show only Unread. Status changes, editing and assigning are on the
  ticket page: **Open ticket**.
- "New" means anything someone **else** did on a ticket you can see (developers: tickets assigned to them; QA: their
  own; admins: all): a new ticket, a reply, a status change, a reassignment or an edit. Your own actions never notify you.
- Opening a ticket marks it read. **Mark all as read** in the bell clears everything.
- Lists and tickets update by themselves; no reload needed. With device notifications on, an open tab updates the
  moment one arrives; otherwise it checks every 30 seconds while the tab is open. Nothing is checked while the tab is
  in the background, and it checks at once when you come back.

### Device notifications (Windows, Mac, Android, iPhone)

- After signing in on a device where they're off, QA Hub asks **Turn on notifications?** Click **Turn on**, then
  **Allow** when the browser asks. **Not now** hides the question on that device for 14 days. (Browsers only show their
  Allow question after a click, so QA Hub can't skip this step.)
- **My account** is in sections with tabs on the left (a row of tabs on phones): **Profile**, **Password**,
  **Notifications**, **Sound** and **Work hours**. Links can open one directly, e.g. `/account?tab=sound`.
- Any time: **My account → Notifications**: **Turn on**, **Send test** (checks it works) and **Turn off**
  (that device only).
- **No Allow question appears?** An ad blocker (e.g. Adblock Plus) can hide it: pause it for QA Hub and try again.
- **Brave:** push is off by default. Open `brave://settings/privacy`, turn on **Use Google services for push
  messaging**, restart Brave, then Turn on again.
- **Sound** (My account → Sound, or in the sign-in question): Tone 1 to 11 (Tone 1 is the default),
  or **Silent**. ▶ plays it.
  - The tone plays when QA Hub is **on screen in a tab you've clicked in**; the Windows/phone notification is then
    silent, so it doesn't ring twice. With QA Hub **closed or behind other windows**, the device's own notification
    sound plays: browsers can't give a web notification its own sound. **Silent** mutes both.
  - **No sound at all?** Windows Focus / Do Not Disturb (or the phone's) mutes the device sound, and so does turning
    off sounds for the browser in Windows Settings → System → Notifications.
  - Your own messages never notify **any** of your devices: replying from your phone doesn't ring your PC.
  - The tones are in `public/sounds/` (from Pixabay, free to use).
- They come for the same things as the bell: a new or assigned ticket, a reply, a status change, an edit. Your own
  actions never notify you. Clicking one opens the ticket.
- They lead with the message (the device adds the time):
  ```
  #12 · Bill shows the wrong total
  Ana: Can you check the total again? 📷 Photo
  Module: Billing
  ```
  More replies on the same ticket stack into one (the newest message, then **3 new replies**). Opening the ticket
  clears it. Photos are never shown in a notification (they'd be downloaded by every device); open the ticket.
- ⚠️ **Customer data on screens:** previews show ticket titles and messages, so they can show customer
  names and amounts. Each person can turn off **Show message previews** (My account → Sound) to get only
  `#12 · Bug / New reply from Ana / Module: Billing`. Everyone should also hide previews while the device is locked:
  - **iPhone:** Settings → Notifications → **Show Previews → When Unlocked**.
  - **Android:** Settings → Notifications → **Notifications on lock screen → Hide sensitive content** (or don't show).
  - **Windows:** Settings → System → Notifications → untick **Show notifications on the lock screen**.
- **Work hours** (My account → Work hours, picked in half hours, Philippine time). Each person chooses what happens
  outside their hours and days: **Notify me with sound** (the default), **Notify me silently** (no sound or vibration,
  it waits in the device's notification list; iPhones ignore this and still play their sound) or **Don't notify me**.
  Nothing is lost either way: the bell and My inbox still show it. The device's own Do Not Disturb or Focus also mutes
  them.
- **Each status change is its own notification** (Fixed, then Closed, both stay in the list); replies, edits and
  assignment share one per ticket. A device that's off or offline gets what it missed for up to **3 days**. Opening the
  ticket clears its notifications.
- **When they arrive with QA Hub closed:**

  | Device | Needs |
  |---|---|
  | Windows | The browser running in the background. Edge does by default; Chrome: Settings → System → *Continue running background apps when Google Chrome is closed* |
  | Mac | Chrome or Edge still open (no windows is fine). Safari works even when closed (macOS 13+) |
  | Android | Nothing more (Chrome) |
  | iPhone / iPad | iOS 16.4+, and QA Hub **added to the Home Screen** (Share → Add to Home Screen), then turned on from that icon. Not possible in a normal Safari tab |

- Delivery is best-effort: usually seconds, but phone battery savers can delay it, and a notification older than
  3 days is dropped.
- **Blocked by mistake?** Click the icon left of the address bar → Notifications → Allow, and reload.
- **Office network:** the firewall must allow `fcm.googleapis.com`, `*.push.apple.com`,
  `updates.push.services.mozilla.com` and `*.notify.windows.com`. If tests work at home but not at the office, ask IT.

### Installing QA Hub as an app

- **Install:** My account → Notifications → **Install QA Hub** (on a phone: Settings → Notifications). iPhone and iPad show the steps instead: Share →
  Add to Home Screen, in Safari. Needs HTTPS, so it works on the live site or a Vercel preview, not from `localhost` on a phone.
- **Start with Windows:** after installing, open `edge://apps` or `chrome://apps`, right-click QA Hub and choose *Start app when you sign in*.
- **Unread count on the icon:** on installed Android, iPhone (iOS 16.4+) and Windows apps. It updates when a notification arrives, so it needs notifications on.
- **Share → QA Hub (Android, installed app only):** share a screenshot or recording from the gallery, and New ticket opens with it attached. The file stays in
  that phone's browser storage until New ticket collects it. If nobody does within a day, it's deleted the next time the app opens or a notification
  arrives. Sign-out deletes it too. iPhones have no share option, so pick from Photos in New ticket.
- **Nothing else is stored:** the app keeps no pages or tickets on the device, so with no connection it shows the browser's normal offline page.

## 6. Daily Accomplishment Reports (My DAR)

- **Everyone has My DAR** (QA testers, developers and admins, in the sidebar under Tickets). There is no shared
  template: a new account starts empty and shows **Set up my DAR**.
- **Set up once (each person), under My DAR → My details** (the **My DAR set-up** page, which also asks for their first period, laid out like the old shared
  template page; Save keeps you on it):
  - Full name as on official forms (the account only holds a nickname), and position title.
  - Department and unit.
  - The Confirmed by (immediate supervisor) and Noted by signatories, with their titles.
  - The core and support duties with their MFOs. Tick **Fill this row's days from my ticket work** on the rows that
    should get the day entries.
  - It's used for every period and can be changed anytime. A field left empty stays empty on the report.
- **Module codes:** set them in **Team & modules** (e.g. `BCA`, `CRM`, `HR-RSP`, `HR201`). The DAR writes a day as
  "QA - BCA / CRM" from those codes, or "DEV - BCA / CRM" for developers. A sub-module with no code uses its module's
  code, then its name.
- **Each period:**
  - Pick the period (1–15 or 16 to the end of the month) and check the days.
  - A day with no ticket work is **REST DAY**. Type over it for work done outside QA Hub, such as HR201 or encoding.
  - Then save and either download **Excel** or use **Print** (choose *Save as PDF* in the print dialog for a PDF).
- **Privacy:** each person sees only their own DARs. Nobody, admins included, can open anyone else's.

## 7. Free-plan limits and when to upgrade

| Limit (free) | What happens | Upgrade |
|---|---|---|
| Storage 1 GB | Uploads start failing. At 50 MB a video, about 20 long videos fill it | Supabase Pro |
| 50 MB per file | Longer or sharper videos are refused before upload | Pro, then raise the bucket limit and `NEXT_PUBLIC_VIDEO_MAX_MB` |
| Egress (downloads) 5 GB / month | Watching videos uses it up; Supabase warns by email. To keep it low, videos load only when someone presses Play, the browser reuses a file for 5 minutes, and screenshots are saved as WebP at full size before upload | Pro |
| Database 500 MB | Text only, so this lasts a long time | Pro |
| No Supabase backups | The laptop's nightly backup is the only copy | Pro adds daily backups |
| Vercel Hobby is for non-commercial use | Ask IT whether this counts; otherwise Vercel Pro | Vercel Pro |
| One cron run per day | Fine for the clean-up | — |

Check usage in Supabase → **Organization → Usage** about once a month.

## 8. Good to know

- **Screenshots:** every image added to a ticket or reply opens in the **Mark up screenshot** tools before it uploads.
  - Add one with **Win+Shift+S** then **Ctrl+V** (anywhere on the page outside a text box, or after clicking the
    **Screenshots** box), **Add images**, drag-and-drop, or **Capture screen**
    (Chrome and Edge on a PC: pick the ERP tab or window; one picture is taken and sharing stops at once).
  - Tools (key in brackets): **Select** (V), **Box** (B), **Circle** (E), **Arrow** (A), **Pen** (P), **Highlight**
    (M, see-through yellow), **Text** (T), **Steps** (N: click to drop 1, 2, 3…), **Callout** (K: drag from the thing
    to where the note goes, then type), **Hide** (H) and **Crop** (C).
  - **Select** a mark to drag it, pull a round handle to resize it (text, steps and callouts grow or shrink), change
    its colour or text size, or press **Delete**. Double-click a note or callout to retype it; arrow keys nudge it.
  - **Text size:** S / M / L / XL buttons, or **[** and **]**. Colours: buttons or keys **1–4**.
  - **Zoom:** **Ctrl + mouse wheel** zooms the screenshot (not the page), as do **− / +** and **Fit** (Ctrl+0). Hold
    **Space** and drag, or drag with the wheel button, to move around when zoomed.
  - **Shortcuts** lists every key; **?** shows it too. Ctrl+Z / Ctrl+Y undo and redo, Ctrl+Enter uses the image, Esc
    cancels what you're drawing or deselects.
  - **Hide** paints a solid black box. It's not a blur on purpose: blurred or pixelated text can be read back by tools.
    Only the marked-up copy is uploaded, so hidden names, account numbers and amounts never leave the PC.
  - **Use original** uploads the picture unchanged; **Remove** drops it. The pencil on a thumbnail marks it up again.
- **Videos:** QA records with **Snipping Tool (Win+Shift+R)** or Xbox Game Bar (Win+Alt+R) and uploads the MP4 with
  **Add video** (MP4 or WebM, up to 3 min / 50 MB). iPhone `.mov` files are refused; share them as MP4 ("Most
  Compatible") instead.
- **Ticket data is sensitive** (customer names, account numbers, amounts) and is never sent to any AI model.
- **Supabase's own API** (the publishable key) can't read anything: every table has RLS on with no policies, and the
  bucket is private. Only QA Hub's server, with the secret key, reaches the data.
