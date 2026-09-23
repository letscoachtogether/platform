const mongoose = require("mongoose");

// A lead a client sends in from their dashboard during offboarding — not
// published anywhere, just surfaced to admins at /admin/referrals to follow
// up on.
const referralSchema = new mongoose.Schema({

    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PortalUser",
        required: true
    },

    friendName: {
        type: String,
        required: true
    },

    friendEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },

    note: {
        type: String
    }

}, {
    timestamps: true
});

// getReferralPage (dashboardController.js) looks up a client's own
// referrals by this field on every visit to their referral tab.
referralSchema.index({ submittedBy: 1 });

module.exports = mongoose.model("Referral", referralSchema);
