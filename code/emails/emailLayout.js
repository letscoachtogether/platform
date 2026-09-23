// Shared visual shell for every outbound email — the "hero + card + teal
// button" look that used to only exist in a handful of hand-copied
// templates (passwordResetEmail, welcomeSetPasswordEmail) while the rest
// were bare <h2>/<p> with no styling at all. Every email in this directory
// now builds through here instead, so there's exactly one place that
// defines what a site email looks like — not a dozen copies that can each
// drift.

const site = require("../config/site");

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Body copy. `lead` is the slightly larger opening line ("Hi Jane,"),
// `muted` is smaller/greyer supporting text (fine print, expiry notices).
function paragraph(html, { lead = false, muted = false } = {}) {

    const size = lead ? "18px" : "17px";
    const color = muted ? "#6b7280" : "#374151";
    const fontSize = muted ? "16px" : size;

    return `<p style="font-size:${fontSize};line-height:1.8;color:${color};margin-top:0;">${html}</p>`;
}

// A "Label: value" line — the shape every admin-notification email (new
// lead, new signup, new referral, etc.) needs for its at-a-glance facts.
function fact(label, value) {
    return `<p style="font-size:16px;line-height:1.7;color:#374151;margin:6px 0;"><strong>${label}:</strong> ${value}</p>`;
}

function button(url, label) {
    return `
    <div style="text-align:center;margin:40px 0;">
        <a href="${url}" style="display:inline-block;background:#0f766e;color:white;text-decoration:none;padding:16px 28px;border-radius:12px;font-size:16px;font-weight:600;">
            ${label}
        </a>
    </div>`;
}

// The wrapper itself. `signOff` defaults on for client-facing emails
// ("Looking forward to working with you. — ${site.founderName}"); admin-facing
// notifications (new lead, new signup, scheduling failed, etc.) pass
// `signOff: false` since there's no client to sign off to.
const UNSUBSCRIBE_NOTE = `<p style="font-size:14px;line-height:1.7;color:#9ca3af;margin-top:24px;">You can turn these emails off anytime from your dashboard profile.</p>`;

// unsubscribeNote: true adds the standard opt-out line — only for the
// notification types that are actually toggleable in
// notificationPreferences (new tool, session notes, testimonial reviewed,
// session reminders). Security notices (password/email changed) and
// admin-facing notifications never get it, since neither is optional.
function layout({ title, subtitle, body, signOff = true, unsubscribeNote = false }) {

    return `
<div style="background:#f4f7fb;padding:40px 20px;font-family:${FONT};color:#1f2937;">

    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);">

        <!-- HERO -->
        <div style="background:linear-gradient(135deg,#0f766e,#115e59);padding:48px 40px;text-align:center;color:white;">
            <h1 style="margin:0;font-size:36px;line-height:1.2;font-weight:700;">${title}</h1>
            ${subtitle ? `<p style="margin-top:16px;font-size:18px;line-height:1.6;opacity:0.92;">${subtitle}</p>` : ""}
        </div>

        <!-- BODY -->
        <div style="padding:48px 40px;">

            ${body}

            ${unsubscribeNote ? UNSUBSCRIBE_NOTE : ""}

            ${signOff ? `
            <!-- CLOSING -->
            <div style="margin-top:60px;padding-top:30px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:16px;line-height:1.8;">Best,</p>
                <p style="margin-top:32px;font-size:16px;line-height:1.8;">${site.founderName}</p>
            </div>` : ""}

        </div>

    </div>

</div>
`;
}

module.exports = { layout, paragraph, fact, button };
