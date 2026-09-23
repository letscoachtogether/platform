const mongoose = require("mongoose");

const PortalUserSchema = new mongoose.Schema(
  {
    // Authentication
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      default: null,
    },

    // Profile
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    preferredName: {
      type: String,
      required: false,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    pronouns: {
      type: String,
      required: false,
      trim: true,
    },

    // Portal
    lastLogin: Date,

    emailVerified: {
      type: Boolean,
      default: false,
    },

    verificationCodeHash: {
      type: String,
      default: null
    },

    verificationExpires: {
      type: Date,
      default: null
    },

    // Password reset. Only a SHA-256 hash of the raw token is stored (not
    // bcrypt) — the token itself is a high-entropy random value, not a
    // guessable password, so a fast deterministic hash is fine, and it lets
    // the reset link be looked up directly instead of comparing against
    // every user.
    resetPasswordTokenHash: {
      type: String,
      default: null
    },

    resetPasswordExpires: {
      type: Date,
      default: null
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    wheelOfLifeHistory: [
      {
        completedAt: {
          type: Date,
          default: Date.now
        },
        results: [
          {
            name: String,
            value: Number,
            color: String
          }
        ]
      }
    ],

    valuesExercise: {
      selectedValues: {
        type: [String],
        default: []
      },

      categories: {
        category1: {
          type: [String],
          default: []
        },

        category2: {
          type: [String],
          default: []
        },

        category3: {
          type: [String],
          default: []
        }
      },

      coreValues: {
        category1: {
          type: String,
          default: null
        },

        category2: {
          type: String,
          default: null
        },

        category3: {
          type: String,
          default: null
        }
      },

      completed: {
        type: Boolean,
        default: false
      },

      completedAt: {
        type: Date,
        default: null
      },

      updatedAt: {
        type: Date,
        default: Date.now
      }
    },

    agreementAcceptances: [{
      version: {
        type: String,
        required: true
      },
      acceptedAt: {
        type: Date,
        required: true
      },
      ipAddress: {
        type: String
      },
      userAgent: {
        type: String
      }
    }],

    resources: [{
      resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resource"
      },

      unlocked: {
        type: Boolean,
        default: false
      },

      requested: {
        type: Boolean,
        default: false
      },

      completed: {
        type: Boolean,
        default: false
      },

      answers: {
        type: Map,
        of: String
      },

      completedAt: Date
    }],

    role: {
      type: String,
      enum: [
        "client",
        "admin"
      ],
      default: "client"
    },

    // Per-client opt-in/out for the emails this platform sends them. Small,
    // bounded, and scoped to this one person — same reasoning as
    // valuesExercise above, unlike SessionResource's unbounded per-booking
    // data. Checked by controllers/clientNotificationService.js before
    // sending any of these; defaults are all "on" so existing clients start
    // subscribed rather than silently missing emails until they visit their
    // profile.
    notificationPreferences: {
      sessionReminders: {
        type: Boolean,
        default: true
      },

      sessionNotesPosted: {
        type: Boolean,
        default: true
      },

      newToolAdded: {
        type: Boolean,
        default: true
      },

      testimonialReviewed: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true,
  }
);

// An account created by createAccount() but never verified is unusable —
// verifyCode() rejects any code once verificationExpires has passed, and
// there is no "resend code" flow, so a signup nobody comes back to finish
// would otherwise sit here forever as a phantom document (and permanently
// block that email from signing up again, since email is unique). verifyCode
// clears this field ($unset) on success, so MongoDB's TTL monitor only ever
// removes documents that are still unverified and past their code's expiry —
// a verified account has no verificationExpires value and is never touched.
PortalUserSchema.index(
  { verificationExpires: 1 },
  { expireAfterSeconds: 0 }
);

// Password reset is a direct token lookup (postForgotPassword/getResetPassword
// query by this field, not by user id) — index it the same way email is.
PortalUserSchema.index(
  { resetPasswordTokenHash: 1 },
  { sparse: true }
);

module.exports = mongoose.model("PortalUser", PortalUserSchema);
