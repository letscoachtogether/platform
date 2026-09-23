window.client = window.client || {};

window.addEventListener("DOMContentLoaded", () => {

    const saved = localStorage.getItem("client");

    if (saved) {
        window.client = JSON.parse(saved);
    }

    const agreementCheckbox = document.getElementById("agreementAccepted");
    const agreementAcceptedInput = document.getElementById("agreementAcceptedInput");
    const checkoutButton = document.getElementById("checkoutButton");
    const agreementError = document.getElementById("agreementError");
    const checkoutForm = document.getElementById("checkoutForm");

    if (agreementCheckbox) {

        agreementCheckbox.addEventListener("change", () => {

            agreementAcceptedInput.value = agreementCheckbox.checked ? "true" : "false";

            checkoutButton.disabled = !agreementCheckbox.checked;

            agreementError.style.display =
                agreementCheckbox.checked ? "none" : "block";

        });

    }

    if (checkoutForm) {

        checkoutForm.addEventListener("submit", (e) => {

            if (!agreementCheckbox.checked) {

                e.preventDefault();

                agreementError.style.display = "block";

                return;
            }

            document.getElementById("checkoutEmail").value =
                window.client.email;

            document.getElementById("checkoutOfferingId").value =
                window.client.offering._id;

            document.getElementById("priceId").value =
                window.client.offering.priceId;

            agreementAcceptedInput.value = "true";

        });

    }

});


function nextStep(current, next) {

    document.getElementById(current).classList.remove("active");
    document.getElementById(next).classList.add("active");

}

function saveName() {

    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    let preferredName = document.getElementById("preferredName").value.trim();
    const pronouns = document.getElementById("pronouns").value.trim();

    if (!firstName) {
        alert("Please enter your legal first name.");
        return;
    }

    if (!lastName) {
        alert("Please enter your legal last name.");
        return;
    }

    if (!preferredName) {
        preferredName = firstName;
    }

    console.log("preferred Name: ", preferredName);
    window.client = {
        firstName,
        lastName,
        preferredName,
        pronouns
    };

    localStorage.setItem(
        "client",
        JSON.stringify(window.client)
    );

    document.getElementById("welcomeName").textContent =
        preferredName

    nextStep("step1", "step2");

}


function updateAgreementLink() {

    const link = document.getElementById("agreementLink");

    if (!link || !window.client || !window.client.offering) {
        return;
    }

    const params = new URLSearchParams({
        offeringId: window.client.offering._id,
        firstName: window.client.firstName,
        lastName: window.client.lastName
    });

    link.href = `/coaching-agreement?${params.toString()}`;
}

function selectProgram(offeringId) {

    const offering = window.offerings.find(
        o => o._id === offeringId
    );

    if (!offering) {
        console.error("Offering not found:", offeringId);
        return;
    }

    window.client = window.client || {};

    window.client.offering = offering;

    localStorage.setItem(
        "client",
        JSON.stringify(window.client)
    );

    updateAgreementLink();

    nextStep("step2", "step3");
}

function togglePassword() {

    const input = document.getElementById("password");
    const icon = document.querySelector(".toggle-password img");

    const hidden = input.type === "password";

    input.type = hidden ? "text" : "password";

    icon.src = hidden
        ? "/images/eye.svg"
        : "/images/eye-off.svg";

}

async function createAccount() {

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;


    if (!email || !password) {
        alert("Please enter an email and password.");
        return;
    }

    const passwordError = document.getElementById("passwordError");
    passwordError.style.display = "none";

    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

    if (!passwordRegex.test(password)) {

        passwordError.textContent =
            "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.";

        passwordError.style.display = "block";

        return;
    }

    window.client = {
        ...window.client,
        email
    };

    localStorage.setItem(
        "client",
        JSON.stringify(window.client)
    );

    // Without an explicit Accept header, the server's error handler (which
    // picks JSON vs. an HTML error page via req.accepts()) treats this
    // request the same as a browser navigation and renders HTML — so
    // res.json() below would throw trying to parse it, silently swallowing
    // whatever went wrong server-side instead of showing it via alert().
    const res = await fetch("/create-account", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": window.CSRF_TOKEN
        },
        body: JSON.stringify({
            firstName: window.client.firstName,
            preferredName: window.client.preferredName,
            lastName: window.client.lastName,
            pronouns: window.client.pronouns,
            email,
            password
        })
    });

    const data = await res.json();

    if (!res.ok) {

        if (data.code === "ACCOUNT_EXISTS") {

            passwordError.innerHTML =
                `${data.error} If you already verified your email but didn't finish payment, ` +
                `<a href="/login">log in</a> and choose a program from your dashboard to continue.`;

            passwordError.style.display = "block";

            return;
        }

        alert(data.error || "Account creation failed.");
        return;
    }

    document.getElementById("verifyEmail").textContent = email;

    nextStep("step3", "step4");

}

async function verifyCode() {

    const code = document.getElementById("code").value.trim();

    const errorEl = document.getElementById("codeError");
    errorEl.style.display = "none";

    if (code.length !== 6) {
        errorEl.textContent = "Enter a valid 6-digit code.";
        errorEl.style.display = "block";
        return;
    }

    try {

        const res = await fetch("/verify-code", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-CSRF-Token": window.CSRF_TOKEN
            },
            body: JSON.stringify({
                email: window.client.email,
                code
            })
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data.error || "Invalid code.";
            errorEl.style.display = "block";
            return;
        }

        window.client.emailVerified = true;


        localStorage.setItem(
            "client",
            JSON.stringify(window.client)
        );

        populateCheckout();

        updateAgreementLink();

        nextStep("step4", "step5");

    } catch (err) {

        console.error(err);

        errorEl.textContent = "Something went wrong. Please try again.";
        errorEl.style.display = "block";

    }

}

async function resendVerificationCode() {

    const messageEl = document.getElementById("resendMessage");

    try {

        await fetch("/resend-verification-code", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": window.CSRF_TOKEN
            },
            body: JSON.stringify({
                email: window.client.email
            })
        });

        messageEl.textContent = "A new code has been sent.";
        messageEl.style.display = "block";

    } catch (err) {

        console.error(err);

    }

}

function populateCheckout() {

    const offering = window.client.offering;

    document.getElementById("checkoutProgramName").textContent =
        offering.name;

    document.getElementById("checkoutProgramPrice").textContent =
        `$${offering.price} · ${offering.duration}`;

    document.getElementById("checkoutProgramDescription").textContent =
        offering.description;

    document.getElementById("checkoutEmail").value =
        window.client.email;

    document.getElementById("checkoutOfferingId").value =
        offering._id;

    document.getElementById("priceId").value =
        offering.priceId;

}

