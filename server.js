require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const helmet = require("helmet");
const stripeController = require("./code/controllers/stripeController");
const { seedTestimonialQuestions, seedNotificationSettings, seedAdminFromEnv } = require("./code/scripts/seedDefaults");
const { checkAndSendSessionReminders } = require("./code/scripts/sessionReminders");
const site = require("./code/config/site");

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// How often to look for sessions that just entered the reminder window.
// Sending is de-duplicated on SessionResource.reminderSentAt, so a shorter
// interval only means reminders go out sooner after crossing the window,
// not more of them.
const SESSION_REMINDER_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// Behind a reverse proxy (Render, Heroku, nginx, etc.) this is required for
// req.secure / the "x-forwarded-proto" check that the session cookie's
// secure flag relies on below.
app.set("trust proxy", 1);

// mongoose.connect() returns a promise; a failed *initial* connection
// rejects it outside of any request, so leaving it unhandled crashes the
// whole process on startup (this is separate from connection.on("error"),
// which only covers errors after a connection has been established).
mongoose.connect(process.env.MONGODB_URI).catch((err) => {
    console.error("Initial MongoDB connection failed:", err.message);
    process.exit(1);
});
mongoose.connection.once("open", () => {
    console.log("MongoDB connected");

    seedTestimonialQuestions().catch((err) => {
        console.error("Failed to seed default testimonial questions:", err.message);
    });

    seedNotificationSettings().catch((err) => {
        console.error("Failed to seed default notification settings:", err.message);
    });

    seedAdminFromEnv().catch((err) => {
        console.error("Failed to create admin account from ADMIN_EMAIL/ADMIN_PASSWORD:", err.message);
    });

    checkAndSendSessionReminders().catch((err) => {
        console.error("Session reminder check failed:", err);
    });

    setInterval(() => {
        checkAndSendSessionReminders().catch((err) => {
            console.error("Session reminder check failed:", err);
        });
    }, SESSION_REMINDER_CHECK_INTERVAL_MS);
});
mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
});

// Last-resort safety net: log and keep running instead of letting Node dump
// a raw stack trace and die on whatever slipped past the fixes above.
process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
});

// Stripe needs the raw request body to verify the webhook signature, so this
// is registered before the JSON/urlencoded body parsers below.
app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeController.createStripeWebhook);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "code/views"));

// CSP is left disabled here rather than shipped half-configured: the app
// relies on inline <script> blocks throughout its views, which the default
// policy blocks. Enabling it correctly needs a nonce-based pass across those
// templates as a follow-up project. The rest of Helmet's defaults (frame
// options, content-type sniffing, referrer policy) are safe as-is.
//
// HSTS is scoped to production specifically — it tells the browser "force
// HTTPS for this exact host for the next year," which is correct once
// deployed behind real HTTPS, but actively breaks local dev: a browser that
// ever received this header from http://localhost:PORT caches the policy
// and silently rewrites every later request to https://localhost, which
// fails outright since there's no local TLS server. Sending it
// unconditionally is why "localhost won't let me sign in" can happen even
// though nothing about the login logic itself is broken.
app.use(helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: isProduction
}));

app.use(express.static(path.join(__dirname, "code/public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Makes site.businessName / site.founderName / etc. available in every EJS
// view without each controller having to pass them explicitly — see
// code/config/site.js for the values, driven by .env.
app.use((req, res, next) => {
    res.locals.site = site;
    next();
});

// if (!process.env.SESSION_SECRET) {
//     if (isProduction) {
//         throw new Error("SESSION_SECRET must be set in production.");
//     }
//     console.warn("SESSION_SECRET is not set. Using an insecure development default.");
// }

// express-session defaults to an in-process MemoryStore, which express
// itself warns is unfit for production: it leaks memory over the process's
// life, can't be shared across more than one instance, and — worse for this
// app's actual deploy flow — means every `pm2 restart` (i.e. every deploy)
// silently logs out every signed-in user, admin included. MongoStore backs
// sessions with a Mongo collection instead, using the same database this
// app already depends on rather than adding a new kind of infrastructure
// (e.g. Redis) just for this.
const sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions",
    ttl: 60 * 60 * 24 // seconds — kept equal to cookie.maxAge below
});

sessionStore.on("error", (err) => {
    console.error("Session store error:", err.message);
});

app.use(session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

const pageRoutes = require("./code/routes/pages");

app.use("/", pageRoutes);

app.use((req, res) => {
    if (req.accepts(["html", "json"]) === "json") {
        return res.status(404).json({ error: "Not found" });
    }
    res.status(404).render("error", {
        title: "Page Not Found",
        message: "The page you're looking for doesn't exist or may have moved."
    });
});

// Centralized error handler. Anything a route handler throws or passes to
// next(err) lands here instead of crashing the process or leaking a stack
// trace to the client. err.message is never sent to the client here — only
// logged — since it can contain internal details (query shapes, library
// wording) that aren't meant for an end user; routes that have a specific,
// safe, user-facing message to show set err.status and their own response
// before reaching this point.
app.use((err, req, res, next) => {
    if (err && err.code === "EBADCSRFTOKEN") {
        const csrfMessage = "Form expired or invalid. Please refresh the page and try again.";
        if (req.accepts(["html", "json"]) === "json") {
            return res.status(403).json({ error: csrfMessage });
        }
        return res.status(403).render("error", {
            title: "Form Expired",
            message: csrfMessage
        });
    }

    console.error(err);

    const status = err && err.status ? err.status : 500;

    // A route that has already started writing a response (e.g. it responded
    // early, then a best-effort step after that failed) can't be answered
    // again — trying to would throw its own "headers already sent" error.
    if (res.headersSent) {
        return next(err);
    }

    // Requests that expect a JSON API response (fetch/AJAX calls, or a
    // client that explicitly asked for JSON) get JSON back; plain page
    // navigations and form submissions get a real HTML error page instead
    // of a raw JSON blob.
    if (req.accepts(["html", "json"]) === "json") {
        return res.status(status).json({
            error: "Something went wrong."
        });
    }

    res.status(status).render("error", {
        title: "Something Went Wrong",
        message: "An unexpected error occurred. Please try again."
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
