const NotificationSetting = require("../models/notificationSetting");
const sendEmail = require("../utils/email");

// Sends an admin notification email if — and only if — this event type is
// enabled in /admin/notifications, to whatever address is configured there.
// Never throws: a notification failing (or being disabled, or not yet
// seeded) should never break the actual signup/lead/referral/etc. flow it's
// attached to, so every failure just logs and returns.
async function notify(key, { subject, html }) {

    try {

        const setting = await NotificationSetting.findOne({ key });

        if (!setting) {
            console.error(`No notification setting found for "${key}" — has seedDefaults run?`);
            return;
        }

        if (!setting.enabled) {
            return;
        }

        await sendEmail({
            to: setting.recipientEmail,
            subject,
            html
        });

    } catch (err) {

        console.error(`Failed to send "${key}" notification:`, err);

    }

}

module.exports = { notify };
