# Coaching Platform Template

A self-hostable website, client portal, and admin dashboard for a solo coaching
business — built with Express, EJS, MongoDB, Stripe, Cal.com, and Resend.

You don't need to know how to code to set this up. You'll need to create a
handful of free (or nearly free) accounts with other companies — a database
provider, a payment processor, a scheduling tool, and an email service — and
copy a few codes ("API keys") from each of them into this project. This guide
walks through every one of those steps in order, in plain language.

**What's included:**
- A public marketing site (home) with SEO/structured data
- Stripe-billed offerings (one-time and subscription), with automatic Cal.com session scheduling on payment
- A client portal: onboarding checklist, sessions, resources/worksheets (including a coaching roadmap — goals plus a per-session plan, editable by both client and coach), gated tool resources a client can request and a coach unlocks (from the resource library, or tied to a specific session), a values-inventory tool, wheel-of-life tracking, testimonials, referrals, profile & notification preferences (including billing, for subscription clients)
- An admin dashboard: manage offerings, resources, coaching agreements, testimonials, clients, coaching containers, sessions, and notification settings — no code changes needed for day-to-day content
- Free client creation (`/admin/clients/new`) — add a client directly with no Stripe payment involved; they get a set-password email, are required to sign the coaching agreement on first login, and land in the same scheduling flow a paying client would
- Session reminder emails, and event-triggered notifications (session notes posted, new tool added, testimonial reviewed), each with a per-client opt-out
- CSRF protection, rate limiting, and Mongo-backed sessions (safe for a real multi-process/deploy environment)

## Prerequisites

You'll be creating one free account with each of these companies (except your
business email, which is a small paid add-on). None of this requires
technical knowledge — each one is a normal sign-up form, the same as signing
up for any website.

- Node.js 20+ (only needed if running on your own computer — not needed for the Render deploy path below)
- (Required) Database to store information: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) — free
- (Required) Payment Processing: [Stripe](https://stripe.com) — free
- (Required) Calendar Management: [Cal.com](https://cal.com) — free
- (Required) Automated Emailing: [Resend](https://resend.com) — free
- (Required) Business Email: I use — [Proton](https://proton.me/) Mail Plus — $48/yr
- (Recommended) Platform Hosting: [Render](https://render.com) Hobby tier account — free
- (Recommended) Web Domain: I use — [Cloudflare](https://cloudflare.com) — free
   - If not using your own web domain, Render offers a subdomain option so your website will look like: YOUR_BUSINESS_NAME.onrender.com. A web domain manager like Cloudflare is recommended if you'd like to host your website without the `onrender` subdomain.
- (Recommended) Web pinging to keep site up - [cron-job.org](https://cron-job.org) — free (not actually used — see **Keeping it awake / scheduled tasks** below for the method this repo actually uses)

## Getting your environment variables

"Environment variables" just means a list of settings the app needs — API
keys from the services above, plus things like your business name. You'll
collect all of these first, then paste them in either during `npm run setup`
(running locally) or into a form on Render (deploying live) — see the
sections after this one for where they actually get entered.

Do these in order — some steps depend on the one before it.

### 1. Database — MongoDB Atlas → `MONGODB_URI`

This is where all your client data, sessions, and settings are stored.

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Create a free cluster (Atlas calls the free tier "M0"). Any cloud provider/region is fine — pick one close to you.
3. When prompted to create a database user, set a username and password and **save them somewhere** — you'll need them in a moment.
4. In the left sidebar, go to **Network Access** → **Add IP Address** → choose **Allow Access from Anywhere** (`0.0.0.0/0`). This is required because Render's servers don't have a fixed address.
5. Go to **Database** in the sidebar, click **Connect** on your cluster, choose **Drivers**, and copy the connection string shown. It looks like:
   ```
   mongodb+srv://yourusername:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual database password from step 3.
7. **Add a database name** right after `.net/` — Atlas's string doesn't include one, but the app needs one. For example:
   ```
   mongodb+srv://yourusername:yourpassword@cluster0.xxxxx.mongodb.net/coaching-platform?retryWrites=true&w=majority
   ```
   (Any name works — MongoDB creates it automatically the first time the app writes to it. If you skip this, the app will still connect but will silently store everything in a generic default database instead.)

This finished string is your `MONGODB_URI`.

### 2. Payments — Stripe → `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

Stripe is what actually charges your clients' cards and manages subscriptions.

**Getting your secret key:**

1. Go to [stripe.com](https://stripe.com) and create an account (you can finish account verification later — you can get your keys immediately).
2. In the Stripe Dashboard, make sure you're looking at **Test mode** first (toggle near the top) while you're setting things up — you'll switch to **Live mode** once you're ready to accept real payments, and repeat the steps below to get a second, live version of each key.
3. Go to **Developers** → **API keys**.
4. Under "Standard keys," copy the **Secret key** (starts with `sk_test_...` in test mode, or `sk_live_...` in live mode). This is your `STRIPE_SECRET_KEY`.

   *Optional, more advanced/secure option:* instead of the standard secret key, you can create a **restricted key** (same page, "Create restricted key") that only has the specific permissions this app actually needs. If you do this, give it **Write** access to **Checkout Sessions**, **Write** access to **Subscriptions**, and **Read** access to **Prices**. Missing the Prices permission is the single most common cause of a confusing "Unable to create checkout session" error, since Stripe needs to read the price before it can create the checkout — if you hit that error, this permission is the first thing to check.

**Setting up the webhook** (this is how Stripe tells your app "a payment just came in"):

You'll do this step *after* your site is deployed and live (see **Deploy to Render** below), because Stripe needs a real, working URL to send events to.

1. In the Stripe Dashboard (same mode — test or live — as the key you're using), go to **Developers** → **Webhooks**.
2. Click **Add endpoint** (sometimes labeled **Add destination**).
3. For the endpoint URL, enter: `https://your-app.onrender.com/stripe/webhook` (use your actual site address, whatever it ends up being).
4. Under "Select events to listen to," search for and check exactly these three:
   - `checkout.session.completed` — fires when a client finishes paying, so the app can create their account/schedule their sessions.
   - `invoice.paid` — fires on every recurring subscription charge, so the app can send the next session and apply any pending cancellation.
   - `customer.subscription.deleted` — fires when a subscription actually ends, so the app can mark that client's engagement as completed.
5. Click **Add endpoint** to save it.
6. On the endpoint's detail page, find **Signing secret** and click **Reveal**. Copy that value (starts with `whsec_...`) — this is your `STRIPE_WEBHOOK_SECRET`.

**Per-offering setup (not an environment variable):** in Stripe, go to **Product catalog** and create a Product with a Price for each program/package you offer (one-time or recurring, matching how you'll set it up in this app). Each Price has its own ID (starts with `price_...`) — you'll paste that into the **Price ID** field when you create the matching "Offering" in this app's admin dashboard (**Admin → Offerings → New**), not into your `.env` file.

### 3. Scheduling — Cal.com → `CAL_API_KEY`

Cal.com is what actually books sessions on your calendar once a client pays (or is added by an admin).

1. Go to [cal.com](https://cal.com) and create a free account, connecting the calendar you actually use (Google Calendar, Outlook, etc.) when prompted.
2. Create an **Event Type** for each program/package you plan to offer (**Event Types** in the left sidebar → **+ New**) — set its duration, availability, and any other scheduling rules the way you want that session to work.
3. For each event type, note its numeric ID: open the event type to edit it, and look at the web address in your browser's address bar — it will contain a number like `.../event-types/123456`. That number (`123456` in this example) is what you'll paste into the **Cal.com Event Type ID** field when creating the matching Offering in this app's admin dashboard. It is *not* an environment variable — it's entered per-offering, inside the app itself, after you've deployed.
4. To get the API key: go to **Settings** → **Developer** → **API Keys** → **+ Add** (naming it something like "Coaching Platform" is fine). Copy the key shown — this is your `CAL_API_KEY`. You won't be able to see it again after leaving the page, so copy it somewhere safe now.

**One more setting, not an environment variable:** the `BOOKING_URL` value (in the business-identity section below) is your general public Cal.com scheduling link, e.g. `https://cal.com/your-username` — shown as the general "Book a session" link on your public marketing pages. It's separate from the per-offering Event Type IDs above, which control what happens during the paid checkout flow specifically.

### 4. Email — Resend → `RESEND_API_KEY`

Resend is what sends every email this app sends: account verification, password resets, session reminders, notifications to you when a client does something, and so on.

1. Go to [resend.com](https://resend.com) and create a free account.
2. **Verify a domain** — this is the step that's easy to miss, and without it your emails either won't send or will look untrustworthy to email providers. Go to **Domains** → **Add Domain**, enter a domain you own (e.g. `yourcoachingbusiness.com`), and Resend will show you a handful of DNS records (TXT and CNAME entries) to add.
   - Add those exact records at wherever your domain's DNS is managed (Cloudflare, GoDaddy, Namecheap, etc. — wherever you bought/manage the domain).
   - This can take anywhere from a few minutes to a few hours to verify, depending on your DNS provider. Resend's Domains page will show a green "Verified" status once it's done.
3. Once verified, go to **API Keys** → **Create API Key**, give it a name, and copy the value shown (starts with `re_...`) — this is your `RESEND_API_KEY`. Like Cal.com's key, you won't be able to see it again later.
4. Your `CONTACT_EMAIL` (see below) needs to be an address at that same verified domain (e.g. `hello@yourcoachingbusiness.com`) — that's the "From" address every email gets sent from.

*If you don't have a domain yet:* you can skip domain verification temporarily and Resend will let you send test emails only to your own Resend account email — fine for kicking the tires locally, but real clients won't receive anything until a domain is verified.

### 5. Your business identity (no external account needed)

These are just plain text — fill them in directly, no sign-up required:

- `BUSINESS_NAME` — shown across the site, emails, and page titles.
- `FOUNDER_NAME` — your name, shown as the person emails come from.
- `SITE_TAGLINE` — a one-line description shown on the homepage.
- `CONTACT_EMAIL` — must be an address at the domain you verified with Resend above (step 4).
- `BOOKING_URL` — your general Cal.com scheduling link, e.g. `https://cal.com/your-username` (see step 3 above).
- `BASE_URL` — the web address your site is actually running at (e.g. `https://your-app.onrender.com`, or your own domain once connected). Locally this is just `http://localhost:3000` and you won't need to touch it. On Render, this isn't part of the deploy form at all — leave it alone until you add a custom domain (see **Deploy to Render**, step 7).

### 6. Everything else (auto-generated — nothing to sign up for)

- `SESSION_SECRET` and `CRON_SECRET` are random security codes the app needs, but you never choose these yourself — `npm run setup` generates them for you locally, and Render's Blueprint generates them automatically when deploying (see **Deploy to Render** below).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` are only needed for the Render deploy path (see step 4 of **Deploy to Render** below) — locally, `npm run setup` creates your admin account interactively instead.

## Running it locally (for testing/validation)

```bash
npm install
npm run setup   # walks through .env and creates your first admin account
npm run dev
```

`npm run setup` will ask you for each value from the section above, one at a
time, and tell you if something looks wrong (e.g. a malformed URL). Press
Enter to accept a suggested default where one is shown.

Visit `http://localhost:3000/home`, then log in at `/login` with the admin account you just created.

## Deploy to Render

The recommended path — Render's free Hobby tier gives you a running HTTPS app at `https://your-app.onrender.com` from a form, no terminal access to the server needed at all.

1. **Push this repo to your own GitHub account** (fork it, or push it to a new repo you create).

2. **Get your MongoDB connection string** — see **1. Database — MongoDB Atlas** above if you haven't already. You'll paste the finished string in as `MONGODB_URI` in the next step.

3. **In Render: New → Blueprint, and connect your repo.** Render reads this repo's `render.yaml` automatically and shows a form for every setting the app needs. Fill in each value using the steps in **Getting your environment variables** above — `SESSION_SECRET` and `CRON_SECRET` aren't part of that form at all; Render generates both automatically.

4. **Fill in `ADMIN_EMAIL` and `ADMIN_PASSWORD` in that same form.** This is how you get your first login with no shell access on the server — the app creates that admin account itself on first boot. (Password needs 8+ characters with upper/lowercase, a number, and a symbol.)

   *Alternative, if you'd rather not put a password in a form field:* leave those two blank and create the admin directly in your database instead — see **Creating an admin without the form** below. Either way gets you the same result.

5. **Click Deploy.** Once it's live, log in at `https://your-app.onrender.com/login` with the admin email/password from step 4 (or the password you set via the alternative method).

6. **Register the Stripe webhook** (skip if you left Stripe blank in step 3) — now that your site has a real address, follow the **Setting up the webhook** steps under **2. Payments — Stripe** above, using `https://your-app.onrender.com/stripe/webhook` (or your custom domain, if you've already added one) as the endpoint URL.

7. **Optional: add your own domain later.** Render's Settings → Custom Domains walks you through it (it gives you the DNS record to add at whatever registrar/DNS host you use, and issues the HTTPS certificate itself). Once added, set `BASE_URL` to that domain in Render's Environment tab, and update your Stripe webhook's endpoint URL (step 6 above) to match.

A note about the free tier:

- **It spins down after 15 minutes of no traffic** — the first visitor after a quiet spell waits ~30-50 seconds for it to wake back up. See **Keeping it awake / scheduled tasks** below for the fix — Render's Starter tier ($7/mo, no spin-down at all) is the paid alternative.

## Keeping it awake / scheduled tasks

The app has one built-in scheduled job — a session-reminder check that runs every 30 minutes via `setInterval` in `server.js` — but that only fires while the process happens to be running, which Render's free tier doesn't guarantee once it's spun down.

`GET /api/cron/session-reminders` solves both problems in one request: it triggers that same reminder check directly (safe to call as often as you like — it's de-duplicated, never double-sends), and the request itself resets Render's inactivity timer, keeping the free instance awake. It's authenticated by `CRON_SECRET` (auto-generated by the Blueprint, or by `npm run setup` locally) via an `Authorization: Bearer <token>` header — with no secret configured it refuses every request, so it's never accidentally open.

This repo includes a ready-to-use GitHub Actions workflow for it — `.github/workflows/cron.yml`, runs every 10 minutes. One-time setup:

1. In this repo's GitHub settings → Secrets and variables → Actions, add two repository secrets:
   - `APP_URL` — e.g. `https://your-app.onrender.com` (no trailing slash)
   - `CRON_SECRET` — the same value as the `CRON_SECRET` env var on your deploy (Render's Environment tab)
2. That's it — GitHub runs it on schedule from here on. Check the Actions tab to confirm it's green.

(cron-job.org's free plan times out at 30 seconds, which is often shorter than a cold Render instance's ~50-second wake-up — that's why this uses GitHub Actions instead, not because Render blocks it outright.)

Self-hosting somewhere that doesn't spin down (a VPS, Render's Starter tier)? None of this is necessary — the built-in `setInterval` already covers it.

### Creating an admin without the form

Skipped `ADMIN_EMAIL`/`ADMIN_PASSWORD`, or need to add a second admin later? Do it straight from Atlas's UI — no code, no terminal, and no need to type a password anywhere except the site itself:

1. In Atlas, open **Browse Collections** on your cluster, find the `portalusers` collection (it appears once the app has connected at least once — deploy first if it's not there yet), and **Insert Document**.
2. Switch that dialog to its JSON view and paste this in, changing the email/name:
   ```json
   {
     "email": "you@example.com",
     "firstName": "Your",
     "lastName": "Name",
     "role": "admin",
     "emailVerified": true,
     "passwordHash": null
   }
   ```
   No password field to fill in here on purpose — there's no safe way to hand-type a valid one (a real bcrypt hash can't be produced without running code, and a "paste your password into this website to hash it" tool is a bad idea for obvious reasons).
3. On your live site, go to `/forgot-password` and enter that same email. You'll get a real password-reset email — set your password there, the normal way, through the app's own login system. That's your admin account.

This works because it's the same mechanism `/admin/clients/new` already uses for clients added without payment: create the account with no password, let them set one themselves through the app.

## Architecture notes for customizing further

- **`code/config/site.js`** is the one place site identity lives — every view has it available as `site` (wired via `res.locals` in `server.js`), and email templates `require()` it directly.
- **Models** are in `code/models/`, one Mongoose schema per file. **Controllers** in `code/controllers/` are grouped by area (account/auth, admin, client dashboard, values tool, Stripe, Cal.com, site/marketing). **Routes** are all in `code/routes/pages.js`.
- `code/views/home.ejs` is a bare placeholder — build out your own marketing page there before going live.
- `code/views/privacy-policy.ejs` and `terms-of-use.ejs` are boilerplate, not legal advice — have them reviewed before relying on them.
- Sessions are stored in MongoDB (`connect-mongo`), not in-process memory — safe to restart/redeploy without logging everyone out.
- `render.yaml` defines the Render Blueprint used by **Deploy to Render** above; `seedAdminFromEnv()` in `code/scripts/seedDefaults.js` is what turns `ADMIN_EMAIL`/`ADMIN_PASSWORD` into a real account on first boot.

## Contributing

Found a bug, or want to suggest or build a new feature? This repo has GitHub issue and pull request templates set up under `.github/` to make that easy:

- **Reporting a bug**: open a new issue and choose the **Bug report** template (`.github/ISSUE_TEMPLATE/bug_report.yml`) — it'll prompt you for what happened, what you expected instead, the exact steps to reproduce it, and where you're running the app (local, Render, self-hosted elsewhere). The more specific the repro steps, the faster it can get fixed.
- **Suggesting something new**: open a new issue and choose the **Feature request** template (`.github/ISSUE_TEMPLATE/feature_request.yml`) — describe the problem you're trying to solve and what you'd like to happen. A "blank issue" option is also available for anything that doesn't fit either template.
- **Submitting a pull request**: GitHub automatically fills in the description box from `.github/PULL_REQUEST_TEMPLATE.md` — fill in what changed and how you tested it, and check off the checklist items. One of those items matters more than the others here: **don't hardcode business-specific values** (a business name, an email address, etc.) anywhere in a contribution — route anything identity-related through `code/config/site.js` and environment variables, the same way the rest of the app already does (see **Architecture notes** above). That's what keeps this usable as a template for every self-hoster, not just one business.

## License

MIT, with the [Commons Clause](https://commonsclause.com/) — see `LICENSE`. In short: free to use, self-host, modify, and run your own (including paid) coaching business on. What it blocks is selling the software itself or offering it as a paid hosted/managed service to third parties.
