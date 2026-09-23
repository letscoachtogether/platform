// Creates (or promotes) the first admin account for a fresh deployment.
// There's no other way to get an admin into this system — the public
// signup flow always creates role: "client" accounts — so this is a
// required one-time setup step. Run with:
//
//   npm run create-admin
//
// promptCreateAdmin() is also reused by the first-run setup wizard
// (code/scripts/setup.js), which already has its own readline interface and
// mongoose connection open by the time it calls this — hence the
// require.main guard at the bottom, and why this function doesn't manage
// either lifecycle itself.
require("dotenv").config();

const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const PortalUser = require("../models/portaluser");
const { PASSWORD_REGEX } = require("../utils/validators");

// Runs the interactive Q&A against an already-open readline interface, with
// mongoose already connected. Throws on invalid input rather than calling
// process.exit() so callers can decide how to handle failure — and is
// responsible for opening/closing neither rl nor the mongoose connection.
async function promptCreateAdmin(rl) {

    console.log("Create an admin account");
    console.log("(this is a one-time local setup step — input isn't masked, so avoid running it somewhere your screen or terminal history is exposed)\n");

    const email = (await rl.question("Email: ")).trim().toLowerCase();

    if (!email || !email.includes("@")) {
        throw new Error("That doesn't look like a valid email address.");
    }

    const existing = await PortalUser.findOne({ email });

    if (existing) {

        if (existing.role === "admin") {
            console.log(`${email} is already an admin. Nothing to do.`);
            return;
        }

        const promote = (await rl.question(`An account for ${email} already exists (role: ${existing.role}). Promote it to admin instead? [y/N]: `)).trim().toLowerCase();

        if (promote !== "y" && promote !== "yes") {
            console.log("Cancelled.");
            return;
        }

        existing.role = "admin";
        existing.emailVerified = true;
        await existing.save();

        console.log(`${email} is now an admin.`);
        return;
    }

    const firstName = (await rl.question("First name: ")).trim();
    const lastName = (await rl.question("Last name: ")).trim();

    let password;

    while (true) {
        password = await rl.question("Password (min 8 chars, upper+lower+number+symbol): ");

        if (PASSWORD_REGEX.test(password)) {
            break;
        }

        console.log("Doesn't meet the requirements — try again.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await PortalUser.create({
        firstName,
        lastName,
        preferredName: firstName,
        email,
        passwordHash,
        role: "admin",
        // Skips the email-verification-code flow entirely — this account
        // is being created directly by whoever controls the database, not
        // through the public signup form.
        emailVerified: true
    });

    console.log(`\nAdmin account created for ${email}. You can log in at /login.`);
}

async function main() {

    if (!process.env.MONGODB_URI) {
        console.error("MONGODB_URI is not set — check your .env file.");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const rl = readline.createInterface({ input: stdin, output: stdout });

    try {
        await promptCreateAdmin(rl);
    } finally {
        rl.close();
        await mongoose.disconnect();
    }
}

module.exports = { promptCreateAdmin };

if (require.main === module) {
    main().catch((err) => {
        console.error("Failed to create admin account:", err.message);
        process.exit(1);
    });
}
