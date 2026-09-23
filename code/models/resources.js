const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },

    question: {
        type: String,
        required: true
    },

    type: {
        type: String,
        enum: ["text", "textarea"],
        default: "textarea"
    },

    placeholder: String,

    required: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const resourceSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true
    },

    slug: {
        type: String,
        required: true,
        unique: true
    },

    // Determines where a resource shows up, not what format it's in (see
    // `type` below for that) — each value maps to exactly one place in the
    // app (see dashboardController.js's getResources/getResource/
    // getDashboard, and views/client-dashboard/main.ejs):
    //   pre-session     — Sessions tab, attached to each individual session
    //   exercises       — Resources tab
    //   onboarding      — Resources tab, and also the dashboard's "Finish
    //                      Onboarding" checklist until the client completes it
    //   worksheets      — Resources tab
    //   reference-lists — Resources tab
    //   progress        — dashboard, "Your Coaching Journey" section
    //   continuity      — dashboard, "Share & Explore" section
    category: {
        type: String,
        enum: [
            "pre-session",
            "exercises",
            "onboarding",
            "worksheets",
            "reference-lists",
            "progress",
            "continuity"
        ],
        required: true
    },

    type: {
        type: String,
        enum: [
            "tool",
            "worksheet",
            "list"
        ],
        required: true
    },

    summary: String,

    content: String,

    listItems: [String],

    questions: [questionSchema],

    active: {
        type: Boolean,
        default: true
    },
    sections: [
        {
            title: String,
            items: [String]
        }
    ],
    
    display_order: Number

}, {
    timestamps: true
});

module.exports = mongoose.model("Resource", resourceSchema);