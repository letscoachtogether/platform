export function createWheelEngine(canvas) {

    const ctx = canvas.getContext("2d");

    let categories = [];

    function setData(data) {
        categories = data;
    }

    function resize() {
        const parent = canvas.parentElement;

        const size = Math.min(800, parent?.offsetWidth || 600);

        const dpr = window.devicePixelRatio || 1;

        canvas.style.width = size + "px";
        canvas.style.height = size + "px";

        canvas.width = size * dpr;
        canvas.height = size * dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        return size;
    }

    function draw() {

        const size = resize();
        const center = size / 2;
        const radius = size * 0.33;

        ctx.clearRect(0, 0, size, size);

        ctx.save();
        ctx.translate(center, center);

        const step = (Math.PI * 2) / categories.length;

        for (let i = 1; i <= 10; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, (radius * i) / 10, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0,0,0,0.08)";
            ctx.stroke();
        }

        categories.forEach((c, i) => {

            const angle = -Math.PI / 2 + i * step;

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius
            );
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.stroke();

            const lx = Math.cos(angle) * (radius + 25);
            const ly = Math.sin(angle) * (radius + 25);

            ctx.fillStyle = "#111";
            ctx.font = "14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            ctx.fillText(c.name, lx, ly);
        });

        ctx.beginPath();

        categories.forEach((c, i) => {

            const angle = -Math.PI / 2 + i * step;
            const r = radius * (c.value / 10);

            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

        });

        ctx.closePath();

        ctx.fillStyle = "rgba(56,189,248,0.25)";
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;

        ctx.fill();
        ctx.stroke();

        categories.forEach((c, i) => {

            const angle = -Math.PI / 2 + i * step;
            const r = radius * (c.value / 10);

            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;

            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = c.color || "#38bdf8";
            ctx.fill();
        });

        ctx.restore();
    }

    return {
        setData,
        draw,
        resize
    };
}