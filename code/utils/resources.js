// The one place PortalUser.resources[] gets matched to a specific Resource
// by id — reused everywhere a resource's per-user state (unlocked,
// requested, completed, answers) needs to be looked up, so the matching
// logic can't drift between call sites.
//
// r.resourceId can be either a raw ObjectId or a populated Resource
// document, depending on whether the caller did
// .populate("resources.resourceId") — a populated document's .toString()
// returns its full serialized contents, not its id, so that case has to be
// unwrapped via its own ._id first or every lookup silently fails to match.
function findUserResourceEntry(resources, resourceId) {
    const targetId = resourceId.toString();
    return (resources || []).find(r => {
        if (!r.resourceId) return false;
        const id = r.resourceId._id || r.resourceId;
        return id.toString() === targetId;
    });
}

module.exports = { findUserResourceEntry };
