const { layout, fact, paragraph, button } = require("./emailLayout");

module.exports = function newTestimonialSubmissionEmail(clientName, preview) {

    const body = `
        ${fact("From", clientName)}
        ${paragraph(preview)}
        ${button(`${process.env.BASE_URL}/admin/testimonial-submissions`, "Review It")}
    `;

    return layout({
        title: "New Testimonial Submission",
        body,
        signOff: false
    });
};
