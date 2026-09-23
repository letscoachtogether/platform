const mongoose = require("mongoose");

const OfferingsSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    description: {
        type: String,
        required: true
    },

    active: {
        type: Boolean,
        default: true
    },

    mode: {
        type: String,
        required: true
    },

    // Availability
    spotsRemaining: {
        type: Number,
        default: 0
    },

    // Program details
    duration: {
        type: String,
        required: true
    },

    sessionCount: {
        type: Number,
        required: true
    },

    sessionLength: {
        type: Number,
        required: true
    },

    // Pricing
    price: {
        type: Number,
        required: true
    },

    bestFor: {
        type: String,
        required: true
    },

    agreement: {

        type: mongoose.Schema.Types.ObjectId,
    
        ref: "Agreement",
    
        required: true
    
    },

    priceId: {
        type: String,
        required: true
    },

    eventTypeId: {
        type: Number,
        required: true
    },

    // Subscription-mode offerings only. How many days before the next
    // billing date a client must cancel to avoid being charged for that
    // upcoming cycle — see cancelSubscription() in stripeController.js.
    // Harmless on a one-time offering (never read there).
    cancellationNoticeDays: {
        type: Number,
        default: 14
    },

}, {
    timestamps: true
});

module.exports = mongoose.model(
    "offerings",
    OfferingsSchema
);