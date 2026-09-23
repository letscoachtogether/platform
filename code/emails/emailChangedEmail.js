const site = require("../config/site");
const { layout, paragraph } = require("./emailLayout");

module.exports = function emailChangedEmail(name, newEmail) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph(`This confirms the login email on your ${site.businessName} portal account was changed to <strong>${newEmail}</strong>.`)}
        ${paragraph("If you made this change, no action is needed. If you didn't, please reply to this email right away.")}
    `;

    return layout({
        title: "Your Login Email Was Changed",
        body
    });
};
