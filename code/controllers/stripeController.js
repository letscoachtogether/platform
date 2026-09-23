const { getStripeClient } = require("../utils/stripeClient");

const site = require("../config/site");
const PortalUser = require("../models/portaluser");
const Offering = require("../models/offerings");
const CoachingContainer = require("../models/coachingContainer");
const calService = require("../controllers/cal");
const { notify } = require("../controllers/notificationService");
const sendEmail = require("../utils/email");
const orphanedRenewalEmail = require("../emails/orphanedRenewalEmail");
const newClientSignupEmail = require("../emails/newClientSignupEmail");
const welcomeClientEmail = require("../emails/welcomeClientEmail");
const { wrapControllerExports } = require("../middleware/asyncHandler");

exports.createCheckoutSession = async (req, res) => {
    try {
        const stripe = getStripeClient();

        const {
            email,
            offeringId,
            agreementAccepted
        } = req.body;

        if (agreementAccepted !== "true") {
            return res.status(400).json({
                error: "You must accept the Coaching Agreement."
            });
        }

        const user = await PortalUser.findOne({
            email: email.toLowerCase().trim()
        });

        if (!user) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                error: "Please verify your email before completing checkout."
            });
        }

        const offering = await Offering.findById(offeringId).populate("agreement");

        if (!offering) {
            return res.status(404).json({
                error: "Offering not found."
            });
        }

        if (!["payment", "subscription"].includes(offering.mode)) {
            return res.status(400).json({
                error: "Invalid offering mode."
            });
        }

        if (!offering.agreement) {
            return res.status(400).json({
                error: "This offering has no coaching agreement assigned."
            });
        }

        // The version recorded is always the one actually tied to this
        // offering — never trusted from the client. A hidden form field
        // previously supplied this directly and had gone stale (it never
        // matched the live agreement), silently mis-recording what every
        // client had actually agreed to. Recording it only now, after the
        // offering/agreement are confirmed valid, also means a failed or
        // invalid checkout attempt no longer leaves a phantom acceptance
        // on the account.
        user.agreementAcceptances.push({
            version: offering.agreement.version,
            acceptedAt: new Date(),
            ipAddress: req.ip,
            userAgent: req.get("User-Agent")
        });

        await user.save();

        const session = await stripe.checkout.sessions.create({
            mode: offering.mode,

            customer_email: user.email,

            line_items: [
                {
                    // Price comes from the offering record, not the client,
                    // so a request can't substitute a different Stripe price.
                    price: offering.priceId,
                    quantity: 1
                }
            ],

            allow_promotion_codes: true,

            metadata: {
                userId: user._id.toString(),
                offeringId: offering._id.toString()
            },

            success_url: `${process.env.BASE_URL}/create-account-success`,
            cancel_url: `${process.env.BASE_URL}/create-account`
        });

        return res.redirect(303, session.url);

    } catch (err) {
        console.error("Checkout Session Error:", err);

        return res.status(500).json({
            error: "Unable to create checkout session."
        });
    }
};

// Same purchase flow as createCheckoutSession above, but for a client who's
// already logged in and adding another container — pulls the buyer from the
// session instead of trusting an emailed identity, and returns to the
// dashboard instead of the new-account flow.
exports.createCheckoutSessionForClient = async (req, res) => {
    try {
        const stripe = getStripeClient();

        const {
            offeringId,
            agreementAccepted
        } = req.body;

        if (agreementAccepted !== "true") {
            return res.status(400).send("You must accept the Coaching Agreement.");
        }

        const user = await PortalUser.findById(req.session.portalUserId);

        if (!user) {
            return res.status(404).send("User not found.");
        }

        const offering = await Offering.findById(offeringId).populate("agreement");

        if (!offering || !offering.active) {
            return res.status(404).send("Offering not found.");
        }

        if (!["payment", "subscription"].includes(offering.mode)) {
            return res.status(400).send("Invalid offering mode.");
        }

        if (!offering.agreement) {
            return res.status(400).send("This offering has no coaching agreement assigned.");
        }

        // See createCheckoutSession above — version always comes from the
        // offering's actual assigned agreement, never trusted from the
        // client, and only recorded once the offering is confirmed valid.
        user.agreementAcceptances.push({
            version: offering.agreement.version,
            acceptedAt: new Date(),
            ipAddress: req.ip,
            userAgent: req.get("User-Agent")
        });

        await user.save();

        const session = await stripe.checkout.sessions.create({
            mode: offering.mode,

            customer_email: user.email,

            line_items: [
                {
                    price: offering.priceId,
                    quantity: 1
                }
            ],

            allow_promotion_codes: true,

            metadata: {
                userId: user._id.toString(),
                offeringId: offering._id.toString()
            },

            success_url: `${process.env.BASE_URL}/client-dashboard/main?newSessionsPurchased=true`,
            cancel_url: `${process.env.BASE_URL}/client-dashboard/add-sessions`
        });

        return res.redirect(303, session.url);

    } catch (err) {
        console.error("Checkout Session Error (existing client):", err);

        return res.status(500).send("Unable to create checkout session.");
    }
};

exports.createStripeWebhook = async (req, res) => {

    console.log("CREATE WEBHOOK");
    let event;
    let stripe;

    try {

        stripe = getStripeClient();
        const signature = req.headers["stripe-signature"];

        event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {

        console.error("Webhook signature failed:", err.message);

        return res.sendStatus(400);

    }

    try {

        switch (event.type) {

            case "checkout.session.completed": {

                console.log("Checkout completed");

                const checkoutSession = event.data.object;

                console.log(checkoutSession.metadata);

                const { userId, offeringId } = checkoutSession.metadata;

                const user = await PortalUser.findById(userId);

                if (!user) {
                    throw new Error(`User ${userId} not found.`);
                }

                const offering = await Offering.findById(offeringId);

                if (!offering) {
                    throw new Error(`Offering ${offeringId} not found.`);
                }

                let container = await CoachingContainer.findOne({
                    stripeCheckoutSessionId: checkoutSession.id
                });

                if (!container) {

                    // Checked before creating this container: "Add More
                    // Sessions" (createCheckoutSessionForClient) sends an
                    // existing client through this exact same webhook path
                    // to buy an additional container — that's a returning
                    // client, not a new one, and shouldn't trigger either
                    // the admin's "new client" notification or the client's
                    // own welcome-to-the-portal email below.
                    const isFirstContainer = (await CoachingContainer.countDocuments({ user: user._id })) === 0;

                    container = await CoachingContainer.create({

                        user: user._id,

                        offering: offering._id,

                        name: offering.name,

                        status: "awaiting-slot",

                        stripeCheckoutSessionId: checkoutSession.id,

                        // Only present for offering.mode === "subscription"
                        // checkouts — lets a later invoice.paid renewal find
                        // its way back to this container.
                        stripeSubscriptionId: checkoutSession.subscription || null,

                        startedAt: new Date(),

                        eventTypeId: offering.eventTypeId,

                        sessionCount: offering.sessionCount,

                        // Sessions per billing period; this first grant
                        // covers period one. Renewals top this up below
                        // instead of creating a new container.
                        sessionsGranted: offering.sessionCount

                    });

                    console.log("Created CoachingContainer:", container._id);

                    // This — not email verification — is the real "signup
                    // complete" moment: a paid container actually exists.
                    // Both the admin notification and the client's own
                    // welcome email fire from here, once, only for this
                    // client's very first container — a retried webhook
                    // delivery for the same checkout hits the "already
                    // exists" branch below instead and sends neither again,
                    // and "Add More Sessions" (isFirstContainer false)
                    // correctly sends neither either, since that's an
                    // existing client, not a new one.
                    if (isFirstContainer) {

                        await notify("new-client-signup", {
                            subject: `New client: ${user.preferredName || user.firstName}`,
                            html: newClientSignupEmail(
                                `${user.preferredName || user.firstName} ${user.lastName}`,
                                user.email
                            )
                        });

                        try {

                            await sendEmail({
                                to: user.email,
                                subject: `Welcome to ${site.businessName} — let's get started`,
                                html: welcomeClientEmail(user.preferredName || user.firstName)
                            });

                        } catch (err) {

                            // The container is already created either way —
                            // log it so the admin can follow up manually,
                            // but don't fail webhook processing (and risk
                            // Stripe retrying a checkout that already
                            // succeeded) over a delivery problem with this
                            // one best-effort email.
                            console.error("Failed to send welcome email:", err);
                        }
                    }

                } else {

                    console.log("Container already exists.");

                }

                break;

            }

            case "invoice.paid": {

                const invoice = event.data.object;

                // The first invoice on a brand-new subscription is already
                // covered by checkout.session.completed above — reacting to
                // it here too would grant period one twice. Only act on
                // actual renewals.
                if (invoice.billing_reason !== "subscription_cycle") {
                    console.log(`Ignoring invoice.paid (billing_reason: ${invoice.billing_reason})`);
                    break;
                }

                const subscriptionId = invoice.subscription;

                if (!subscriptionId) {
                    console.log("invoice.paid with no subscription id — ignoring.");
                    break;
                }

                const container = await CoachingContainer.findOne({
                    stripeSubscriptionId: subscriptionId
                });

                if (!container) {

                    // A real charge came in with nowhere in the portal to
                    // apply it — this needs a human, and retrying the same
                    // lookup won't fix it on its own. notify() never throws,
                    // so this is safe to call before the throw below, which
                    // still returns a 500 so Stripe keeps retrying in case
                    // the container genuinely turns up later (e.g. it was
                    // just slow to write).
                    await notify("orphaned-renewal", {
                        subject: `Orphaned subscription renewal: ${subscriptionId}`,
                        html: orphanedRenewalEmail(subscriptionId, invoice.id)
                    });

                    throw new Error(`No CoachingContainer found for subscription ${subscriptionId}.`);
                }

                // Stripe can redeliver the same event; don't double-grant.
                if (container.lastProcessedInvoiceId === invoice.id) {
                    console.log(`Invoice ${invoice.id} already processed for container ${container._id}.`);
                    break;
                }

                container.sessionsGranted = (container.sessionsGranted || container.sessionCount) + container.sessionCount;
                container.lastProcessedInvoiceId = invoice.id;

                // A cancellation requested too close to this exact renewal to
                // stop it (see requestCancellation/pendingCancellation) — this
                // charge was unavoidable and already happened, so this is now
                // the last one: tell Stripe not to renew again after it.
                if (container.pendingCancellation) {

                    await stripe.subscriptions.update(subscriptionId, {
                        cancel_at_period_end: true
                    });

                    container.pendingCancellation = false;

                    console.log(`Applied deferred cancellation for container ${container._id} after its forced renewal.`);
                }

                await container.save();

                console.log(`Renewed container ${container._id}: sessionsGranted now ${container.sessionsGranted}.`);

                // Only auto-schedule the new batch if the client already
                // picked their recurring slot. If they haven't, there's
                // nothing to extend yet — whenever they do pick one,
                // generateContainerBookings runs against the (by then
                // higher) sessionsGranted ceiling and catches everything up.
                if (container.recurringWeekday !== undefined && container.recurringWeekday !== null && container.recurringTime) {

                    const containerUser = await PortalUser.findById(container.user);

                    if (containerUser) {
                        await calService.generateContainerBookings({
                            container,
                            user: containerUser,
                            startIndex: container.scheduling.completed || 0
                        });
                    }
                }

                break;

            }

            // Fires once a cancelled subscription actually reaches its end
            // (whether that was scheduled via requestCancellation above, or
            // cancelled directly in the Stripe dashboard) — the one place
            // CoachingContainer.status ever gets moved to "completed" for a
            // subscription container. Requires this event type to be
            // selected on the webhook endpoint in the Stripe dashboard.
            case "customer.subscription.deleted": {

                const subscription = event.data.object;

                const container = await CoachingContainer.findOne({
                    stripeSubscriptionId: subscription.id
                });

                if (!container) {
                    console.log(`No CoachingContainer found for deleted subscription ${subscription.id} — ignoring.`);
                    break;
                }

                container.status = "completed";
                container.pendingCancellation = false;
                await container.save();

                console.log(`Marked container ${container._id} completed — subscription ${subscription.id} ended.`);

                break;

            }

            default:

                console.log(`Unhandled event: ${event.type}`);

        }

    } catch (err) {

        console.error("Webhook processing error:");
        console.error(err);

        return res.sendStatus(500);

    }

    res.sendStatus(200);

};

wrapControllerExports(exports);
