const mongoose = require("mongoose");

// The published pool — anything with active:true shows on the homepage
// (see siteController.getHome). Nothing writes here directly from the
// client dashboard; a client's submission only lands here once an admin
// reviews and approves it (see TestimonialSubmission,
// adminController.approveTestimonialSubmission).
const TestimonialSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    testimonialText: {
        type: String,
        required: true
    },

    active: {
        type: Boolean,
        required: true
    },

    // Set when this was published from a client's dashboard submission,
    // rather than typed directly by an admin. Optional — purely for
    // traceability back to the original review.
    sourceSubmission: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TestimonialSubmission"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Testimonial", TestimonialSchema);
