const { layout, paragraph, button } = require("./emailLayout");

module.exports = function newToolAddedEmail(name, resourceTitle) {

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph(`A new tool is available: <strong>${resourceTitle}</strong>. Request access from your dashboard and your coach will unlock it for you.`)}
        ${button(`${process.env.BASE_URL}/client-dashboard/resources`, "Request Access")}
    `;

    return layout({
        title: "A New Tool Is Available",
        body,
        unsubscribeNote: true
    });
};
