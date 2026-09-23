import { createWheelEngine } from "/js/wheelEngine.js";

// Dashboard page elements
const submitDashboardWheel =
    document.getElementById("saveWheelBtn") ||
    document.getElementById("saveNewWheelBtn");
const dashboardMessage = document.getElementById("newWheelMessage");


const newWheelBtn = document.getElementById("newWheelBtn");
const newWheelSection = document.getElementById("newWheelSection");


function initializeWheelEditor(canvas, controls) {

    if (!canvas || !controls) {
        console.error("Missing editor elements", { canvas, controls });
        return;
    }


    const engine = createWheelEngine(canvas);

    const categories = [
        { name: "Career & Work", value: 1, color: "#38bdf8" },
        { name: "Money & Finances", value: 1, color: "#60a5fa" },
        { name: "Health & Fitness", value: 1, color: "#34d399" },
        { name: "Fun & Recreation", value: 1, color: "#f472b6" },
        { name: "Environment", value: 1, color: "#fbbf24" },
        { name: "Community", value: 1, color: "#fb7185" },
        { name: "Family & Friends", value: 1, color: "#a78bfa" },
        { name: "Partner & Love", value: 1, color: "#22d3ee" },
        { name: "Personal Growth & Learning", value: 1, color: "#f97316" },
        { name: "Spirituality", value: 1, color: "#c084fc" }
    ];


    function render() {
        engine.setData(categories);
        engine.draw();
    }

    function renderControls(controls) {

        controls.innerHTML = "";

        categories.forEach((c, i) => {

            const div = document.createElement("div");

            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;">
                    <strong>${c.name}</strong>
                    <span id="score-${i}">${c.value}</span>
                </div>

                <input
                    type="range"
                    min="1"
                    max="10"
                    value="${c.value}"
                    data-i="${i}"
                >
            `;

            controls.appendChild(div);

        });

        controls.querySelectorAll("input").forEach(input => {

            input.addEventListener("input", (e) => {

                const i = Number(e.target.dataset.i);

                categories[i].value = Number(e.target.value);

                document.getElementById(`score-${i}`).innerText = e.target.value;

                render();

            });

        });

    }

    function exportWheelData() {

        return categories.map(c => ({
            name: c.name,
            value: c.value,
            color: c.color
        }));

    }

    // ==========================
    // Client Dashboard Flow
    // ==========================

    if (submitDashboardWheel) {

        submitDashboardWheel.addEventListener("click", async () => {

            submitDashboardWheel.disabled = true;
            submitDashboardWheel.textContent = "Saving...";

            if (dashboardMessage) {
                dashboardMessage.classList.add("hidden");
                dashboardMessage.textContent = "";
            }

            try {

                const response = await fetch("/client-dashboard/wheel-of-life", {

                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": window.CSRF_TOKEN
                    },

                    body: JSON.stringify({
                        wheelResults: exportWheelData()
                    })

                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        data.message ||
                        "Unable to save your Wheel of Life."
                    );
                }

                if (dashboardMessage) {
                    dashboardMessage.textContent =
                        data.message || "Your Wheel of Life has been saved.";
                    dashboardMessage.classList.remove("hidden");
                }

                window.location.href = "/client-dashboard/wheel-of-life";

            } catch (err) {

                console.error(err);

                if (dashboardMessage) {
                    dashboardMessage.textContent = err.message;
                    dashboardMessage.classList.remove("hidden");
                }

            }

            submitDashboardWheel.disabled = false;
            submitDashboardWheel.textContent = "Save Results";

        });

    }

    renderControls(controls);
    render();

    window.addEventListener("resize", render);

}

window.addEventListener("DOMContentLoaded", () => {

    const canvas =
        document.getElementById("wheelCanvas") ||
        document.getElementById("newWheelCanvas");

    const controls =
        document.getElementById("controls") ||
        document.getElementById("newWheelControls");

    if (canvas && controls) {
        initializeWheelEditor(canvas, controls);
    }

    const newWheelBtn = document.getElementById("newWheelBtn");
    const newWheelSection = document.getElementById("newWheelSection");

    if (newWheelBtn && newWheelSection) {

        newWheelBtn.addEventListener("click", () => {

            newWheelSection.classList.remove("hidden");
            newWheelBtn.classList.add("hidden");

            window.scrollTo({
                top: newWheelSection.offsetTop - 50,
                behavior: "smooth"
            });

        });

    }

});