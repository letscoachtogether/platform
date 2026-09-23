// Formats dates/times in whichever timezone the VIEWER's browser is set to,
// instead of the server's. Server-side EJS (`new Date(x).toLocaleString()`)
// always renders in the server process's timezone — same markup for every
// viewer regardless of where they actually are. This runs client-side
// instead, where the browser's default Intl/Date behavior is already
// "viewer's local timezone" with no extra work.
//
// Usage: render the raw ISO instant into a data attribute instead of
// formatting it server-side, and this fills in the text on load:
//
//   <span data-datetime="<%= someDate.toISOString() %>" data-format="date-short">
//       <%= someDate.toISOString() %>
//   </span>
//
// The element's existing text is a plain fallback for anyone without JS;
// this immediately overwrites it once the page loads.
//
// data-format presets (see FORMATS below): "date" | "date-short" | "date-numeric"
// | "time" | "datetime" | "datetime-short"

const DATE_LOCALIZE_FORMATS = {
    "date": { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    "date-short": { month: "short", day: "numeric", year: "numeric" },
    "date-numeric": null, // toLocaleDateString() with no options — e.g. 1/5/2026
    "time": { hour: "numeric", minute: "2-digit" },
    "datetime": { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
    "datetime-short": { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
};

function localizeDates(root = document) {

    root.querySelectorAll("[data-datetime]").forEach(el => {

        const iso = el.getAttribute("data-datetime");

        if (!iso) return;

        const date = new Date(iso);

        if (isNaN(date)) return;

        const formatKey = el.getAttribute("data-format") || "date";
        const options = DATE_LOCALIZE_FORMATS[formatKey];

        if (formatKey === "time") {
            el.textContent = date.toLocaleTimeString("en-US", options);
        } else if (formatKey === "datetime" || formatKey === "datetime-short") {
            el.textContent = date.toLocaleString("en-US", options);
        } else {
            el.textContent = date.toLocaleDateString("en-US", options || undefined);
        }

    });

}

document.addEventListener("DOMContentLoaded", () => localizeDates());
