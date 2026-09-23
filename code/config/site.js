// Single place that defines "who this deployment is for." Every marketing
// page, email, and piece of structured data pulls from here instead of
// hardcoding a business/founder name — set these in .env and the whole
// site follows. See .env.example for the full list.
module.exports = {
    businessName: process.env.BUSINESS_NAME || "Your Coaching Business",
    founderName: process.env.FOUNDER_NAME || "Your Name",
    tagline: process.env.SITE_TAGLINE || "1:1 coaching to help you move forward with clarity.",
    contactEmail: process.env.CONTACT_EMAIL || "you@example.com",
    bookingUrl: process.env.BOOKING_URL || "https://cal.com/your-username",
    // RENDER_EXTERNAL_URL is set automatically by Render on every web
    // service — falling back to it means a Render deploy works with no
    // BASE_URL set at all until a custom domain is added, at which point
    // setting BASE_URL explicitly takes over.
    baseUrl: process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"
};
