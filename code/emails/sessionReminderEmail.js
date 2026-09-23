const { BUSINESS_TIMEZONE } = require("../utils/timezone");
const { layout, paragraph, button } = require("./emailLayout");

// timezone is the client's own (see CoachingContainer.timezone), falling
// back to the business's if a container never captured one (booked before
// this was tracked) — there's no browser here to detect it the way the
// dashboard itself does, so this can never be "the viewer's local time"
// the way on-site displays are; it's the best available stand-in.
module.exports = function sessionReminderEmail(name, startISO, timezone = BUSINESS_TIMEZONE) {

    const start = new Date(startISO);

    const formatted = start.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: timezone
    });

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph("This is a reminder that you have a coaching session coming up:")}
        ${paragraph(`<strong>${formatted}</strong>`)}
        ${button(`${process.env.BASE_URL}/client-dashboard/sessions`, "View Your Sessions")}
    `;

    return layout({
        title: "Upcoming Coaching Session Reminder",
        body,
        unsubscribeNote: true
    });
};
