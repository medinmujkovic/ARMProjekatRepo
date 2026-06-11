let EditorTeksta = function (divReferenca) {
    if (!divReferenca || divReferenca.tagName !== "DIV") throw new Error("Pogresan tip elementa!");
    if (divReferenca.getAttribute("contenteditable") !== "true") throw new Error("Neispravan DIV, ne posjeduje contenteditable atribut!");

    const elementEditora = divReferenca;
    const regexSlovo = /\p{L}/u;

    function jeSlovo(znak) {
        return regexSlovo.test(znak);
    }

    function linijeTeksta() {
        
        const tekst = (elementEditora.innerText || "").replace(/\r/g, "");
        return tekst.split("\n");r
    }

    function jeNaslovScene(linija) {
        const t = linija.trim();
        if (!t) return false;
        if (t !== t.toUpperCase()) return false;

        return /^(INT\.|EXT\.)\s+/.test(t);
    }

    function jeUloga(linija) {
        const t = linija.trim();
        if (!t) return false;
        if (t !== t.toUpperCase()) return false;
        if (/^(INT\.|EXT\.)/.test(t)) return false;
        if (!regexSlovo.test(t)) return false;
        if (!/^[\p{L}\s]+$/u.test(t)) return false;
        if (/[0-9]/.test(t) || /[,.]/.test(t)) return false;
        return true;
    }

    function jeZagradjena(linija) {
        return /^\s*\(.*\)\s*$/.test(linija);
    }

    function imaGovorIspod(linije, indeks) {
        for (let i = indeks + 1; i < linije.length; i++) {
            const t = linije[i].trim();
            if (t === "") continue;
            if (jeZagradjena(t)) continue;
            if (jeNaslovScene(t)) return false;
            if (jeUloga(t)) return false;
            return true;
        }
        return false;
    }

    function kreirajScenu(naslov) {
        return { naslov: naslov || null, stavke: [], replikaBrojac: 0, segmentBrojac: 0, uSegmentu: false };
    }

    function parsirajTekst() {
        const linije = linijeTeksta();
        const scene = [];
        let scena = null;

        function sacuvajScenu() {
            if (!scena) return;
            const imaSadrzaj = scena.stavke.some(stavka => stavka.type !== "empty");
            if (!imaSadrzaj) return;
            scene.push({
                naslov: scena.naslov || "SCENA",
                stavke: scena.stavke
            });
        }

        function inicijalizujScenuAkoNedostaje() {
            if (!scena) scena = kreirajScenu(null);
        }

        let i = 0;
        while (i < linije.length) {
            const sirovaLinija = linije[i];
            const linija = sirovaLinija.trim();

            if (jeNaslovScene(linija)) {
                sacuvajScenu();
                scena = kreirajScenu(linija);
                i++;
                continue;
            }

            inicijalizujScenuAkoNedostaje();

            if (linija === "") {
                scena.stavke.push({ type: "empty" });
                i++;
                continue;
            }

            if (jeUloga(linija) && imaGovorIspod(linije, i)) {
                let j = i + 1;
                const linijeGovora = [];
                while (j < linije.length) {
                    const narednaLinija = linije[j].trim();
                    if (narednaLinija === "") break;
                    if (jeNaslovScene(narednaLinija)) break;
                    if (jeUloga(narednaLinija) && imaGovorIspod(linije, j)) break;
                    if (jeZagradjena(narednaLinija)) {
                        j++;
                        continue;
                    }
                    linijeGovora.push(narednaLinija);
                    j++;
                }

                if (linijeGovora.length > 0) {
                    scena.replikaBrojac++;
                    if (!scena.uSegmentu) {
                        scena.segmentBrojac++;
                        scena.uSegmentu = true;
                    }
                    scena.stavke.push({
                        type: "dialog",
                        uloga: linija,
                        linije: linijeGovora,
                        pozicijaUTekstu: scena.replikaBrojac,
                        segment: scena.segmentBrojac
                    });
                    i = j;
                    continue;
                }
            }

            scena.stavke.push({ type: "action", tekst: linija });
            scena.uSegmentu = false;
            i++;
        }

        sacuvajScenu();
        return scene;
    }

    function dajBrojRijeci() {
        const tok = [];

        function obilazi(cvor, bold = false, italic = false) {
            if (cvor.nodeType === Node.TEXT_NODE) {
                const tekst = cvor.nodeValue || "";
                for (const znak of tekst) tok.push({ znak, boldirano: bold, kurziv: italic });
                return;
            }

            if (cvor.nodeType === Node.ELEMENT_NODE) {
                const novoBold = bold || ["B", "STRONG"].includes(cvor.tagName);
                const novoItalic = italic || ["I", "EM"].includes(cvor.tagName);
                if (cvor.tagName === "BR") tok.push({ znak: "\n", boldirano: false, kurziv: false });
                for (const dijete of cvor.childNodes) obilazi(dijete, novoBold, novoItalic);
            }
        }

        obilazi(elementEditora);

        let ukupno = 0;
        let boldiranih = 0;
        let kurzivnih = 0;
        let indeks = 0;

        function prodjiRijec(startIndeks) {
            let sveBoldirano = tok[startIndeks].boldirano;
            let savKurziv = tok[startIndeks].kurziv;
            let j = startIndeks + 1;
            while (j < tok.length) {
                const trenutniZnak = tok[j].znak;
                const jeSlovoNastavak = jeSlovo(trenutniZnak);
                const imaSlovoIza = j + 1 < tok.length ? jeSlovo(tok[j + 1].znak) : false;
                const znakUnutar = (trenutniZnak === "-" || trenutniZnak === "'") && j > startIndeks && imaSlovoIza;
                if (jeSlovoNastavak || znakUnutar) {
                    sveBoldirano = sveBoldirano && tok[j].boldirano;
                    savKurziv = savKurziv && tok[j].kurziv;
                    j++;
                } else break;
            }
            return { kraj: j, sveBoldirano, savKurziv };
        }

        while (indeks < tok.length) {
            if (jeSlovo(tok[indeks].znak)) {
                const rezultat = prodjiRijec(indeks);
                ukupno++;
                if (rezultat.sveBoldirano) boldiranih++;
                if (rezultat.savKurziv) kurzivnih++;
                indeks = rezultat.kraj;
            } else {
                indeks++;
            }
        }

        return { ukupno, boldiranih, italic: kurzivnih };
    }

    function dajUloge() {
        const scene = parsirajTekst();
        const vidjene = new Set();
        const uloge = [];

        scene.forEach(scena => {
            scena.stavke.forEach(stavka => {
                if (stavka.type === "dialog" && !vidjene.has(stavka.uloga)) {
                    vidjene.add(stavka.uloga);
                    uloge.push(stavka.uloga);
                }
            });
        });

        return uloge;
    }

    function razlikaULiteralima(a, b) {
        const matrica = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
        for (let i = 0; i <= a.length; i++) matrica[i][0] = i;
        for (let j = 0; j <= b.length; j++) matrica[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cijena = a[i - 1] === b[j - 1] ? 0 : 1;
                matrica[i][j] = Math.min(
                    matrica[i - 1][j] + 1,
                    matrica[i][j - 1] + 1,
                    matrica[i - 1][j - 1] + cijena
                );
            }
        }
        return matrica[a.length][b.length];
    }

    function pogresnaUloga() {
        const scene = parsirajTekst();
        const brojac = {};

        scene.forEach(scena => {
            scena.stavke.forEach(stavka => {
                if (stavka.type === "dialog") {
                    brojac[stavka.uloga] = (brojac[stavka.uloga] || 0) + 1;
                }
            });
        });

        const sveUloge = Object.keys(brojac);
        const rezultat = [];

        for (const ulogaA of sveUloge) {
            for (const ulogaB of sveUloge) {
                if (ulogaA === ulogaB) continue;
                const distanca = razlikaULiteralima(ulogaA, ulogaB);
                const prag = (ulogaA.length > 5 && ulogaB.length > 5) ? 2 : 1;
                if (distanca > prag) continue;
                if (brojac[ulogaB] >= 4 && brojac[ulogaB] >= brojac[ulogaA] + 3) {
                    if (!rezultat.includes(ulogaA)) rezultat.push(ulogaA);
                }
            }
        }

        return rezultat;
    }

    function brojLinijaTeksta(uloga) {
        if (!uloga) return 0;
        const ciljnaUloga = uloga.toUpperCase();
        const scene = parsirajTekst();
        let ukupno = 0;

        scene.forEach(scena => {
            scena.stavke.forEach(stavka => {
                if (stavka.type === "dialog" && stavka.uloga === ciljnaUloga) {
                    ukupno += stavka.linije.length;
                }
            });
        });

        return ukupno;
    }

    function scenarijUloge(uloga) {
        if (!uloga) return [];
        const ciljnaUloga = uloga.toUpperCase();
        const scene = parsirajTekst();
        const rezultat = [];

        scene.forEach(scena => {
            const dijalozi = scena.stavke.filter(stavka => stavka.type === "dialog");
            for (let i = 0; i < dijalozi.length; i++) {
                const dijalog = dijalozi[i];
                if (dijalog.uloga !== ciljnaUloga) continue;

                const trenutni = { uloga: dijalog.uloga, linije: dijalog.linije.join("\n") };
                let prethodni = null;
                for (let p = i - 1; p >= 0; p--) {
                    if (dijalozi[p].segment !== dijalog.segment) break;
                    prethodni = { uloga: dijalozi[p].uloga, linije: dijalozi[p].linije.join("\n") };
                    break;
                }

                let sljedeci = null;
                for (let n = i + 1; n < dijalozi.length; n++) {
                    if (dijalozi[n].segment !== dijalog.segment) break;
                    sljedeci = { uloga: dijalozi[n].uloga, linije: dijalozi[n].linije.join("\n") };
                    break;
                }

                rezultat.push({
                    scena: scena.naslov,
                    pozicijaUTekstu: dijalog.pozicijaUTekstu,
                    prethodni: prethodni,
                    trenutni: trenutni,
                    sljedeci: sljedeci
                });
            }
        });

        return rezultat;
    }

    function grupisiUloge() {
        const scene = parsirajTekst();
        const rezultat = [];

        scene.forEach(scena => {
            let trenutniSegment = null;
            let uloge = [];
            scena.stavke.forEach(stavka => {
                if (stavka.type === "dialog") {
                    if (trenutniSegment === null || trenutniSegment !== stavka.segment) {
                        if (uloge.length > 0) {
                            rezultat.push({ scena: scena.naslov, segment: trenutniSegment, uloge: uloge });
                        }
                        trenutniSegment = stavka.segment;
                        uloge = [];
                    }
                    if (!uloge.includes(stavka.uloga)) uloge.push(stavka.uloga);
                } else if (stavka.type === "action") {
                    if (uloge.length > 0) {
                        rezultat.push({ scena: scena.naslov, segment: trenutniSegment, uloge: uloge });
                        uloge = [];
                        trenutniSegment = null;
                    }
                }
            });

            if (uloge.length > 0) {
                rezultat.push({ scena: scena.naslov, segment: trenutniSegment, uloge: uloge });
            }
        });

        return rezultat;
    }

    function formatirajTekst(komanda) {
        const selekcija = window.getSelection();
        if (!selekcija || selekcija.rangeCount === 0) return false;
        const opseg = selekcija.getRangeAt(0);
        if (opseg.collapsed) return false;

        function jeUnutar(cvor) {
            let trenutni = cvor;
            while (trenutni) {
                if (trenutni === elementEditora) return true;
                trenutni = trenutni.parentNode;
            }
            return false;
        }

        if (!jeUnutar(opseg.startContainer) || !jeUnutar(opseg.endContainer)) return false;

        if (komanda === "bold") document.execCommand("bold");
        else if (komanda === "italic") document.execCommand("italic");
        else if (komanda === "underline") document.execCommand("underline");
        else return false;

        return true;
    }

    return {
        dajBrojRijeci,
        dajUloge,
        pogresnaUloga,
        brojLinijaTeksta,
        scenarijUloge,
        grupisiUloge,
        formatirajTekst
    };
};

if (typeof window !== "undefined") window.EditorTeksta = EditorTeksta;
