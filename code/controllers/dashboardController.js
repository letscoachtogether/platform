const PortalUser = require("../models/portaluser");
const CoachingContainer = require("../models/coachingContainer");
const SessionResource = require("../models/sessionResource");
const calService = require("../controllers/cal");
const Resource = require("../models/resources");
const TestimonialQuestion = require("../models/testimonialQuestion");
const TestimonialSubmission = require("../models/testimonialSubmission");
const Referral = require("../models/referral");
const Offering = require("../models/offerings");
const referralEmail = require("../emails/referralEmail");
const newTestimonialSubmissionEmail = require("../emails/newTestimonialSubmissionEmail");
const passwordChangedEmail = require("../emails/passwordChangedEmail");
const emailChangedEmail = require("../emails/emailChangedEmail");
const toolAccessRequestedEmail = require("../emails/toolAccessRequestedEmail");
const bcrypt = require("bcrypt");
const { PASSWORD_REGEX } = require("../utils/validators");
const { notify } = require("../controllers/notificationService");
const sendEmail = require("../utils/email");
const { wrapControllerExports } = require("../middleware/asyncHandler");
const { BUSINESS_TIMEZONE, resolveTimezone } = require("../utils/timezone");
const { buildRoadmapUpdate, ensureRoadmapSessions } = require("../utils/roadmap");
const { findCurrentContainer, RESCHEDULABLE_STATUSES } = require("../utils/containers");
const { findUserResourceEntry } = require("../utils/resources");
const { getSubscriptionBillingInfo, requestCancellation } = require("../utils/subscriptions");

// Encodes a chosen slot's weekday as a number — used when a client picks a
// recurring slot in getBookedSessions.
const WEEKDAY_NUMBERS = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
};

// Where a client is in the coaching relationship, derived from their most
// recent CoachingContainer rather than a separate stored field — one less
// thing to keep in sync. Drives which exercises the dashboard surfaces.
function getClientStage(container) {

    if (!container) return "onboarding";

    if (["awaiting-slot", "scheduling", "scheduling-failed"].includes(container.status)) {
        return "onboarding";
    }

    if (["active", "paused"].includes(container.status)) {
        return "active";
    }

    if (container.status === "completed") {
        return "offboarding";
    }

    return "onboarding";
}

// Guided prompts shown on the client testimonial form, managed by admins at
// /admin/testimonial-questions.
async function getActiveTestimonialQuestions() {
    return TestimonialQuestion.find({ active: true }).sort({ order: 1, createdAt: 1 });
}

// Turns a list of {questionText, answer} snapshots into a readable Q&A
// block — the starting point for TestimonialSubmission.draftText, which an
// admin then edits before it's ever published.
function composeDraftText(answers) {
    return answers
        .map(({ questionText, answer }) => `${questionText}\n${answer}`)
        .join("\n\n");
}

async function verifyBookingOwnership(userId, bookingUid) {
    const user = await PortalUser.findById(userId);

    if (!user) return false;

    const bookings = await calService.getBookingsByEmail(user.email);

    // A cancelled booking's uid shouldn't keep granting access to its
    // worksheet/notes page — once cancelled, it's not a session the client
    // should still be able to open.
    return bookings.some(b => b.uid === bookingUid && !calService.isCancelledBooking(b));
}

exports.getDashboard = async (req, res) => {

    const user = await PortalUser.findOne({
        _id: req.session.portalUserId
    });

    // Most recent container regardless of status — used both for the
    // status card and to derive the client's lifecycle stage below.
    const container = await findCurrentContainer(user._id);

    const displayName = user.preferredName;

    const mySubmission = await TestimonialSubmission.findOne({
        submittedBy: user._id
    }).populate("publishedTestimonial");

    const referralCount = await Referral.countDocuments({
        submittedBy: user._id
    });

    const stage = getClientStage(container);

    // How many of this container's sessions have already happened, for the
    // progress bar under "Your Coaching Journey" — only computed once
    // there's an actual schedule to measure against (mirrors the same
    // status gate getDashboardSessions/clientProfile already use before
    // hitting Cal.com), so onboarding/awaiting-slot clients don't pay for
    // an API call with nothing to show for it yet.
    let sessionProgress = null;

    if (stage === "active" && container?.status === "active") {

        const bookings = await calService.getBookingsByEmail(user.email);

        const relevantBookings = bookings.filter(b =>
            calService.belongsToContainer(b, container)
        );

        const now = new Date();
        const passed = relevantBookings.filter(b => new Date(b.start) < now).length;
        const total = container.sessionsGranted || container.sessionCount;

        sessionProgress = { passed, total };
    }

    // "Onboarding" resources (see models/resources.js) drive the dashboard's
    // checklist directly by category now, instead of a hand-maintained slug
    // list — an admin adding/retiring an onboarding item just changes its
    // category in /admin/resources, nothing here needs to change to match.
    const onboardingResourceDocs = await Resource.find({
        category: "onboarding",
        active: true
    }).sort({ display_order: 1 });

    const completedResourceIds = new Set(
        (user.resources || [])
            .filter(r => r.completed && r.resourceId)
            .map(r => r.resourceId.toString())
    );

    const wheelDone = (user.wheelOfLifeHistory || []).length > 0;

    // Wheel of Life isn't a Resource document (it's its own dedicated
    // exercise/model), so it's still the one hardcoded first item — every
    // onboarding-category resource after it is fully data-driven.
    const onboardingItems = [
        {
            title: "Wheel of Life",
            href: "/client-dashboard/wheel-of-life",
            done: wheelDone
        },
        ...onboardingResourceDocs.map(resource => ({
            title: resource.title,
            href: `/client-dashboard/resources/${resource.slug}`,
            done: completedResourceIds.has(resource._id.toString())
        }))
    ];

    const onboardingCompleted = onboardingItems.filter(i => i.done).length;

    // Progress/Continuity resources — surfaced in "Your Coaching Journey"
    // and "Share & Explore" respectively (see main.ejs). Fetched
    // unconditionally (not gated on stage) since Share & Explore is always
    // shown regardless of lifecycle stage.
    const progressResources = await Resource.find({
        category: "progress",
        active: true
    }).sort({ display_order: 1 });

    const continuityResources = await Resource.find({
        category: "continuity",
        active: true
    }).sort({ display_order: 1 });

    const progress = {
        // Only the ones still outstanding show in the dashboard checklist
        // itself — a completed onboarding item stays visible (with its
        // completion state) on the Resources tab, not here.
        onboardingItems: onboardingItems.filter(i => !i.done),
        onboardingCompleted,
        onboardingTotal: onboardingItems.length,
        valuesDone: !!user.valuesExercise?.completed,
        testimonialSubmitted: !!mySubmission,
        referralCount
    };

    res.render("client-dashboard/main", {
        currentPage: "dashboard",
        progressResources,
        continuityResources,
        displayName: displayName,
        container: container,
        mySubmission: mySubmission,
        stage,
        progress,
        sessionProgress,
        newSessionsPurchased: req.query.newSessionsPurchased === "true"
    });
};

// A shared goals + per-session breakdown, editable by both the client (their
// own container, here) and the admin (any container, adminController's
// getContainerRoadmap/updateContainerRoadmap) — same template
// (views/client-dashboard/roadmap.ejs), gated by isAdmin.
exports.getRoadmap = async (req, res) => {

    const container = await findCurrentContainer(req.session.portalUserId);

    if (!container) {
        return res.status(404).send("No coaching container found.");
    }

    await ensureRoadmapSessions(container);

    res.render("client-dashboard/roadmap", {
        container,
        isAdmin: false,
        client: null
    });
};

exports.saveRoadmap = async (req, res) => {

    const container = await findCurrentContainer(req.session.portalUserId);

    if (!container) {
        return res.status(404).send("No coaching container found.");
    }

    container.roadmap = buildRoadmapUpdate(req.body, "client");

    await container.save();

    res.redirect("/client-dashboard/roadmap");
};

exports.getTestimonialPage = async (req, res) => {

    const user = await PortalUser.findById(req.session.portalUserId);

    const mySubmission = await TestimonialSubmission.findOne({
        submittedBy: user._id
    }).populate("publishedTestimonial");

    const questions = await getActiveTestimonialQuestions();

    res.render("client-dashboard/testimonial", {
        testimonialName: user.preferredName || user.firstName || "",
        mySubmission: mySubmission,
        questions: questions
    });
};

exports.submitTestimonial = async (req, res) => {

    const user = await PortalUser.findById(req.session.portalUserId);

    const name = (req.body.name || "").trim();

    const questions = await getActiveTestimonialQuestions();

    const answers = [];
    questions.forEach((q) => {
        const answer = (req.body[q._id.toString()] || "").trim();

        if (answer) {
            answers.push({
                question: q._id,
                questionText: q.question,
                answer
            });
        }
    });

    if (!name || !answers.length) {
        return res.status(400).send("Please fill in your name and at least one question.");
    }

    const draftText = composeDraftText(answers);

    const existing = await TestimonialSubmission.findOne({
        submittedBy: user._id
    });

    if (existing) {
        // Editing — even editing an already-published submission — always
        // goes back to "pending" for re-review. It never touches whatever
        // is currently live on the homepage; that only changes when an
        // admin explicitly re-approves it (adminController.js).
        existing.name = name;
        existing.answers = answers;
        existing.draftText = draftText;
        existing.status = "pending";
        await existing.save();
    } else {
        await TestimonialSubmission.create({
            submittedBy: user._id,
            name,
            answers,
            draftText,
            status: "pending"
        });
    }

    await notify("new-testimonial-submission", {
        subject: `New testimonial submission from ${name}`,
        html: newTestimonialSubmissionEmail(name, draftText.slice(0, 300))
    });

    res.redirect("/client-dashboard/testimonial");
};

// Note: SPIN, Purpose & Outcomes, Inner Dialogues, and Resource Matrix are
// NOT separate dashboard pages — they're already real, populated Resource
// records (type "worksheet") and are reachable at /client-dashboard/resources
// like any other resource. An earlier version of this file resurrected
// dead bespoke pages for these that duplicated that content; removed once
// that overlap was caught (see Referral/add-sessions sections below for
// what's actually unique to the dashboard).

// ============================================
// REFERRALS (offboarding)
// ============================================

exports.getReferralPage = async (req, res) => {

    const referrals = await Referral.find({
        submittedBy: req.session.portalUserId
    }).sort({ createdAt: -1 });

    res.render("client-dashboard/referral", { referrals });
};

exports.submitReferral = async (req, res) => {

    const user = await PortalUser.findById(req.session.portalUserId);

    const friendName = (req.body.friendName || "").trim();
    const friendEmail = (req.body.friendEmail || "").trim().toLowerCase();
    const note = (req.body.note || "").trim();

    if (!friendName || !friendEmail) {
        return res.status(400).send("Please fill in your friend's name and email.");
    }

    await Referral.create({
        submittedBy: user._id,
        friendName,
        friendEmail,
        note
    });

    await notify("new-referral", {
        subject: `New referral from ${user.preferredName || user.firstName}`,
        html: referralEmail(user.preferredName || user.firstName, friendName, friendEmail, note)
    });

    res.redirect("/client-dashboard/referral");
};

// ============================================
// ADD MORE SESSIONS (offboarding)
// ============================================

exports.getAddSessionsPage = async (req, res) => {

    const user = await PortalUser.findById(req.session.portalUserId);
    const activeOfferings = await Offering.find({ active: true });

    res.render("client-dashboard/add-sessions", {
        activeOfferings,
        clientFirstName: user.firstName,
        clientLastName: user.lastName
    });
};

// Billing info is only meaningful for a subscription container — a
// one-time-payment container (or no container at all) just shows the
// "nothing to manage here" state instead.
exports.cancelBilling = async (req, res) => {

    const container = await findCurrentContainer(req.session.portalUserId);

    if (!container || !container.stripeSubscriptionId) {
        return res.status(404).send("No active subscription found.");
    }

    const offering = container.offering ? await Offering.findById(container.offering) : null;

    if (!offering) {
        return res.status(400).send("This container has no associated offering — contact your coach.");
    }

    await requestCancellation(container, offering, "client");

    res.redirect("/client-dashboard/profile");
};

exports.getDashboardProfile = async (req, res) => {

    const user = await PortalUser.findOne({
        _id: req.session.portalUserId
    });

    const container = await findCurrentContainer(req.session.portalUserId);

    let billing = null;
    let cancellationNoticeDays = null;

    if (container && container.stripeSubscriptionId) {

        const offering = container.offering ? await Offering.findById(container.offering) : null;

        cancellationNoticeDays = offering?.cancellationNoticeDays ?? 14;

        try {
            billing = await getSubscriptionBillingInfo(container.stripeSubscriptionId);
        } catch (err) {
            console.error(`Failed to load billing info for container ${container._id}:`, err);
        }
    }

    res.render("client-dashboard/profile", {
        stage: "no-discovery",
        user: user,
        currentPage: "profile",
        billingContainer: container && container.stripeSubscriptionId ? container : null,
        billing,
        cancellationNoticeDays,

        // Both driven by a query param after a redirect from the POST
        // handlers below — same pattern getDashboard already uses for
        // newSessionsPurchased. success is a fixed key (profile/password/
        // email/notifications) the view maps to a message; error is
        // free text, already meant for display.
        success: req.query.success || null,
        error: req.query.error || null
    });
};

// --------------------------------------------
// Profile: basic info
// --------------------------------------------

exports.postUpdateProfile = async (req, res) => {

    const firstName = (req.body.firstName || "").trim();
    const lastName = (req.body.lastName || "").trim();
    const preferredName = (req.body.preferredName || "").trim();
    const pronouns = (req.body.pronouns || "").trim();

    if (!firstName || !lastName) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("First and last name are required.")}`
        );
    }

    await PortalUser.findByIdAndUpdate(
        req.session.portalUserId,
        {
            firstName,
            lastName,
            preferredName: preferredName || firstName,
            pronouns
        },
        { runValidators: true }
    );

    res.redirect("/client-dashboard/profile?success=profile");
};

// --------------------------------------------
// Profile: change password
// --------------------------------------------

exports.postChangePassword = async (req, res) => {

    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    const user = await PortalUser.findById(req.session.portalUserId);

    const validCurrent = user.passwordHash &&
        await bcrypt.compare(currentPassword || "", user.passwordHash);

    if (!validCurrent) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("Current password is incorrect.")}`
        );
    }

    if (newPassword !== confirmNewPassword) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("New passwords do not match.")}`
        );
    }

    if (!PASSWORD_REGEX.test(newPassword || "")) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("New password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.")}`
        );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Security confirmation — always sent regardless of notification
    // preferences (those are for activity/marketing-style emails, not
    // "did you just authorize a credential change").
    try {
        await sendEmail({
            to: user.email,
            subject: "Your password was changed",
            html: passwordChangedEmail(user.preferredName || user.firstName)
        });
    } catch (err) {
        console.error("Failed to send password-changed confirmation:", err);
    }

    res.redirect("/client-dashboard/profile?success=password");
};

// --------------------------------------------
// Profile: change email
// --------------------------------------------

exports.postChangeEmail = async (req, res) => {

    const { currentPassword, newEmail } = req.body;

    const normalizedEmail = (newEmail || "").toLowerCase().trim();

    const user = await PortalUser.findById(req.session.portalUserId);

    const validCurrent = user.passwordHash &&
        await bcrypt.compare(currentPassword || "", user.passwordHash);

    if (!validCurrent) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("Current password is incorrect.")}`
        );
    }

    if (!normalizedEmail) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("Please enter a new email address.")}`
        );
    }

    if (normalizedEmail === user.email) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("That's already your current email.")}`
        );
    }

    const existing = await PortalUser.findOne({ email: normalizedEmail });

    if (existing) {
        return res.redirect(
            `/client-dashboard/profile?error=${encodeURIComponent("That email is already in use.")}`
        );
    }

    const oldEmail = user.email;
    user.email = normalizedEmail;
    await user.save();

    // Sent to the OLD address on purpose — if this change wasn't the real
    // account owner's doing, the new address is the one that shouldn't be
    // trusted with that notice.
    try {
        await sendEmail({
            to: oldEmail,
            subject: "Your login email was changed",
            html: emailChangedEmail(user.preferredName || user.firstName, normalizedEmail)
        });
    } catch (err) {
        console.error("Failed to send email-changed confirmation:", err);
    }

    res.redirect("/client-dashboard/profile?success=email");
};

// --------------------------------------------
// Profile: notification preferences
// --------------------------------------------

exports.postUpdateNotificationPreferences = async (req, res) => {

    await PortalUser.findByIdAndUpdate(
        req.session.portalUserId,
        {
            notificationPreferences: {
                sessionReminders: req.body.sessionReminders === "on",
                sessionNotesPosted: req.body.sessionNotesPosted === "on",
                newToolAdded: req.body.newToolAdded === "on",
                testimonialReviewed: req.body.testimonialReviewed === "on"
            }
        }
    );

    res.redirect("/client-dashboard/profile?success=notifications");
};

exports.getDashboardSessions = async (req, res) => {

    const user = await PortalUser.findById(
        req.session.portalUserId
    );

    // "scheduling" and "scheduling-failed" used to be left out of this
    // filter — the client's Sessions page had no way to show "we're
    // scheduling" or "retry" UI, since this query just returned null for
    // those containers. Also sorted now, since a client can have more than
    // one container over time.
    const container = await CoachingContainer.findOne({

        user: user._id,

        status: {
            $in: [
                "awaiting-slot",
                "active",
                "paused",
                "scheduling",
                "scheduling-failed"
            ]
        }
    }).sort({ createdAt: -1 });

    let sessions = [];

    if (container && container.status === "active") {

        const email = user.email;

        const bookings =
            await calService.getBookingsByEmail(email);

        sessions = bookings
            .filter(
                booking =>
                    calService.belongsToContainer(booking, container)
            )

            .sort(
                (a, b) =>
                    new Date(a.start) -
                    new Date(b.start)
            )

            .map((booking, index) => ({

                sessionNumber: index + 1,

                bookingUid: booking.uid,

                ...booking

            }));
    }

    

    res.render("client-dashboard/sessions", {

        container,

        sessions
    });
};

exports.saveWheelOfLife = async (req, res) => {
    try {

        const { wheelResults } = req.body;

        if (!wheelResults) {
            return res.status(400).json({
                error: "Wheel results are required."
            });
        }

        await PortalUser.findByIdAndUpdate(
            req.session.portalUserId,
            {
                $push: {
                    wheelOfLifeHistory: {
                        results: wheelResults
                    }
                }
            }
        );

        return res.json({
            success: true,
            message: "Wheel of Life saved successfully."
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error: "Unable to save your Wheel of Life. Please try again."
        });
    }
};


exports.getSessionWorksheet = async (req, res) => {

    const bookingUid = req.params.bookingUid;
    const sessionStatus = req.params.status;

    const allowed = await verifyBookingOwnership(
        req.session.portalUserId,
        bookingUid
    );

    if (!allowed) {
        return res.sendStatus(403);
    }

    let sessionResource =
        await SessionResource.findOne({
            bookingUid
        }).populate("resource");

    if (!sessionResource) {
        sessionResource = { answers: null, completed: false };
    }

    if (!sessionResource.resource) {

        const resource =
            await Resource.findOne({
                type: "worksheet",
                category: "pre-session",
                active: true
            });


        if (!resource) {
            return res.status(404)
                .send("Preparation worksheet not found");
        }

        sessionResource.resource = resource;
    }

    res.render(
        "client-dashboard/session-worksheet",
        {
            bookingUid: bookingUid,

            resource: sessionResource.resource,

            answers: sessionResource.answers,

            completed: sessionResource.completed,

            status: sessionStatus,
            isAdmin: false,
            editing: req.query.edit === "true"
        }
    );
};

exports.getSessionNotes = async (req, res) => {

    const bookingUid = req.params.bookingUid;

    const start = req.params.start;

    const allowed = await verifyBookingOwnership(
        req.session.portalUserId,
        bookingUid
    );

    if (!allowed) {
        return res.sendStatus(403);
    }

    const sessionResource = await SessionResource.findOne({
        bookingUid
    });

    if (!sessionResource) {
        return res.status(404).send("Session resource not found");
    }

    res.render("client-dashboard/session-notes", {
        notes: sessionResource.notes || { sections: [] },
        start: start
    });
};

exports.submitSessionWorksheet = async (req, res) => {


    const bookingUid = req.params.bookingUid;

    const allowed = await verifyBookingOwnership(
        req.session.portalUserId,
        bookingUid
    );

    if (!allowed) {
        return res.sendStatus(403);
    }

    const sessionResource =
        await SessionResource.findOne({
            bookingUid
        });

    if (!sessionResource) {
        return res.status(404)
            .send("Worksheet not found");
    }

    sessionResource.answers =
        new Map(
            Object.entries(req.body)
        );

    sessionResource.completed = true;

    sessionResource.completedAt =
        new Date();

    await sessionResource.save();

    res.redirect(
        `/client-dashboard/sessions`
    );
};

// The categories that actually belong on the Resources tab — see
// models/resources.js for what each of the 7 categories is for and where
// it shows up instead. "pre-session" lives on the Sessions tab (attached to
// a specific booking); "progress"/"continuity" live in their own dashboard
// sections (see getDashboard) — none of the three are general-purpose
// things a client should be browsing to here.
const RESOURCES_TAB_CATEGORIES = ["exercises", "onboarding", "worksheets", "reference-lists"];

exports.getResources = async (req, res) => {

    const resources = await Resource.find({
        active: true,
        category: { $in: RESOURCES_TAB_CATEGORIES }
    }).sort({
        category: 1,
        display_order: 1
    });

    const user = await PortalUser.findById(req.session.portalUserId);

    const userResources = new Map();

    // resourceId isn't required in the schema — skip any entry missing one
    // rather than throwing (adminController.clientProfile already guards
    // the same way for the same reason).
    user.resources
        .filter(r => r.resourceId)
        .forEach(r => {
            userResources.set(r.resourceId.toString(), r);
        });

    res.render("client-dashboard/resources", {
        resources,
        userResources
    });
};


exports.getResource = async (req, res) => {

    // Same exclusion as getResources — a client landing here directly
    // (e.g. an old bookmark) for the pre-session worksheet's slug should
    // get the same 404 they'd get for any resource that isn't meant for
    // them, not the generic resource-viewer template standing in for the
    // dedicated session-worksheet page it's actually meant to appear on.
    const resource = await Resource.findOne({
        slug: req.params.slug,
        active: true,
        category: { $ne: "pre-session" }
    });

    if (!resource) {
        return res.sendStatus(404);
    }

    const user = await PortalUser.findById(req.session.portalUserId);

    if (!user) {
        return res.redirect("/login");
    }


    const userResource = findUserResourceEntry(user.resources, resource._id);

    res.render("client-dashboard/resource", {
        resource,
        userResource,
        isAdmin: false,
        editing: req.query.edit === "true"
    });
};

exports.updateResources = async (req, res) => {

    const resource = await Resource.findOne({
        slug: req.params.slug,
        active: true
    });

    if (!resource) {
        return res.sendStatus(404);
    }

    const user = await PortalUser.findById(req.session.portalUserId);

    let userResource = findUserResourceEntry(user.resources, resource._id);

    if (!userResource) {

        user.resources.push({
            resourceId: resource._id,
            completed: true,
            completedAt: new Date(),
            answers: req.body
        });

    } else {

        userResource.completed = true;
        userResource.completedAt = new Date();
        userResource.answers = req.body;

    }

    await user.save();

    res.redirect(`/client-dashboard/resources/${resource.slug}`);

};

exports.requestResource = async (req, res) => {
    const resource = await Resource.findOne({
        slug: req.params.slug,
        active: true
    });

    if (!resource) {
        return res.sendStatus(404);
    }

    const user = await PortalUser.findById(req.session.portalUserId);

    let userResource = findUserResourceEntry(user.resources, resource._id);

    if (!userResource) {

        user.resources.push({
            resourceId: resource._id,
            requested: true
        });

    } else {

        userResource.requested = true;

    }

    await user.save();

    await notify("tool-access-requested", {
        subject: `Tool access requested: ${resource.title}`,
        html: toolAccessRequestedEmail(
            user.preferredName || user.firstName,
            resource.title,
            `${process.env.BASE_URL}/admin/clients/${user._id}`
        )
    });

    res.redirect(`/client-dashboard/resources/${resource.slug}`);

};

// Tools requested in the context of one specific session (distinct from
// the resource-library request above, which isn't tied to any session).
exports.getSessionTools = async (req, res) => {

    const { bookingUid, status } = req.params;

    const allowed = await verifyBookingOwnership(req.session.portalUserId, bookingUid);

    if (!allowed) {
        return res.sendStatus(403);
    }

    let sessionResource = await SessionResource.findOne({ bookingUid })
        .populate("tools.resource");

    if (!sessionResource) {
        sessionResource = await SessionResource.create({ bookingUid, answers: {} });
    }

    const user = await PortalUser.findById(req.session.portalUserId);

    const requestedTools = sessionResource.tools
        .filter(t => t.resource)
        .map(t => ({
            resource: t.resource,
            requestedAt: t.requestedAt,
            unlocked: !!findUserResourceEntry(user.resources, t.resource._id)?.unlocked
        }));

    const requestedResourceIds = new Set(requestedTools.map(t => t.resource._id.toString()));

    // Only upcoming sessions can request a new tool — a past session's page
    // is a read-only record of what was asked for.
    const availableResources = status === "upcoming"
        ? await Resource.find({
            type: "tool",
            active: true,
            _id: { $nin: [...requestedResourceIds] }
        })
        : [];

    res.render("client-dashboard/session-tools", {
        bookingUid,
        status,
        requestedTools,
        availableResources
    });
};

exports.requestSessionTool = async (req, res) => {

    const { bookingUid } = req.params;
    const { resourceId } = req.body;

    const allowed = await verifyBookingOwnership(req.session.portalUserId, bookingUid);

    if (!allowed) {
        return res.sendStatus(403);
    }

    const resource = await Resource.findOne({
        _id: resourceId,
        type: "tool",
        active: true
    });

    if (!resource) {
        return res.sendStatus(404);
    }

    let sessionResource = await SessionResource.findOne({ bookingUid });

    if (!sessionResource) {
        sessionResource = await SessionResource.create({ bookingUid, answers: {} });
    }

    const alreadyRequested = sessionResource.tools.some(t =>
        t.resource && t.resource.toString() === resource._id.toString()
    );

    if (!alreadyRequested) {

        sessionResource.tools.push({ resource: resource._id, requestedAt: new Date() });
        await sessionResource.save();

        const user = await PortalUser.findById(req.session.portalUserId);

        await notify("session-tool-requested", {
            subject: `Tool requested for a session: ${resource.title}`,
            html: toolAccessRequestedEmail(
                user.preferredName || user.firstName,
                resource.title,
                `${process.env.BASE_URL}/admin/clients/${user._id}`
            )
        });
    }

    res.redirect(`/client-dashboard/sessions/${bookingUid}/upcoming/tools`);
};

exports.getWheelofLife = async (req, res) => {
    try {

        const user = await PortalUser.findById(req.session.portalUserId);

        if (!user) {
            return res.redirect("/login");
        }

        const latestWheel =
            user.wheelOfLifeHistory?.[user.wheelOfLifeHistory.length - 1];


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
            adminView: false,
        });


    } catch (err) {

        console.error(err);

        res.status(500).send("Server error");

    }

};

exports.getBookedSessions = async (req, res) => {

    // Same slot picker either way — reusing it for a reschedule just means
    // looking up a container that already has a schedule instead of one
    // still waiting for its first.
    const isReschedule = req.query.reschedule === "true";

    const container = await findCurrentContainer(req.session.portalUserId, {
        statuses: isReschedule ? RESCHEDULABLE_STATUSES : "awaiting-slot"
    });

    if (!container) {
        return res.redirect("/client-dashboard/sessions");
    }


    const start = new Date();

    start.setDate(start.getDate() + 2);


    const end = new Date(start);

    end.setDate(
        end.getDate() +
        (container.sessionCount * 7) +
        14
    );


    const slotsResponse =
        await calService.getRecurringAvailableSlots({

            eventTypeId:
                container.eventTypeId,

            start:
                start.toISOString(),

            end:
                end.toISOString(),

            sessionCount:
                container.sessionCount,

            // The slots Cal.com returns (which ones exist, and how their
            // times are labeled) are computed relative to this timezone —
            // use the client's own if they sent one (see sessions.ejs),
            // otherwise fall back to the business's.
            timezone:
                resolveTimezone(req.query.tz)

        });


    const weekdayOrder = [

        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"

    ];


    const slotGroups =
        weekdayOrder
            .filter(day =>
                slotsResponse.some(
                    slot => slot.day === day
                )
            )
            .map(day => ({

                weekday: day,

                slots: slotsResponse
                    .filter(
                        slot => slot.day === day
                    )
                    .map(slot => ({

                        label: slot.time,

                        value: JSON.stringify({
                            weekday: WEEKDAY_NUMBERS[day],
                            time: slot.time
                        }),

                        starts: slot.slots

                    }))

            }));// res.render("client-dashboard/select-slots", { slots });

    res.render(
        "client-dashboard/select-slot",
        {
            slotGroups,
            isReschedule
        }
    );

};

exports.bookSessions = async (req, res) => {

    const {
        slot,
        firstSession,
        reschedule,
        timezone
    } = req.body;

    const isReschedule = reschedule === "true";

    if (!slot) {
        return res.status(400)
            .send("Please select a coaching time");
    }


    if (!firstSession) {
        return res.status(400)
            .send("Please select your first session date");
    }

    let selectedSlot;

    try {

        selectedSlot = JSON.parse(slot);

    } catch (error) {

        return res.status(400)
            .send("Invalid slot selection");

    }



    const container =
        await findCurrentContainer(req.session.portalUserId, {
            statuses: isReschedule ? RESCHEDULABLE_STATUSES : "awaiting-slot"
        });



    if (!container) {

        return res.status(404)
            .send("No pending coaching container found");

    }



    const startDate =
        new Date(firstSession);



    if (isNaN(startDate)) {

        return res.status(400)
            .send("Invalid start date");

    }



    const user =
        await PortalUser.findById(
            req.session.portalUserId
        );

    // Reusing the exact same slot-pick logic above (find the container,
    // validate the chosen weekday/time/date) — this branch only exists
    // because a reschedule additionally has to clear out the sessions that
    // were booked under the old timeslot before generating new ones.
    let bookingOptions = {};

    if (isReschedule) {

        const bookings = await calService.getBookingsByEmail(user.email);

        const containerBookings = bookings.filter(
            b => calService.belongsToContainer(b, container)
        );

        const now = new Date();

        const pastBookings = containerBookings.filter(b => new Date(b.start) < now);
        const futureBookings = containerBookings.filter(b => new Date(b.start) >= now);

        for (const booking of futureBookings) {

            try {
                await calService.cancelBooking(booking.uid);
            } catch (error) {
                console.error(`Failed to cancel booking ${booking.uid} during reschedule:`, error);
            }

        }

        // Past sessions already happened and aren't touched — the new
        // cadence picks up right where they left off, numbering-wise.
        container.scheduling.completed = pastBookings.length;

        // The new cadence starts fresh at the newly chosen date, not
        // startIndex weeks after it.
        bookingOptions = {
            startIndex: pastBookings.length,
            dateOffsetWeeks: 0
        };

    }

    container.recurringWeekday =
        selectedSlot.weekday;



    container.recurringTime =
        selectedSlot.time;



    // Sent by select-slot.ejs via Intl.DateTimeFormat in the client's own
    // browser at submission time — more reliable than trusting the ?tz=
    // this page itself was reached with, and this is what session-reminder
    // emails are sent in later (see sessionReminders.js), since there's no
    // browser there to ask.
    container.timezone =
        resolveTimezone(timezone);



    container.startedAt =
        startDate;


    await container.save();



    await calService.generateContainerBookings({

        container,

        user,

        ...bookingOptions

    });



    res.redirect(
        "/client-dashboard/sessions"
    );

};

exports.retrySessionScheduling = async (req, res) => {

    const container = await findCurrentContainer(req.session.portalUserId, {
        statuses: "scheduling-failed"
    });

    if (!container) {
        return res.redirect("/client-dashboard/sessions");
    }

    const user = await PortalUser.findById(req.session.portalUserId);

    await calService.generateContainerBookings({
        container,
        user,
        // Resume after the sessions that already succeeded instead of
        // rebooking from the start of the container.
        startIndex: container.scheduling.completed || 0
    });

    res.redirect("/client-dashboard/sessions");

};

wrapControllerExports(exports);
