const mongoose = require("mongoose");

// A snapshot of one question+answer at the time the client submitted it, so
// the review page still reads correctly even if that question is later
// edited or removed from TestimonialQuestion.
const answerSnapshotSchema = new mongoose.Schema({

    question: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TestimonialQuestion"
    },

    questionText: {
        type: String,
        required: true
    },

    answer: {
        type: String,
        required: true
    }

}, { _id: false });

// The intermediary between a client's dashboard submission and what
// actually appears on the homepage (Testimonial). Nothing here is ever
// shown publicly — an admin has to review it and explicitly publish
// (see adminController.approveTestimonialSubmission) before it becomes a
// live Testimonial.
const testimonialSubmissionSchema = new mongoose.Schema({

    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PortalUser",
        required: true
    },

    name: {
        type: String,
        required: true
    },

    answers: [answerSnapshotSchema],

    // Auto-composed from `answers`, then editable by the admin on the
    // review page before it's published as Testimonial.testimonialText.
    draftText: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    // Set once approved. Re-approving an edited resubmission updates this
    // same Testimonial rather than creating a duplicate.
    publishedTestimonial: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Testimonial"
    },

    reviewedAt: Date

}, {
    timestamps: true
});

// submitTestimonial (dashboardController.js) looks up "does this client
// already have a submission" by this field on every visit to their
// testimonial tab.
testimonialSubmissionSchema.index({ submittedBy: 1 });

module.exports = mongoose.model("TestimonialSubmission", testimonialSubmissionSchema);
