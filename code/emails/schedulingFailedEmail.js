const { layout, paragraph, fact, button } = require("./emailLayout");

module.exports = function schedulingFailedEmail(clientName, clientEmail, error) {

    const body = `
        ${paragraph("A client's coaching sessions couldn't be automatically scheduled and need attention.", { lead: true })}
        ${fact("Client", `${clientName} (${clientEmail})`)}
        ${fact("Error", error || "Unknown error")}
        ${button(`${process.env.BASE_URL}/admin/clients`, "View Clients")}
    `;

    return layout({
        title: "Session Scheduling Failed",
        body,
        signOff: false
    });
};
