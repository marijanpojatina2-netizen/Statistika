# Košarkaška statistika (PWA)

Web aplikacija za vođenje statistike košarkaške utakmice uživo — na tabletu ili
mobitelu, potpuno offline. Svijetla tema, veliki dodirni gumbi, sve na hrvatskom.

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

Svaki unos može biti **grupa evenata** (npr. šut + asistencija). UNDO briše
cijelu zadnju grupu odjednom.

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
- [ ] Faza 3 — lančani upiti (asistencija / skok / slobodna bacanja)
- [ ] Faza 4 — napredna statistika, uređivanje evenata u logu
- [ ] Faza 5 — predlošci, arhiva, sezonska statistika, CSV/PNG export, dijeljenje
