const site = require("../config/site");
const { layout, paragraph, button } = require("./emailLayout");

module.exports = function welcomeClientEmail(name) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph("Welcome to your coaching portal! Your payment is confirmed and your account is ready to go.")}
        ${paragraph("Head to your dashboard to schedule your sessions and finish your onboarding checklist — that's the fastest way to get everything set up before your first session.")}
        ${button(`${process.env.BASE_URL}/client-dashboard/main`, "Go to My Dashboard")}
    `;

    return layout({
        title: `Welcome to ${site.businessName}`,
        subtitle: "Let's get your coaching journey started.",
        body
    });
};
