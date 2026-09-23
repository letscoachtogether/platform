const { layout, fact } = require("./emailLayout");

module.exports = function newClientSignupEmail(name, email) {

    const body = `
        ${fact("Name", name)}
        ${fact("Email", email)}
    `;

    return layout({
        title: "New Client Portal Signup",
        body,
        signOff: false
    });
};
