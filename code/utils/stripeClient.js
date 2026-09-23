const Stripe = require("stripe");

// Constructed lazily — importing this module must never throw just because
// STRIPE_SECRET_KEY hasn't been set yet, since stripeController.js is
// required unconditionally at boot. Constructing `new Stripe(...)` eagerly
// (as this used to do, directly in stripeController.js and
// utils/subscriptions.js) throws synchronously on an empty key, crashing
// the whole app on startup instead of leaving Stripe features merely
// inactive as render.yaml promises.
let client = null;

function getStripeClient() {

    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not set — add it to your environment to use Stripe features.");
    }

    if (!client) {
        client = new Stripe(process.env.STRIPE_SECRET_KEY);
    }

    return client;
}

module.exports = { getStripeClient };
