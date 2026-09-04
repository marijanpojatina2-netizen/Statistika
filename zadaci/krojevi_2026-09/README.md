# Konture krojnih uzoraka iz 13 fotografija (rujan 2026)

Fotografije folija na papiru s crvenom mrežom 10 cm (`fotke/01.jpg` … `13.jpg`) → konture u mm.

```bash
python3 zadaci/krojevi_2026-09/run.py        # sve; ili npr. `run.py 04 11` samo te fotografije
```

Rezultati u `izlaz/`:

| datoteka | sadržaj |
|---|---|
| `konture_1_1.dxf` | 13 kontura **1:1 u mm**, svaka na svom sloju (naziv = natpis na foliji), gabaritne kote na sloju `KOTE` |
| `konture_1_10.pdf` | naslovna s tablicom + stranica po elementu u **mjerilu 1:10** (A4, ispis u stvarnoj veličini, kontrolna crta 100 mm = 1000 mm) |
| `konture_mm.json` | polilinije u mm, opseg, gabarit, broj čvorova mreže i ostatak homografije po fotografiji |
| `kontrola/NN_kontura.jpg` | ispravljena fotografija (1 px = 1 mm) s konturom, za provjeru oka |
| `kontrola/NN_mreza.jpg` | detektirane linije mreže, zadano (plavo) i zalijepljeno (žuto) ishodište |

## Kako radi

1. Mreža: detekcija crvenih linija, ishodište se "zalijepi" na najbliže presjecište, homografija +
   thin-plate-spline preko svih presjecišta (ispravlja perspektivu i neravnost papira), 1 px = 1 mm.
2. Kontura: rast unutrašnjosti od sjemena kroz svijetle piksele, crni potez je barijera; kontura =
   središnjica poteza. Kod folija s dijagonalnom linijom (2C, 5C) sjeme s obje strane i unija.
   Barijera 3 mm izvan osi papira jer rub folije koji leži na osi ima potez stopljen s crvenom linijom.
3. **Peglanje** (`iron`): uglovi se detektiraju; dio između uglova čiji je najveći otklon od pravca
   manji od 15 mm postaje pravac (prilagodba najmanjih kvadrata), stvarno zakrivljeni dijelovi se glade
   (σ 8 mm), uglovi blaže (σ 5 mm), spojevi bez skoka. Zatim `IZRAVNATI 90°` (KLUP) i pojednostavljenje.

## Napomene

- Iste folije na dvije fotografije: 1B LICE DESNA (01 i 05): 981 × 1164 i 982 × 1165 mm;
  1A PROVA DESNA (02 i 09): 891 × 444 i 884 × 443 mm. Razlika je mjera ponovljivosti (do ~7 mm na 0,9 m
  kod fotografije 09 koja je snimljena bliže i pod kutom).
- Konture su u koordinatama papira (x desno, y gore, kako su fotografirane odozgo); zrcalne parove
  (LIJEVA/DESNA) softver ne zrcali.
- 13 (1E PROVA LIJEVA): vodoravne linije ispod folije su slabe, pa je prag duljine linije spušten
  (`min_total_len=200`); mreža ima manje čvorova u sredini, ali homografija i dalje drži (RMS 2 px).
