const axios = require("axios");
const SessionResource = require("../models/sessionResource");
const { notify } = require("../controllers/notificationService");
const schedulingFailedEmail = require("../emails/schedulingFailedEmail");
const { BUSINESS_TIMEZONE } = require("../utils/timezone");

const cal = axios.create({
    baseURL: "https://api.cal.com",
    headers: {
        Authorization: `Bearer ${process.env.CAL_API_KEY}`,
        "Content-Type": "application/json",
        "cal-api-version": "2024-09-04"
    }
});

const booker = axios.create({
    baseURL: "https://api.cal.com",
    headers: {
        Authorization: `Bearer ${process.env.CAL_API_KEY}`,
        "Content-Type": "application/json",
        "cal-api-version": "2026-02-25"
    }
});

// Converts a wall-clock date/time in a specific IANA timezone to the
// correct UTC instant — accounts for DST, unlike a fixed offset. Only uses
// Intl.DateTimeFormat (already relied on elsewhere in this file), no
// timezone library dependency.
function zonedTimeToUtc(year, month, day, hour, minute, timezone) {

    // A UTC instant built directly from the wanted wall-clock components is
    // a reasonable first guess — it'll be off by exactly the zone's UTC
    // offset, which is exactly what gets corrected for below.
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(guess);

    // Intl can report hour "24" for midnight instead of "0".
    const shownHour = Number(parts.find(p => p.type === "hour").value) % 24;
    const shownMinute = Number(parts.find(p => p.type === "minute").value);

    const wantedMinutes = hour * 60 + minute;
    const shownMinutes = shownHour * 60 + shownMinute;

    return new Date(guess.getTime() + (wantedMinutes - shownMinutes) * 60000);
}

// Advances `date` by one calendar week, re-resolved to the same wall-clock
// hour/minute it started at — in `timezone`, correctly accounting for a DST
// transition that falls inside that week.
//
// The previous version of this (plain date.setDate(+7) on the Date object
// directly) preserves the UTC instant's fixed offset from week to week
// instead of the local wall-clock time — so a weekly booking series that
// spans a DST boundary silently drifts an hour off its stated local time
// from that point on. Cal.com then rejects the drifted instant as
// unavailable (nothing is actually offered at that slightly-wrong time),
// which generateContainerBookings currently absorbs as a silent
// "needs-scheduling" entry rather than a visible failure — so a client's
// weekly sessions can go quietly stuck for the rest of their container the
// moment a series crosses a DST change, with nothing logged anywhere.
function addWeekInTimezone(date, timezone) {

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(date);

    const get = (type) => Number(parts.find(p => p.type === type).value);

    // Rolling the calendar date forward 7 days has no DST ambiguity of its
    // own — a week is always exactly 7 calendar days — so a plain
    // UTC-anchored Date correctly handles month/year rollover here.
    const nextCalendarDay = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
    nextCalendarDay.setUTCDate(nextCalendarDay.getUTCDate() + 7);

    return zonedTimeToUtc(
        nextCalendarDay.getUTCFullYear(),
        nextCalendarDay.getUTCMonth() + 1,
        nextCalendarDay.getUTCDate(),
        get("hour") % 24,
        get("minute"),
        timezone
    );
}


async function createBooking({

    eventTypeId,

    start,

    attendee

}) {

    const response = await booker.post(
        "/v2/bookings",
        {
            eventTypeId,
            start,
            attendee
        }
    );

    return response.data.data;
}


async function cancelBooking(bookingUid, reason = "Client changed their coaching timeslot.") {

    const response = await booker.post(
        `/v2/bookings/${bookingUid}/cancel`,
        {
            cancellationReason: reason
        }
    );

    return response.data.data;
}


// Creates a blank SessionResource for any accepted booking that doesn't
// have one yet. Done as one bulk find + one bulk insert instead of a
// findOne/create per booking, which matters once this runs against
// hundreds of bookings at a time (see getAllBookings below).
async function ensureSessionResourcesExist(bookings) {

    const acceptedUids = bookings
        .filter(b => b.status === "accepted")
        .map(b => b.uid);

    if (!acceptedUids.length) {
        return;
    }

    const existing = await SessionResource.find({
        bookingUid: { $in: acceptedUids }
    }).select("bookingUid");

    const existingUids = new Set(existing.map(r => r.bookingUid));
    const missingUids = acceptedUids.filter(uid => !existingUids.has(uid));

    if (missingUids.length) {

        await SessionResource.insertMany(

            missingUids.map(bookingUid => ({
                bookingUid,
                answers: {}
            })),

            // One duplicate-key race (two requests creating the same
            // missing record at once) shouldn't fail the rest of the
            // batch — insertMany with ordered:false keeps inserting the
            // other documents instead of aborting on the first error.
            { ordered: false }

        ).catch(err => {
            console.error("ensureSessionResourcesExist: insertMany failed", err);
        });
    }
}

async function getBookingsByEmail(email) {

    // Paginated the same way as getAllBookings — the API caps each page at
    // 100 regardless of the attendeeEmail filter, so a client with more
    // bookings than that would otherwise be silently truncated.
    const bookings = [];
    let skip = 0;
    const limit = 100;
    let hasNextPage = true;

    while (hasNextPage) {

        const { data } = await booker.get("/v2/bookings", {
            params: { attendeeEmail: email, limit, skip }
        });

        bookings.push(...(data.data || []));

        hasNextPage = !!data.pagination?.hasNextPage;
        skip += limit;

    }

    await ensureSessionResourcesExist(bookings);

    return bookings;
}

// Fetches every booking on the account in one paginated sweep, instead of
// one Cal.com API call per client (attendeeEmail only filters to a single
// email per call). Used by admin pages that need sessions across ALL
// clients at once — see groupBookingsByEmail below to split the result
// back out per client.
async function getAllBookings() {

    const bookings = [];
    let skip = 0;
    const limit = 100;
    let hasNextPage = true;

    while (hasNextPage) {

        const { data } = await booker.get("/v2/bookings", {
            params: { limit, skip }
        });

        bookings.push(...(data.data || []));

        hasNextPage = !!data.pagination?.hasNextPage;
        skip += limit;

    }

    await ensureSessionResourcesExist(bookings);

    return bookings;
}

// Splits a flat list of bookings (e.g. from getAllBookings) into a
// Map<lowercased attendee email, bookings[]> so per-client lookups against
// a bulk fetch are a simple, free map.get() instead of another API call.
function groupBookingsByEmail(bookings) {

    const map = new Map();

    for (const booking of bookings) {

        const email = booking.attendees?.[0]?.email?.toLowerCase();

        if (!email) {
            continue;
        }

        if (!map.has(email)) {
            map.set(email, []);
        }

        map.get(email).push(booking);
    }

    return map;
}

// A client's full Cal.com booking history for a given eventTypeId isn't
// necessarily just this container's sessions — the same event type can be
// reused for a free discovery call, or carried over from a previous
// container, both of which were BOOKED before this container even existed.
// Filtering on eventTypeId alone (as several call sites used to) could
// overcount — e.g. a client with one prior discovery call and a
// single-session container showing "2 of 1 sessions completed" instead of
// "0 of 1".
//
// Comparing calendar times (booking.start vs container.startedAt) seems
// like the obvious anchor, but it's wrong: a client can reschedule directly
// through Cal.com's own UI (their confirmation email's "Reschedule" link)
// without ever touching this app, which moves booking.start without
// touching container.startedAt at all — that legitimately rescheduled
// session then looks like it's "before" the container and gets wrongly
// excluded. booking.createdAt (when the Cal.com booking record itself was
// made) isn't affected by a later reschedule, so comparing that against
// container.createdAt (when we created the container row) reliably answers
// "was this booking made in the context of this container" regardless of
// what calendar slot it's since been moved to.
function isCancelledBooking(booking) {
    return booking.status === "cancelled";
}

function belongsToContainer(booking, container) {

    if (booking.eventTypeId !== container.eventTypeId) {
        return false;
    }

    if (isCancelledBooking(booking)) {
        return false;
    }

    // Containers from before this was reliably set fall back to the old
    // (eventTypeId-only) behavior rather than excluding everything.
    if (container.createdAt && new Date(booking.createdAt) < new Date(container.createdAt)) {
        return false;
    }

    return true;
}

async function getAvailableSlots({
    eventTypeId,
    start,
    end,
    timezone = "America/Los_Angeles"
}) {
    try {
        const response = await cal.get("/v2/slots", {
            params: {
                eventTypeId: Number(eventTypeId),
                start,
                end,
                timeZone: timezone
            }
        });

        const slotsByDate = response.data?.data || {};
        const allSlots = Object.values(slotsByDate).flat();

        const dayFormatter = new Intl.DateTimeFormat("en-CA", {
            weekday: "long",
            timeZone: timezone
        });

        const timeFormatter = new Intl.DateTimeFormat("en-CA", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: timezone
        });

        const slotsByDayAndTime = allSlots.reduce((acc, slot) => {
            const date = new Date(slot.start);

            const day = dayFormatter.format(date);
            const time = timeFormatter.format(date);

            if (!acc[day]) {
                acc[day] = {};
            }

            if (!acc[day][time]) {
                acc[day][time] = [];
            }

            acc[day][time].push({
                start: slot.start
            });

            return acc;
        }, {});

        return slotsByDayAndTime;

    } catch (error) {
        console.error(
            "Cal API Error:",
            error.response?.data || error.message
        );

        throw error;
    }
}

async function getRecurringAvailableSlots({
    eventTypeId,
    start,
    end,
    sessionCount,
    timezone = "America/Los_Angeles"
}) {

    try {

        const slotsByDayAndTime =
            await getAvailableSlots({

                eventTypeId,

                start,

                end,

                timezone

            });

        const validSlots = [];

        for (const day of Object.keys(slotsByDayAndTime)) {

            const times =
                slotsByDayAndTime[day];

            for (const time of Object.keys(times)) {

                const occurrences =
                    times[time];

                if (
                    occurrences.length >= sessionCount
                ) {

                    validSlots.push({

                        day,

                        time,

                        slots:
                            occurrences.slice(
                                0,
                                sessionCount
                            )
                    });
                }
            }
        }

        return validSlots;

    } catch (error) {

        console.error(
            "Recurring slot lookup failed:",
            error.response?.data || error.message
        );

        throw error;
    }
}

function isAvailabilityError(error) {

    const message =
        error?.response?.data?.error?.message ||
        error?.message;

    return (
        typeof message === "string" &&
        (
            message.includes("already has booking") ||
            message.includes("not available")
        )
    );
}


async function generateContainerBookings({
    container,
    user,

    // Sessions before this index are assumed already booked (e.g. a retry
    // after a partial failure, or a renewal) and are skipped, so this call
    // can't create duplicate bookings on Cal.com for sessions that already
    // succeeded.
    startIndex = 0,

    // How many weeks past container.startedAt the first NEW booking in
    // this call should land. Defaults to startIndex, which is correct for
    // a retry/renewal continuing the same weekly cadence from the same
    // startedAt anchor. A reschedule passes 0 instead, alongside a new
    // startedAt — the new cadence starts immediately at that new anchor,
    // not startIndex weeks after it.
    dateOffsetWeeks = null
}) {

    const offset = dateOffsetWeeks !== null ? dateOffsetWeeks : startIndex;

    let currentDate = new Date(container.startedAt);

    for (let w = 0; w < offset; w++) {
        currentDate = addWeekInTimezone(currentDate, BUSINESS_TIMEZONE);
    }


    try {

        container.status = "scheduling";

        let bookings = [];

        if (!container.scheduling.completed) {
            container.scheduling.completed = 0;
        }

        await container.save();

        // sessionsGranted is the cumulative ceiling (bumped on each
        // subscription renewal); falls back to sessionCount for
        // containers from before that field existed, or one-time
        // offerings where the two are the same anyway.
        const ceiling = container.sessionsGranted || container.sessionCount;

        for (
            let i = startIndex;
            i < ceiling;
            i++
        ) {

            const sessionNumber = i + 1;

            const existing =
                bookings.find(
                    booking =>
                        booking.sessionNumber === sessionNumber
                );

            if (existing) {

                currentDate = addWeekInTimezone(currentDate, BUSINESS_TIMEZONE);

                continue;
            }

            try {

                const booking =
                    await createBooking({

                        eventTypeId:
                            container.eventTypeId,

                        start:
                            currentDate.toISOString(),

                        attendee: {

                            name:
                                `${user.preferredName} ${user.lastName}`,

                            email:
                                user.email,

                            timeZone:
                                BUSINESS_TIMEZONE

                        }

                    });

                if (!booking || !booking.uid) {

                    throw new Error(
                        "Cal booking failed"
                    );
                }

                bookings.push({

                    sessionNumber,

                    bookingUid:
                        booking.uid,

                    status:
                        "scheduled"
                });

                container.scheduling.completed++;


            } catch (error) {

                if (isAvailabilityError(error)) {

                    bookings.push({

                        sessionNumber,

                        bookingUid:
                            null,

                        status:
                            "needs-scheduling"
                    });

                } else {

                    console.error(
                        "Cal booking generation failed",
                        error
                    );

                    throw error;
                }

            }

            await container.save();

            currentDate =
                addWeekInTimezone(currentDate, BUSINESS_TIMEZONE);
        }

        const unscheduled =
            bookings.filter(
                booking =>
                    booking.status === "needs-scheduling"
            );

        const needsScheduling = unscheduled.length > 0;

        // A per-session availability conflict (this client's recurring
        // slot wasn't actually open on one or more of these specific
        // dates — a DST transition shifting the wall-clock instant was one
        // real cause of this) used to be absorbed silently here: the loop
        // kept going, but the container was set right back to "scheduling"
        // — the same status it already had — with nothing recorded and no
        // one notified. That left it permanently stuck: the client only
        // ever sees "scheduling" (a plain in-progress message with no
        // retry option — that's reserved for scheduling-failed), and there
        // was no admin visibility into it at all. Routing it through the
        // same scheduling-failed path as an outright API failure fixes
        // both — it's already the correct, already-built UI/notification
        // for "some sessions couldn't be scheduled," it just never
        // actually reached it.
        if (needsScheduling) {

            const message = `${unscheduled.length} of ${ceiling - startIndex} session(s) could not be scheduled due to a booking conflict (session number${unscheduled.length === 1 ? "" : "s"}: ${unscheduled.map(b => b.sessionNumber).join(", ")}).`;

            container.status = "scheduling-failed";
            container.scheduling.failedAt = new Date();
            container.scheduling.error = message;

            await container.save();

            await notify("scheduling-failed", {
                subject: `Scheduling failed for ${user.preferredName || user.firstName} ${user.lastName}`,
                html: schedulingFailedEmail(
                    `${user.preferredName || user.firstName} ${user.lastName}`,
                    user.email,
                    message
                )
            });

            return {
                success: false,
                created: container.scheduling.completed,
                needsScheduling,
                error: message
            };
        }

        container.status = "active";

        await container.save();

        return {

            success: true,

            created:
                container.scheduling.completed,

            needsScheduling
        };

    } catch (error) {

        console.error(
            "Cal booking generation failed",
            error
        );

        container.status =
            "scheduling-failed";

        container.scheduling.failedAt =
            new Date();

        container.scheduling.error =
            error.message;

        await container.save();

        await notify("scheduling-failed", {
            subject: `Scheduling failed for ${user.preferredName || user.firstName} ${user.lastName}`,
            html: schedulingFailedEmail(
                `${user.preferredName || user.firstName} ${user.lastName}`,
                user.email,
                error.message
            )
        });

        return {

            success: false,

            created:
                container.scheduling.completed,

            error:
                error.message
        };
    }
}

module.exports = {

    getRecurringAvailableSlots,

    generateContainerBookings,

    getBookingsByEmail,

    getAllBookings,

    groupBookingsByEmail,

    cancelBooking,

    belongsToContainer,

    isCancelledBooking

};