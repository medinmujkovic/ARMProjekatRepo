# Sudski informacioni sistem

Jednostavna ASP.NET Core aplikacija za sigurnu obradu sudskih predmeta i digitalnih dokaza.

## Tehnologije

- C# / ASP.NET Core MVC
- HTML, CSS i JavaScript
- SQLite baza podataka
- Lokalni folder za čuvanje uploadovanih fajlova
- SHA-256 provjera integriteta digitalnih dokaza

## Funkcionalnosti

- Prijava korisnika u sistem
- Prikaz dashboarda prema ulozi
- Kreiranje sudskog predmeta, samo glavni inspektor
- Pregled sudskih predmeta, sve uloge
- Dodavanje digitalnih dokaza, glavni inspektor i inspektor
- Pregled digitalnih dokaza, sve uloge
- SHA-256 provjera fajla, sve uloge
- Ograničenje neuspješnih pokušaja prijave
- Lozinke se čuvaju hashirane, ne u otvorenom obliku
- Upload ograničen na dozvoljene tipove fajlova

## Demo korisnici

| Uloga | Korisničko ime | Lozinka |
|---|---|---|
| Glavni inspektor | glavni | Glavni123! |
| Inspektor | inspektor | Inspektor123! |
| Sudija | sudija | Sudija123! |

## Pokretanje

U folderu projekta pokrenuti:

```bash
dotnet restore
dotnet run
```

Zatim otvoriti adresu koju terminal prikaže, najčešće:

```text
https://localhost:5001
```

Ako browser prijavi razvojni HTTPS certifikat, može se pokrenuti:

```bash
dotnet dev-certs https --trust
```

## Baza i fajlovi

- SQLite baza se automatski kreira u folderu `App_Data/court_system.db`.
- Digitalni dokazi se čuvaju u folderu `UploadedEvidence`.
- Aplikacija automatski dodaje tri demo korisnika i dva primjer sudska predmeta prilikom prvog pokretanja.


## HTTPS-only napomena

Aplikacija je podešena da sluša samo HTTPS endpoint `https://localhost:5001`.
HTTP endpoint je uklonjen kako se login forma ne bi mogla servirati preko nezaštićenog
HTTP saobraćaja ili lokalnog MITM proxyja. Session i anti-forgery cookie postavke ostaju
`Secure`, `HttpOnly` i `SameSite=Strict`.

Pokretanje:

```powershell
dotnet dev-certs https --trust
dotnet run
```

Otvoriti isključivo:

```text
https://localhost:5001
```
