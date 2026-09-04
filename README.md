# Jastuk: mjerenje krojnih uzoraka jastuka za plovila

Paket `jastuk_cv` pretvara fotografiju krojnog uzorka (folija precrtana crnim flomasterom na
papiru s crvenom mrežom 10 cm) u vektorsku konturu u milimetrima, 1:1, i iz nje radi DXF/PDF
krojeve. Ovo je prva metoda mjerenja iz [`PLAN.md`](PLAN.md) (metoda A); ostatak sustava
(baza brodova, sučelje na tabletu, mjerenje markerima, nesting) gradi se oko nje.

## Pokretanje

```bash
pip install -e ".[test]"          # ili: pip install opencv-python-headless numpy scipy scikit-image shapely ezdxf matplotlib
python3 -m jastuk_cv fotke/elementi.json --out izlaz
python3 -m pytest                  # 21 test, ~20 s (regresija na 4 fotografije, geometrija, API od kraja do kraja)
python3 data/seed_boats.py         # provjera startnog popisa brodova
```

`fotke/elementi.json` je popis elemenata (po fotografiji: ishodište mreže, os x, točka unutar
uzorka; putanje relativne prema JSON-u). Gustoća piksela `px_per_cm` je neobavezna, procijeni
se iz mreže.

## Aplikacija (faza 1): poslužitelj + web sučelje za tablet

```bash
pip install fastapi "uvicorn[standard]" sqlmodel python-multipart
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000
# na tabletu/mobitelu u istoj mreži otvori  http://<ip-računala>:8000/
```

Što radi: popis poslova, novi posao s odabirom modela broda (pretraga po 90 modela iz
`data/brodovi.csv`, ili dodavanje novog), shema broda (jedrilica/katamaran) po zonama na kojoj se
elementi **crtaju prstom** (dodir dodaje točku, povlačenje pomiče, zrcaljenje L↔D, zrcalna kopija
elementa), **mjerenje** elementa s fotografije folije kroz **tri dodira** (ishodište mreže, točka na
osi x, točka u uzorku; lupa za finu doradu), prikaz konture preko fotografije s ocjenom kvalitete,
prihvat, i **izvoz DXF/PDF** za sve izmjerene elemente posla.

Podaci su u `var/` (SQLite baza, fotografije, izvozi; mapa se mijenja s `JASTUK_VAR`). Ljuska
aplikacije radi bez mreže (service worker); podaci se za sada šalju odmah, red za offline
sinkronizaciju je na popisu za fazu 2. Prijava korisnika još ne postoji.

Prolaz kroz sučelje s dodirima i snimkama ekrana: `tools/ui_walkthrough.py` (traži pokrenut
poslužitelj i Playwright).

## API (za poslužitelj aplikacije)

```python
import cv2
from jastuk_cv import measure_grid

img = cv2.imread("fotke/mala_kupa_stola.jpg")
m = measure_grid(img, origin_px=(375, 1878), x_axis_px=(975, 1878), seed_px=(760, 1100))
m.poly_mm          # (N,2) polilinija u mm, CCW, koordinate papira
m.perimeter_mm, m.bbox_mm, m.corners
m.quality()        # broj čvorova mreže, ostatak homografije, debljina poteza, px/cm
m.to_dict()        # JSON-spreman zapis
m.control_images(img)   # {"rectified": ..., "detection": ...} za prikaz korisniku
```

Ulazi su točno ono što korisnik dodirne na fotografiji: **ishodište mreže**, **jedna točka na
osi x** (npr. oznaka "50") i **jedna točka unutar uzorka**. Alternativno se mogu zadati `xdir`,
`ydir` i `seed_cm` kao i prije.

## Struktura

| putanja | sadržaj |
|---|---|
| `jastuk_cv/grid.py` | detekcija crvene mreže, homografija, TPS, ispravljanje slike |
| `jastuk_cv/contour.py` | kontura uzorka iz ispravljene slike, glađenje, uglovi |
| `jastuk_cv/measure.py` | javni API `measure_grid`, `GridMeasurement`, izravnavanje kuta na 90° |
| `jastuk_cv/outputs.py` | DXF/PDF 1:1, offset, trake |
| `jastuk_cv/cli.py` | naredbeni redak (`python3 -m jastuk_cv`) |
| `api/` | FastAPI poslužitelj: brodovi, poslovi, elementi, fotografije, mjerenje, izvoz (SQLite) |
| `app/` | web aplikacija za tablet (PWA, bez build koraka): sheme, crtanje prstom, mjerenje, izvoz |
| `tools/ui_walkthrough.py` | prolaz kroz sučelje u Chromiumu s dodirima i snimkama |
| `tests/` | regresija na fotografijama + jedinični testovi geometrije |
| `data/brodovi.csv` | startni popis 90 modela brodova (čarter Hrvatska), `seed_boats.py` provjera |
| `fotke/` | 4 fotografije uzoraka + `elementi.json` |
| `izlaz/` | rezultati (dolje) |

## Rezultati u `izlaz/`

| datoteka | sadržaj |
|---|---|
| `elementi_1_1.dxf` | 4 konture 1:1, svaka na svom sloju (`KLUP LICE`, `MALA KUPA STOLA`, `1A PROVA LIJEVA`, `1F LICE`), sloj `KOTE` s gabaritnim kotama |
| `elementi_1_1.pdf` | pregled + stranica po elementu, mreža 100/50 mm, gabaritne kote |
| `elementi_traka_offset.dxf` | po elementu: `… KONTURA` (referenca), `… OFFSET` (+10 mm prema van, round join), `… TRAKA` (traka 90 mm × opseg s oznakama uglova) |
| `elementi_traka_offset.pdf` | stranica po elementu: offset + traka s oznakama |
| `konture_mm.json` | polilinije (mm), opseg, gabarit, položaji uglova, ocjena kvalitete |
| `kontrola/*_ispravljeno_kontura.png` | ispravljena fotografija (1 px = 1 mm) s mrežom, detektiranim presjecištima i konturom |
| `kontrola/*_detekcija_mreze.png` | original s detektiranim linijama mreže, presjecištima i konturom |

## Kako radi

1. **Mreža** (`jastuk_cv/grid.py`): crvene linije papira su na rasteru **10 cm** (ručne crtice na
   osima su svakih 5 cm). Linije se detektiraju iz "crvenosti" slike (top-hat + Hough),
   grupiraju u obitelji x = const / y = const i indeksiraju od ručno zadanog približnog
   ishodišta (`fotke/elementi.json`). Iz presjecišta se računa homografija, zatim se svako
   presjecište sub-pikselno dorađuje i konačno preslikavanje cm → piksel je thin-plate-spline
   preko svih presjecišta (popravlja i distorziju leće / neravnost papira). Ostatak homografije
   na doraćenim čvorovima je 1.5–2 px, TPS ostatak ≈ 0.
2. **Kontura** (`jastuk_cv/contour.py`): u ispravljenoj slici (1 px = 1 mm) unutrašnjost uzorka
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
  `fotke/elementi.json`): točke bliže od 14 cm kutu su uklonjene, kroz susjedne ravne dijelove
  obaju rubova provučeni su pravci i njihovo presjecište je vrh kuta.
- Pretpostavka: crvene linije papira su točno 10 cm (natpisi 10/20/30 … uz linije).