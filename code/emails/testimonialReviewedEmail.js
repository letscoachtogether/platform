const { layout, paragraph, button } = require("./emailLayout");

module.exports = function testimonialReviewedEmail(name, approved) {

    if (approved) {

        const body = `
            ${paragraph(`Hi ${name},`, { lead: true })}
            ${paragraph("Thank you — your testimonial has been reviewed and published. We really appreciate you taking the time to share it.")}
        `;

        return layout({
            title: "Your Testimonial Was Published",
            body,
            unsubscribeNote: true
        });
    }

    const body = `
        ${paragraph(`Hi ${name},`, { lead: true })}
        ${paragraph("Your testimonial submission was reviewed but hasn't been published yet. Feel free to submit an update from your dashboard anytime.")}
        ${button(`${process.env.BASE_URL}/client-dashboard/testimonial`, "View Your Submission")}
    `;

    return layout({
        title: "Your Testimonial Submission",
        body,
        unsubscribeNote: true
    });
};
