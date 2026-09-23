const PortalUser = require("../models/portaluser");
const SessionResource = require("../models/sessionResource");
const CoachingContainer = require("../models/coachingContainer");
const calService = require("../controllers/cal");
const { notifyClient } = require("../controllers/clientNotificationService");
const sessionReminderEmail = require("../emails/sessionReminderEmail");
const { BUSINESS_TIMEZONE } = require("../utils/timezone");

// How far ahead a session has to be to enter the reminder window. Combined
// with how often this runs (see server.js), a session first crosses into
// this window somewhere between REMINDER_WINDOW_HOURS and
// REMINDER_WINDOW_HOURS minus the check interval before it starts — in
// practice, "about a day before."
const REMINDER_WINDOW_HOURS = 24;

// Finds every upcoming session across all clients that's due a reminder —
// starting within the window, not cancelled, and not already sent (tracked
// on SessionResource.reminderSentAt so this is safe to call as often as the
// caller likes without double-sending). One bulk Cal.com fetch covers every
// client, same as adminController's clients()/sessions() pages.
async function checkAndSendSessionReminders() {

    const clients = await PortalUser.find({ role: "client" });

    if (!clients.length) {
        return;
    }

    let allBookings;

    try {
        allBookings = await calService.getAllBookings();
    } catch (err) {
        console.error("Session reminder check: failed to fetch bookings from Cal.com:", err);
        return;
    }

    const bookingsByEmail = calService.groupBookingsByEmail(allBookings);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

    let sentCount = 0;

    for (const client of clients) {

        if (client.notificationPreferences?.sessionReminders === false) {
            continue;
        }

        const bookings = bookingsByEmail.get(client.email.toLowerCase()) || [];

        // "accepted" specifically (not just "not cancelled") — that's also
        // the only status getAllBookings() guarantees a SessionResource
        // exists for (see ensureSessionResourcesExist in cal.js), which the
        // claim step below depends on.
        const dueBookings = bookings.filter(b =>
            b.status === "accepted" &&
            new Date(b.start) >= now &&
            new Date(b.start) <= windowEnd
        );

        if (!dueBookings.length) {
            continue;
        }

        // Fetched once per client (not per booking) and matched by
        // eventTypeId below — a client can have more than one container
        // over time, each potentially booked in a different timezone.
        const containers = await CoachingContainer.find({ user: client._id });

        for (const booking of dueBookings) {

            // findOneAndUpdate with a filter on reminderSentAt:null (rather
            // than a plain findOne-then-set) means two overlapping runs of
            // this check can't both send a reminder for the same booking —
            // only one of them can win the update.
            const claimed = await SessionResource.findOneAndUpdate(
                { bookingUid: booking.uid, reminderSentAt: null },
                { $set: { reminderSentAt: new Date() } }
            );

            if (!claimed) {
                continue;
            }

            const container = containers.find(c => calService.belongsToContainer(booking, c));
            const timezone = container?.timezone || BUSINESS_TIMEZONE;

            await notifyClient(client, "sessionReminders", {
                subject: "Reminder: Upcoming Coaching Session",
                html: sessionReminderEmail(client.preferredName || client.firstName, booking.start, timezone)
            });

            sentCount++;
        }
    }

    if (sentCount) {
        console.log(`Session reminders sent: ${sentCount}`);
    }
}

module.exports = { checkAndSendSessionReminders, REMINDER_WINDOW_HOURS };
