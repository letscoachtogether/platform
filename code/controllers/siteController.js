const Testimonials = require("../models/testimonial");
const { wrapControllerExports } = require("../middleware/asyncHandler");
const site = require("../config/site");

exports.getHome = async (req, res) => {

    const activeTestimonials = await Testimonials.find({
        active: true,
    });
    res.render("home", {
        activeTestimonials: activeTestimonials,
        baseUrl: site.baseUrl
    });
};


exports.getRobotsTxt = async (req, res) => {

    res.type("text/plain").send(
`User-agent: *
Disallow: /admin
Disallow: /client-dashboard
Disallow: /login
Disallow: /create-account
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-code
Disallow: /api/

Sitemap: ${site.baseUrl}/sitemap.xml
`
    );
};

exports.getSitemap = async (req, res) => {

    const urls = [
        { loc: `${site.baseUrl}/home`, changefreq: "monthly", priority: "1.0" },
        { loc: `${site.baseUrl}/privacy-policy`, changefreq: "yearly", priority: "0.2" }
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

    res.type("application/xml").send(xml);
};

wrapControllerExports(exports);
