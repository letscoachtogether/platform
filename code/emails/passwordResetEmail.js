const site = require("../config/site");
const { layout, paragraph, button } = require("./emailLayout");

module.exports = function passwordResetEmail(name, resetUrl) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph(`We received a request to reset the password on your ${site.businessName} account.`)}
        ${paragraph("Click the button below to choose a new password.")}
        ${button(resetUrl, "Reset My Password")}
        ${paragraph("For your security, this link will expire in 1 hour.", { muted: true })}
        ${paragraph("If you didn't request a password reset, you can safely ignore this email — your password won't be changed.", { muted: true })}
    `;

    return layout({
        title: "Reset Your Password",
        subtitle: "Let's get you back into your coaching portal.",
        body
    });
};
