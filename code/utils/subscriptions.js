const { getStripeClient } = require("./stripeClient");

// Deliberately not in stripeController.js: that file ends with
// wrapControllerExports(exports), which wraps every export as an Express
// route handler (req, res, next) — fine for the actual route handlers it
// exports, but it silently breaks a plain async helper like these two.
// wrapAsync's returned function never returns fn's result (so every
// `await` on it resolves to undefined instead of the real value) and only
// forwards the first 3 positional arguments (so requestCancellation's 4th
// argument, `override`, was always getting dropped). Living here instead
// avoids that entirely, matching every other shared non-route helper in
// this codebase (findCurrentContainer, findUserResourceEntry, etc.).

// Live Stripe state for a subscription — deliberately not duplicated into
// CoachingContainer (current_period_end/cancel_at_period_end/price would
// just drift out of sync with Stripe's own source of truth). Fetched fresh
// wherever a client or admin needs to see billing info.
async function getSubscriptionBillingInfo(subscriptionId) {

    const sub = await getStripeClient().subscriptions.retrieve(subscriptionId);
    const price = sub.items.data[0].price;

    // As of Stripe's 2025+ API versions, current_period_end/start live on
    // the subscription ITEM, not the subscription itself — the top-level
    // field is undefined now. Falling back to the old location too in case
    // this ever runs against an older pinned API version.
    const periodEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;

    return {
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: new Date(periodEnd * 1000),
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring.interval,
        intervalCount: price.recurring.interval_count
    };
}

// Shared by the client's own "cancel my subscription" action and the
// admin's "cancel billing" action — same rule either way, just with the
// notice-window check skippable by an admin override. See the
// pendingCancellation field's own comment (models/coachingContainer.js) for
// why the within-window case doesn't cancel in Stripe immediately.
async function requestCancellation(container, offering, actor, override = false) {

    const billing = await getSubscriptionBillingInfo(container.stripeSubscriptionId);

    const noticeMs = (offering.cancellationNoticeDays ?? 14) * 24 * 60 * 60 * 1000;
    const withinWindow = billing.currentPeriodEnd.getTime() - Date.now() < noticeMs;

    if (override || !withinWindow) {

        await getStripeClient().subscriptions.update(container.stripeSubscriptionId, {
            cancel_at_period_end: true
        });

        container.pendingCancellation = false;

    } else {

        container.pendingCancellation = true;
    }

    container.cancellationRequestedAt = new Date();
    container.cancellationRequestedBy = actor;

    await container.save();

    return {
        chargedOnceMore: withinWindow && !override,
        currentPeriodEnd: billing.currentPeriodEnd
    };
}

module.exports = { getSubscriptionBillingInfo, requestCancellation };
