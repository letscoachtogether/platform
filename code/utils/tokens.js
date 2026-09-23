const crypto = require("crypto");

// Only a SHA-256 hash of a raw token is ever stored — the token itself is a
// high-entropy random value, not a guessable password, so a fast
// deterministic hash is fine, and it lets a reset/setup link be looked up
// directly instead of comparing against every user. Shared by
// accountController.js (forgot-password) and adminController.js
// (admin-created client account setup) so both stay consistent.
function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { hashResetToken };
