(function () {
    const config = window.UserApiConfig || {};
    const baseUrl = (config.baseUrl || "/api").replace(/\/+$/, "");

    const form = document.getElementById("userForm");
    const nameInput = document.getElementById("userName");
    const emailInput = document.getElementById("userEmail");
    const itemsInput = document.getElementById("userItemsPerPage");
    const passwordInput = document.getElementById("userPassword");
    const twoFactorInput = document.getElementById("user2fa");
    const frequencySelect = document.getElementById("userFrequency");
    const statusBox = document.getElementById("userStatus");
    const saveButton = document.querySelector(".dugme-spremi");

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

    function setStatus(message, type) {
        if (!statusBox) return;
        statusBox.textContent = message;
        statusBox.dataset.type = type || "";
    }

    function getSelectedContact() {
        const selected = document.querySelector('input[name="kontakt"]:checked');
        return selected ? selected.value : "email";
    }

    function setSelectedContact(value) {
        const radio = document.querySelector(`input[name="kontakt"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
        }
    }

    async function loadUser() {
        try {
            const user = await fetchJson(`${baseUrl}/user`);
            if (nameInput) nameInput.value = user.name || "";
            if (emailInput) emailInput.value = user.email || "";
            if (itemsInput) itemsInput.value = user.itemsPerPage || 25;
            if (twoFactorInput) twoFactorInput.checked = Boolean(user.twoFactorEnabled);
            if (frequencySelect) frequencySelect.value = user.notificationFrequency || "Daily";
            setSelectedContact(user.preferredContact || "email");
        } catch (error) {
            console.error(error);
            setStatus("Neuspjelo ucitavanje podataka.", "error");
        }
    }

    async function submitForm(event) {
        event.preventDefault();
        if (saveButton) saveButton.disabled = true;
        setStatus("Spremanje...", "info");

        const payload = {
            name: nameInput ? nameInput.value.trim() : "",
            email: emailInput ? emailInput.value.trim() : "",
            twoFactorEnabled: twoFactorInput ? twoFactorInput.checked : false,
            preferredContact: getSelectedContact(),
            notificationFrequency: frequencySelect ? frequencySelect.value : "Daily"
        };

        if (itemsInput) {
            const parsedItems = parseInt(itemsInput.value, 10);
            if (Number.isFinite(parsedItems)) {
                payload.itemsPerPage = parsedItems;
            }
        }

        if (passwordInput && passwordInput.value.trim().length > 0) {
            payload.password = passwordInput.value.trim();
        }

        try {
            await fetchJson(`${baseUrl}/user`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            setStatus("Podaci su sacuvani.", "success");
            if (passwordInput) passwordInput.value = "";
        } catch (error) {
            console.error(error);
            setStatus("Neuspjelo spremanje.", "error");
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        loadUser();
        if (form) {
            form.addEventListener("submit", submitForm);
        }
    });
})();
