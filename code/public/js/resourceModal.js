const modal = document.getElementById("toolModal");
const title = document.getElementById("modalTitle");
const description = document.getElementById("modalDescription");

document.querySelectorAll(".tool").forEach(tool => {

    tool.addEventListener("click", e => {

        e.preventDefault();

        title.textContent = tool.dataset.title;
        description.textContent = tool.dataset.description;

        modal.style.display = "flex";

    });

});


document.querySelector(".close").addEventListener("click", () => {

    modal.style.display = "none";

});


window.addEventListener("click", e => {

    if (e.target === modal) {

        modal.style.display = "none";

    }

});