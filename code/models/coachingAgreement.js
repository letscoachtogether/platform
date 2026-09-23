const mongoose = require("mongoose");
const CoachingAgreementSchema = new mongoose.Schema({

    version: {
        type: String,
        required: true,
        unique: true
    },

    active: {
        type: Boolean,
        default: true
    },

    sections: [{
        title: String,
        content: String
    }],

    createdAt: {
        type: Date,
        default: Date.now
    }

});
module.exports = mongoose.model(
    "Agreement",
    CoachingAgreementSchema
);