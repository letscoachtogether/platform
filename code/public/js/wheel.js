window.addEventListener("DOMContentLoaded", () => {

  const STORAGE_KEY = "wheel-of-life";

  const controls = document.getElementById("controls");
  const canvas = document.getElementById("wheelCanvas");

  const reflection = document.getElementById("reflection");

  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  const ctx = canvas.getContext("2d");

  function renderControls() {
    controls.innerHTML = "";

    categories.forEach((c, i) => {
      const div = document.createElement("div");

      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;">
          <strong>${c.name}</strong>
          <span id="score-${i}">${c.value}</span>
        </div>
        <input type="range" min="1" max="10" value="${c.value}" data-i="${i}">
      `;

      controls.appendChild(div);
    });

    controls.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", (e) => {
        const i = +e.target.dataset.i;
        categories[i].value = +e.target.value;

        document.getElementById(`score-${i}`).innerText = e.target.value;

        drawWheel();
        save();
      });
    });
  }

  function init() {

    load();
    const loaded = load();

    if (!loaded) {
      categories.forEach(c => {
        c.value = 1;
      });
    }

    renderControls();

    setupCanvas();
    drawWheel();

    window.addEventListener("resize", () => {
      setupCanvas();
      drawWheel();
    });

  }

  init();

});

