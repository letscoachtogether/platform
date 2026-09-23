document.addEventListener(
    "DOMContentLoaded",
    () => {

        const slotButtons =
            document.querySelectorAll(
                'input[name="slot"]'
            );


        const startDateCard =
            document.getElementById(
                "startDateCard"
            );


        const startDatesContainer =
            document.getElementById(
                "startDates"
            );


        slotButtons.forEach(slot => {

            slot.addEventListener(
                "change",
                () => {

                    startDateCard.style.display =
                        "block";


                    startDatesContainer.innerHTML =
                        "";


                    const starts =
                        JSON.parse(
                            slot.dataset.starts || "[]"
                        );


                    if (!starts.length) {

                        startDatesContainer.innerHTML = `
                            <p>
                                No available start dates.
                            </p>
                        `;

                        return;

                    }

                    let count = 0;
                    starts.forEach(start => {
                        let startDate = new Date(start.start);
                        let today = new Date();
                        let twty_fr_hrs = 24 * 60 * 60 * 1000;
                        let diff = startDate - today;
                        if (count < 3 && diff > twty_fr_hrs) {
                            const startDate =
                            new Date(start.start);


                        const label =
                            document.createElement(
                                "label"
                            );


                        label.className =
                            "time-button";


                        label.innerHTML = `

                            <input
                                type="radio"
                                name="firstSession"
                                value="${start.start}"
                                required>

                            <span>
                                ${startDate.toLocaleDateString(
                                    "en-US",
                                    {
                                        weekday: "long",
                                        month: "long",
                                        day: "numeric",
                                        year: "numeric"
                                        // No timeZone override — this shows in whichever
                                        // timezone the client's own browser is set to.
                                    }
                                )}
                            </span>

                        `;

                        startDatesContainer.appendChild(
                            label
                        );
                        count++;
                        }

                        
                    });

                }
            );

        });

    }
);