# Krojni uzorci iz fotografija → DXF/PDF (1:1, mm)

Četiri fotografije krojnih uzoraka na papiru s crvenom mrežom (`fotke/`) pretvaraju se u
vektorske konture u milimetrima, 1:1.

## Pokretanje

```bash
pip install opencv-python-headless numpy scipy scikit-image shapely ezdxf matplotlib
python3 krojevi/run.py
```

Rezultati u `izlaz/`:

| datoteka | sadržaj |
|---|---|
| `elementi_1_1.dxf` | 4 konture 1:1, svaka na svom sloju (`KLUP LICE`, `MALA KUPA STOLA`, `1A PROVA LIJEVA`, `1F LICE`), sloj `KOTE` s gabaritnim kotama |
| `elementi_1_1.pdf` | pregled + stranica po elementu, mreža 100/50 mm, gabaritne kote |
| `elementi_traka_offset.dxf` | po elementu: `… KONTURA` (referenca), `… OFFSET` (+10 mm prema van, round join), `… TRAKA` (traka 90 mm × opseg s oznakama uglova) |
| `elementi_traka_offset.pdf` | stranica po elementu: offset + traka s oznakama |
| `konture_mm.json` | polilinije (mm), opseg, gabarit, položaji uglova |
| `kontrola/*_ispravljeno_kontura.png` | ispravljena fotografija (1 px = 1 mm) s mrežom, detektiranim presjecištima i konturom |
| `kontrola/*_detekcija_mreze.png` | original s detektiranim linijama mreže, presjecištima i konturom |

## Kako radi

1. **Mreža** (`krojevi/grid.py`): crvene linije papira su na rasteru **10 cm** (ručne crtice na
   osima su svakih 5 cm). Linije se detektiraju iz "crvenosti" slike (top-hat + Hough),
   grupiraju u obitelji x = const / y = const i indeksiraju od ručno zadanog približnog
   ishodišta (`krojevi/config.py`). Iz presjecišta se računa homografija, zatim se svako
   presjecište sub-pikselno dorađuje i konačno preslikavanje cm → piksel je thin-plate-spline
   preko svih presjecišta (popravlja i distorziju leće / neravnost papira). Ostatak homografije
   na doraćenim čvorovima je 1.5–2 px, TPS ostatak ≈ 0.
2. **Kontura** (`krojevi/contour.py`): u ispravljenoj slici (1 px = 1 mm) unutrašnjost uzorka
   raste iz zadane sjemene točke kroz svijetle piksele; crni potez (+ tanke crne linije) je
   barijera. Rast je "zabrtvljen" erozijom pa uski prekidi poteza (folija preko linije) ne cure.
   Kontura = unutarnji rub poteza + pola tipične debljine poteza = **središnjica crnog poteza**.
   Zatim uzorkovanje 1 mm → Gaussovo glađenje (σ 2 mm) → Douglas-Peucker 0.3 mm.
3. **Uglovi**: dijelovi krivulje gdje se smjer tangente mijenja > 8° na 20 mm i ukupno > 25°;
   za svaki se bilježi početak, vrh i kraj (duljina luka od početka trake).
4. **Traka**: početak = točka konture najbliža ishodištu papira (donji lijevi kut), smjer CCW.

## Napomene / ograničenja

- Konture su središnjice poteza flomastera (debljina 4–6 mm); ako je folija bila obrubljena
  s vanjske strane, stvarni rub folije je ≈ 2–3 mm unutar konture.
- `1F LICE` ima na gornjem i desnom rubu dvostruko nacrtanu liniju; uzeta je unutarnja.
- `KLUP LICE`: donji lijevi kut nosi napomenu "IZRAVNATI 90°", a u sam kut je nacrtana strelica
  koja dodiruje obris. Kut je zato ispravljen na oštrih 90° (`square_corner_cm` u
  `krojevi/config.py`): točke bliže od 14 cm kutu su uklonjene, kroz susjedne ravne dijelove
  obaju rubova provučeni su pravci i njihovo presjecište je vrh kuta.
- Pretpostavka: crvene linije papira su točno 10 cm (natpisi 10/20/30 … uz linije).
