const mongoose = require("mongoose");


const coachingContainerSchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PortalUser",
        required: true
    },

    name: String,

    // These two were being written by stripeController.js but were never
    // actually declared here — Mongoose's default strict mode silently
    // dropped both on every save. That meant a container could never be
    // traced back to its offering, and the webhook's duplicate-checkout
    // guard (which queries by stripeCheckoutSessionId) could never match,
    // so a retried webhook delivery could create a second container for
    // the same payment.
    offering: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "offerings"
    },

    stripeCheckoutSessionId: String,

    // Subscription-mode offerings only. Identifies which container a
    // renewal invoice belongs to, and de-dupes renewal processing if
    // Stripe redelivers the same invoice.paid event.
    stripeSubscriptionId: String,
    lastProcessedInvoiceId: String,

    // Set when a client (or admin) requests cancellation while still
    // outside the offering's cancellationNoticeDays window — Stripe's
    // subscription is told to stop immediately (cancel_at_period_end),
    // nothing further needed. This flag is only for the opposite case:
    // the request came in *within* the notice window, so one more charge
    // is unavoidable — true here means "cancel it for real, but only once
    // the next invoice.paid renewal actually lands" (see stripeController.js's
    // webhook handler), rather than stopping the already-in-flight cycle
    // the client was warned they'd still be billed for.
    pendingCancellation: {
        type: Boolean,
        default: false
    },

    cancellationRequestedAt: Date,

    cancellationRequestedBy: {
        type: String,
        enum: ["client", "admin"]
    },

    status: {
        type: String,
        enum: [
            "awaiting-slot",
            "active",
            "paused",
            "completed",
            "scheduling",
            "scheduling-failed"
        ],
        default: "awaiting-slot"
    },

    scheduling: {
        completed: {
            type: Number,
            default: 0
        },
        failedAt: Date,
        error: String
    },

    // Sessions per billing period (matches Offering.sessionCount at the
    // time this container was created) — the cadence, not a running total.
    sessionCount: {
        type: Number,
        required: true
    },

    // How many sessions this container is currently entitled to have
    // scheduled, cumulative across periods. For a one-time offering this
    // is set once and equals sessionCount. For a subscription it starts at
    // sessionCount and increases by sessionCount on every renewal
    // (invoice.paid with billing_reason "subscription_cycle") — that's
    // what actually gates how many bookings generateContainerBookings
    // (cal.js) will create.
    //
    // Not required/defaulted here on purpose: containers created before
    // this field existed don't have it, and every place that reads it
    // falls back to sessionCount, so leaving it optional avoids a
    // validation error the next time an old container is saved.
    sessionsGranted: Number,

    startedAt: Date,

    eventTypeId: {
        type: Number,
        required: true
    },


    recurringWeekday: {
        type: Number,
        min: 0,
        max: 6
    },

    recurringTime: String,

    // The client's own IANA timezone (e.g. "America/New_York"), captured
    // from their browser at the moment they picked recurringWeekday/
    // recurringTime — recurringTime alone is ambiguous without it. Also
    // what session-reminder emails are sent in, since there's no browser
    // there to detect it client-side the way the dashboard itself does.
    // Optional: containers from before this existed just fall back to
    // BUSINESS_TIMEZONE (see utils/timezone.js) wherever it's read.
    timezone: String,

    // Shared, editable roadmap for this engagement — goals plus a
    // per-session breakdown. Both the client (their own container) and the
    // admin can edit it; whoever saved last wins, with updatedBy/updatedAt
    // just for visibility into that, not real conflict resolution.
    roadmap: {

        goals: {
            type: String,
            default: ""
        },

        sessions: [{
            title: {
                type: String,
                default: ""
            },
            // Set going into the session (the plan).
            agenda: {
                type: String,
                default: ""
            },
            // Set coming out of it (the record) — what was actually
            // covered/decided, and what the client's on the hook for
            // before the next one.
            takeaway: {
                type: String,
                default: ""
            },
            followUp: {
                type: String,
                default: ""
            }
        }],

        updatedAt: Date,

        updatedBy: {
            type: String,
            enum: ["client", "admin"]
        }
    }

}, {
    // Needed so a user's containers can be sorted "most recent first" —
    // relevant now that a client can end up with more than one container
    // over time (e.g. via "Add More Sessions").
    timestamps: true
});

// Every admin/dashboard page that shows a client's coaching state queries
// by {user, status} (find their current active/awaiting-slot container).
coachingContainerSchema.index({ user: 1, status: 1 });

// Both are point lookups on every Stripe webhook delivery — the
// checkout.session.completed idempotency check and the invoice.paid
// renewal lookup. sparse because older/one-time-payment containers can
// have stripeSubscriptionId unset; unique because each identifies at most
// one container by design (see the webhook handler's own comments).
coachingContainerSchema.index(
    { stripeCheckoutSessionId: 1 },
    { unique: true, sparse: true }
);

coachingContainerSchema.index(
    { stripeSubscriptionId: 1 },
    { unique: true, sparse: true }
);

module.exports = mongoose.model(
    "CoachingContainer",
    coachingContainerSchema
);
