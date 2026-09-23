const mongoose = require("mongoose");


const sessionResourceSchema = new mongoose.Schema({

    bookingUid: {
        type: String,
        required: true,
        unique: true
    },


    resource: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resource",
        required: false
    },


    answers: {
        type: Map,
        of: String,
        default: {}
    },


    completed: {
        type: Boolean,
        default: false
    },


    completedAt: Date,


    // Tools a client asked for in the context of this specific session
    // (distinct from PortalUser.resources[], which tracks resource-library
    // access generally, not tied to any one session). Granting one still
    // goes through the same PortalUser.resources[].unlocked mechanism —
    // this is just where the request itself, and its session context, live.
    tools: [
        {
            resource: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Resource"
            },

            requestedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],


    notes: {

        sections: [
            {
                title: String,
                items: [String]
            }
        ],

        updatedAt: Date

    },

    // Set once the "your session is coming up" reminder has gone out for
    // this booking (see code/scripts/sessionReminders.js) — a dedupe flag,
    // not a schedule. This is the natural place for it: it's a one-time
    // fact about this specific appointment, same scope as everything else
    // on this record.
    reminderSentAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});


module.exports = mongoose.model(
    "SessionResource",
    sessionResourceSchema
);