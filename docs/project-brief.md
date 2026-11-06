# Project: Talent Profile Studio

Build a web application for a software services company (Enosis Solutions) to produce proposal-ready talent/resource profiles. When a prospect sends a staffing requirement, we select a resource from our internal database, ask the resource to confirm or update their information, generate a tailored profile with AI, get it reviewed and approved, and export the final version as a branded design in Canva.

Before writing any code, read this whole brief, ask me any clarifying questions, then propose an architecture, data model, and phased build plan for my approval. Build one phase at a time and stop after each phase so I can test it.

## Workflow at a glance

1. Admin creates a requirement and selects a resource.
2. **Resource** receives a polite notification message with a secure link. They click it and land directly on a form pre-filled with their information. **No login, no account, no password.** They check everything and update or edit their name, tech stack and skills, experience, certifications, and projects, then submit.
3. Admin generates a tailored profile with AI from the updated record.
4. **Reviewer** receives a polite notification message with a secure link. They click it and see the **final formatted profile** exactly as it will be delivered. **No login, no account, no password.** They can read the full content and either **edit directly** or **leave suggestions** in the page UI, then approve or request changes.
5. Admin exports the approved profile to Canva (or the in-app PDF fallback).

## Reference: our current profile format and data source

The app must produce profiles in the format we already send to clients, and import the data we already collect. Use these as the source of truth for the data model, the forms, the AI output, and the export template.

### Current resource profile (the output format)
Our existing profile is a 2-page branded PDF with the footer `www.enosisbd.com` on every page. Sections, in this order:

1. **Header:** resource name (all caps) and title (e.g., "Senior Software Engineer").
2. **Career Summary:** one short paragraph (2–3 sentences): title, years of experience, core specialization, and any notable secondary strengths.
3. **Core Competency:** 3–5 bullets. Each bullet states a strength and backs it with evidence from the record (e.g., competitive programming results backing problem-solving, architecture knowledge, research work, types of systems built).
4. **Technical Expertise:** a two-column table of category → comma-separated items. Categories: Languages, Web Technologies, Frameworks, Libraries, Databases, Tools (plus Project Management and Cloud & Platforms when the resource has them). Omit empty categories. Fix the typos in our current template ("Librarie" → "Libraries", "Datasbases" → "Databases").
5. **Education:** degree and university (year optional).
6. **Awards & Certifications:** bullets with the full name of each award, competition result, publication, or certification.
7. **Project Engagements:** usually 2–4 projects. For each project:
   - A descriptive project title in caps (e.g., "WEB-BASED EVENT MANAGEMENT PLATFORM"). **Client names are never shown in the profile**; the title describes the product, not the client.
   - Industry line (e.g., "Industry: Event Management Software / SaaS").
   - A one-paragraph description of what the system does and its key features.
   - Core Technologies line.
   - Major Contributions: 4–6 bullets of concrete technical work, including measurable results when the record has them (e.g., "Optimized file load time by 80–90%").

### Current Google Form / Sheet (the input data)
Our existing data is in a Google Form whose responses land in a Google Sheet ("Form Responses 1", about 130 rows, one row per submission). Columns:

- Timestamp
- Name
- Bachelor's (degree name, university, year) — free text
- Master's (degree name, university, year) — free text, often "N/A"
- Years of work experience at previous workplaces (not total), or "N/A"
- Years of experience at Enosis
- Major Expertise — free text covering core specialization (backend/frontend/full-stack/mobile/desktop), key strengths (scalability, performance, architecture, algorithms), and types of systems (enterprise, SaaS, FinTech, etc.). Tech stack is intentionally excluded here.
- Achievements & Certifications — free text, often a bulleted list in one cell
- Tech stack, one column per category: Programming Language, Web Technologies, Frameworks, Library, Database, Other Tools, Project Management, Cloud & Platforms — each a comma-separated list or "N/A"
- Projects 1, 2, and 3, each with: Project Name (sometimes combined with type, e.g., "Project Name: X; Type: Desktop application"), Project Brief & Features (free text, sometimes with "Project Brief:" and "Project Feature:" labels), Client Name ("N/A" if not done at Enosis), Responsibilities (often "- " bullet lines in one cell), Core Technologies (comma-separated), and Industry / Domain

Data notes the app must handle:
- **There is no email column yet.** I will share the real resource email list later. For now:
  - Import matches people by normalized name, shows likely duplicates for the admin to confirm, and keeps the latest submission per person.
  - Give each imported resource a sample email on our domain in the format `firstname.lastname@enosisbd.com` (lowercase, spaces and special characters removed; add a number if two people collide, e.g., `firstname.lastname2@enosisbd.com`).
  - Mark these emails as **"sample / unverified"** in the database and show a badge in the admin UI.
  - **Never send real emails to unverified addresses.** Because these are guesses on a real domain, messages to unverified emails must go only to the dev inbox (or be blocked with a clear message in production) until the admin replaces or verifies the email.
  - Provide a bulk "update emails" import (CSV with name and email columns) so I can load the real list later in one step, matched by name, with a preview before saving. Importing a real email marks it verified.
- Treat "N/A", "n/a", "-", and blank as empty.
- Total experience = previous-workplace years + Enosis years.
- Split comma-separated tech lists into individual items, trim them, and de-duplicate case-insensitively (e.g., "Git" vs "git"). Keep the category they came from.
- Split "- " bullet lines in Responsibilities and Achievements into separate items.
- Parse "Project Name: …; Type: …" into name and type, and "Project Brief: … Project Feature(s): …" into brief and features, when those labels are present.
- The form only allows 3 projects; the app must allow any number.
- The sheet contains real employee data. Don't copy it into seed data, fixtures, logs, or AI prompts beyond what each feature needs.

Import options: CSV upload with a column-mapping screen (preset mapping for the columns above), and optionally a direct Google Sheets sync using a service account with read-only access.

## Users and access model

1. **Admin / Sales Ops** (me and my team): the only users who log in. Admins manage requirements, select resources, send update and review requests, trigger AI generation, and export final profiles to Canva.
2. **Resource** (engineers, designers, QA, etc.): **no account and no login.** They receive a notification message with a secure personal link that opens a form pre-filled with their current information. The link is all they need; there is nothing to sign up for or remember.
3. **Reviewer**: **no account and no login.** They receive a notification message with a secure link that opens the final formatted profile for review. The link is all they need.

### Secure link requirements (replaces login for resources and reviewers)
- Each link contains a long, random, unguessable token tied to one specific task (one resource update request, or one profile review). Store only a hash of the token in the database.
- Links expire after a configurable period (default 7 days for resources, 3 days for reviewers). Admin can resend a fresh link or revoke a link at any time.
- A link only grants access to its own task: a resource link shows only that resource's own record; a reviewer link shows only the profile being reviewed.
- Once a task is completed (form submitted, profile approved), the link becomes read-only or shows a friendly "already completed, thank you" page.
- An expired or revoked link shows a friendly page explaining what happened and how to ask for a new link (never a raw error).
- Log every link open and submission (timestamp, task) for auditing.
- Optional setting (off by default): require a 6-digit code sent to the recipient's email before the page opens, for extra security.

## Notifications

- Send notifications by email (use a provider such as Resend, Postmark, or SendGrid; configurable). Design the notification layer so other channels (e.g., Slack, WhatsApp) can be added later.
- All messages must be **polite, warm, short, and professional**. Each message clearly invites the recipient to open the link, and makes it obvious that no login is needed.
- Store message templates in an admin settings page so we can edit wording without code changes. Templates support variables such as {name}, {role_title}, {client_industry}, {due_date}, {link}, {sender_name}. Admin can preview a message with real values before sending.
- Default templates to seed:

**Resource update request**
> Subject: Quick request: please review your profile information
>
> Hi {name},
>
> I hope you're doing well! We have an exciting opportunity for a {role_title} role, and we'd love to put your profile forward.
>
> Could you please take a few minutes to check your information using the link below? Everything is already filled in, including your tech stack, skills, experience, certifications, and projects, so you only need to review it and update or edit anything that has changed. No login is needed; just open the link.
>
> {link}
>
> It would be great if you could complete this by {due_date}. Thank you so much for your help!
>
> Best regards,
> {sender_name}

**Reviewer request**
> Subject: Profile ready for your review: {resource_name}, {role_title}
>
> Hi {reviewer_name},
>
> A new talent profile for {resource_name} ({role_title}) is ready for your review. The link below opens the final formatted profile, exactly as it will be shared. You can read the full content and make edits or leave suggestions directly on the page. No login is needed.
>
> {link}
>
> We'd appreciate your feedback by {due_date}. Thank you!
>
> Best regards,
> {sender_name}

**Friendly reminder** (sent automatically if a task is not completed within a configurable time, e.g., 2 days before the due date; maximum one reminder by default)
> Hi {name}, just a gentle reminder about the request below. Whenever you have a moment, we'd really appreciate it. Thank you!
>
> {link}

**Thank-you confirmation** (shown on screen and optionally emailed after submission)
> Thank you, {name}! Your information has been received.

## Core features

### 1. Resource database (admin-managed)
- Each resource record contains: name, email, title, seniority, years of experience at previous workplaces, years at Enosis (total is calculated), availability status and available-from date, major expertise (core specialization, key strengths, types of systems), tech stack grouped by the categories above (Languages, Web Technologies, Frameworks, Libraries, Databases, Tools, Project Management, Cloud & Platforms), optional proficiency level and years per item, domains/industries, achievements and certifications (name, issuer, year, optional credential link; achievements include competition results, awards, and publications), education (bachelor's and master's: degree, university, year or "in progress"), and a list of projects.
- Each project entry: project name, project type (web, desktop, mobile, backend API, etc.), brief, key features, client name (internal only, never shown in profiles), whether it was done at Enosis, industry/domain, duration, team size, the resource's role, core technologies, responsibilities and contributions (as separate bullets), and measurable outcomes.
- Track "last updated" per resource and per section, and whether the last update came from the resource or an admin.
- **Import:** see "Current Google Form / Sheet" above for the columns and parsing rules.

### 2. Resource update form (accessed via secure link, no login)
- The resource opens the link from the notification and lands directly on the form. No sign-in screen.
- The form opens **pre-filled** with the resource's current information. The resource checks everything and can **update, edit, add, or remove** information in these areas:
  - **Name** and title
  - **Tech stack and skills**, grouped by category, with optional proficiency level and years per item
  - **Experience**: years at previous workplaces, years at Enosis, major expertise, and availability
  - **Education**
  - **Achievements and certifications**
  - **Projects**: all project fields
- Sections, shown as clear steps with a progress indicator:
  1. Personal details: name, title, email (read-only), education
  2. Experience and expertise: years at previous workplaces, years at Enosis, major expertise (specialization, strengths, types of systems), availability
  3. Tech stack: one group per category (Languages, Web Technologies, Frameworks, Libraries, Databases, Tools, Project Management, Cloud & Platforms) as editable tag inputs with suggestions, so items stay consistent across resources
  4. Achievements and certifications: add, edit, or remove
  5. Projects: add, edit, or remove any number of projects, using the same fields and example text as our current Google Form so it feels familiar
  6. Review and confirm: a summary of all changes before submitting
- Each section has a "This is still correct" quick-confirm option so resources with no changes can finish quickly.
- Autosave drafts so a resource can close the page and return via the same link before it expires.
- Mobile-friendly, simple, and friendly in tone. Inline help text explaining what makes a good project description (concrete technologies, what they built, measurable results).
- On submission: update the resource record, keep the previous version in history, mark the request complete, show the thank-you message, and notify the admin. Show the admin a highlighted diff of what the resource changed.

### 3. Requirements
- Admin creates a requirement: client/prospect name, role title, must-have skills, nice-to-have skills, minimum experience, domain, engagement type, deadline, and free-text notes (or a pasted job description).
- **Matching:** show a ranked shortlist of resources with a match score based on skill overlap, experience, availability, and data freshness. Show *why* each resource matched (matched skills, missing skills). The admin makes the final selection; never auto-select.
- From the shortlist, the admin can send update requests to one or more resources in one click, or skip the request if the record is already current.
- Flag records as "stale" if not updated within a configurable number of days (default 60), and suggest sending an update request.
- One requirement can have multiple proposed resources, each with its own profile.

### 4. AI profile generation (Claude API)
- Generate a tailored profile for the selected resource against the requirement, using the Anthropic API. Keep the model name in an environment variable.
- Output must be **structured JSON** matching our current profile sections: career summary, core competency bullets (3–5), technical expertise by category (items relevant to the requirement first), education, awards and certifications, and project engagements (2–4 most relevant, each with descriptive title, industry, description, core technologies, and major contributions).
- **Hard rules for the AI, enforced in the system prompt:**
  - Use ONLY facts present in the resource's record. Never invent skills, projects, numbers, employers, or certifications. Tailoring means selecting and emphasizing, not fabricating.
  - If a must-have skill is missing from the record, do not claim it. List it in a separate internal "gaps" field shown to the admin only, never in the final profile.
  - Prefer concrete technical contributions over generic leadership/management language.
  - Never include client names. Give each project a descriptive title based on what the product does (e.g., "Wi-Fi Spectrum Analysis Desktop Application"), and describe clients only generically if needed (e.g., "a US-based healthcare SaaS company").
  - Keep measurable results exactly as stated in the record; never round up or add new numbers.
  - Respect per-section length limits (configurable).
- Store a house style guide and section length limits in an admin settings page. Seed the style guide from our current profile: third-person, no pronouns in bullets, concise past-tense contribution bullets, technical and specific, career summary of 2–3 sentences.
- After generation, run an automatic fact-check pass comparing every claim against the source record. Show flags to the admin before sending to the reviewer.

### 5. Reviewer page (accessed via secure link, no login)
- The reviewer opens the link from the notification and lands directly on the profile. No sign-in screen.
- The reviewer receives the **final formatted file**: the page shows the profile exactly as it will look in the exported document, with the same layout, branding, section order, and `www.enosisbd.com` footer as our current profile (a web preview of the final template). The reviewer can view the full content and download it as a PDF.
- The reviewer has two ways to give input on any section, both directly in the page UI:
  - **Edit:** click into a section and change the text inline. Direct edits are tracked (who, when, before/after).
  - **Suggest:** highlight text or select a section and leave a suggestion or comment (e.g., "make this shorter", "emphasize the AWS work"). Suggestions are shown as visible annotations.
- A side panel lists all edits and suggestions made in this review.
- Actions at the bottom: **Approve** or **Request changes**, with an optional overall comment.
- When the reviewer clicks **Request changes**, the system sends the suggestions to the AI, which revises **only** the sections that have suggestions, follows the same no-invention rules, and keeps the reviewer's direct edits unchanged. The admin is notified, can check the revised version, and sends it back to the reviewer with a new secure link for the next round.
- When the reviewer clicks **Approve**, the version is locked, a thank-you message is shown, and the admin is notified.
- Profile statuses: Draft → Waiting on Resource → Generated → In Review → Changes Requested → Revised → Approved → Exported.
- Keep full version history with a diff view between versions.

### 6. Canva export
- Integrate with the **Canva Connect API**. Approved profiles are sent to Canva by filling a Canva brand template with the profile's fields (autofill), then exporting the result as PDF.
- Build a field-mapping screen where the admin picks the Canva brand template and maps each profile field to a template data field.
- Save the generated Canva design link and the exported PDF on the profile record; allow download from the app.
- Canva's autofill and brand template APIs may require a specific Canva plan. Check the current Canva Connect API documentation, tell me the requirements, and design the integration behind an interface so we can fall back to generating the PDF in-app from the same HTML template used for the reviewer preview. Implement this fallback too.

### 7. Admin dashboard
- Pipeline view of all requirements and profiles by status.
- Pending resource update requests and review requests, with link status (sent, opened, completed, expired) and buttons to resend, remind, or revoke.
- Stale records and profiles waiting on action.
- Search and filter resources by skill, availability, and seniority.

## Technical preferences
- Next.js (App Router) with TypeScript, Tailwind CSS, PostgreSQL (Supabase is fine for database, admin auth, and file storage), and Prisma or Drizzle as the ORM. Propose alternatives if something is clearly better, and explain why.
- Admin authentication only (email magic link or Google sign-in for our company domain). Resources and reviewers never authenticate; they use secure links only.
- All secrets (Anthropic API key, Canva credentials, email provider) in environment variables, with a `.env.example`.
- Validate AI JSON output with a schema (e.g., Zod) and retry on invalid output.
- Log every AI call (requirement, resource version, output, model) for traceability.
- Rate-limit the public token-based pages and protect them from bots.
- Seed data: 5 realistic but fictional sample resources (shaped like our Google Form data, covering web, desktop, and full-stack profiles), 2 sample requirements, and a sample reviewer, so I can test the full flow end to end, including the link-based pages. All seed people (resources, reviewer, admin) use sample `@enosisbd.com` addresses in the `firstname.lastname@enosisbd.com` format, marked unverified, so every message lands in the dev inbox. Also include a sample CSV in the exact column layout of our Google Sheet, with fictional data, to test the import.
- In local development, show sent emails in a dev inbox (or log them with clickable links) so I can test the resource and reviewer links without a real email provider.
- Include a README with setup, environment variables, and how to run locally and deploy.

## Suggested phases (adjust if you have a better plan)
1. Project setup, admin auth, resource data model, admin CRUD, CSV import.
2. Secure link system, notification templates, and email sending.
3. Resource update form (pre-filled, stepwise, autosave, diff for admin).
4. Requirements and resource matching.
5. AI profile generation, style guide settings, fact-check pass.
6. Reviewer page: formatted preview, inline editing, suggestions, approve/request changes, AI revision loop, version history.
7. Canva integration plus in-app PDF fallback.
8. Dashboard, reminders, polish, and deployment.

Start by asking me your clarifying questions.
