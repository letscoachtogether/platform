const bcrypt = require("bcrypt");
const TestimonialQuestion = require("../models/testimonialQuestion");
const NotificationSetting = require("../models/notificationSetting");
const PortalUser = require("../models/portaluser");
const { PASSWORD_REGEX } = require("../utils/validators");
const site = require("../config/site");

// These were previously hardcoded in dashboardController.js. Now that they
// live in Mongo (so admins can edit them), this seeds them in on first boot
// against an empty collection only — it never touches an already-seeded or
// admin-edited set of questions.
const DEFAULT_TESTIMONIAL_QUESTIONS = [
    "What motivated you to seek coaching and what specific goal or problem brought you here?",
    "What solutions had you already tried on your own and why didn’t they work?",
    "Was there a moment in our coaching that became a turning point for you?",
    "What results, changes or breakthroughs have you achieved since starting coaching?",
    "How have these changes impacted your daily life, career, business or relationships?",
    "What part of the coaching process did you find most valuable (frameworks, accountability, tools, support)?",
    "Were there any unexpected wins or surprising improvements during your coaching journey?",
    "How did my coaching style or approach support your progress and growth?",
    "What would you tell someone who is unsure or hesitant about investing in coaching?",
    "What measurable outcomes have you achieved (income, performance, productivity, well being)?",
    "How has coaching influenced your long-term direction, clarity or decision-making?",
    "Is there anything else you’d like to add about your growth, wins or the coaching relationship?"
];

async function seedTestimonialQuestions() {
    const count = await TestimonialQuestion.countDocuments();

    if (count > 0) {
        return;
    }

    await TestimonialQuestion.insertMany(
        DEFAULT_TESTIMONIAL_QUESTIONS.map((question, index) => ({
            question,
            order: index + 1,
            active: true
        }))
    );

    console.log(`Seeded ${DEFAULT_TESTIMONIAL_QUESTIONS.length} default testimonial questions.`);
}

// The address every notification went to before this was configurable.
// Same reasoning as above: seed once per key, then leave whatever the
// admin has since edited at /admin/notifications alone.
const DEFAULT_NOTIFICATION_RECIPIENT = site.contactEmail;

const DEFAULT_NOTIFICATIONS = [
    {
        key: "new-client-signup",
        label: "New Client Signup",
        description: "Sent when someone creates a client portal account."
    },
    {
        key: "new-referral",
        label: "New Referral",
        description: "Sent when a client refers a friend from their dashboard."
    },
    {
        key: "new-testimonial-submission",
        label: "New Testimonial Submission",
        description: "Sent when a client submits (or edits) a testimonial for review."
    },
    {
        key: "scheduling-failed",
        label: "Session Scheduling Failed",
        description: "Sent when a client's coaching sessions fail to auto-schedule and need attention."
    },
    {
        key: "orphaned-renewal",
        label: "Orphaned Subscription Renewal",
        description: "Sent when a subscription renewal charge comes in with no matching CoachingContainer to apply it to."
    },
    {
        key: "tool-access-requested",
        label: "Tool Access Requested",
        description: "Sent when a client requests access to a gated tool resource."
    },
    {
        key: "session-tool-requested",
        label: "Session Tool Requested",
        description: "Sent when a client requests a tool in the context of a specific session."
    }
];

// Upserts each default by key instead of an all-or-nothing insert against an
// empty collection — the previous version only ever seeded once, so adding
// a new entry here (like orphaned-renewal above) would silently never reach
// an already-seeded database without a manual migration. $setOnInsert only
// writes fields on a brand-new row, so it never touches a setting an admin
// has since edited at /admin/notifications.
async function seedNotificationSettings() {

    let seededCount = 0;

    for (const n of DEFAULT_NOTIFICATIONS) {

        const result = await NotificationSetting.updateOne(
            { key: n.key },
            {
                $setOnInsert: {
                    ...n,
                    enabled: true,
                    recipientEmail: DEFAULT_NOTIFICATION_RECIPIENT
                }
            },
            { upsert: true }
        );

        if (result.upsertedCount) {
            seededCount++;
        }
    }

    if (seededCount) {
        console.log(`Seeded ${seededCount} new default notification setting(s).`);
    }
}

// Non-interactive alternative to `npm run create-admin`, for platforms
// (Render, and any other host without shell access on its free/hobby tier)
// where there's no terminal to run the interactive wizard against. Reads
// ADMIN_EMAIL/ADMIN_PASSWORD (and optional ADMIN_FIRST_NAME/ADMIN_LAST_NAME)
// and, if there's no admin account yet, creates one from them — otherwise
// does nothing. Safe to leave these env vars set permanently: once an admin
// exists, every later boot is a no-op.
async function seedAdminFromEnv() {

    const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD || "";

    if (!email || !password) {
        // Not configured — expected for local dev (use `npm run create-admin`
        // instead) and for any boot after the first admin already exists.
        return;
    }

    const alreadyHasAdmin = await PortalUser.exists({ role: "admin" });

    if (alreadyHasAdmin) {
        return;
    }

    if (!email.includes("@")) {
        console.error(`ADMIN_EMAIL ("${email}") doesn't look like a valid email address — skipping admin creation.`);
        return;
    }

    if (!PASSWORD_REGEX.test(password)) {
        console.error("ADMIN_PASSWORD doesn't meet the requirements (min 8 chars, upper+lower+number+symbol) — skipping admin creation.");
        return;
    }

    const existingByEmail = await PortalUser.findOne({ email });

    if (existingByEmail) {
        // Deliberately not auto-promoting an existing non-admin account —
        // that's a bigger decision than a first-boot convenience should make
        // silently. createAdmin.js asks for confirmation in this exact case;
        // there's no one to ask here.
        console.error(`An account for ${email} already exists (role: ${existingByEmail.role}) — not automatically promoting it. Use a different ADMIN_EMAIL, or promote it via \`npm run create-admin\`.`);
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const firstName = process.env.ADMIN_FIRST_NAME || "Admin";

    await PortalUser.create({
        firstName,
        lastName: process.env.ADMIN_LAST_NAME || "",
        preferredName: firstName,
        email,
        passwordHash,
        role: "admin",
        emailVerified: true
    });

    console.log(`Created admin account for ${email} from ADMIN_EMAIL/ADMIN_PASSWORD.`);
}

module.exports = { seedTestimonialQuestions, seedNotificationSettings, seedAdminFromEnv };
