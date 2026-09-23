const { Resend } = require("resend");
const site = require("../config/site");

// Constructed lazily — importing this module must never throw just because
// RESEND_API_KEY hasn't been set yet, since this is required unconditionally
// by controllers loaded at boot. See utils/stripeClient.js for the same
// pattern and the reasoning behind it.
let client = null;

function getResendClient() {

    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not set — add it to your environment to send email.");
    }

    if (!client) {
        client = new Resend(process.env.RESEND_API_KEY);
    }

    return client;
}

async function sendEmail({ to, subject, html }) {

    return await getResendClient().emails.send({
        // CONTACT_EMAIL's domain must be verified in Resend (Domains →
        // Add Domain, then the DKIM/SPF records it gives you) before this
        // will actually send — see .env.example.
        from: `${site.founderName} at ${site.businessName} <${site.contactEmail}>`,
        to,
        subject,
        html
    });

}

module.exports = sendEmail;
