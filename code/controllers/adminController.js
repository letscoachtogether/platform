const crypto = require("crypto");
const PortalUser = require("../models/portaluser");
const SessionResource = require("../models/sessionResource");
const CoachingContainer = require("../models/coachingContainer");
const cal = require("./cal");
const { getSubscriptionBillingInfo, requestCancellation } = require("../utils/subscriptions");
const Resource = require("../models/resources");
const Offering = require("../models/offerings");
const Agreement = require("../models/coachingAgreement");
// const Resource = require("../models/resources");
const Testimonial = require("../models/testimonial");
const TestimonialQuestion = require("../models/testimonialQuestion");
const TestimonialSubmission = require("../models/testimonialSubmission");
const Referral = require("../models/referral");
const NotificationSetting = require("../models/notificationSetting");
const { notifyClient } = require("./clientNotificationService");
const sendEmail = require("../utils/email");
const sessionNotePostedEmail = require("../emails/sessionNotePostedEmail");
const newToolAddedEmail = require("../emails/newToolAddedEmail");
const testimonialReviewedEmail = require("../emails/testimonialReviewedEmail");
const welcomeSetPasswordEmail = require("../emails/welcomeSetPasswordEmail");
const { wrapControllerExports } = require("../middleware/asyncHandler");
const { findCurrentContainer } = require("../utils/containers");
const { findUserResourceEntry } = require("../utils/resources");
const { hashResetToken } = require("../utils/tokens");
const site = require("../config/site");
const { buildRoadmapUpdate, ensureRoadmapSessions } = require("../utils/roadmap");

// Read directly off the schema rather than hand-copied, so this can never
// drift from CoachingContainer's actual status enum.
const CONTAINER_STATUSES = CoachingContainer.schema.path("status").enumValues;

// Mongoose validation errors (a missing required field, a bad enum value)
// and duplicate-key errors (a unique constraint, e.g. a repeated slug)
// describe exactly what's wrong with the submitted form and are safe and
// useful to show the admin verbatim. Anything else (a dropped DB
// connection, a driver-internal message) is logged in full below but
// replaced with a generic message before it reaches the response.
function isSafeToShowAdmin(err) {
    return err.name === "ValidationError" || err.code === 11000;
}

function sendAdminError(res, err, status = 500) {
    console.error(err);
    const message = isSafeToShowAdmin(err)
        ? err.message
        : "Something went wrong. Please try again.";
    res.status(status).send(message);
}

exports.dashboard = async (req, res) => {

    const clients = await PortalUser.countDocuments({
        role: "client"
    });

    const pendingTestimonialSubmissions = await TestimonialSubmission.countDocuments({
        status: "pending"
    });

    res.render("admin/dashboard", {
        clients,
        pendingTestimonialSubmissions
    });

};

exports.clients = async (req, res) => {

    const clients = await PortalUser.find({
        role: "client"
    });

    // One bulk Cal.com fetch covering every client, instead of one API call
    // per client (getBookingsByEmail only filters to a single attendee).
    // If Cal.com is unreachable, every client just falls back to no next
    // session rather than failing the whole page.
    let bookingsByEmail = new Map();

    try {

        const allBookings = await cal.getAllBookings();
        bookingsByEmail = cal.groupBookingsByEmail(allBookings);

    } catch (err) {

        console.log("Could not load sessions for clients list:", err.message);
    }

    // One bulk CoachingContainer query covering every client, instead of one
    // findOne per client — same idea as the Cal.com fetch above.
    const containers = await CoachingContainer.find({
        user: { $in: clients.map(c => c._id) },

        status: {
            $in: [
                "awaiting-slot",
                "active"
            ]
        }
    }).sort({ createdAt: -1 });

    const containerByUserId = new Map();

    for (const container of containers) {

        const userId = container.user.toString();

        // A client shouldn't normally have more than one container in
        // these statuses at once, but if they somehow do, keep the most
        // recent (containers are sorted newest-first above) rather than
        // whichever Mongo happens to return last.
        if (!containerByUserId.has(userId)) {
            containerByUserId.set(userId, container);
        }
    }

    const clientRows = [];

    for (const client of clients) {

        const container = containerByUserId.get(client._id.toString()) || null;

        const bookings = bookingsByEmail.get(client.email.toLowerCase()) || [];

        const nextSession =
            bookings

                .filter(
                    booking =>
                        !cal.isCancelledBooking(booking)
                )

                .filter(
                    booking =>
                        new Date(booking.start) > new Date()
                )

                .sort(
                    (a, b) =>
                        new Date(a.start) -
                        new Date(b.start)
                )[0];

        clientRows.push({

            client,

            container,

            nextSession

        });
    }

    res.render(
        "admin/clients",
        {
            clientRows,
            clients: clients.length
        }
    );

};

exports.newClientPage = async (req, res) => {

    const offerings = await Offering.find().sort({ name: 1 });

    res.render("admin/new-client", {
        offerings,
        error: null
    });

};

// Creates a client directly from the admin panel — no Stripe checkout — for
// comps, scholarships, or anyone else who shouldn't be charged. Still
// creates a real CoachingContainer (structured off an existing Offering, so
// the session count/Cal.com event type come from somewhere real rather than
// being typed in free-form) so the client lands in the same "pick your
// weekly slot" state a paying client would.
exports.createClient = async (req, res) => {

    const { firstName, lastName, preferredName, pronouns, offeringId } = req.body;
    const email = (req.body.email || "").toLowerCase().trim();

    if (!firstName || !lastName || !email || !offeringId) {

        const offerings = await Offering.find().sort({ name: 1 });

        return res.status(400).render("admin/new-client", {
            offerings,
            error: "First name, last name, email, and an offering are all required."
        });
    }

    try {

        const existing = await PortalUser.findOne({ email });

        if (existing) {

            const offerings = await Offering.find().sort({ name: 1 });

            return res.status(400).render("admin/new-client", {
                offerings,
                error: "An account with that email already exists."
            });
        }

        const offering = await Offering.findById(offeringId);

        if (!offering) {
            return res.status(404).send("Offering not found.");
        }

        // No password yet — the client sets their own via the link below.
        // emailVerified is set directly rather than going through the
        // signup code-verification flow: an admin adding someone by hand
        // already knows this is a real address.
        const client = await PortalUser.create({
            firstName,
            lastName,
            preferredName: preferredName || firstName,
            pronouns,
            email,
            passwordHash: null,
            emailVerified: true,
            role: "client"
        });

        const container = await CoachingContainer.create({
            user: client._id,
            offering: offering._id,
            name: offering.name,
            status: "awaiting-slot",
            startedAt: new Date(),
            eventTypeId: offering.eventTypeId,
            sessionCount: offering.sessionCount,
            sessionsGranted: offering.sessionCount
        });

        // Reuses the same reset-password token mechanism as "forgot
        // password" — this is effectively their first login, just without
        // a password to reset from. A week (rather than the self-serve
        // flow's 1 hour) since this is their first touchpoint, not a
        // time-sensitive security action.
        const rawToken = crypto.randomBytes(32).toString("hex");

        client.resetPasswordTokenHash = hashResetToken(rawToken);
        client.resetPasswordExpires = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await client.save();

        const setupUrl = `${process.env.BASE_URL}/reset-password/${rawToken}`;

        try {

            await sendEmail({
                to: client.email,
                subject: `Welcome to ${site.businessName} — set up your account`,
                html: welcomeSetPasswordEmail(client.preferredName || client.firstName, setupUrl)
            });

        } catch (err) {

            // The client and container are already created either way —
            // log it so the admin can manually resend/share the setup
            // link, but don't fail the whole request over a delivery
            // problem.
            console.error("Failed to send account-setup email:", err);
        }

        res.redirect(`/admin/clients/${client._id}`);

    } catch (err) {

        sendAdminError(res, err);
    }

};


exports.clientProfile = async (req, res) => {

    const client = await PortalUser.findById(req.params.id)
        .populate("resources.resourceId");

    if (!client) {
        return res.sendStatus(404);
    }

    const completedResources = client.resources.filter(r =>
        r.completed && r.resourceId
    );

    const pendingToolRequests = client.resources.filter(r =>
        r.requested && !r.unlocked && r.resourceId
    );

    const container = await findCurrentContainer(client._id, {
        statuses: ["awaiting-slot", "active"]
    });

    // Every container this client has ever had, not just the current
    // awaiting-slot/active one above — a client can accumulate more than
    // one over time (e.g. a completed engagement, then "Add More Sessions"
    // starting a fresh one), and the admin should be able to see all of it.
    const allContainers = await CoachingContainer.find({
        user: client._id
    })
        .populate("offering")
        .sort({ createdAt: -1 });

    let sessions = [];
    let pendingSessionToolRequests = [];

    if (container && container.status === "active") {

        const bookings = await cal.getBookingsByEmail(client.email);

        const sessionResources = await SessionResource.find({
            bookingUid: {
                $in: bookings.map(b => b.uid)
            }
        }).populate("tools.resource");

        const resourceMap = new Map();

        sessionResources.forEach(resource => {
            resourceMap.set(resource.bookingUid, resource);
        });

        const bookingStartByUid = new Map(bookings.map(b => [b.uid, b.start]));

        sessionResources.forEach(sessionResource => {
            sessionResource.tools
                .filter(t => t.resource)
                .forEach(t => {

                    const unlocked = !!findUserResourceEntry(client.resources, t.resource._id)?.unlocked;

                    if (!unlocked) {
                        pendingSessionToolRequests.push({
                            resource: t.resource,
                            requestedAt: t.requestedAt,
                            sessionStart: bookingStartByUid.get(sessionResource.bookingUid),
                            bookingUid: sessionResource.bookingUid
                        });
                    }
                });
        });

        sessions = bookings

            .filter(booking =>
                cal.belongsToContainer(booking, container)
            )

            .sort((a, b) =>
                new Date(a.start) - new Date(b.start)
            )

            .map((booking, index) => ({

                sessionNumber: index + 1,

                bookingUid: booking.uid,

                start: booking.start,

                end: booking.end,

                status: booking.status,

                worksheetCompleted:
                    resourceMap.get(booking.uid)?.completed || false,

                hasNotes:
                    !!resourceMap.get(booking.uid)?.notes,

                sessionResource:
                    resourceMap.get(booking.uid)
            }));
    }

    // Live Stripe state for every subscription this client has ever had —
    // realistically at most one at a time, but a completed-then-renewed
    // history can leave more than one container with a stripeSubscriptionId.
    // Best-effort per container: one bad/deleted subscription shouldn't
    // block loading the rest of the page.
    const billingByContainer = new Map();

    for (const c of allContainers) {

        if (!c.stripeSubscriptionId) {
            continue;
        }

        try {
            billingByContainer.set(c._id.toString(), await getSubscriptionBillingInfo(c.stripeSubscriptionId));
        } catch (err) {
            console.error(`Failed to load billing info for container ${c._id}:`, err.message);
        }
    }

    res.render("admin/client-profile", {
        client,
        completedResources,
        pendingToolRequests,
        pendingSessionToolRequests,
        container,
        allContainers,
        billingByContainer,
        sessions
    });
};

// Admin equivalent of the client's own "cancel my subscription" — same
// rule, but the admin can pass override=true to skip the notice-window
// wait entirely and stop the very next charge regardless of timing.
exports.cancelContainerBilling = async (req, res) => {

    const container = await CoachingContainer.findById(req.params.id).populate("offering");

    if (!container || !container.stripeSubscriptionId) {
        return res.sendStatus(404);
    }

    if (!container.offering) {
        return res.status(400).send("This container has no associated offering.");
    }

    const override = req.body.override === "true";

    await requestCancellation(container, container.offering, "admin", override);

    res.redirect(`/admin/clients/${container.user}`);
};

// Grants a client access to a tool resource they've requested — the only
// place `resources[].unlocked` is ever set true. Scoped to a specific
// client+resource pair (not just a resourceId) so this can't be used to
// unlock a resource for the wrong client via a guessed/reused slug.
exports.unlockResource = async (req, res) => {

    const client = await PortalUser.findById(req.params.id);

    if (!client) {
        return res.sendStatus(404);
    }

    const resource = await Resource.findOne({ slug: req.params.slug });

    if (!resource) {
        return res.sendStatus(404);
    }

    // No pre-existing resources[] entry is required — a tool requested via
    // the per-session flow (requestSessionTool, dashboardController.js)
    // only ever writes to SessionResource.tools[], never to the client's
    // own resources[], so unlocking has to be able to create this entry on
    // the fly rather than assuming the resource-library request flow
    // (requestResource) already created one.
    let userResource = findUserResourceEntry(client.resources, resource._id);

    if (!userResource) {
        client.resources.push({ resourceId: resource._id, unlocked: true });
    } else {
        userResource.unlocked = true;
    }

    await client.save();

    res.redirect(`/admin/clients/${client._id}`);
};

// Deletes a client and everything that traces back to them: every
// CoachingContainer, TestimonialSubmission, and Referral they own, plus
// (best-effort) the SessionResource worksheet/notes records and any
// upcoming Cal.com sessions tied to their bookings. Deliberately does NOT
// touch:
//   - Past Cal.com sessions. Only upcoming ones are cancelled — history
//     stays intact on the calendar.
//   - Any Testimonial this client's submission was published into. That's
//     live site content the coach chose to publish; it survives on its own
//     once published, same as approving/rejecting/deleting the submission
//     that originated it.
exports.deleteClient = async (req, res) => {

    const client = await PortalUser.findById(req.params.id);

    if (!client) {
        return res.sendStatus(404);
    }

    await CoachingContainer.deleteMany({ user: client._id });
    await TestimonialSubmission.deleteMany({ submittedBy: client._id });
    await Referral.deleteMany({ submittedBy: client._id });

    // Best-effort: SessionResource has no direct link back to a client (it
    // keys off Cal.com's bookingUid), so this requires a live Cal.com
    // lookup by email. A slow/failed Cal.com call is a real possibility and
    // must never block deleting the client record itself over it — this
    // only ever leaves a handful of harmless orphaned worksheet/notes
    // documents behind, the same class of leftover deleteContainer already
    // knows how to show and clean up as a "phantom" container.
    //
    // The client's every container was just deleted above, so — unlike
    // deleteContainer, which only cancels one specific container's
    // sessions — every upcoming booking under this email gets cancelled
    // here, not just ones tied to a particular container.
    try {

        const bookings = await cal.getBookingsByEmail(client.email);

        if (bookings.length) {

            const now = new Date();

            const upcoming = bookings.filter(b =>
                !cal.isCancelledBooking(b) &&
                new Date(b.start) > now
            );

            for (const booking of upcoming) {

                try {
                    await cal.cancelBooking(booking.uid, "Client account deleted by admin.");
                } catch (error) {
                    console.error(`Failed to cancel booking ${booking.uid} for deleted client ${client.email}:`, error);
                }
            }

            await SessionResource.deleteMany({
                bookingUid: { $in: bookings.map(b => b.uid) }
            });
        }

    } catch (err) {

        console.error(`Failed to clean up SessionResource records for deleted client ${client.email}:`, err.message);
    }

    await PortalUser.deleteOne({ _id: client._id });

    res.redirect("/admin/clients");
};

exports.getClientWheelOfLife = async (req, res) => {
    try {

        const client = await PortalUser.findById(req.params.id);

        if (!client) {
            return res.sendStatus(404);
        }

        const latestWheel =
            client.wheelOfLifeHistory?.[
            client.wheelOfLifeHistory.length - 1
            ];

        const scores = latestWheel?.results || null;

        const completedAt = latestWheel?.completedAt
            ? latestWheel.completedAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            })
            : null;

        res.render("client-dashboard/wheel-of-life", {
            scores,
            completedAt,
            adminView: true,
            client
        });

    } catch (err) {

        sendAdminError(res, err);

    }
};


exports.getClientResource = async (req, res) => {

    const client = await PortalUser.findById(req.params.id);

    if (!client) {
        return res.sendStatus(404);
    }

    const resource = await Resource.findOne({
        slug: req.params.slug,
        active: true
    });

    if (!resource) {
        return res.sendStatus(404);
    }

    const userResource = findUserResourceEntry(client.resources, resource._id);

    res.render("client-dashboard/resource", {
        resource,
        userResource,
        isAdmin: true,
        client,
        editing: false
    });
};

exports.sessions = async (req, res) => {

    const clients =
        await PortalUser.find({
            role: "client"
        });

    // One bulk Cal.com fetch covering every client, instead of one API call
    // per client (getBookingsByEmail only filters to a single attendee).
    const allBookings = await cal.getAllBookings();
    const bookingsByEmail = cal.groupBookingsByEmail(allBookings);

    let sessions = [];

    for (const client of clients) {

        const bookings = bookingsByEmail.get(client.email.toLowerCase()) || [];

        bookings.forEach(b => {

            sessions.push({

                client,

                bookingUid: b.uid,

                start: b.start,

                status: b.status

            });
        });
    }

    sessions.sort(
        (a, b) =>
            new Date(a.start) -
            new Date(b.start)
    );

    res.render(
        "admin/sessions",
        {
            sessions
        }
    );
};

exports.saveNotes = async (req, res) => {

    const session = await SessionResource.findOne({
        bookingUid: req.params.bookingUid
    });

    if (!session) {
        return res.status(404).send("Session not found");
    }

    let sections = req.body.sections || [];

    if (!Array.isArray(sections)) {
        sections = Object.values(sections);
    }

    try {

        session.notes = {

            sections: sections
                .map(section => {

                    const items = Array.isArray(section.items)
                        ? section.items
                        : [section.items];

                    return {
                        title: (section.title || "").trim(),
                        // Drop blank lines (an "Add Item" click left unfilled,
                        // or the last item in a section someone cleared) rather
                        // than saving empty bullet points.
                        items: items
                            .map(item => (item || "").trim())
                            .filter(Boolean)
                    };

                })
                // A section with no title and no items left isn't worth keeping.
                .filter(section => section.title || section.items.length),

            updatedAt: new Date()
        };

        await session.save();

        const clientId = req.body.clientId;
        const start = req.body.start;

        // Best-effort — a client not being resolvable (notes saved without
        // client context in the URL) or the email failing shouldn't block
        // the admin from seeing their notes saved.
        if (clientId) {
            const client = await PortalUser.findById(clientId);
            if (client) {
                await notifyClient(client, "sessionNotesPosted", {
                    subject: "New session notes are available",
                    html: sessionNotePostedEmail(client.preferredName || client.firstName)
                });
            }
        }

        const redirectQuery = clientId && start
            ? `?clientId=${encodeURIComponent(clientId)}&start=${encodeURIComponent(start)}`
            : "";

        res.redirect(
            `/admin/sessions/${req.params.bookingUid}/notes${redirectQuery}`
        );

    } catch (err) {

        sendAdminError(res, err);

    }
};

exports.newOfferingPage = async (req, res) => {

    // Only active agreements are assignable to a new offering — inactive
    // ones are "retired" versions that stay attached to whatever already
    // uses them, but shouldn't be pickable going forward.
    const agreements = await Agreement
        .find({ active: true })
        .sort({
            version: -1
        });

    res.render("admin/new-offering", {
        agreements
    });


};


exports.showNotes = async (req, res) => {

    const session = await SessionResource.findOne({
        bookingUid: req.params.bookingUid
    }).populate("tools.resource");

    if (!session) {
        return res.status(404).send("Session not found");
    }

    // Threaded through as query params from wherever this was linked from
    // (SessionResource itself has no client reference, only a Cal.com
    // bookingUid) so the page can show who and when this is for instead of
    // just a bare booking id.
    const client = req.query.clientId
        ? await PortalUser.findById(req.query.clientId)
        : null;

    // The unlock action itself (unlocking is per-client, not per-session —
    // see requestSessionTool's comment in dashboardController.js) only
    // makes sense once we actually know which client this is.
    const requestedTools = client
        ? session.tools
            .filter(t => t.resource)
            .map(t => ({
                resource: t.resource,
                requestedAt: t.requestedAt,
                unlocked: !!findUserResourceEntry(client.resources, t.resource._id)?.unlocked
            }))
        : [];

    res.render("admin/notes", {
        session,
        client,
        requestedTools,
        sessionStart: req.query.start || null,
        sections: session.notes?.sections?.length
            ? session.notes.sections
            : [{ title: "", items: [""] }]
    });
};


exports.getClientSessionWorksheet = async (req, res) => {

    const client = await PortalUser.findById(req.params.clientId);

    if (!client) {
        return res.sendStatus(404);
    }

    const sessionResource = await SessionResource.findOne({
        bookingUid: req.params.bookingUid
    }).populate("resource");

    if (!sessionResource) {
        return res.status(404)
            .send("Worksheet not found");
    }

    res.render(
        "client-dashboard/session-worksheet",
        {
            bookingUid: req.params.bookingUid,
            resource: sessionResource.resource,
            answers: sessionResource.answers,
            completed: sessionResource.completed,
            status: "admin-view",
            client,
            isAdmin: true,
            editing: false
        }
    );
};

exports.updateOffering = async (req, res) => {

    try {

        await Offering.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
                description: req.body.description,
                duration: req.body.duration,
                sessionCount: req.body.sessionCount,
                sessionLength: req.body.sessionLength,
                price: req.body.price,
                priceId: req.body.priceId,
                cancellationNoticeDays: req.body.cancellationNoticeDays,
                eventTypeId: req.body.eventTypeId,
                spotsRemaining: req.body.spotsRemaining,
                bestFor: req.body.bestFor,
                mode: req.body.mode,
                agreement: req.body.agreement,
                active: req.body.active === "true"
            },
            { runValidators: true }
        );

        res.redirect("/admin/offerings");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.deleteOffering = async (req, res) => {

    await Offering.findByIdAndDelete(
        req.params.id
    );

    res.redirect("/admin/offerings");

};

exports.toggleOffering = async (req, res) => {

    const offering = await Offering.findById(req.params.id);

    if (!offering) {
        return res.sendStatus(404);
    }

    await Offering.updateOne(
        { _id: offering._id },
        { $set: { active: !offering.active } }
    );

    res.redirect("/admin/offerings");

};

exports.editOfferingPage = async (req, res) => {

    const offering = await Offering.findById(req.params.id);

    if (!offering) {
        return res.sendStatus(404);
    }

    // Active agreements, plus whichever one this offering already uses
    // even if it's since been deactivated — otherwise saving this form
    // again would silently drop a still-in-use, but now-inactive, agreement.
    const agreements = await Agreement
        .find({
            $or: [
                { active: true },
                { _id: offering.agreement }
            ]
        })
        .sort({
            version: -1
        });

    res.render("admin/edit-offering", {

        offering,

        agreements

    });
};

exports.createOffering = async (req, res) => {

    try {

        await Offering.create({

            name: req.body.name,

            description: req.body.description,

            duration: req.body.duration,

            sessionCount: req.body.sessionCount,

            sessionLength: req.body.sessionLength,

            price: req.body.price,

            priceId: req.body.priceId,

            cancellationNoticeDays: req.body.cancellationNoticeDays,

            eventTypeId: req.body.eventTypeId,

            spotsRemaining: req.body.spotsRemaining || 0,

            bestFor: req.body.bestFor,

            mode: req.body.mode,

            agreement: req.body.agreement

        });

        res.redirect("/admin/dashboard");

    } catch (err) {

        sendAdminError(res, err);

    }
};

// Every coaching container across every client — offerings/resources/etc.
// each get their own admin list page already; containers never had one,
// even though they're the thing that actually determines whether a client
// can book sessions. Useful both day-to-day and for spotting a client whose
// container ended up in an unexpected state.
exports.containersPage = async (req, res) => {

    const statusFilter = req.query.status;

    const query = {};

    if (statusFilter && CONTAINER_STATUSES.includes(statusFilter)) {
        query.status = statusFilter;
    }

    const containers = await CoachingContainer
        .find(query)
        .populate("user")
        .populate("offering")
        .sort({ createdAt: -1 });

    res.render("admin/containers", {
        containers,
        statuses: CONTAINER_STATUSES,
        statusFilter: statusFilter || ""
    });
};

// Manual override for a container's status — mainly a recovery tool (e.g. a
// client stuck in scheduling-failed after a Cal.com hiccup, or a container
// that needs to be paused/reactivated by hand) rather than a normal part of
// the client lifecycle, which drives status changes itself via checkout,
// generateContainerBookings, etc.
exports.updateContainerStatus = async (req, res) => {

    const { status } = req.body;

    if (!CONTAINER_STATUSES.includes(status)) {
        return res.status(400).send("Invalid status.");
    }

    const container = await CoachingContainer.findById(req.params.id);

    if (!container) {
        return res.sendStatus(404);
    }

    container.status = status;
    await container.save();

    res.redirect(req.get("Referrer") || "/admin/containers");
};

// Optionally preselects a client via ?clientId=, so this doubles as both
// the containers list's "+ New Container" and a client profile's
// "Add Container" action without needing two separate forms.
exports.newContainerPage = async (req, res) => {

    const clients = await PortalUser.find({ role: "client" }).sort({ firstName: 1 });
    const offerings = await Offering.find().sort({ name: 1 });

    res.render("admin/new-container", {
        clients,
        offerings,
        selectedClientId: req.query.clientId || "",
        error: null
    });
};

// Manually gives an existing client a fresh container — same shape a paying
// checkout or the free-client flow produces (sessionCount/eventTypeId
// always come from the chosen Offering, never typed in free-form), for
// cases like a deleted/mistaken container needing to be redone, or a
// second engagement that createClient's own "no duplicate client" check
// wouldn't otherwise support.
exports.createContainer = async (req, res) => {

    const { clientId, offeringId } = req.body;

    if (!clientId || !offeringId) {

        const clients = await PortalUser.find({ role: "client" }).sort({ firstName: 1 });
        const offerings = await Offering.find().sort({ name: 1 });

        return res.status(400).render("admin/new-container", {
            clients,
            offerings,
            selectedClientId: clientId || "",
            error: "A client and an offering are both required."
        });
    }

    const client = await PortalUser.findById(clientId);

    if (!client) {
        return res.status(404).send("Client not found.");
    }

    const offering = await Offering.findById(offeringId);

    if (!offering) {
        return res.status(404).send("Offering not found.");
    }

    await CoachingContainer.create({
        user: client._id,
        offering: offering._id,
        name: offering.name,
        status: "awaiting-slot",
        startedAt: new Date(),
        eventTypeId: offering.eventTypeId,
        sessionCount: offering.sessionCount,
        sessionsGranted: offering.sessionCount
    });

    res.redirect(`/admin/clients/${client._id}`);
};

// Deletes the container record and cancels any of its own upcoming Cal.com
// sessions (best-effort — see the try/catch below). Past sessions are left
// on the calendar untouched.
exports.deleteContainer = async (req, res) => {

    const container = await CoachingContainer.findById(req.params.id);

    if (!container) {
        return res.sendStatus(404);
    }

    const clientId = container.user;

    // Redirecting to the owning client's profile after a delete is a nice
    // touch normally, but a container whose client was removed directly in
    // the database (not through the app — there's no "delete client" admin
    // action) has a clientId that no longer resolves to anything. Following
    // it unconditionally sent a *successful* delete straight into
    // clientProfile's own 404, which looked exactly like the delete had
    // failed. Only follow it if that client still actually exists.
    const client = clientId ? await PortalUser.findById(clientId) : null;

    // Best-effort: cancel this container's own upcoming Cal.com sessions
    // before deleting the record — otherwise the client (and coach) are
    // left with real calendar holds for a container that no longer exists
    // anywhere in the app. Scoped to this container specifically (not every
    // booking under the client's email) since a client can have more than
    // one container at once. Each cancellation is wrapped individually, same
    // as the reschedule flow (dashboardController.js's bookSessions), so one
    // failure doesn't stop the rest — and none of this should ever block the
    // actual delete below.
    if (client) {

        try {

            const bookings = await cal.getBookingsByEmail(client.email);

            const now = new Date();

            const upcoming = bookings.filter(b =>
                cal.belongsToContainer(b, container) &&
                !cal.isCancelledBooking(b) &&
                new Date(b.start) > now
            );

            for (const booking of upcoming) {

                try {
                    await cal.cancelBooking(booking.uid, "Coaching container deleted by admin.");
                } catch (error) {
                    console.error(`Failed to cancel booking ${booking.uid} for deleted container ${container._id}:`, error);
                }
            }

        } catch (err) {
            console.error(`Failed to fetch Cal.com bookings for deleted container ${container._id}:`, err.message);
        }
    }

    await CoachingContainer.deleteOne({ _id: container._id });

    res.redirect(client ? `/admin/clients/${clientId}` : "/admin/containers");
};

// Same shared roadmap as the client-facing one (dashboardController's
// getRoadmap/saveRoadmap) — same template (views/client-dashboard/
// roadmap.ejs), gated by isAdmin, so the two editors can never drift into
// different behavior. Targets a specific container by id, since an admin
// (unlike a client on their own dashboard) can be looking at any of a
// client's containers, not just their current one.
exports.getContainerRoadmap = async (req, res) => {

    const container = await CoachingContainer
        .findById(req.params.id)
        .populate("user");

    if (!container) {
        return res.sendStatus(404);
    }

    await ensureRoadmapSessions(container);

    res.render("client-dashboard/roadmap", {
        container,
        isAdmin: true,
        client: container.user
    });
};

exports.updateContainerRoadmap = async (req, res) => {

    const container = await CoachingContainer.findById(req.params.id);

    if (!container) {
        return res.sendStatus(404);
    }

    container.roadmap = buildRoadmapUpdate(req.body, "admin");

    await container.save();

    res.redirect(`/admin/containers/${container._id}/roadmap`);
};

exports.offeringsPage = async (req, res) => {

    const offerings = await Offering
        .find()
        .sort({ createdAt: -1 });

    res.render("admin/offerings", {
        offerings
    });

};



exports.createNewWorksheet = async (req, res) => {

    try {

        let questions = req.body.questions || [];

        if (!Array.isArray(questions)) {
            questions = Object.values(questions);
        }

        questions = questions.map(q => ({
            id: q.id,
            question: q.question,
            type: q.type || "textarea",
            placeholder: q.placeholder,
            required: q.required === "on"
        }));

        await Resource.create({

            title: req.body.title,

            slug: req.body.slug,

            category: req.body.category,

            summary: req.body.summary,

            content: req.body.content,

            type: "worksheet",

            questions,

            display_order: Number(req.body.display_order) || 0

        });

        res.redirect("/admin");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.resourcesPage = async (req, res) => {

    const resources = await Resource
        .find()
        .sort({
            category: 1,
            display_order: 1
        });

    res.render("admin/resources", {
        resources
    });

};

exports.newResourcePage = (req, res) => {

    res.render("admin/new-resource");

};

exports.editResourcePage = async (req, res) => {

    const resource = await Resource.findById(req.params.id);

    if (!resource) {
        return res.sendStatus(404);
    }

    res.render("admin/edit-resource", {
        resource
    });

};

exports.createResource = async (req, res) => {

    try {

        let questions = req.body.questions || [];

        if (!Array.isArray(questions)) {
            questions = Object.values(questions);
        }

        questions = questions.map(q => ({
            id: q.id,
            question: q.question,
            type: q.type || "textarea",
            placeholder: q.placeholder,
            required: q.required === "on"
        }));

        const resource = await Resource.create({

            title: req.body.title,

            slug: req.body.slug,

            category: req.body.category,

            type: req.body.type,

            summary: req.body.summary,

            content: req.body.content,

            display_order: Number(req.body.display_order) || 0,

            questions

        });

        // "Tool" resources are the ones meant to be a proactive addition a
        // client should hear about — worksheets/lists get filled in as part
        // of onboarding/scheduled flows already, so surfacing every new one
        // by email would be noisier than useful. New resource defaults to
        // active (see schema), so it's already visible on
        // /client-dashboard/resources by the time this sends.
        if (resource.type === "tool" && resource.active) {

            const clients = await PortalUser.find({ role: "client" });

            for (const client of clients) {
                await notifyClient(client, "newToolAdded", {
                    subject: "A new tool is available",
                    html: newToolAddedEmail(client.preferredName || client.firstName, resource.title)
                });
            }
        }

        res.redirect("/admin/resources");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.updateResource = async (req, res) => {

    try {

        let questions = req.body.questions || [];

        if (!Array.isArray(questions)) {
            questions = Object.values(questions);
        }

        questions = questions.map(q => ({
            id: q.id,
            question: q.question,
            type: q.type || "textarea",
            placeholder: q.placeholder,
            required: q.required === "on"
        }));

        await Resource.findByIdAndUpdate(
            req.params.id,
            {

                title: req.body.title,

                slug: req.body.slug,

                category: req.body.category,

                type: req.body.type,

                summary: req.body.summary,

                content: req.body.content,

                display_order: Number(req.body.display_order),

                active: req.body.active === "true",

                questions

            },
            { runValidators: true }
        );

        res.redirect("/admin/resources");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.deleteResource = async (req, res) => {

    await Resource.findByIdAndDelete(req.params.id);

    res.redirect("/admin/resources");

};

exports.toggleResource = async (req, res) => {

    const resource = await Resource.findById(req.params.id);

    if (!resource) {
        return res.sendStatus(404);
    }

    await Resource.findByIdAndUpdate(
        resource._id,
        {
            active: !resource.active
        }
    );

    res.redirect("/admin/resources");

};

exports.agreementsPage = async (req, res) => {

    const agreements = await Agreement
        .find()
        .sort({ createdAt: -1 });

    res.render(
        "admin/agreements",
        {
            agreements
        }
    );

};

exports.newAgreementPage = (req, res) => {

    res.render(
        "admin/new-agreement"
    );

};

exports.editAgreementPage = async (req, res) => {

    const agreement = await Agreement.findById(req.params.id);

    if (!agreement) {
        return res.sendStatus(404);
    }

    res.render(
        "admin/edit-agreement",
        {
            agreement
        }
    );

};

exports.createAgreement = async (req, res) => {

    let sections = req.body.sections || [];

    if (!Array.isArray(sections)) {
        sections = Object.values(sections);
    }

    try {

        await Agreement.create({

            version: req.body.version,

            sections

        });

        res.redirect("/admin/agreements");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.updateAgreement = async (req, res) => {

    let sections = req.body.sections || [];

    if (!Array.isArray(sections)) {
        sections = Object.values(sections);
    }

    try {

        await Agreement.findByIdAndUpdate(

            req.params.id,

            {

                version: req.body.version,

                active: req.body.active === "true",

                sections

            },

            { runValidators: true }

        );

        res.redirect("/admin/agreements");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.deleteAgreement = async (req, res) => {

    await Agreement.findByIdAndDelete(
        req.params.id
    );

    res.redirect("/admin/agreements");

};

exports.toggleAgreement = async (req, res) => {

    const agreement = await Agreement.findById(
        req.params.id
    );

    if (!agreement) {
        return res.sendStatus(404);
    }

    await Agreement.findByIdAndUpdate(

        agreement._id,

        {
            active: !agreement.active
        }

    );

    res.redirect("/admin/agreements");

};

exports.testimonialsPage = async (req, res) => {

    const testimonials = await Testimonial
        .find()
        .sort({
            name: 1
        });

    res.render(
        "admin/testimonials",
        {
            testimonials
        }
    );

};

exports.newTestimonialPage = (req, res) => {

    res.render(
        "admin/new-testimonial"
    );

};

exports.editTestimonialPage = async (req, res) => {

    const testimonial = await Testimonial.findById(
        req.params.id
    );

    if (!testimonial) {
        return res.sendStatus(404);
    }

    res.render(
        "admin/edit-testimonial",
        {
            testimonial
        }
    );

};

exports.createTestimonial = async (req, res) => {

    try {

        await Testimonial.create({

            name: req.body.name,

            testimonialText: req.body.testimonialText,

            active: true

        });

        res.redirect(
            "/admin/testimonials"
        );

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.updateTestimonial = async (req, res) => {

    try {

        await Testimonial.findByIdAndUpdate(

            req.params.id,

            {

                name: req.body.name,

                testimonialText: req.body.testimonialText,

                active: req.body.active === "true"

            },

            { runValidators: true }

        );

        res.redirect(
            "/admin/testimonials"
        );

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.deleteTestimonial = async (req, res) => {

    await Testimonial.findByIdAndDelete(
        req.params.id
    );

    res.redirect(
        "/admin/testimonials"
    );

};

exports.toggleTestimonial = async (req, res) => {

    const testimonial = await Testimonial.findById(
        req.params.id
    );

    if (!testimonial) {
        return res.sendStatus(404);
    }

    await Testimonial.findByIdAndUpdate(

        testimonial._id,

        {

            active: !testimonial.active

        }

    );

    res.redirect(
        "/admin/testimonials"
    );

};

// ============================================
// TESTIMONIAL QUESTIONS
// ============================================
// The prompts shown on the client-facing testimonial submission form
// (/client-dashboard/testimonial). Editable here so questions can change
// without a code deploy.

exports.testimonialQuestionsPage = async (req, res) => {

    const testimonialQuestions = await TestimonialQuestion
        .find()
        .sort({
            order: 1,
            createdAt: 1
        });

    res.render(
        "admin/testimonial-questions",
        {
            testimonialQuestions
        }
    );

};

exports.newTestimonialQuestionPage = (req, res) => {

    res.render(
        "admin/new-testimonial-question"
    );

};

exports.editTestimonialQuestionPage = async (req, res) => {

    const testimonialQuestion = await TestimonialQuestion.findById(
        req.params.id
    );

    if (!testimonialQuestion) {
        return res.sendStatus(404);
    }

    res.render(
        "admin/edit-testimonial-question",
        {
            testimonialQuestion
        }
    );

};

exports.createTestimonialQuestion = async (req, res) => {

    try {

        await TestimonialQuestion.create({

            question: req.body.question,

            order: Number(req.body.order) || 0,

            active: true

        });

        res.redirect(
            "/admin/testimonial-questions"
        );

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.updateTestimonialQuestion = async (req, res) => {

    try {

        await TestimonialQuestion.findByIdAndUpdate(

            req.params.id,

            {

                question: req.body.question,

                order: Number(req.body.order) || 0,

                active: req.body.active === "true"

            },

            { runValidators: true }

        );

        res.redirect(
            "/admin/testimonial-questions"
        );

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.deleteTestimonialQuestion = async (req, res) => {

    await TestimonialQuestion.findByIdAndDelete(
        req.params.id
    );

    res.redirect(
        "/admin/testimonial-questions"
    );

};

exports.toggleTestimonialQuestion = async (req, res) => {

    const testimonialQuestion = await TestimonialQuestion.findById(
        req.params.id
    );

    if (!testimonialQuestion) {
        return res.sendStatus(404);
    }

    await TestimonialQuestion.findByIdAndUpdate(

        testimonialQuestion._id,

        {

            active: !testimonialQuestion.active

        }

    );

    res.redirect(
        "/admin/testimonial-questions"
    );

};

// ============================================
// TESTIMONIAL SUBMISSIONS (review inbox)
// ============================================
// The intermediary between a client's dashboard submission and the
// homepage. Nothing here is public — approving is the only thing that
// creates/updates a live Testimonial.

exports.testimonialSubmissionsPage = async (req, res) => {

    const submissions = await TestimonialSubmission
        .find()
        .populate("publishedTestimonial")
        .sort({
            createdAt: -1
        });

    // Pending review first, regardless of date, so nothing gets buried.
    const statusOrder = { pending: 0, approved: 1, rejected: 2 };
    submissions.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    res.render(
        "admin/testimonial-submissions",
        {
            submissions
        }
    );

};

exports.reviewTestimonialSubmissionPage = async (req, res) => {

    const submission = await TestimonialSubmission
        .findById(req.params.id)
        .populate("publishedTestimonial");

    if (!submission) {
        return res.sendStatus(404);
    }

    res.render(
        "admin/testimonial-submission-review",
        {
            submission
        }
    );

};

exports.approveTestimonialSubmission = async (req, res) => {

    const submission = await TestimonialSubmission.findById(req.params.id);

    if (!submission) {
        return res.sendStatus(404);
    }

    const name = (req.body.name || "").trim();
    const testimonialText = (req.body.testimonialText || "").trim();

    if (!name || !testimonialText) {
        return res.status(400).send("Name and testimonial text are required to publish.");
    }

    try {

        let testimonial = submission.publishedTestimonial
            ? await Testimonial.findById(submission.publishedTestimonial)
            : null;

        if (testimonial) {
            // Re-approving an edited resubmission updates the same live
            // Testimonial instead of creating a duplicate.
            testimonial.name = name;
            testimonial.testimonialText = testimonialText;
            testimonial.active = true;
            await testimonial.save();
        } else {
            testimonial = await Testimonial.create({
                name,
                testimonialText,
                active: true,
                sourceSubmission: submission._id
            });
        }

        submission.status = "approved";
        submission.publishedTestimonial = testimonial._id;
        submission.reviewedAt = new Date();
        await submission.save();

        const submitter = await PortalUser.findById(submission.submittedBy);
        if (submitter) {
            await notifyClient(submitter, "testimonialReviewed", {
                subject: "Your testimonial was published",
                html: testimonialReviewedEmail(submitter.preferredName || submitter.firstName, true)
            });
        }

        res.redirect("/admin/testimonial-submissions");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.rejectTestimonialSubmission = async (req, res) => {

    const submission = await TestimonialSubmission.findById(req.params.id);

    if (!submission) {
        return res.sendStatus(404);
    }

    try {

        // Rejecting only affects future review status — it does not touch a
        // Testimonial that's already live from a previous approval. To take
        // something off the homepage, use the toggle/delete on
        // /admin/testimonials directly.
        submission.status = "rejected";
        submission.reviewedAt = new Date();
        await submission.save();

        const submitter = await PortalUser.findById(submission.submittedBy);
        if (submitter) {
            await notifyClient(submitter, "testimonialReviewed", {
                subject: "Your testimonial submission was reviewed",
                html: testimonialReviewedEmail(submitter.preferredName || submitter.firstName, false)
            });
        }

        res.redirect("/admin/testimonial-submissions");

    } catch (err) {

        sendAdminError(res, err);

    }

};

// Deletes the submission record only — same reasoning as rejecting: it
// never touches an already-published Testimonial. That's separate, real
// content the coach chose to publish, not something a client-side record
// disappearing should retroactively take down.
exports.deleteTestimonialSubmission = async (req, res) => {

    const submission = await TestimonialSubmission.findById(req.params.id);

    if (!submission) {
        return res.sendStatus(404);
    }

    await TestimonialSubmission.deleteOne({ _id: submission._id });

    res.redirect("/admin/testimonial-submissions");
};

// ============================================
// REFERRALS
// ============================================

exports.referralsPage = async (req, res) => {

    const referrals = await Referral
        .find()
        .populate("submittedBy")
        .sort({ createdAt: -1 });

    res.render("admin/referrals", { referrals });

};

exports.deleteReferral = async (req, res) => {

    const referral = await Referral.findById(req.params.id);

    if (!referral) {
        return res.sendStatus(404);
    }

    await Referral.deleteOne({ _id: referral._id });

    res.redirect("/admin/referrals");
};

// ============================================
// NOTIFICATIONS
// ============================================

exports.notificationsPage = async (req, res) => {

    const notifications = await NotificationSetting
        .find()
        .sort({ label: 1 });

    res.render("admin/notifications", { notifications });

};

exports.updateNotificationSetting = async (req, res) => {

    const recipientEmail = (req.body.recipientEmail || "").trim().toLowerCase();

    if (!recipientEmail) {
        return res.status(400).send("Recipient email is required.");
    }

    try {

        await NotificationSetting.findByIdAndUpdate(
            req.params.id,
            {
                recipientEmail,
                enabled: req.body.enabled === "on"
            },
            { runValidators: true }
        );

        res.redirect("/admin/notifications");

    } catch (err) {

        sendAdminError(res, err);

    }

};

exports.getClientValues = async (req, res) => {

    try {

        const client = await PortalUser.findById(req.params.clientId);

        if (!client) {
            return res.status(404).send("Client not found");
        }

        res.render("admin/client-values", {
            client
        });

    } catch (err) {

        sendAdminError(res, err);

    }
};

exports.updateClientValues = async (req, res) => {

    try {

        const client = await PortalUser.findById(req.params.clientId);

        if (!client) {
            return res.status(404).send("Client not found");
        }


        // --------------------------------------------
        // Helper: convert comma-separated text to array
        // --------------------------------------------

        const parseValues = (value) => {

            if (!value) {
                return [];
            }

            return value
                .split(",")
                .map(item => item.trim())
                .filter(Boolean);

        };


        // --------------------------------------------
        // Update valuesExercise
        // --------------------------------------------

        client.valuesExercise = {

            selectedValues:
                parseValues(req.body.selectedValues),

            categories: {

                category1:
                    parseValues(req.body.category1),

                category2:
                    parseValues(req.body.category2),

                category3:
                    parseValues(req.body.category3)

            },

            coreValues: {

                category1:
                    req.body.coreValue1?.trim() || null,

                category2:
                    req.body.coreValue2?.trim() || null,

                category3:
                    req.body.coreValue3?.trim() || null

            },

            completed:
                req.body.completed === "true",

            completedAt:
                req.body.completed === "true"
                    ? (
                        client.valuesExercise?.completedAt ||
                        new Date()
                    )
                    : null,

            updatedAt:
                new Date()

        };


        await client.save();


        res.redirect(
            `/admin/clients/${client._id}/values`
        );


    } catch (err) {

        sendAdminError(res, err);

    }

};

wrapControllerExports(exports);