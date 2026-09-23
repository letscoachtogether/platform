// Express 4 does not forward a rejected promise from an async route handler
// to the error-handling middleware on its own — an unhandled rejection there
// crashes the entire Node process (taking the whole site down for every
// visitor) instead of producing a 500 for the one request that failed.
// wrapAsync catches that; wrapControllerExports applies it to every handler
// a controller file exports, via a single call at the bottom of the file.

function wrapAsync(fn) {
    return function (req, res, next) {
        try {
            Promise.resolve(fn(req, res, next)).catch(next);
        } catch (err) {
            next(err);
        }
    };
}

function wrapControllerExports(exportsObj) {
    for (const key of Object.keys(exportsObj)) {
        if (typeof exportsObj[key] === "function") {
            exportsObj[key] = wrapAsync(exportsObj[key]);
        }
    }

    return exportsObj;
}

module.exports = { wrapAsync, wrapControllerExports };
