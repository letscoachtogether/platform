// Shared across accountController.js (signup, reset-password) and
// dashboardController.js (change-password) — kept in one place so the
// server-side rule can never drift from itself between those flows. The
// client-side copy in createAccount.js is a separate, cosmetic pre-check
// only; this is the one that's actually enforced.
const PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

module.exports = { PASSWORD_REGEX };
