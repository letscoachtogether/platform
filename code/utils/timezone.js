// The business's own operating timezone — used as the fallback whenever a
// client-specific one isn't available (a container from before this was
// tracked, an invalid/missing value, or a context with no client browser to
// ask at all, like a server-generated email). Shared by dashboardController
// (deciding which slots to show) and sessionReminders (deciding what time
// to put in the reminder email), so the two can't drift out of sync.
const BUSINESS_TIMEZONE = "America/Los_Angeles";

// Validates a client-supplied IANA timezone (e.g. from Intl.DateTimeFormat
// in the browser) and falls back to BUSINESS_TIMEZONE if it's missing or
// not a real one — Intl.DateTimeFormat throws on an invalid zone name,
// which is the only real way to validate one without a lookup table.
function resolveTimezone(candidate) {
    if (!candidate) return BUSINESS_TIMEZONE;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: candidate });
        return candidate;
    } catch (err) {
        return BUSINESS_TIMEZONE;
    }
}

module.exports = { BUSINESS_TIMEZONE, resolveTimezone };
