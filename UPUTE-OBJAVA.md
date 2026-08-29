# Objava na kkdinamo.hr/statistika (Vercel)

Stranica kkdinamo.hr je na Vercelu, pa se aplikacija objavljuje kao zaseban
Vercel projekt iz ovog repozitorija. Lozinka se provjerava **na serveru**
(`middleware.js`) — bez nje se ne može ni do jedne datoteke.

## 1. Napravi Vercel projekt (5 minuta)

Radi osoba koja ima pristup Vercel računu kluba:

1. [vercel.com](https://vercel.com) → **Add New… → Project**
2. **Import** repozitorij `marijanpojatina2-netizen/Statistika`
   (poveži GitHub račun ako već nije)
3. Vercel sam prepozna Vite — ništa ne mijenjaj (Build `npm run build`,
   Output `dist`)
4. Prije klika na Deploy otvori **Environment Variables** i dodaj:
   | Ime | Vrijednost |
   |---|---|
   | `STAT_PASS` | lozinka koju će treneri upisivati |
   | `STAT_USER` | korisničko ime (neobavezno; zadano je `dinamo`) |
5. **Deploy** → dobiješ adresu tipa `statistika-xxxx.vercel.app`,
   već zaključanu lozinkom

> Bez postavljenog `STAT_PASS` stranica je otvorena — obavezno ga postavi.

## 2. Spoji na kkdinamo.hr

**Varijanta A — poddomena `statistika.kkdinamo.hr` (najjednostavnije):**
u novom projektu **Settings → Domains → Add** upiši
`statistika.kkdinamo.hr`. Ako je glavna domena u istom Vercel računu,
gotovo je odmah; inače Vercel ispiše DNS zapis koji treba dodati.

**Varijanta B — točno `kkdinamo.hr/statistika`:**
u projektu **glavne stranice** (kkdinamo.hr) dodaj u njezin `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/statistika", "destination": "https://ADRESA-NOVOG-PROJEKTA.vercel.app/statistika/" },
    { "source": "/statistika/:path*", "destination": "https://ADRESA-NOVOG-PROJEKTA.vercel.app/statistika/:path*" }
  ]
}
```

Aplikacija je građena s relativnim putanjama i poslužuje se i na `/` i na
`/statistika/`, pa rade obje varijante bez ponovnog builda.

## 3. Kako treneri koriste

- otvore adresu, preglednik pita korisničko ime i lozinku (jednom po uređaju,
  preglednik ih zapamti)
- **Dodaj na početni zaslon** → radi preko cijelog ekrana i **offline u
  dvorani** (nakon prve prijave s internetom)
- podaci (utakmice, arhiva, predlošci) ostaju **na tom uređaju** — ne dijele
  se između tableta ni s drugim trenerima; nakon utakmice izvezi CSV

## 4. Napomene

- Svaki push na granu `claude/basketball-stats-pwa-j3j0zs` automatski
  objavljuje novu verziju i na Vercel (kad se projekt spoji) i na GitHub Pages
- Kopija na GitHub Pagesu (`marijanpojatina2-netizen.github.io/Statistika`)
  **nema lozinku**. Kad klupska adresa proradi, isključi je:
  GitHub → Settings → Pages → **Disable**
- Promjena lozinke: Vercel → Project → Settings → Environment Variables →
  uredi `STAT_PASS` → **Redeploy**
