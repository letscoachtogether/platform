const { csrfSync } = require("csrf-sync");

const {
    csrfSynchronisedProtection,
    generateToken
} = csrfSync({
    // Accept the token from a hidden form field (server-rendered <form> posts)
    // or from a header (fetch/AJAX calls). Both are compared against the
    // per-session token stored server-side, so this fallthrough is safe here
    // (unlike the double-submit-cookie pattern, where it would not be).
    getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.headers["x-csrf-token"]
});

// Generates (or reuses) the current session's CSRF token and exposes it to
// views/client JS as res.locals.csrfToken. Mount this only on routes that
// render forms or accept mutating requests, since it writes to req.session
// and will start a session for the visitor if one doesn't exist yet.
function attachCsrfToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
}

module.exports = {
    csrfProtection: csrfSynchronisedProtection,
    attachCsrfToken
};
