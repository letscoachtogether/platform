const mongoose = require("mongoose");

// One row per notification event type. `key` is the stable identifier code
// uses to look a setting up (see controllers/notificationService.js);
// everything else here is what the admin can edit at /admin/notifications.
const notificationSettingSchema = new mongoose.Schema({

    key: {
        type: String,
        required: true,
        unique: true
    },

    label: {
        type: String,
        required: true
    },

    description: {
        type: String
    },

    enabled: {
        type: Boolean,
        default: true
    },

    recipientEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("NotificationSetting", notificationSettingSchema);
