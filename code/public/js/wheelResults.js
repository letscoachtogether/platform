import { createWheelEngine } from "/js/wheelEngine.js";

console.log("wheelResults.js LOADED");

const canvas = document.getElementById("resultsWheelCanvas");

if (!canvas) {
    console.error("Canvas missing");
}

const engine = createWheelEngine(canvas);

console.log("WHEEL DATA: ", window.WHEEL_DATA);

const categories = Object.entries(window.WHEEL_DATA).map(([name, data]) => ({
    name,
    value: data.value,
    color: data.color
}));

console.log("PARSED CATEGORIES", categories);

engine.setData(categories);

engine.draw();