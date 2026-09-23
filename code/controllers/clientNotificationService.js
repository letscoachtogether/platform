const sendEmail = require("../utils/email");

// The client-facing counterpart to notificationService.js's notify(): that
// one emails the admin about client activity (one global recipient per
// event type, configured at /admin/notifications). This one emails a
// specific client about activity on their own account, gated by their own
// per-user preference (PortalUser.notificationPreferences) rather than a
// shared setting. Same contract as notify() on purpose — never throws, so a
// failed or opted-out client email never breaks whatever admin action
// triggered it (saving notes, publishing a resource, reviewing a
// testimonial).
async function notifyClient(user, preferenceKey, { subject, html }) {

    if (!user || !user.email) {
        return;
    }

    if (user.notificationPreferences && user.notificationPreferences[preferenceKey] === false) {
        return;
    }

    try {

        await sendEmail({
            to: user.email,
            subject,
            html
        });

    } catch (err) {

        console.error(`Failed to send "${preferenceKey}" notification to ${user.email}:`, err);
    }
}

module.exports = { notifyClient };
