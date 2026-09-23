const mongoose = require("mongoose");

const testimonialQuestionSchema = new mongoose.Schema({

    question: {
        type: String,
        required: true
    },

    // Controls display order on the client testimonial form (ascending).
    order: {
        type: Number,
        default: 0
    },

    active: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("TestimonialQuestion", testimonialQuestionSchema);
