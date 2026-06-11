(function () {
    const config = window.ProjectApiConfig || {};
    const baseUrl = (config.baseUrl || "/api").replace(/\/+$/, "");

    const grid = document.getElementById("projectsGrid");
    const searchInput = document.getElementById("projectSearch");
    const newButton = document.getElementById("newProjectBtn");
    const nameLabel = document.getElementById("userNameLabel");
    const planLabel = document.getElementById("userPlanLabel");
    const initialsLabel = document.getElementById("userInitials");

    function parseJson(text) {
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, options);
        const text = await response.text();
        const data = parseJson(text);
        if (!response.ok) {
            const message = data && data.message ? data.message : "Greska na serveru.";
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function formatRelativeTime(isoValue) {
        const parsed = Date.parse(isoValue);
        if (!Number.isFinite(parsed)) return "Nepoznato";
        const diffMs = Math.max(0, Date.now() - parsed);
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return "Upravo sad";
        if (minutes < 60) return `Prije ${minutes} minuta`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Prije ${hours} sati`;
        const days = Math.floor(hours / 24);
        if (days === 1) return "Jucer";
        if (days < 7) return `Prije ${days} dana`;
        const weeks = Math.floor(days / 7);
        return `Prije ${weeks} sedmica`;
    }

    function createDetailRow(label, value) {
        const p = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = label;
        p.appendChild(strong);
        p.appendChild(document.createTextNode(" " + value));
        return p;
    }

    function createProjectCard(project) {
        const card = document.createElement("div");
        card.className = project.active ? "kartica-aktivna" : "kartica";
        card.dataset.projectId = project.id;

        if (project.active) {
            const badge = document.createElement("span");
            badge.className = "aktivna-oznaka";
            badge.textContent = "Aktivan";
            card.appendChild(badge);
        }

        const title = document.createElement("h2");
        title.className = "naslov-projekta";
        title.textContent = project.title || "Novi projekat";

        const description = document.createElement("p");
        description.className = "opis-projekta";
        description.textContent = project.genre || "Nedefinisano";

        const details = document.createElement("div");
        details.className = "detalji-projekta";
        details.appendChild(createDetailRow("Status:", project.status || "Nedefinisano"));
        details.appendChild(createDetailRow("Broj stranica:", String(project.pages || 0)));
        details.appendChild(
            createDetailRow("Vrijeme posljednje izmjene:", formatRelativeTime(project.lastEdited))
        );

        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(details);
        return card;
    }

    function createNewProjectCard() {
        const card = document.createElement("div");
        card.className = "kartica-noviprojekat";
        const content = document.createElement("div");
        content.className = "kartica-noviprojekat-sadrzaj";
        const icon = document.createElement("i");
        icon.className = "fa-regular fa-square-plus kartica-noviprojekat-ikona";
        const text = document.createElement("p");
        text.className = "kartica-noviprojekat-tekst";
        text.textContent = "Kreiraj novi scenarij";
        content.appendChild(icon);
        content.appendChild(text);
        card.appendChild(content);
        card.addEventListener("click", handleCreateProject);
        return card;
    }

    function renderProjects(projects) {
        if (!grid) return;
        grid.innerHTML = "";
        projects.forEach(project => {
            grid.appendChild(createProjectCard(project));
        });
        grid.appendChild(createNewProjectCard());
    }

    function getInitials(name) {
        if (!name) return "U";
        const parts = name.trim().split(/\s+/).filter(Boolean);
        const initials = parts.slice(0, 2).map(part => part[0].toUpperCase());
        return initials.join("") || "U";
    }

    async function loadUserBadge() {
        if (!nameLabel || !planLabel || !initialsLabel) return;
        try {
            const user = await fetchJson(`${baseUrl}/user`);
            nameLabel.textContent = user.name || "Korisnik";
            planLabel.textContent = user.plan || "Member";
            initialsLabel.textContent = getInitials(user.name);
        } catch (error) {
            console.warn(error);
        }
    }

    async function loadProjects(query) {
        const queryValue = query ? query.trim() : "";
        const url = queryValue
            ? `${baseUrl}/projects?q=${encodeURIComponent(queryValue)}`
            : `${baseUrl}/projects`;
        try {
            const data = await fetchJson(url);
            renderProjects(data.items || []);
        } catch (error) {
            console.error(error);
            if (grid) {
                grid.innerHTML = "";
                const empty = document.createElement("div");
                empty.className = "kartica";
                empty.textContent = "Nema dostupnih projekata.";
                grid.appendChild(empty);
            }
        }
    }

    async function handleCreateProject() {
        const title = window.prompt("Naziv projekta?");
        if (!title || !title.trim()) return;
        const payload = { title: title.trim() };
        try {
            await fetchJson(`${baseUrl}/projects`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (searchInput) searchInput.value = "";
            await loadProjects("");
        } catch (error) {
            console.error(error);
            window.alert("Neuspjelo kreiranje projekta.");
        }
    }

    function setupSearch() {
        if (!searchInput) return;
        let timer = null;
        searchInput.addEventListener("input", () => {
            if (timer) clearTimeout(timer);
            const value = searchInput.value;
            timer = setTimeout(() => {
                loadProjects(value);
            }, 250);
        });
    }

    function setupButtons() {
        if (newButton) {
            newButton.addEventListener("click", handleCreateProject);
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        loadUserBadge();
        loadProjects("");
        setupSearch();
        setupButtons();
    });
})();
