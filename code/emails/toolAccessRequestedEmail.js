const { layout, fact, button } = require("./emailLayout");

module.exports = function toolAccessRequestedEmail(clientName, resourceTitle, adminUrl) {

    const body = `
        ${fact("Client", clientName)}
        ${fact("Tool", resourceTitle)}
        ${button(adminUrl, "Review & Unlock")}
    `;

    return layout({
        title: "Tool Access Requested",
        body,
        signOff: false
    });
};
