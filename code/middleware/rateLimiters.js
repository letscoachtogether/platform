const rateLimit = require("express-rate-limit");

// Login and account-creation are brute-forceable (login: password guessing;
// verify-code: only 1,000,000 six-digit codes). Cap attempts per IP.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." }
});

const verifyCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." }
});

const resendVerificationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." }
});

module.exports = {
    authLimiter,
    verifyCodeLimiter,
    resendVerificationLimiter
};
