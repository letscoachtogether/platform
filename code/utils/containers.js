const CoachingContainer = require("../models/coachingContainer");

// Statuses a container can be rescheduled from — used by both the GET (show
// available slots) and POST (actually book) halves of the reschedule flow,
// which need to agree on exactly the same set.
const RESCHEDULABLE_STATUSES = ["active", "paused", "scheduling-failed"];

// The container a given lookup should treat as "the current one" for a
// user — most recently created match wins. A client can hold more than one
// container at once (e.g. an old engagement plus a fresh "Add More
// Sessions" purchase), so every call site needs the same tie-break rather
// than an arbitrary/unsorted match.
function findCurrentContainer(userId, { statuses } = {}) {

    const query = { user: userId };

    if (statuses) {
        query.status = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }

    return CoachingContainer.findOne(query).sort({ createdAt: -1 });
}

module.exports = { findCurrentContainer, RESCHEDULABLE_STATUSES };
