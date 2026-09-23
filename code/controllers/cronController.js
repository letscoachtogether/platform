const { checkAndSendSessionReminders } = require("../scripts/sessionReminders");
const { wrapControllerExports } = require("../middleware/asyncHandler");

// Lets an external scheduler (GitHub Actions, Render Cron Jobs, cron-job.org,
// etc.) trigger the same reminder check server.js already runs on its own
// setInterval — safe to call as often as the caller likes, since
// checkAndSendSessionReminders() de-dupes on SessionResource.reminderSentAt.
// On a host that spins the app down when idle (Render's free tier), this
// endpoint doubles as a keep-alive ping: the request itself resets the
// inactivity timer, so reminders stop depending on the process having
// happened to stay up.
exports.runSessionReminders = async (req, res) => {

    await checkAndSendSessionReminders();

    res.json({ ok: true });
};

wrapControllerExports(exports);
