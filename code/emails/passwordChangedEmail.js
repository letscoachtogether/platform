const site = require("../config/site");
const { layout, paragraph } = require("./emailLayout");

module.exports = function passwordChangedEmail(name) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph(`This confirms your ${site.businessName} portal password was just changed.`)}
        ${paragraph("If you made this change, no action is needed. If you didn't, please reply to this email right away.")}
    `;

    return layout({
        title: "Your Password Was Changed",
        body
    });
};
