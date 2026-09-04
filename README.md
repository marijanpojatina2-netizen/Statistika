# Jastuk: mjerenje krojnih uzoraka jastuka za plovila

Paket `jastuk_cv` pretvara fotografiju krojnog uzorka (folija precrtana crnim flomasterom na
papiru s crvenom mrežom 10 cm) u vektorsku konturu u milimetrima, 1:1, i iz nje radi DXF/PDF
krojeve. Ovo je prva metoda mjerenja iz [`PLAN.md`](PLAN.md) (metoda A); ostatak sustava
(baza brodova, sučelje na tabletu, mjerenje markerima, nesting) gradi se oko nje.

## Pokretanje

```bash
pip install -e ".[test]"          # ili: pip install opencv-python-headless numpy scipy scikit-image shapely ezdxf matplotlib
python3 -m jastuk_cv fotke/elementi.json --out izlaz
python3 -m pytest                  # 51 test, ~75 s (regresija na 4 fotografije, geometrija, markeri, kalibracija, dodaci, krojevi, nesting, ponuda, API)
python3 data/seed_boats.py         # provjera startnog popisa brodova
```

`fotke/elementi.json` je popis elemenata (po fotografiji: ishodište mreže, os x, točka unutar
uzorka; putanje relativne prema JSON-u). Gustoća piksela `px_per_cm` je neobavezna, procijeni
se iz mreže.

## Mjerenje s markerima (metoda B): prostor na brodu ili stari jastuk

Na ravnu plohu (ležaj, sjedalo, stol, ili stari jastuk položen na ravno) polože se **4–8 ArUco
markera** iz `markeri/aruco_5x5_80mm_a4.pdf` (ispis u stvarnoj veličini, 3 stranice, 12 markera po
80 mm; generator `tools/make_markers.py`). Jedna fotografija odozgo, u aplikaciji **jedan dodir
unutar elementa**, i kontura je na ekranu preko ispravljene slike (1 px = 1 mm), gdje se prstom
popravlja: pomicanje, dodavanje i brisanje točaka, i "izravnaj između 2 točke" kojim se odsiječe
dio koji nije trebao ući u mjerenje.

Kako radi (`jastuk_cv/markers.py`): međusobni položaj markera nije poznat, ali svi su kvadrati
poznate stranice u istoj ravnini. Traži se jedna homografija slika → ravnina takva da se svaki
marker preslika u kvadrat od 80 mm (položaj i zakret svakog markera su slobodni parametri,
zajednička nelinearna prilagodba). Uglovi markera i rub elementa dorađuju se na mjestu 50 %
prijelaza intenziteta, što je nepristrano za meke (zamućene) rubove. Segmentacija: rast po boji od
dodira + GrabCut dorada, kartice markera isključene. Na sintetičkoj sceni s poznatom istinom:
mjerilo unutar 0,01 %, rub unutar 1 mm. Na stvarnim fotografijama točnost ovisi o ravnosti plohe,
kutu snimanja i rasporedu markera; to se mjeri u pilotu. Za kalibraciju kamere (distorzija leće) je
tu `markeri/kalibracija_sahovnica_a4.pdf`; koristi se u sljedećem koraku.

Ograničenje: jedna fotografija mjeri ravnu plohu. Zakrivljeni nasloni idu na foliju (metoda A).

## Nacrt: dodaci na elementu (cif, keder, čičak, kopče, rupe, rupice, gumbi, vezice, napomene)

Nakon prihvata konture otvara se **Nacrt** elementa: obris u mm s mrežom 100 mm na koji se prstom
dodaju dodaci. Rubni dodaci (cif, keder, čičak) idu po obrisu između dva dodira, u smjeru obrisa od
označenog početka; točkasti (kopča, rupa, rupica, gumb, vezica, napomena) jednim dodirom. Svaki ima
parametre (širina cifa i na kojoj je strani, promjer rupe, vrsta kopče, tekst napomene…) i može se
povlačiti, kopirati i brisati. Definicije tipova su u `jastuk_cv/features.py`.

U izvozu: svaki tip dodatka je na svom DXF sloju (`<ELEMENT> ZIP`, `… KOPCA`, `… RUPA` …) sa simbolom
i natpisom, cif i keder su označeni i **na traci** (početak i kraj po duljini luka), PDF ima stranicu s
popisom dodataka, a `dodaci.csv` daje količine po elementu (metri cifa/kedera/čička, komadi kopči,
rupa, gumba) za nabavu.

## Krojevi: lice, dno, traka, spužva, šav, zarezi, PDF 1:1 na A4/A3

Iz obrisa gotovog jastuka, debljine i dodataka, `jastuk_cv/pattern.py` radi krojeve po **pravilima
radionice** (u aplikaciji pod ⚙, spremljena u `var/rules.json`): šivaća linija = obris umanjen za
skupljanje navlake (vinil 2 %, tkanina 1 %), lice = šivaća linija + šav 10 mm, dno = zrcalno lice,
traka = opseg šivaće linije + 2 šava × (debljina + 2 šava), spužva = izmjereni obris −3 mm (kokpit)
ili −5 mm (unutrašnjost) po strani. **Zarezi** su na istim duljinama luka na licu, dnu i traci:
početak, počeci i krajevi uglova, početak i kraj cifa, i svakih 300 mm po ravnim dijelovima.

Izvoz posla (`jastuk_cv/kroj_out.py`): `kroj_1_1.dxf` (svi dijelovi, slojevi `<ELEMENT> LICE/DNO/
TRAKA/SPUZVA/ZAREZI/TEKST`, šivaća linija crtkano) i **`kroj_1_1_A4.pdf` ili `_A3.pdf`**: naslovna s
količinama, pregled dijelova po elementu, tablica zareza za traku (traka se crta ravnalom po mjerama),
pa **lice i spužva 1:1 razrezani na stranice** s preklopom 10 mm, križićima za lijepljenje i
kontrolnim kvadratom 100 mm na svakoj stranici. `materijal.csv` daje m² tkanine i spužve, mjere trake i
širinu role po elementu.

Ručne mjere: na ekranu mjerenja treća metoda "Ručne mjere (metar)": pravokutnik, trapez, L oblik ili
elipsa iz brojeva, sa zaobljenim uglovima; obris ide izravno u nacrt.

## Ponuda

Izvoz posla radi i `ponuda.pdf` (`jastuk_cv/quote.py`): po elementu tkanina, spužva (m² × debljina ×
€/m³), rad po tipu elementa i dodaci (cif, keder, čičak po metru; kopče, rupe, gumbi po komadu),
tkanina po dužnom metru role iz nestinga, marža, popust po poslu, PDV. Cjenik i zaglavlje radionice
(naziv, adresa, OIB, kontakt, rok, valjanost) su u ⚙ Pravilima; iznosi su i u odgovoru izvoza.

## Predlošci po modelu broda

Kod novog posla, ako za isti model broda već postoji posao s elementima, ponudi se **predložak**:
preuzimaju se šifre, zone, skice na shemi, debljine i dodaci, a obrisi iz izvora postaju nominalni
obris za usporedbu (`template_outline_mm`), nikad izravno izmjereni obris. Na elementu se predložak
može i **preuzeti bez mjerenja** (isti model, isti jastuk). Nakon mjerenja aplikacija uspoređuje
izmjereni obris s predloškom i upozorava kad rub odstupa više od 10 mm ili gabarit više od 20 mm,
što obično znači krivi element ili druga varijanta broda.

## Kalibracija kamere i rub ispod ravnine markera

`jastuk_cv/calib.py`: iz 15–20 fotografija šahovnice (`markeri/kalibracija_sahovnica_a4.pdf`)
računa se K i distorzija leće; kalibracija se sprema po uređaju (EXIF proizvođač, model, rezolucija) i
kod mjerenja se primjenjuje sama (uklanjanje distorzije prije detekcije mreže ili markera). S poznatim
K iz homografije ravnine slijedi položaj kamere, pa se rub jastuka koji je **ispod ravnine markera**
(zaobljen rub, keder; polje "rub ispod markera" na ekranu mjerenja) točno vraća na pravo mjesto
umjesto pomaknut od kamere. Ekran: ⚙ Pravila → Kalibracija kamere.

## Nesting, prijava, rad bez mreže

**Nesting** (`jastuk_cv/nesting.py`): lice, dno i traka svih elemenata posla slažu se na rolu po
materijalu (vinil: kokpit i paluba, rotacija slobodna; tkanina: ostalo, samo uzduž; trake uvijek
uzduž role). Heuristika bottom-left po gabaritima; izlaz `nesting_<materijal>.dxf` (1:1 s rolom)
i `.pdf` (pregled), potrebna duljina role i iskoristivost u izvozu i u `materijal.csv`.

**Prijava**: dva (ili više) korisnika s punim pravima, `python3 tools/users.py add <ime>`. Bez
korisnika poslužitelj stvori `radionica` / `jastuk` i upozori u logu; promijeni lozinku. Token vrijedi
180 dana, čuva se na uređaju. Poslovi i mjerenja pamte tko ih je napravio. Za razvoj bez prijave:
`JASTUK_NO_AUTH=1`.

**Bez mreže**: ljuska aplikacije radi offline (service worker); zadnje otvoreni poslovi i elementi
prikazuju se iz predmemorije; uređivanje elemenata i nacrta (PATCH/DELETE) ide u red koji se pošalje
kad se veza vrati (oznaka "N čeka mrežu" u zaglavlju). Novi posao, fotografije i mjerenje traže vezu.

## Aplikacija (faza 1): poslužitelj + web sučelje za tablet

```bash
pip install fastapi "uvicorn[standard]" sqlmodel python-multipart
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000
# na tabletu/mobitelu u istoj mreži otvori  http://<ip-računala>:8000/
```

Što radi: popis poslova, novi posao s odabirom modela broda (pretraga po 90 modela iz
`data/brodovi.csv`, ili dodavanje novog), shema broda (jedrilica/katamaran) po zonama na kojoj se
elementi **crtaju prstom** (dodir dodaje točku, povlačenje pomiče, zrcaljenje L↔D, zrcalna kopija
elementa), **mjerenje** elementa: s markerima (jedan dodir) ili s folije na mreži (tri dodira: ishodište,
os x, točka u uzorku; lupa za finu doradu), zatim **uređivanje konture prstom** na ispravljenoj slici
(zum s dva prsta), prihvat, i **izvoz DXF/PDF** za sve izmjerene elemente posla.

Podaci su u `var/` (SQLite baza, fotografije, izvozi, korisnici, pravila; mapa se mijenja s
`JASTUK_VAR`).

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
| `jastuk_cv/markers.py` | metoda B: detekcija ArUco markera, prilagodba ravnine, ispravljanje, segmentacija na dodir, dorada ruba |
| `jastuk_cv/features.py` | dodaci na elementu: tipovi, geometrija po obrisu (duljina luka), popis materijala |
| `jastuk_cv/pattern.py` | krojevi: šivaća linija, šav, zarezi, traka, spužva, pravila radionice, popis materijala |
| `jastuk_cv/kroj_out.py` | krojevi u DXF i PDF 1:1 slijepljen iz A4/A3 stranica; nesting DXF/PDF |
| `jastuk_cv/nesting.py` | slaganje dijelova na rolu (skyline, rotacije po materijalu) |
| `jastuk_cv/quote.py` | ponuda iz popisa materijala i cjenika, PDF |
| `jastuk_cv/calib.py` | kalibracija kamere (šahovnica), undistort, položaj kamere iz homografije, korekcija ruba ispod ravnine |
| `api/auth.py`, `tools/users.py` | prijava korisnika (PBKDF2, tokeni) |
| `markeri/` | PDF za tisak: 12 ArUco markera 80 mm (A4, 3 str.) i šahovnica za kalibraciju; `tools/make_markers.py` |
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
| `konture_mm.json` | polilinije (mm), opseg, gabarit, položaji uglova, ocjena kvalitete, dodaci |
| `dodaci.csv` | (izvoz posla) količine dodataka po elementu |
| `kroj_1_1.dxf`, `kroj_1_1_A4.pdf`, `materijal.csv` | (izvoz posla) krojevi i materijal, vidi gore |
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