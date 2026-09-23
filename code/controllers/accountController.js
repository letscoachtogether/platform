const sendEmail = require("../utils/email");
const PortalUser = require("../models/portaluser");
const Offerings = require("../models/offerings");
const Agreement = require("../models/coachingAgreement");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const renderAgreement = require("../controllers/renderAgreement");
const passwordResetEmail = require("../emails/passwordResetEmail");
const { wrapControllerExports } = require("../middleware/asyncHandler");
const { PASSWORD_REGEX } = require("../utils/validators");
const { hashResetToken } = require("../utils/tokens");
const { findCurrentContainer } = require("../utils/containers");

// The offering a client still needs to sign the Coaching Agreement for, or
// null if there's nothing to sign — either they have no active/awaiting
// container yet, or that container's offering was never assigned an
// agreement. Shared by the gate (requireAgreementSigned) and the sign page
// itself so both agree on exactly what "nothing to sign" means.
async function findSignableOffering(userId) {

    const container = await findCurrentContainer(userId);

    if (!container) {
        return null;
    }

    const offering = await Offerings.findById(container.offering).populate("agreement");

    return offering && offering.agreement ? offering : null;
}

// Generates a fresh 6-digit code, emails it, and returns the hash+expiry to
// store — shared by createAccount (first send) and resendVerificationCode
// (a client who let the first one expire or never received it). Sends
// before returning anything to store, same reasoning as createAccount used
// to have inline: if the email throws, nothing about the account's
// verification state should change.
async function sendVerificationCode(email) {

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);

    await sendEmail({
        to: email,
        subject: "Your verification code",
        html: `<h2>Your code</h2><h1>${code}</h1>`
    });

    return {
        verificationCodeHash: codeHash,
        verificationExpires: Date.now() + 10 * 60 * 1000
    };
}

exports.createAccount = async (req, res) => {

    const { firstName, preferredName, lastName, pronouns, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await PortalUser.findOne({ email: normalizedEmail });

    // A verified account with this email is a real, in-use account — block
    // as before. An *unverified* one is a previous signup attempt that was
    // never finished (code expired, tab closed, typo caught too late) —
    // since it never completed verification, nothing else in the app
    // references it yet, so it's safe to replace outright once this attempt
    // is ready to commit.
    if (existingUser && existingUser.emailVerified) {
        return res.status(400).json({
            error: "An account with this email already exists.",
            code: "ACCOUNT_EXISTS"
        });
    }

    if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({
            error: "Password does not meet the security requirements."
        });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Sent before touching the database: if this throws, nothing below
    // runs, so a stale unverified record (if any) is left exactly as it was
    // and no new/duplicate document is ever created — there's no window
    // where a PortalUser exists but no email went out.
    const { verificationCodeHash, verificationExpires } = await sendVerificationCode(normalizedEmail);

    if (existingUser) {
        await PortalUser.deleteOne({ _id: existingUser._id });
    }

    await PortalUser.create({
        firstName,
        preferredName,
        lastName,
        pronouns,
        email: normalizedEmail,
        passwordHash,
        emailVerified: false,
        verificationCodeHash,
        verificationExpires
    });

    return res.json({ success: true });
}

exports.resendVerificationCode = async (req, res) => {

    const { email } = req.body;
    const normalizedEmail = (email || "").toLowerCase().trim();

    const user = await PortalUser.findOne({ email: normalizedEmail });

    if (!user || user.emailVerified) {
        // Same response either way (no account, or already verified) — a
        // resend endpoint shouldn't reveal which emails have an account.
        return res.json({ success: true });
    }

    const { verificationCodeHash, verificationExpires } = await sendVerificationCode(normalizedEmail);

    user.verificationCodeHash = verificationCodeHash;
    user.verificationExpires = verificationExpires;
    await user.save();

    return res.json({ success: true });
}

exports.verifyCode = async (req, res) => {

    const { email, code } = req.body;

    const user = await PortalUser.findOne({
        email: email.toLowerCase().trim()
    });

    if (!user) {
        return res.status(400).json({ error: "User not found" });
    }

    if (user.emailVerified) {
        return res.status(400).json({ error: "Already verified" });
    }

    if (!user.verificationCodeHash) {
        return res.status(400).json({ error: "No verification code found" });
    }

    if (user.verificationExpires < Date.now()) {
        return res.status(400).json({ error: "Code expired" });
    }

    const valid = await bcrypt.compare(code, user.verificationCodeHash);

    if (!valid) {
        return res.status(400).json({ error: "Invalid code" });
    }

    await PortalUser.updateOne(
        { email: user.email },
        {
            $set: {
                emailVerified: true
            },
            $unset: {
                verificationCodeHash: "",
                verificationExpires: ""
            }
        }
    );

    // Verifying an email isn't "a new client" on its own — someone can
    // verify and then never pay, or abandon checkout partway through. The
    // admin "new client" notification and the client's own welcome email
    // both fire later, from the Stripe webhook, once a CoachingContainer
    // actually exists — that's the real "signup complete" moment.
    return res.json({ success: true });
}

exports.login = async (req, res) => {

    const { email, password } = req.body;

    const user = await PortalUser.findOne({
        email: email.toLowerCase().trim()
    });

    if (!user) {
        return res.status(401).render("login", {
            error: "Invalid email or password.",
            success: null
        });
    }

    const validPassword = await bcrypt.compare(
        password,
        user.passwordHash
    );


    if (!validPassword) {
        return res.status(401).render("login", {
            error: "Invalid email or password.",
            success: null
        });
    }

    if (!user.emailVerified) {

        return res.render("login", {
            error: "Please verify your email first.",
            success: null
        });
    }

    user.lastLogin = new Date();

    await user.save();

    req.session.portalUserId = user._id;

    req.session.save(() => {


        if (user.role === "admin") {
            req.session.isAdmin = user.role === "admin";
            return res.redirect("/admin/dashboard");

        }

        return res.redirect("/client-dashboard/main");
    });
};


exports.getCreateAccount = async (req, res) => {

    const activeOfferings = await Offerings.find({

        active: true,

    });

    res.render("create-account", {
        activeOfferings: activeOfferings,
        error: null,
        paymentSuccess: req.query.payment === "success"
    });
}


exports.requirePortalLogin = (req, res, next) => {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0"
    });

    if (!req.session.portalUserId) {
        return res.redirect("/login");
    }

    next();
};

// Gates every /client-dashboard/* route behind having signed the Coaching
// Agreement at least once. Clients who paid via Stripe checkout already
// have an acceptance recorded at that point (see stripeController); this
// exists for clients an admin creates directly (e.g. a free client), who
// skip checkout entirely and would otherwise reach the dashboard having
// never agreed to anything.
exports.requireAgreementSigned = async (req, res, next) => {

    const user = await PortalUser.findById(req.session.portalUserId);

    if (!user) {
        return res.redirect("/login");
    }

    if (user.agreementAcceptances.length > 0) {
        return next();
    }

    const offering = await findSignableOffering(user._id);

    if (!offering) {
        return next();
    }

    res.redirect("/sign-agreement");
};

exports.getSignAgreement = async (req, res) => {

    const user = await PortalUser.findById(req.session.portalUserId);

    if (!user) {
        return res.redirect("/login");
    }

    if (user.agreementAcceptances.length > 0) {
        return res.redirect("/client-dashboard/main");
    }

    const offering = await findSignableOffering(user._id);

    if (!offering) {
        return res.redirect("/client-dashboard/main");
    }

    const sections = offering.agreement.sections.map(section => ({
        title: section.title,
        content: renderAgreement(section.content, offering, user)
    }));

    res.render("sign-agreement", {
        sections,
        offeringName: offering.name,
        error: null
    });
};

exports.postSignAgreement = async (req, res) => {

    const user = await PortalUser.findById(req.session.portalUserId);

    if (!user) {
        return res.redirect("/login");
    }

    const offering = await findSignableOffering(user._id);

    if (!offering) {
        return res.redirect("/client-dashboard/main");
    }

    if (req.body.agreementAccepted !== "true") {

        const sections = offering.agreement.sections.map(section => ({
            title: section.title,
            content: renderAgreement(section.content, offering, user)
        }));

        return res.status(400).render("sign-agreement", {
            sections,
            offeringName: offering.name,
            error: "You must accept the Coaching Agreement to continue."
        });
    }

    user.agreementAcceptances.push({
        version: offering.agreement.version,
        acceptedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
    });

    await user.save();

    res.redirect("/client-dashboard/main");
};

exports.requireAdmin = async (req, res, next) => {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0"
    });

    if (!req.session.isAdmin) {
        return res.status(403).send("Access denied");
    }

    if (!req.session.portalUserId) {
        return res.redirect("/login");
    }

    const user = await PortalUser.findById(
        req.session.portalUserId
    );

    if (!user || user.role !== "admin") {
        return res.status(403).send("Access denied");
    }

    req.admin = user;

    // Read by the shared dashboard-nav.ejs partial (used by both admin and
    // client-dashboard views) to show "Admin Panel" instead of "Client
    // Portal" next to the logo — set here rather than in every individual
    // admin controller's render() call, since this middleware already runs
    // in front of every /admin route.
    res.locals.isAdmin = true;

    next();
};

exports.getCoachingAgreement = async (req, res) => {

    const offering = await Offerings
        .findById(req.query.offeringId)
        .populate("agreement");

    if (!offering) {

        return res
            .status(404)
            .send("Offering not found.");

    }

    if (!offering.agreement) {

        return res
            .status(404)
            .send("Agreement not assigned.");

    }

    const agreement = offering.agreement;

    const client = {
        firstName: req.query.firstName || "",
        lastName: req.query.lastName || ""
    };

    const sections = agreement.sections.map(section => ({
        title: section.title,
        content: renderAgreement(
            section.content,
            offering,
            client
        )
    }));

    res.render("coaching-agreement", {
        sections
    });
};

exports.getLogout = (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie("connect.sid");

        res.set({
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
            "Expires": "0"
        });

        res.redirect("/login");
    });
};

exports.getLogin = (req, res) => {
    res.render("login", {
        error: null,
        success: null
    });
};

exports.getForgotPassword = (req, res) => {
    res.render("forgot-password", {
        error: null,
        sent: false
    });
};

exports.postForgotPassword = async (req, res) => {

    const email = (req.body.email || "").toLowerCase().trim();

    if (!email) {
        return res.status(400).render("forgot-password", {
            error: "Please enter your email address.",
            sent: false
        });
    }

    const user = await PortalUser.findOne({ email });

    // Always show the same confirmation regardless of whether the email
    // matches an account — otherwise this endpoint becomes a way to check
    // which emails have accounts.
    if (user) {

        const rawToken = crypto.randomBytes(32).toString("hex");

        user.resetPasswordTokenHash = hashResetToken(rawToken);
        user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();

        const resetUrl = `${process.env.BASE_URL}/reset-password/${rawToken}`;

        try {
            await sendEmail({
                to: user.email,
                subject: "Reset your password",
                html: passwordResetEmail(user.preferredName || user.firstName, resetUrl)
            });
        } catch (err) {
            console.error("Failed to send password reset email:", err);
        }
    }

    return res.render("forgot-password", {
        error: null,
        sent: true
    });
};

exports.getResetPassword = async (req, res) => {

    const user = await PortalUser.findOne({
        resetPasswordTokenHash: hashResetToken(req.params.token),
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        return res.render("reset-password", {
            token: null,
            error: "This password reset link is invalid or has expired. Please request a new one.",
            invalid: true
        });
    }

    res.render("reset-password", {
        token: req.params.token,
        error: null,
        invalid: false
    });
};

exports.postResetPassword = async (req, res) => {

    const { password, confirmPassword } = req.body;
    const token = req.params.token;

    const user = await PortalUser.findOne({
        resetPasswordTokenHash: hashResetToken(token),
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        return res.render("reset-password", {
            token: null,
            error: "This password reset link is invalid or has expired. Please request a new one.",
            invalid: true
        });
    }

    if (password !== confirmPassword) {
        return res.status(400).render("reset-password", {
            token,
            error: "Passwords do not match.",
            invalid: false
        });
    }

    if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).render("reset-password", {
            token,
            error: "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.",
            invalid: false
        });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.render("login", {
        error: null,
        success: "Your password has been reset. Please sign in."
    });
};

wrapControllerExports(exports);