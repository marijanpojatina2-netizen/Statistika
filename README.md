# Košarkaška statistika (PWA)

Web aplikacija za vođenje statistike košarkaške utakmice uživo — na tabletu ili
mobitelu, potpuno offline. Tamna tema u klupskim bojama, veliki dodirni gumbi,
sve na hrvatskom.

## Dizajn

Vizualni jezik prema handoffu `design_handoff_dinamo_redizajn`: Barlow /
Barlow Condensed (self-hostani u `public/fonts/`, pa rade offline), tamna
mornarska paleta s Dinamo plavom, parket na dijagramu terena.

**Grb kluba:** stavi sliku u `public/crest.png` ili `public/crest.jpg` i
pojavit će se u zaglavlju i na setup ekranu. Bez nje se prikazuju inicijali
ekipe.

**Zamjena povlačenjem:** prstom se povlačenje pokreće tek nakon kratkog
zadržavanja prsta na kartici igrača — bez toga bi popis igrača prestao
skrolati. Mišem povlačenje kreće nakon 12 px. Gumb „Zamjena" radi isto
i uvijek je dostupan.

## Ključni koncept — event log

Sve je event u kronološkom logu (tip, igrač, četvrtina, vrijeme, pozicija šuta).
**Box score, shot chart i napredna statistika uvijek se izračunavaju iz loga** —
nikad se ne pohranjuju zasebno. Zato UNDO i naknadne izmjene automatski isprave
sve izvedene brojke.

- `src/model/events.js` — tipovi evenata, kreiranje, UNDO grupe
- `src/model/derive.js` — sav izračun (box score, +/-, minutaža, prekršaji, serije)
- `src/model/game.js` — nova utakmica, stanje sata
- `src/model/court.js` — FIBA geometrija terena, 2P/3P i zone iz pozicije
- `src/state/GameContext.jsx` — unos evenata + automatsko spremanje u localStorage
- `src/model/season.js` — sezonski agregat preko arhiviranih utakmica
- `src/model/exportCsv.js` — CSV izvoz i sažetak za dijeljenje
- `src/model/svgPng.js` — shot chart kao PNG slika

Svaki unos može biti **grupa evenata** (npr. šut + asistencija, ukradena +
izgubljena protivnika). UNDO briše cijelu zadnju grupu odjednom, pa jedan UNDO
poništi cijeli and-1 lanac (šut + faul + slobodno bacanje).

Posebni tokovi:
- **and-1** — nakon pogotka „+ FAUL" upiše protivnički faul, izborenu osobnu
  šutera i otvori 1 slobodno bacanje, sve u istoj grupi
- **šuterski faul** — nakon promašaja briše upisani pokušaj šuta iz grupe (FIBA:
  nema pokušaja) i otvara 2 ili 3 bacanja prema poziciji šuta
- **bonus** — peti momčadski prekršaj u četvrtini automatski otvara 2 bacanja;
  ako je to ujedno igračeva peta osobna, obavezna zamjena se traži nakon bacanja

## Pokretanje

```bash
npm install
npm run dev        # razvoj
npm run build      # produkcijski build u dist/
npm run preview    # provjera builda
```

## Objava na GitHub Pages

`.github/workflows/deploy.yml` gradi i objavljuje aplikaciju na svaki push.
Jednokratno treba uključiti Pages: **Settings → Pages → Source: GitHub Actions**.

## Status po fazama

- [x] **Faza 1** — event log arhitektura, glavni ekran s klasičnim gumbima, UNDO,
      zamjene, semafor (s vremenom i bez), box score, play-by-play, PWA/offline
- [x] **Faza 2** — dijagram terena (FIBA mjere) za unos šuteva u 3 dodira,
      automatsko određivanje 2P/3P iz pozicije, shot chart s filtrima i
      postocima po zonama (`src/model/court.js`, `src/components/Court.jsx`)
- [x] **Faza 3** — lančani upiti: asistencija nakon pogotka, skok nakon
      promašaja, automatska izgubljena protivniku nakon ukradene, upit za
      ukradenu nakon izgubljene, flow slobodnih bacanja, otvaranje zamjene na
      peti prekršaj (`src/components/ChainBar.jsx`)
- [x] **Faza 4** — napredna statistika (eFG%, TS%, procjena posjeda, PPP,
      OR%/DR%, TO ratio, udio poena po izvoru, vodstva i serije) i uređivanje
      evenata u play-by-playu (`src/components/AdvancedStats.jsx`,
      `src/components/EventEditor.jsx`)
- [x] **Faza 5** — predlošci rostera, arhiva utakmica, sezonski prosjeci s
      trendom zadnjih 5 utakmica, CSV izvoz (box score, play-by-play, sezona),
      shot chart kao PNG i tekstualni sažetak za dijeljenje
      (`src/model/exportCsv.js`, `src/model/season.js`, `src/model/svgPng.js`,
      `src/screens/ArchiveScreen.jsx`)

## Podaci u pregledniku

Sve živi u `localStorage` istog preglednika i profila:

| Ključ | Sadržaj |
|---|---|
| `ks.current` | utakmica koja je u tijeku (sprema se nakon svakog eventa) |
| `ks.archive` | završene utakmice s cijelim event logom |
| `ks.templates` | predlošci ekipa i rostera |

Brisanje podataka preglednika briše i ovo, pa je pametno nakon utakmice
izvesti CSV. Arhiva se ne sinkronizira između uređaja.
