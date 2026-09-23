const { layout, paragraph, fact } = require("./emailLayout");

module.exports = function orphanedRenewalEmail(subscriptionId, invoiceId) {

    const body = `
        ${paragraph("A Stripe subscription renewal charge came in, but no CoachingContainer could be found for it. This client's new billing period isn't reflected anywhere in the portal and needs manual attention.", { lead: true })}
        ${fact("Stripe subscription", subscriptionId)}
        ${fact("Invoice", invoiceId)}
        ${paragraph("Check the Stripe dashboard for this subscription to identify the client, then look up (or recreate) their CoachingContainer.")}
    `;

    return layout({
        title: "Subscription Renewal Has No Matching Container",
        body,
        signOff: false
    });
};
