
const express = require("express");
const router = express.Router();

const dashboardController = require("../controllers/dashboardController");
const stripeController = require("../controllers/stripeController");
const siteController = require("../controllers/siteController");
const accountController = require("../controllers/accountController");
const adminController = require("../controllers/adminController");
const valuesController = require("../controllers/valuesController");
const cronController = require("../controllers/cronController");

const { attachCsrfToken, csrfProtection } = require("../middleware/csrf");
const { authLimiter, verifyCodeLimiter, resendVerificationLimiter } = require("../middleware/rateLimiters");
const { requireCronSecret } = require("../middleware/cronAuth");

router.get("/", (req, res) => {
    res.redirect("/home");
});

router.get("/privacy-policy", (req, res) => {
    res.render("privacy-policy");
});

router.get("/create-account-success", (req, res) => {
    res.render("create-account-success");
});



router.get("/home", siteController.getHome);
router.get("/robots.txt", siteController.getRobotsTxt);
router.get("/sitemap.xml", siteController.getSitemap);
router.post("/api/create-checkout-session", attachCsrfToken, csrfProtection, stripeController.createCheckoutSession);

// Machine-triggered, not browser-triggered — authenticated by CRON_SECRET
// (see middleware/cronAuth.js) instead of a session, so it deliberately
// sits outside the CSRF-protected browser routes below.
router.get("/api/cron/session-reminders", requireCronSecret, cronController.runSessionReminders);



router.use("/client-dashboard", accountController.requirePortalLogin);
router.use("/client-dashboard", accountController.requireAgreementSigned);
router.use("/client-dashboard", attachCsrfToken, csrfProtection);

router.get("/client-dashboard/main", dashboardController.getDashboard);
router.get("/client-dashboard/testimonial", dashboardController.getTestimonialPage);
router.post("/client-dashboard/testimonial", dashboardController.submitTestimonial);

// Offboarding
router.get("/client-dashboard/referral", dashboardController.getReferralPage);
router.post("/client-dashboard/referral", dashboardController.submitReferral);
router.get("/client-dashboard/add-sessions", dashboardController.getAddSessionsPage);
router.post("/client-dashboard/add-sessions/checkout", stripeController.createCheckoutSessionForClient);
router.get("/client-dashboard/sessions/book", dashboardController.getBookedSessions);
router.get("/client-dashboard/sessions/:bookingUid/:status/worksheet", dashboardController.getSessionWorksheet);
router.get("/client-dashboard/sessions/:bookingUid/:start/notes", dashboardController.getSessionNotes);
router.get("/client-dashboard/resources", dashboardController.getResources);
router.get("/client-dashboard/resources/:slug", dashboardController.getResource);
router.get("/client-dashboard/profile", dashboardController.getDashboardProfile);
router.post("/client-dashboard/profile", dashboardController.postUpdateProfile);
router.post("/client-dashboard/profile/password", authLimiter, dashboardController.postChangePassword);
router.post("/client-dashboard/profile/email", authLimiter, dashboardController.postChangeEmail);
router.post("/client-dashboard/profile/notifications", dashboardController.postUpdateNotificationPreferences);
router.get("/client-dashboard/sessions", dashboardController.getDashboardSessions);
router.get("/client-dashboard/wheel-of-life", dashboardController.getWheelofLife);
router.get("/client-dashboard/roadmap", dashboardController.getRoadmap);
router.post("/client-dashboard/roadmap", dashboardController.saveRoadmap);
router.post("/client-dashboard/billing/cancel", dashboardController.cancelBilling);
router.post("/client-dashboard/sessions/book", dashboardController.bookSessions);
router.post("/client-dashboard/sessions/retry", dashboardController.retrySessionScheduling);
router.post("/client-dashboard/sessions/:bookingUid/:status/worksheet", dashboardController.submitSessionWorksheet);
router.post("/client-dashboard/resources/:slug", dashboardController.updateResources);
router.post("/client-dashboard/resources/:slug/request", dashboardController.requestResource);
router.get("/client-dashboard/sessions/:bookingUid/:status/tools", dashboardController.getSessionTools);
router.post("/client-dashboard/sessions/:bookingUid/tools", dashboardController.requestSessionTool);
router.post("/client-dashboard/wheel-of-life", dashboardController.saveWheelOfLife);
router.get("/client-dashboard/allValues", valuesController.getAllValues);
router.get("/client-dashboard/clientValues", valuesController.getClientValues);

// These live under /api/values rather than /client-dashboard, so they miss
// the requirePortalLogin/CSRF middleware mounted above and need it applied
// directly.
router.get(
    "/api/values",
    accountController.requirePortalLogin,
    valuesController.getClientValuesExercise
  );

  router.put(
    "/api/values/selection",
    accountController.requirePortalLogin,
    attachCsrfToken,
    csrfProtection,
    valuesController.saveSelectedValues
  );

  router.put(
    "/api/values/sorting",
    accountController.requirePortalLogin,
    attachCsrfToken,
    csrfProtection,
    valuesController.saveSortedValues
  );

  router.put(
    "/api/values/core",
    accountController.requirePortalLogin,
    attachCsrfToken,
    csrfProtection,
    valuesController.saveCoreValues
  );

  router.put(
    "/api/values/reset",
    accountController.requirePortalLogin,
    attachCsrfToken,
    csrfProtection,
    valuesController.resetValuesExercise
  );

router.get("/create-account", attachCsrfToken, accountController.getCreateAccount);
router.get("/coaching-agreement", accountController.getCoachingAgreement);
router.get("/sign-agreement", accountController.requirePortalLogin, attachCsrfToken, accountController.getSignAgreement);
router.post("/sign-agreement", accountController.requirePortalLogin, csrfProtection, attachCsrfToken, accountController.postSignAgreement);
router.get("/logout", accountController.getLogout);
router.get("/login", attachCsrfToken, accountController.getLogin);
router.post("/login", authLimiter, csrfProtection, attachCsrfToken, accountController.login);
router.post("/create-account", authLimiter, csrfProtection, accountController.createAccount);
router.post("/verify-code", verifyCodeLimiter, csrfProtection, accountController.verifyCode);
router.post("/resend-verification-code", resendVerificationLimiter, csrfProtection, accountController.resendVerificationCode);

router.get("/forgot-password", attachCsrfToken, accountController.getForgotPassword);
router.post("/forgot-password", authLimiter, csrfProtection, attachCsrfToken, accountController.postForgotPassword);
router.get("/reset-password/:token", attachCsrfToken, accountController.getResetPassword);
router.post("/reset-password/:token", authLimiter, csrfProtection, attachCsrfToken, accountController.postResetPassword);

router.use("/admin", accountController.requireAdmin);
router.use("/admin", attachCsrfToken, csrfProtection);

router.get("/admin/dashboard", adminController.dashboard);
router.get("/admin/clients", adminController.clients);
router.get("/admin/clients/new", adminController.newClientPage);
router.post("/admin/clients/new", adminController.createClient);
router.get("/admin/clients/:id", adminController.clientProfile);
router.post("/admin/clients/:id/delete", adminController.deleteClient);
router.get("/admin/sessions", adminController.sessions);
router.get("/admin/sessions/:bookingUid/notes", adminController.showNotes);
router.get("/admin/clients/:id/resources/:slug", adminController.getClientResource);
router.post("/admin/clients/:id/resources/:slug/unlock", adminController.unlockResource);
router.get("/admin/clients/:id/wheel-of-life", adminController.getClientWheelOfLife);
router.get("/admin/clients/:clientId/sessions/:bookingUid/worksheet", adminController.getClientSessionWorksheet);
router.post("/admin/sessions/:bookingUid/notes", adminController.saveNotes);
router.get("/admin/worksheets/new", (req, res) => {
    res.render("admin/new-worksheet");

});
router.post("/admin/worksheets/new", adminController.createNewWorksheet);

// Coaching Containers
router.get(
    "/admin/containers",
    adminController.containersPage
);

router.get(
    "/admin/containers/new",
    adminController.newContainerPage
);

router.post(
    "/admin/containers/new",
    adminController.createContainer
);

router.post(
    "/admin/containers/:id/status",
    adminController.updateContainerStatus
);

router.post(
    "/admin/containers/:id/delete",
    adminController.deleteContainer
);

router.post(
    "/admin/containers/:id/cancel-billing",
    adminController.cancelContainerBilling
);

router.get(
    "/admin/containers/:id/roadmap",
    adminController.getContainerRoadmap
);

router.post(
    "/admin/containers/:id/roadmap",
    adminController.updateContainerRoadmap
);

// Offerings
router.get(
    "/admin/offerings",
    adminController.offeringsPage
);

router.get(
    "/admin/offerings/new",
    adminController.newOfferingPage
);

router.post(
    "/admin/offerings/new",
    adminController.createOffering
);

router.get(
    "/admin/offerings/:id/edit",
    adminController.editOfferingPage
);

router.post(
    "/admin/offerings/:id/edit",
    adminController.updateOffering
);

router.post(
    "/admin/offerings/:id/delete",
    adminController.deleteOffering
);

router.post(
    "/admin/offerings/:id/toggle",
    adminController.toggleOffering
);

router.get(
    "/admin/resources",
    adminController.resourcesPage
);

router.get(
    "/admin/resources/new",
    adminController.newResourcePage
);

router.post(
    "/admin/resources/new",
    adminController.createResource
);

router.get(
    "/admin/resources/:id/edit",
    adminController.editResourcePage
);

router.post(
    "/admin/resources/:id/edit",
    adminController.updateResource
);

router.post(
    "/admin/resources/:id/delete",
    adminController.deleteResource
);

router.post(
    "/admin/resources/:id/toggle",
    adminController.toggleResource
);

router.get(
    "/admin/agreements",
    adminController.agreementsPage
);

router.get(
    "/admin/agreements/new",
    adminController.newAgreementPage
);

router.post(
    "/admin/agreements/new",
    adminController.createAgreement
);

router.get(
    "/admin/agreements/:id/edit",
    adminController.editAgreementPage
);

router.post(
    "/admin/agreements/:id/edit",
    adminController.updateAgreement
);

router.post(
    "/admin/agreements/:id/delete",
    adminController.deleteAgreement
);

router.post(
    "/admin/agreements/:id/toggle",
    adminController.toggleAgreement
);

router.get(
    "/admin/testimonials",
    adminController.testimonialsPage
);

router.get(
    "/admin/testimonials/new",
    adminController.newTestimonialPage
);

router.post(
    "/admin/testimonials/new",
    adminController.createTestimonial
);

router.get(
    "/admin/testimonials/:id/edit",
    adminController.editTestimonialPage
);

router.post(
    "/admin/testimonials/:id/edit",
    adminController.updateTestimonial
);

router.post(
    "/admin/testimonials/:id/delete",
    adminController.deleteTestimonial
);

router.post(
    "/admin/testimonials/:id/toggle",
    adminController.toggleTestimonial
);

router.get(
    "/admin/testimonial-questions",
    adminController.testimonialQuestionsPage
);

router.get(
    "/admin/testimonial-questions/new",
    adminController.newTestimonialQuestionPage
);

router.post(
    "/admin/testimonial-questions/new",
    adminController.createTestimonialQuestion
);

router.get(
    "/admin/testimonial-questions/:id/edit",
    adminController.editTestimonialQuestionPage
);

router.post(
    "/admin/testimonial-questions/:id/edit",
    adminController.updateTestimonialQuestion
);

router.post(
    "/admin/testimonial-questions/:id/delete",
    adminController.deleteTestimonialQuestion
);

router.post(
    "/admin/testimonial-questions/:id/toggle",
    adminController.toggleTestimonialQuestion
);

router.get(
    "/admin/testimonial-submissions",
    adminController.testimonialSubmissionsPage
);

router.get(
    "/admin/testimonial-submissions/:id",
    adminController.reviewTestimonialSubmissionPage
);

router.post(
    "/admin/testimonial-submissions/:id/approve",
    adminController.approveTestimonialSubmission
);

router.post(
    "/admin/testimonial-submissions/:id/reject",
    adminController.rejectTestimonialSubmission
);

router.post(
    "/admin/testimonial-submissions/:id/delete",
    adminController.deleteTestimonialSubmission
);

router.get(
    "/admin/referrals",
    adminController.referralsPage
);

router.post(
    "/admin/referrals/:id/delete",
    adminController.deleteReferral
);

router.get(
    "/admin/notifications",
    adminController.notificationsPage
);

router.post(
    "/admin/notifications/:id",
    adminController.updateNotificationSetting
);

// ============================================
// GET CLIENT VALUES
// ============================================

router.get(
    "/admin/clients/:clientId/values",
    adminController.getClientValues
);


// ============================================
// UPDATE CLIENT VALUES
// ============================================

router.post(
    "/admin/clients/:clientId/values",
    adminController.updateClientValues);
    

module.exports = router