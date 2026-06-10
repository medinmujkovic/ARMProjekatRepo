document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('caseSearch');
    const table = document.getElementById('casesTable');

    if (!searchInput || !table) {
        return;
    }

    searchInput.addEventListener('input', () => {
        const value = searchInput.value.toLowerCase().trim();
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(value) ? '' : 'none';
        });
    });
});
