# Talent Profile Studio

Internal tool for Enosis Solutions to keep resource data current and produce proposal-ready talent profiles.

**Status: Phase 5**
- Phase 1: admin sign-in, resource data model, admin create/edit/archive, Google Form CSV import, bulk email import.
- Phase 2: secure links for resources (and reviewers, used from phase 6), editable message templates, email sending (Resend, Postmark, or SendGrid), reminders, optional email code, rate limiting.
- Phase 3: the resource update form (pre-filled, step by step, autosave) and the admin's highlighted view of what changed.
- Phase 4: requirements, ranked matching with reasons, choosing who to propose, and update requests per requirement.
- Phase 5: AI profile generation with Claude, house style and length settings, and a fact-check pass.

Later phases add the reviewer page and Canva export.

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

On Windows PowerShell, run the commands one per line from the `talent-profile-studio` folder (PowerShell 5 doesn't accept `&&`), use `copy` instead of `cp`, and type `npm.cmd` instead of `npm` if PowerShell says "running scripts is disabled":

```powershell
cd "D:\Enosis Content\talent-profile-studio"
npm.cmd run dev
```

The app always runs on port **3100** (port 3000 is often taken by other local apps).

Open http://localhost:3100, enter an admin email, then open the **dev inbox** at http://localhost:3100/dev/inbox to click the sign-in link. In dev mode no email leaves your machine.

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
| `ANTHROPIC_API_KEY` | Claude API key for profile generation and fact-checking |
| `ANTHROPIC_MODEL` | Model id (default `claude-opus-5-5`) |
| `AI_MODE` | `claude` or `offline`. Defaults to `claude` when a key is set; `offline` builds plain drafts from the record without AI |
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

## Resource update form

When a resource opens their link they get a short, mobile-friendly form, already filled in with their current information, in six steps:

1. Personal details (name, title, email shown read-only, education)
2. Experience (years, major expertise, availability, industries, languages)
3. Tech stack, by category
4. Certifications and achievements
5. Projects, with tips on writing a good description
6. Review and confirm: what was updated or confirmed, and a summary of their changes

- Each step has a **This is still correct** button, so someone with nothing to change can finish in a few taps.
- Changes **save automatically** a couple of seconds after each edit (and when the tab is hidden). Closing the page and reopening the same link continues where they left off.
- Resources can't change their email, email status, or seniority.
- On submit:
  - Only the sections the person actually changed are written to their record. If an admin edited another section in the meantime, that edit is kept.
  - The previous version is saved in the history, and sections they confirmed get fresh "last updated" dates, which clears the stale flag.
  - The request is marked complete, the admin who sent it gets an email, and the person sees the thank-you message (optionally also emailed; see Settings).
- **Requests → View changes** (also linked from the resource page and the admin email) shows a highlighted before/after of everything that changed, with added and removed lines marked.

## Requirements and matching

**Requirements** holds each prospect's staffing request:
- client, role title, must-have and nice-to-have skills, minimum years, domain, engagement type, deadline, and notes or a pasted job description.
- **Find skills in this text** scans the notes for skill names already in our database and lets you add each as must-have or nice-to-have.

Opening a requirement shows every active resource **ranked by a match score out of 100**:

| Part | Points | How |
| --- | --- | --- |
| Must-have skills | 50 | Share of must-haves found in their tech stack or project technologies. A related skill (e.g. "AWS" ↔ "AWS Lambda") counts 60%. |
| Nice-to-have skills | 15 | Same, for nice-to-haves |
| Experience | 15 | Total years compared with the minimum |
| Availability | 10 | Available 100%, partially 60%, unknown 50%, allocated 20% (90% if free before the deadline) |
| Domain | 5 | A project or listed industry matches the requirement's domain |
| Data freshness | 5 | Full if updated within the stale threshold, then declining |

Parts that don't apply (no nice-to-haves, no minimum years, no domain) are left out and the score is scaled back to 100.
Skill names are normalized before comparing, so "React.js" = "React", "Postgres" = "PostgreSQL", "JS" = "JavaScript", "C#" = "c sharp", and so on.

Each row shows why: matched must-haves (with how many projects used them), missing must-haves in red, matched nice-to-haves, availability, and freshness. A score breakdown is one click away.

- **Nothing is selected automatically.** Tick people and click **Add ticked to proposal**.
- In the **Proposed** list, send update requests to the people you tick. The message uses the requirement's role title, and stale records are pre-ticked. Skip anyone whose record is current.
- Each proposed person shows their latest update request for this requirement and a link to their changes.
- A resource's page lists the requirements they're proposed for.

## AI profile generation

On a requirement, each proposed person has **Generate profile**. It writes a tailored profile in our current format: header, career summary, core competency, technical expertise, education, awards & certifications, and 2–4 project engagements.

How it works:
- Claude receives the requirement and the person's record. Email addresses and **client names are removed before sending**, so they can't leak into the profile.
- The system prompt enforces the hard rules:
  - use only facts from the record (tailoring means selecting and emphasizing, never inventing);
  - missing must-have skills go into an internal **gaps** list, never into the profile;
  - prefer concrete technical work over management language;
  - keep numbers exactly as written;
  - project titles describe the product, never the client.
- The response is constrained to a JSON schema (structured outputs) and validated with Zod. Output that breaks a limit or rule (too many bullets, a client name, a project that doesn't exist in the record) is retried up to 3 times with the problems listed; anything left over is flagged.
- If Claude's safety classifiers decline a request, the API automatically retries on Anthropic's recommended fallback model (`fallbacks: "default"`).
- **Every call is logged** in `ai_calls`: purpose, requirement, resource and the record's last-updated time, model, attempt, full request and response, status, token usage, and duration.

**Fact check** runs right after generation and is shown next to the profile, before it goes to a reviewer:
- Rule-based checks: every skill and technology must exist in the record; every project must trace to a record project; awards and education must match; every number must appear in the record; no client names; section limits.
- A second Claude pass compares every claim with the record and flags unsupported or exaggerated ones by severity.

The profile page shows the formatted profile (the same layout the reviewer and the PDF export will use), the fact-check flags, the internal gaps, and the version history. You can **Edit** (saved as a new version; checks re-run), **Re-run fact check**, **Regenerate**, or **Restore** an older version. If the person's record changes after a version was written, the page says so.

**Settings → AI profile writing** holds the house style guide (seeded from our current profiles) and the section limits: summary length, number and length of competencies, number of projects, description length, and contributions per project.

**Without an API key** the app runs in offline mode: **Generate profile** assembles a plain draft straight from the record, clearly labelled "Offline draft (no AI)". Only the rule-based checks run. This lets you try the whole workflow before adding a key.

## Data model

- `resources` — one row per person. List sections (tech stack by category, education, achievements, projects) are validated JSONB, read and written as a whole. Each section tracks when and by whom (admin, import, or the resource) it was last changed.
- `resource_versions` — a full snapshot of the record before every change.
- `import_batches` — uploaded CSVs, their column mapping, and per-row results.
- `login_tokens`, `sessions` — admin magic-link sign-in. Only SHA-256 hashes of tokens are stored.
- `outbound_emails` — every message the app sends (the dev inbox in development).
- `access_requests` — a task for someone without an account (resource update, later profile review), with due date, expiry, status, code-check state, and for update requests the starting snapshot, autosaved draft, and final submission.
- `access_tokens` — hashed link tokens; a request can have several (initial, resend, reminder).
- `access_events` — audit log of link activity.
- `message_templates`, `app_settings` — editable wording and settings.
- `requirements` — prospects' staffing requests.
- `requirement_candidates` — who was proposed for each requirement, with their score when added.
- `profiles` — one tailored profile per person per requirement, with its status.
- `profile_versions` — every version's content, gaps, fact-check flags, source (Claude, offline, admin edit), and the record snapshot it was written from.
- `ai_calls` — log of every Claude API call.

Project client names are stored for internal use only and will never be shown in generated profiles.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Add the 5 fictional sample resources and 2 sample requirements (each only if its table is empty) |
| `npm run typecheck`, `npm run lint` | Checks |

## Deploying

1. Create a Supabase project and copy its Postgres connection string into `DATABASE_URL`.
2. Deploy to Vercel (or any Node host) with the environment variables above. Set `APP_URL` to the public URL and leave `ADMIN_ALLOWED_DOMAIN` empty unless every address on the domain should be an admin.
3. Run `npm run db:migrate` against the production database (the app also applies pending migrations on startup).
4. Set `EMAIL_PROVIDER` and its API key, and verify your sending domain with the provider so messages from `EMAIL_FROM` are delivered.
5. Set `CRON_SECRET` so the daily reminder job can run.
