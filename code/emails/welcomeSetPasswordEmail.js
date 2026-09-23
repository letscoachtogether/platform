const site = require("../config/site");
const { layout, paragraph, button } = require("./emailLayout");

module.exports = function welcomeSetPasswordEmail(name, setupUrl) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph("Your coaching portal account has been set up. Click below to choose a password and get started.")}
        ${button(setupUrl, "Set Up My Account")}
        ${paragraph("This link will expire in 7 days. If it expires before you get to it, just let me know and I'll send a new one.", { muted: true })}
    `;

    return layout({
        title: `Welcome to ${site.businessName}`,
        subtitle: "Your client portal account is ready.",
        body
    });
};
