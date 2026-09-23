const site = require("../config/site");

function renderAgreement(template, offering, client) {

    const data = {
        businessName: site.businessName,

        clientName: `${client.firstName} ${client.lastName}`,
        effectiveDate: new Date().toLocaleDateString(),

        programName: offering.name,
        price: offering.price,
        duration: offering.duration,
        sessionLength: offering.sessionLength,
        sessionCount: offering.sessionCount
    };

    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {

        key = key.trim();

        return data[key] ?? "";

    });

}

module.exports = renderAgreement;