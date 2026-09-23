// Shared sanitization for CoachingContainer.roadmap — both dashboardController
// (a client editing their own container) and adminController (an admin
// editing any container) write through this, so the two editors can't drift
// into different validation rules for the same field.
function buildRoadmapUpdate(body, actor) {

    const goals = (body.goals || "").trim();

    // Submitted as sessions[0][title], sessions[1][title], etc. — Express's
    // body parser turns that into an array already when the indices are
    // sequential from 0, but falls back to an object keyed by index if
    // they're not (e.g. a row got removed client-side before submit), same
    // situation adminController.saveNotes already handles for its sections.
    let sessions = body.sessions || [];

    if (!Array.isArray(sessions)) {
        sessions = Object.values(sessions);
    }

    return {
        goals,
        sessions: sessions.map(s => ({
            title: (s?.title || "").trim(),
            agenda: (s?.agenda || "").trim(),
            takeaway: (s?.takeaway || "").trim(),
            followUp: (s?.followUp || "").trim()
        })),
        updatedAt: new Date(),
        updatedBy: actor
    };
}

// Pre-sizes roadmap.sessions to match the container's session count the
// first time anyone opens the roadmap, so the edit form always starts with
// the right number of rows instead of the client/admin having to add them
// by hand. Only runs once — a container that already has any sessions
// recorded (including ones since edited down to fewer than sessionCount)
// is left alone.
async function ensureRoadmapSessions(container) {

    if (container.roadmap?.sessions?.length) {
        return;
    }

    const sessionCount = container.sessionsGranted || container.sessionCount;

    container.roadmap = container.roadmap || {};

    container.roadmap.sessions = Array.from(
        { length: sessionCount },
        (_, i) => ({ title: `Session ${i + 1}`, agenda: "", takeaway: "", followUp: "" })
    );

    await container.save();
}

module.exports = { buildRoadmapUpdate, ensureRoadmapSessions };
