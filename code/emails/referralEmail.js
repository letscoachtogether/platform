const { layout, fact } = require("./emailLayout");

module.exports = function referralEmail(clientName, friendName, friendEmail, note) {

    const body = `
        ${fact("From client", clientName)}
        ${fact("Referred", `${friendName} (${friendEmail})`)}
        ${note ? fact("Note", note) : ""}
    `;

    return layout({
        title: "New Referral",
        body,
        signOff: false
    });
};
