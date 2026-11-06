# Talent Profile Studio

Internal tool for Enosis Solutions to keep resource data current and produce proposal-ready talent profiles.

**Status: Phase 2**
- Phase 1: admin sign-in, resource data model, admin create/edit/archive, Google Form CSV import, bulk email import.
- Phase 2: secure links for resources (and reviewers, used from phase 6), editable message templates, email sending (Resend, Postmark, or SendGrid), reminders, optional email code, rate limiting.

Later phases add the resource update form, requirements and matching, AI generation, the reviewer page, and Canva export.

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS 4
- PostgreSQL via Drizzle ORM
  - Local dev: [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly, stored in `.data/pglite`), so nothing needs installing
  - Production: any Postgres (Supabase recommended) via `DATABASE_URL`
- Zod for validation, Papa Parse for CSV

## Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env        # then set ADMIN_EMAILS to your address
npm run db:setup            # applies migrations and seeds 5 fictional resources
npm run dev
```

Open http://localhost:3000, enter an admin email, then open the **dev inbox** at http://localhost:3000/dev/inbox to click the sign-in link. In dev mode no email leaves your machine.

> PGlite allows one process at a time. Stop `npm run dev` before running `npm run db:*` scripts.
> To start over, stop the server, delete `.data/`, and run `npm run db:setup` again.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Base URL used in emailed links |
| `DATABASE_URL` | Postgres connection string. Empty = embedded PGlite |
| `PGLITE_DIR` | Where PGlite stores data (default `.data/pglite`) |
| `ADMIN_EMAILS` | Comma-separated admins allowed to sign in |
| `ADMIN_ALLOWED_DOMAIN` | Also allow everyone on this domain (e.g. `enosisbd.com`). Leave empty in production to use only `ADMIN_EMAILS` |
| `EMAIL_PROVIDER` | `dev` = store messages in the dev inbox. `resend`, `postmark`, or `sendgrid` send real email |
| `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` / `SENDGRID_API_KEY` | Key for the chosen provider |
| `CRON_SECRET` | Protects the reminder job at `/api/cron/reminders` |
| `AUDIT_SALT` | Salt for hashing visitor IPs in the link audit log |
| `EMAIL_FROM` | Sender name and address |
| `SAMPLE_EMAIL_DOMAIN` | Domain for generated sample addresses |
| `STALE_AFTER_DAYS` | Records older than this are flagged stale (default 60) |

## Importing our Google Form data

1. In the Google Sheet, open the **Form Responses 1** tab and choose **File → Download → Comma-separated values (.csv)**.
2. In the app, go to **Import → Resources from the Google Form** and upload the file.
3. Check the column mapping. It is detected automatically from the form's question text; the repeated "Client Name" and "Industry / Domain" columns are assigned to the project asked about just before them.
4. Review the preview, then import.

What the importer does:

- Keeps only the **latest submission per person** (matched by name, ignoring case, accents, and extra spaces).
- Treats `N/A`, `-`, and blanks as empty; adds previous-workplace years and Enosis years together for the total.
- Splits comma-separated tech lists into items per category, removing duplicates.
- Splits `- ` bullet lines (including several bullets typed on one line) into separate responsibilities and achievements.
- Parses `Project Name: X; Type: Y` and `Project Brief: … Project Feature(s): …`.
- Updates people who already exist, keeping their previous version in the history. It **skips** a person if their record was edited in the app after the form submission.

### Emails

The form has no email question, so imported people get a **sample address** like `firstname.lastname@enosisbd.com`, marked *sample / unverified*. The app never sends real email to an unverified address (phase 2 enforces this in every provider).

When you have the real list, upload a CSV with `Name` and `Email` columns under **Import → Real email addresses**. Matching addresses replace the samples and are marked verified.

Test files with fictional data are in `samples/` (regenerate with `npx tsx scripts/make-sample-csv.ts`).

## Secure links (no login for resources and reviewers)

- Admins send update requests from a resource's page (**Send update request**) or in bulk by ticking people on the Resources list.
- Each person gets an email with their own link (`/r/<token>`). The token is 256 bits of randomness; only its SHA-256 hash is stored.
- A link shows only that person's own record. Expired, revoked, and completed links show a friendly page instead.
- Links last 7 days for resources and 3 for reviewers by default, or until the due date if later (**Settings**).
- **Requests** lists every request with its status (sent, opened, completed, expired, revoked), email delivery, open count, reminders, and a full activity log.
  - **Resend** emails a fresh link and extends the expiry. Earlier links keep working.
  - **Remind** sends the friendly reminder.
  - **Revoke** stops all of the request's links immediately.
- Sending a new request to someone revokes their previous open one, so each person has one active link.
- **Optional email code** (off by default, in Settings): before the page opens, the recipient gets a 6-digit code by email (10-minute expiry, 5 attempts).
- Link pages are rate-limited per IP (60 requests per 5 minutes), marked `noindex`, never cached, and send no Referer header.
  The limiter is in memory per server instance; use a shared store if you run several instances.
- Every open, code check, email, reminder, and revoke is logged with time, a hashed IP, and the browser's user agent. Email security scanners that open links show up as opens too.

### Messages

Wording lives in **Settings → Messages**: resource update request, reviewer request, friendly reminder, and thank-you confirmation.
Edit the subject and body with variables such as `{name}`, `{role_title}`, `{due_date}`, `{link}`, and `{sender_name}`, preview with sample values, or reset to the default wording.
Each email is sent as plain text plus a simple branded HTML version with an "Open your secure link" button.

### Reminders

`GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET` sends the friendly reminder for open requests whose due date is within the configured number of days (default 2).
It skips requests created in the last 24 hours and never sends more than the maximum (default 1).
`vercel.json` runs it daily on Vercel. Elsewhere, call it from any scheduler.

### Email safety

With a real provider, the app **never sends to sample/unverified addresses**: those messages are recorded as *blocked*, and bulk requests skip those people.
In `dev` mode everything goes to the dev inbox, where you can also view the HTML version.

## Data model

- `resources` — one row per person. List sections (tech stack by category, education, achievements, projects) are validated JSONB, read and written as a whole. Each section tracks when and by whom (admin, import, or the resource) it was last changed.
- `resource_versions` — a full snapshot of the record before every change.
- `import_batches` — uploaded CSVs, their column mapping, and per-row results.
- `login_tokens`, `sessions` — admin magic-link sign-in. Only SHA-256 hashes of tokens are stored.
- `outbound_emails` — every message the app sends (the dev inbox in development).
- `access_requests` — a task for someone without an account (resource update, later profile review), with due date, expiry, status, and code-check state.
- `access_tokens` — hashed link tokens; a request can have several (initial, resend, reminder).
- `access_events` — audit log of link activity.
- `message_templates`, `app_settings` — editable wording and settings.

Project client names are stored for internal use only and will never be shown in generated profiles.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Add the 5 fictional sample resources (only if the table is empty) |
| `npm run typecheck`, `npm run lint` | Checks |

## Deploying

1. Create a Supabase project and copy its Postgres connection string into `DATABASE_URL`.
2. Deploy to Vercel (or any Node host) with the environment variables above. Set `APP_URL` to the public URL and leave `ADMIN_ALLOWED_DOMAIN` empty unless every address on the domain should be an admin.
3. Run `npm run db:migrate` against the production database (the app also applies pending migrations on startup).
4. Set `EMAIL_PROVIDER` and its API key, and verify your sending domain with the provider so messages from `EMAIL_FROM` are delivered.
5. Set `CRON_SECRET` so the daily reminder job can run.
