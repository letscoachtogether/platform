// Protects scheduled/machine-triggered endpoints (see the /api/cron/* routes
// in routes/pages.js) with a shared secret instead of a session/login —
// there's no browser user on the other end, just a scheduler (a GitHub
// Actions workflow, Render's own Cron Jobs, cron-job.org, etc.) making a
// server-to-server call on a timer.
function requireCronSecret(req, res, next) {

    if (!process.env.CRON_SECRET) {
        // Fails closed: an unset secret must never be treated as "open to
        // anyone" — refuse every request until one is configured.
        console.error("CRON_SECRET is not set — refusing cron request.");
        return res.status(503).send("Not configured");
    }

    const header = req.get("Authorization") || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!provided || provided !== process.env.CRON_SECRET) {
        return res.sendStatus(401);
    }

    next();
}

module.exports = { requireCronSecret };
