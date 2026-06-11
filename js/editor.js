document.addEventListener('DOMContentLoaded', function () {
    let div = document.getElementById('divEditor');
    let poruke = document.getElementById('poruke');
    const inputScenarioId = document.getElementById('inputScenarioId');
    const inputUserId = document.getElementById('inputUserId');
    const inputOldName = document.getElementById('inputOldName');
    const inputNewName = document.getElementById('inputNewName');
    const inputSince = document.getElementById('inputSince');
    const btnLoadScenario = document.getElementById('btnLoadScenario');
    const btnRenameCharacter = document.getElementById('btnRenameCharacter');
    const btnGetDeltas = document.getElementById('btnGetDeltas');
    
    function show(msg) {
        poruke.textContent = msg;
    }

    function normalizeId(value) {
        if (value === null || value === undefined) return null;
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function formatGrupa(grupa) {
        return grupa.scena + ' [segment ' + grupa.segment + ']: ' + grupa.uloge.join(', ');
    }

    function formatScenarij(stavka) {
        const linije = stavka.trenutni.linije.replace(/\n/g, ' / ');
        const prethodni = stavka.prethodni ? (stavka.prethodni.uloga + ': ' + stavka.prethodni.linije.replace(/\n/g, ' / ')) : 'null';
        const sljedeci = stavka.sljedeci ? (stavka.sljedeci.uloga + ': ' + stavka.sljedeci.linije.replace(/\n/g, ' / ')) : 'null';
        return 'Scena: ' + stavka.scena +
            ' | pozicija: ' + stavka.pozicijaUTekstu +
            ' | uloga: ' + stavka.trenutni.uloga +
            ' | linije: ' + linije +
            ' | prethodni: ' + prethodni +
            ' | sljedeci: ' + sljedeci;
    }
    
    let editor;
    try {
        editor = EditorTeksta(div);
    } catch (e) {
        show('Greška pri inicijalizaciji editora: ' + e.message);
        return;
    }
    
    
    const ajaxAvailable = typeof window.PoziviAjax !== 'undefined';

    function readPageConfig() {
        const root = document.body || document.documentElement;
        const params = window.URLSearchParams ? new URLSearchParams(window.location.search) : null;
        const scenarioId = (root && root.getAttribute('data-scenario-id')) || (params ? params.get('scenarioId') : null);
        const userId = (root && root.getAttribute('data-user-id')) || (params ? params.get('userId') : null);
         return {
            scenarioId: scenarioId ? scenarioId.trim() : null,
            userId: userId ? userId.trim() : null
        };
    }

    function scenarioTextFromResponse(data) {
        if (!data) return null;
        if (typeof data === 'string') return data;
        if (typeof data.text === 'string') return data.text;
        if (typeof data.content === 'string') return data.content;
        if (typeof data.tekst === 'string') return data.tekst;
        if (Array.isArray(data.content)) {
            return data.content.map(function (line) {
                if (typeof line === 'string') return line;
                if (line && typeof line.text === 'string') return line.text;
                return '';
            }).join('\n');
        }
        const lines = data.lines || data.linije;
        if (Array.isArray(lines)) {
            return lines.map(function (line) {
                if (typeof line === 'string') return line;
                if (line && typeof line.text === 'string') return line.text;
                if (line && typeof line.tekst === 'string') return line.tekst;
                return '';
            }).join('\n');
        }
        return null;
    }

    function scenarioTitleFromResponse(data) {
        if (!data) return null;
        if (typeof data.title === 'string') return data.title;
        if (typeof data.naziv === 'string') return data.naziv;
        if (typeof data.name === 'string') return data.name;
        return null;
    }

    function applyScenarioResponse(data) {
        const text = scenarioTextFromResponse(data);
        if (text !== null) {
            div.textContent = text;
        }
        const title = scenarioTitleFromResponse(data);
        if (title) {
            const titleEl = document.querySelector('.naslov-projekta');
            if (titleEl) titleEl.textContent = title;
        }
    }

    function extractScenarioId(data) {
        if (!data) return null;
        if (data.id !== undefined && data.id !== null) return data.id;
        if (data.scenarioId !== undefined && data.scenarioId !== null) return data.scenarioId;
        if (data.scenarijId !== undefined && data.scenarijId !== null) return data.scenarijId;
        return null;
    }

    function getEditorText() {
        return (div.innerText || '').replace(/\r/g, '');
    }

    const pageConfig = readPageConfig();
    let scenarioId = normalizeId(pageConfig.scenarioId);
    let userId = normalizeId(pageConfig.userId) || 1;

    if (inputScenarioId && scenarioId) inputScenarioId.value = scenarioId;
    if (inputUserId) inputUserId.value = userId;

    function readScenarioId() {
        if (inputScenarioId && inputScenarioId.value !== '') {
            return normalizeId(inputScenarioId.value);
        }
        return normalizeId(scenarioId);
    }

    function readUserId() {
        if (inputUserId && inputUserId.value !== '') {
            const parsed = normalizeId(inputUserId.value);
            if (parsed !== null) return parsed;
        }
        return normalizeId(userId) || 1;
    }

    function setScenarioId(id) {
        scenarioId = id;
        if (inputScenarioId) inputScenarioId.value = id;
    }

    function setUserId(id) {
        userId = id;
        if (inputUserId) inputUserId.value = id;
    }

    function loadScenario() {
        const currentScenarioId = readScenarioId();
        if (!ajaxAvailable || !currentScenarioId) return;
        setScenarioId(currentScenarioId);
        PoziviAjax.getScenario(currentScenarioId, function (status, data) {
            if (status >= 200 && status < 300) {
                applyScenarioResponse(data);
            } else {
                show('Neuspješno učitavanje scenarija (status ' + status + ').');
            }
        });
    }

    function lockAndUpdateLine(lineId, newText, done) {
        if (!ajaxAvailable) {
            done(0, null);
            return;
        }
        const currentScenarioId = readScenarioId();
        const currentUserId = readUserId();
        if (!currentScenarioId) {
            done(0, null);
            return;
        }
        setScenarioId(currentScenarioId);
        setUserId(currentUserId);
        PoziviAjax.lockLine(currentScenarioId, lineId, currentUserId, function (status, data) {
            if (status >= 200 && status < 300) {
                PoziviAjax.updateLine(currentScenarioId, lineId, currentUserId, newText, done);
                return;
            }
            done(status, data);
        });
    }

    function saveLines(lines, scenario) {
        if (!lines.length) {
            show('Nema ništa za spremanje.');
            return;
        }
        if (!scenario || !Array.isArray(scenario.content) || !scenario.content.length) {
            show('Nedostaje sadržaj scenarija (odgovor backenda).');
            return;
        }

        const ordered = scenario.content;
        const existingCount = ordered.length;
        const newCount = lines.length;
        const minCount = Math.min(existingCount, newCount);
        if (minCount <= 0) {
            show('Nema ništa za spremanje.');
            return;
        }

        const updates = [];
        for (let i = 0; i < minCount - 1; i += 1) {
            updates.push({ lineId: ordered[i].lineId, payload: [lines[i]] });
        }

        const lastIndex = minCount - 1;
        const extras = newCount > existingCount ? lines.slice(existingCount) : [];
        const payload = [lines[lastIndex] || ""].concat(extras);
        updates.push({ lineId: ordered[lastIndex].lineId, payload: payload });

        let index = 0;
        function next() {
            if (index >= updates.length) {
                show('Spremljeno ' + updates.length + ' linija.');
                return;
            }
            const update = updates[index];
            lockAndUpdateLine(update.lineId, update.payload, function (status) {
                if (status >= 200 && status < 300) {
                    index++;
                    next();
                } else {
                    show('Neuspješno spremanje linije ' + update.lineId + ' (status ' + status + ').');
                }
            });
        }
        next();
    }

    function getScenarioTitle() {
        const titleEl = document.querySelector('.naslov-projekta');
        const raw = titleEl ? titleEl.textContent : '';
        return raw ? raw.trim() : 'Scenarij';
    }

    function saveScenario() {
        if (!ajaxAvailable) {
            show('PoziviAjax modul nije dostupan (frontend nije povezan s backendom).');
            return;
        }
        const raw = getEditorText();
        const lines = raw ? raw.split('\n') : [];
        const currentScenarioId = readScenarioId();
        const currentUserId = readUserId();
        setUserId(currentUserId);
        if (!currentScenarioId) {
            PoziviAjax.postScenario(getScenarioTitle(), function (status, data) {
                if (status >= 200 && status < 300) {
                    const newScenarioId = extractScenarioId(data);
                    if (!newScenarioId) {
                        show('Scenarij je kreiran, ali ID nije vraćen.');
                        return;
                    }
                    setScenarioId(newScenarioId);
                    saveLines(lines, data);
                } else {
                    show('Neuspješno kreiranje scenarija (status ' + status + ').');
                }
            });
            return;
        }
        setScenarioId(currentScenarioId);
        PoziviAjax.getScenario(currentScenarioId, function (status, data) {
            if (status >= 200 && status < 300) {
                saveLines(lines, data);
            } else {
                show('Neuspješno učitavanje scenarija (status ' + status + ').');
            }
        });
    }

    loadScenario();

    const saveButton = document.querySelector('.dugme-spasi');
    if (saveButton) {
        saveButton.addEventListener('click', saveScenario);
    }

    if (btnLoadScenario) {
        btnLoadScenario.addEventListener('click', function () {
            const currentScenarioId = readScenarioId();
            if (!currentScenarioId) {
                show('ID scenarija nije unesen.');
                return;
            }
            setScenarioId(currentScenarioId);
            setUserId(readUserId());
            loadScenario();
        });
    }

    if (btnRenameCharacter) {
        btnRenameCharacter.addEventListener('click', function () {
            const currentScenarioId = readScenarioId();
            const currentUserId = readUserId();
            const oldName = inputOldName ? inputOldName.value.trim() : '';
            const newName = inputNewName ? inputNewName.value.trim() : '';
            if (!currentScenarioId) {
                show('ID scenarija nije unesen.');
                return;
            }
            if (!oldName || !newName) {
                show('Staro i novo ime su obavezni.');
                return;
            }
            setScenarioId(currentScenarioId);
            setUserId(currentUserId);
            PoziviAjax.lockCharacter(currentScenarioId, oldName, currentUserId, function (status, data) {
                if (status >= 200 && status < 300) {
                    PoziviAjax.updateCharacter(currentScenarioId, currentUserId, oldName, newName, function (statusUpdate, dataUpdate) {
                        if (statusUpdate >= 200 && statusUpdate < 300) {
                            show((dataUpdate && dataUpdate.message) ? dataUpdate.message : 'Lik je uspješno ažuriran.');
                        } else {
                            show((dataUpdate && dataUpdate.message) ? dataUpdate.message : ('Neuspješno ažuriranje (status ' + statusUpdate + ').'));
                        }
                    });
                } else {
                    show((data && data.message) ? data.message : ('Neuspješno zaključavanje (status ' + status + ').'));
                }
            });
        });
    }

    if (btnGetDeltas) {
        btnGetDeltas.addEventListener('click', function () {
            const currentScenarioId = readScenarioId();
            if (!currentScenarioId) {
                show('ID scenarija nije unesen.');
                return;
            }
            const sinceRaw = inputSince ? inputSince.value : '';
            const since = normalizeId(sinceRaw) || 0;
            setScenarioId(currentScenarioId);
            PoziviAjax.getDeltas(currentScenarioId, since, function (status, data) {
                if (status >= 200 && status < 300) {
                    show(JSON.stringify(data, null, 2));
                } else {
                    show((data && data.message) ? data.message : ('Neuspješno dohvaćanje promjena (status ' + status + ').'));
                }
            });
        });
    }

    document.getElementById('btnBrojRijeci').addEventListener('click', function () {
        let res = editor.dajBrojRijeci();
        show('Ukupno: ' + res.ukupno + ', Bold: ' + res.boldiranih + ', Italic: ' + res.italic);
    });
    
    document.getElementById('btnUloge').addEventListener('click', function () {
        let res = editor.dajUloge();
        show(res.length ? res.join(', ') : 'Nema pronađenih uloga');
    });
    
    document.getElementById('btnPogresne').addEventListener('click', function () {
        let res = editor.pogresnaUloga();
        show(res.length ? 'Potencijalno pogrešne uloge: ' + res.join(', ') : 'Nema potencijalno pogrešnih imena');
    });
    
    document.getElementById('btnGrupisi').addEventListener('click', function () {
        let res = editor.grupisiUloge();
        show(res.length ? res.map(formatGrupa).join('\n') : 'Nema grupa za prikaz');
    });
    
    document.getElementById('btnBrojLinija').addEventListener('click', function () {
        let u = prompt('Unesite ime uloge (kao u tekstu):');
        if (u === null) return;
        let res = editor.brojLinijaTeksta(u);
        show('Broj linija za ulogu "' + u + '": ' + res);
    });
    
    document.getElementById('btnScenarijUloge').addEventListener('click', function () {
        let u = prompt('Unesite ime uloge (može mala/velika slova):');
        if (u === null) return;
        let res = editor.scenarijUloge(u);
        show(res.length ? res.map(formatScenarij).join('\n\n') : 'Nema replika za tu ulogu');
    });

    document.getElementById('btnBold').addEventListener('click', function () {
        let ok = editor.formatirajTekst('bold');
        show(ok ? 'Formatirano (bold).' : 'Nije selektovano ili selekcija nije unutar editora.');
    });
    
    document.getElementById('btnItalic').addEventListener('click', function () {
        let ok = editor.formatirajTekst('italic');
        show(ok ? 'Formatirano (italic).' : 'Nije selektovano ili selekcija nije unutar editora.');
    });
    
    document.getElementById('btnUnderline').addEventListener('click', function () {
        let ok = editor.formatirajTekst('underline');
        show(ok ? 'Formatirano (underline).' : 'Nije selektovano ili selekcija nije unutar editora.');
    });
});

