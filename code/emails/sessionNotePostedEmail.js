const { layout, paragraph, button } = require("./emailLayout");

module.exports = function sessionNotePostedEmail(name) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph("Notes from your coaching session have been posted to your dashboard.")}
        ${button(`${process.env.BASE_URL}/client-dashboard/sessions`, "View Your Sessions")}
    `;

    return layout({
        title: "New Session Notes Available",
        body,
        unsubscribeNote: true
    });
};
