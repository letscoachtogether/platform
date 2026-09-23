// First-run setup wizard: walks through every .env variable and, once a
// database is reachable, creates the first admin account. Run with:
//
//   npm run setup
//
// Safe to re-run — an existing .env is read first and used to prefill
// defaults, so pressing Enter through every prompt keeps your current
// values. It's a CLI script rather than a web wizard on purpose: on a fresh
// clone there's no PORT/MONGODB_URI yet, so there's nothing for a browser
// wizard to talk to without standing up a separate bootstrap server first.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");

const ROOT = path.join(__dirname, "..", "..");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");

// Minimal .env parser — just enough to read back existing/example values as
// prompt defaults. Not meant to handle every edge case dotenv itself does
// (quoted values, multiline, etc.); this file's values have never needed
// that.
function parseEnvFile(filePath) {

    if (!fs.existsSync(filePath)) return {};

    const values = {};

    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {

        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const eq = trimmed.indexOf("=");

        if (eq === -1) continue;

        values[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }

    return values;
}

// Format checks for fields where a wrong value would fail loudly later
// (a malformed MONGODB_URI, an unreachable-looking BASE_URL) rather than
// something worth guessing at (CAL_API_KEY has no publicly documented shape,
// so it isn't checked here). Each takes the trimmed value and returns
// true/false; only run when the field isn't blank, so optional fields can
// still be skipped.
const FORMAT_CHECKS = {
    MONGODB_URI: {
        test: (v) => /^mongodb(\+srv)?:\/\/\S+$/.test(v),
        hint: "a MongoDB connection string (starts with mongodb:// or mongodb+srv://)"
    },
    CONTACT_EMAIL: {
        test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        hint: "an email address"
    },
    BOOKING_URL: {
        test: (v) => /^https?:\/\/\S+$/.test(v),
        hint: "a URL (starts with http:// or https://)"
    },
    BASE_URL: {
        test: (v) => /^https?:\/\/\S+$/.test(v) && !v.endsWith("/"),
        hint: "a URL with no trailing slash (starts with http:// or https://)"
    },
    RESEND_API_KEY: {
        test: (v) => /^re_/.test(v),
        hint: "a Resend API key (starts with re_)"
    },
    STRIPE_SECRET_KEY: {
        test: (v) => /^(sk|rk)_(test|live)_/.test(v),
        hint: "a Stripe secret key (starts with sk_test_, sk_live_, etc.)"
    },
    STRIPE_WEBHOOK_SECRET: {
        test: (v) => /^whsec_/.test(v),
        hint: "a Stripe webhook signing secret (starts with whsec_)"
    },
    PORT: {
        test: (v) => /^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 65535,
        hint: "a port number (1-65535)"
    }
};

async function ask(rl, label, { default: def = "", required = false, format = null } = {}) {

    const check = format ? FORMAT_CHECKS[format] : null;

    while (true) {

        const suffix = def ? ` (${def})` : "";
        const answer = (await rl.question(`${label}${suffix}: `)).trim();
        const value = answer || def;

        if (!value && required) {
            console.log("This one's required.");
            continue;
        }

        if (value && check && !check.test(value)) {
            console.log(`That doesn't look like ${check.hint} — try again.`);
            continue;
        }

        return value;
    }
}

async function main() {

    console.log("=== Coaching Platform Template — first-run setup ===\n");

    const existing = parseEnvFile(ENV_PATH);
    const exampleDefaults = parseEnvFile(ENV_EXAMPLE_PATH);

    if (fs.existsSync(ENV_PATH)) {
        console.log(".env already exists — Enter accepts the current value shown in parentheses.\n");
    }

    const rl = readline.createInterface({ input: stdin, output: stdout });

    try {

        console.log("--- Database & session ---");

        const MONGODB_URI = await ask(rl, "MongoDB connection string", {
            default: existing.MONGODB_URI || "",
            format: "MONGODB_URI"
        });

        let SESSION_SECRET = existing.SESSION_SECRET || "";

        if (SESSION_SECRET) {
            console.log("Keeping existing SESSION_SECRET.");
        } else {
            SESSION_SECRET = crypto.randomBytes(64).toString("hex");
            console.log("Generated a random SESSION_SECRET.");
        }

        // Only actually used if you point an external scheduler at
        // /api/cron/session-reminders — generated unconditionally anyway so
        // it's there and ready the moment you want it, same as SESSION_SECRET.
        let CRON_SECRET = existing.CRON_SECRET || "";

        if (CRON_SECRET) {
            console.log("Keeping existing CRON_SECRET.");
        } else {
            CRON_SECRET = crypto.randomBytes(32).toString("hex");
            console.log("Generated a random CRON_SECRET.");
        }

        console.log("\n--- Site identity (shown across the public site, emails, and metadata) ---");

        const BUSINESS_NAME = await ask(rl, "Business name", {
            default: existing.BUSINESS_NAME || exampleDefaults.BUSINESS_NAME
        });
        const FOUNDER_NAME = await ask(rl, "Founder / your name", {
            default: existing.FOUNDER_NAME || exampleDefaults.FOUNDER_NAME
        });
        const SITE_TAGLINE = await ask(rl, "Site tagline", {
            default: existing.SITE_TAGLINE || exampleDefaults.SITE_TAGLINE
        });
        const CONTACT_EMAIL = await ask(rl, "Contact email", {
            default: existing.CONTACT_EMAIL || exampleDefaults.CONTACT_EMAIL,
            format: "CONTACT_EMAIL"
        });
        const BOOKING_URL = await ask(rl, "Booking URL (your Cal.com link)", {
            default: existing.BOOKING_URL || exampleDefaults.BOOKING_URL,
            format: "BOOKING_URL"
        });
        const BASE_URL = await ask(rl, "Base URL this app is deployed at (no trailing slash)", {
            default: existing.BASE_URL || exampleDefaults.BASE_URL,
            format: "BASE_URL"
        });

        console.log("\n--- Email (Resend — resend.com) ---");

        const RESEND_API_KEY = await ask(rl, "Resend API key", {
            default: existing.RESEND_API_KEY || "",
            format: "RESEND_API_KEY"
        });

        console.log("\n--- Payments (Stripe) ---");

        const STRIPE_SECRET_KEY = await ask(rl, "Stripe secret key", {
            default: existing.STRIPE_SECRET_KEY || "",
            format: "STRIPE_SECRET_KEY"
        });
        const STRIPE_WEBHOOK_SECRET = await ask(rl, "Stripe webhook signing secret", {
            default: existing.STRIPE_WEBHOOK_SECRET || "",
            format: "STRIPE_WEBHOOK_SECRET"
        });

        console.log("\n--- Scheduling (Cal.com) ---");

        const CAL_API_KEY = await ask(rl, "Cal.com API key", {
            default: existing.CAL_API_KEY || ""
        });

        console.log("\n--- Server ---");

        const NODE_ENV = await ask(rl, "NODE_ENV", {
            default: existing.NODE_ENV || exampleDefaults.NODE_ENV || "development"
        });
        const PORT = await ask(rl, "Port", {
            default: existing.PORT || exampleDefaults.PORT || "3000",
            format: "PORT"
        });

        const envContent = `# --- Database & session ---
MONGODB_URI=${MONGODB_URI}
SESSION_SECRET=${SESSION_SECRET}

# --- Site identity — shown across the public site, emails, and metadata ---
BUSINESS_NAME=${BUSINESS_NAME}
FOUNDER_NAME=${FOUNDER_NAME}
SITE_TAGLINE=${SITE_TAGLINE}
CONTACT_EMAIL=${CONTACT_EMAIL}
# Where the "Book a session" links on the public site point.
BOOKING_URL=${BOOKING_URL}
# The public URL this app is deployed at — no trailing slash.
BASE_URL=${BASE_URL}

# --- Email (Resend — resend.com) ---
RESEND_API_KEY=${RESEND_API_KEY}

# --- Payments (Stripe) ---
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}

# --- Scheduling (Cal.com) ---
CAL_API_KEY=${CAL_API_KEY}

# --- Cron / scheduled tasks (optional) ---
# Authenticates GET /api/cron/session-reminders. See README's cron-job
# section for how to point a scheduler at it.
CRON_SECRET=${CRON_SECRET}

NODE_ENV=${NODE_ENV}
PORT=${PORT}
`;

        fs.writeFileSync(ENV_PATH, envContent);
        console.log(`\n.env written to ${ENV_PATH}`);

        if (!MONGODB_URI) {
            console.log("\nNo MongoDB URI provided — skipping admin account creation.");
            console.log("Run `npm run create-admin` once your database is configured.");
            return;
        }

        console.log("\n--- Create your admin account ---");

        const mongoose = require("mongoose");
        const { promptCreateAdmin } = require("./createAdmin");

        try {
            await mongoose.connect(MONGODB_URI);
        } catch (err) {
            console.error(`\nCouldn't connect to MongoDB: ${err.message}`);
            console.log("Your .env was still saved — fix MONGODB_URI and run `npm run create-admin` once it connects.");
            return;
        }

        try {
            await promptCreateAdmin(rl);
            console.log("\nSetup complete. Run `npm run dev` (or `npm start`) and visit your BASE_URL.");
        } catch (err) {
            console.error(`\nCouldn't create the admin account: ${err.message}`);
            console.log("Run `npm run create-admin` to try again.");
        } finally {
            await mongoose.disconnect();
        }

    } finally {
        rl.close();
    }
}

main().catch((err) => {
    console.error("\nSetup failed:", err.message);
    process.exit(1);
});
