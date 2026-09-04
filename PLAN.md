# Plan: softver za mjerenje i kroj jastuka za jedrilice i katamarane

Radni naziv: **Jastuk** (aplikacija za tablet + poslužitelj koji radi obradu).

Cilj u jednoj rečenici: čovjek na brodu s tabletom odabere model broda, na shemi broda vidi
sve jastuke, svaki izmjeri kamerom (ili folijom kao i do sada), a radionica isti dan dobije
nacrt, krojne šablone 1:1 za tkaninu i spužvu i popis materijala.

Ovaj dokument je plan rada: što gradimo, kojim redom, zašto baš tako i što je rizično.
Procjene vremena su za jednog developera koji radi puno radno vrijeme na tome.

---

## 0. Ključne odluke (sažetak)

| Pitanje | Odluka | Zašto |
|---|---|---|
| Platforma za rad na brodu | **Web aplikacija (PWA) na Android tabletu** (Chrome), ne nativna app | Crtanje prstom kroz canvas, offline pohrana, jedna baza koda. Isti PWA radi i na mobitelu, pa se fotografije za mjerenje mogu snimati boljom kamerom mobitela. |
| Obrada slika | **Python poslužitelj** (FastAPI + OpenCV + shapely + ezdxf) | Sav postojeći kod u `krojevi/` je Python i već radi. Na tabletu se samo slika i crta. |
| Metoda mjerenja u fazi 1 | **Folija + papir s mrežom** (postojeći cjevovod) | Već provjereno, točnost 1–2 mm. Ne bacamo ono što radi. |
| Metoda mjerenja u fazi 3 | **Fotografija odozgo s ArUco markerima + poluautomatska kontura** | Mjeri se prostor na brodu bez folije. Točnost 2–4 mm ako je ploha ravna. |
| Baza brodova | **Vlastita baza modela**, popunjena javnim podacima (specifikacije) + vlastite sheme rasporeda jastuka | Tvorničke tlocrte ne smijemo preuzeti i redistribuirati; koristimo ih samo kao referencu za vlastito crtanje. |
| 3D (zakrivljeni) jastuci | **Nisu u fazi 1–4.** Rješavamo ih folijom, a app ih označi kao "3D, ručno" | Kamera iz jedne slike ne može izmjeriti zakrivljenu plohu. LiDAR/fotogrametrija ide u fazu 6. |
| Izlazi | **PDF 1:1 slijepljen iz A4/A3** kao glavni izlaz, DXF (mm, 1:1), JSON | Radionica nema ploter. PDF se ispisuje na običnom printeru i lijepi; DXF služi za vanjsko rezanje (CNC spužva, kopirnica s A0 ploterom) i za ploter kad se kupi. HPGL ide u fazu 6. |

---

## 1. Što već imamo i kako se uklapa

Cjevovod u `krojevi/` radi ovo: fotografija folije na papiru s crvenom mrežom 10 cm →
detekcija mreže (Hough + homografija + thin-plate-spline) → ispravljena slika 1 px = 1 mm →
kontura kao središnjica crnog poteza → glađenje, uglovi, ispravljanje kuta na 90° →
DXF/PDF 1:1 + offset +10 mm + traka 90 mm.

Što se od toga prenosi u novi sustav:

- `grid.py`, `contour.py` i `outputs.py` postaju **modul "mjerenje-folija"** na poslužitelju.
  Umjesto ručne konfiguracije po fotografiji (`config.py` s `origin_px`, `seed_cm`) korisnik na
  tabletu **dodirne ishodište mreže i dodirne unutrašnjost uzorka**. To su točno ti isti
  parametri, samo se ne pišu ručno.
- Format `konture_mm.json` (polilinija u mm, opseg, gabarit, uglovi) je dobar temelj za
  **interni format elementa**; proširujemo ga s metapodacima (brod, zona, tip, debljina,
  metoda mjerenja, procjena greške).
- Nazivi elemenata koje već koristite (`1A PROVA LIJEVA`, `1F LICE`, `KLUP LICE`,
  `MALA KUPA STOLA`) postaju **standard imenovanja**: `[zona][redni broj] [pozicija] [dio]`.

Što se mijenja: postojeći kod pretpostavlja da čovjek gleda sliku i upisuje piksele. U aplikaciji
to mora raditi bez programera, uz kontrolnu sliku koju korisnik potvrdi na ekranu.

---

## 2. Ciljevi, ograničenja, mjerila uspjeha

**Točnost.** Lice jastuka: ±3 mm na dužini do 2 m. Trake i debljina: ±5 mm. To je razina na
kojoj šav i napetost tkanine pokrivaju grešku. Sve gore od toga je gubitak materijala.

**Uvjeti rada.** Marina ili brod na vezu: sunce, sjene, mokro, nagnut brod, često nema Wi-Fi.
Aplikacija mora raditi offline (crtanje, slikanje, bilješke), a obradu slika slati kad ima mreže.

**Vrijeme po brodu.** Cilj: kompletan set za jedrilicu od 45 ft (25–35 elemenata) izmjeren u
manje od 2 sata na brodu, s automatski generiranim krojevima do kraja dana.

**Mjerila uspjeha pilota (faza 5).** Na 5 brodova: manje od 5 % elemenata treba ponovno mjerenje,
nijedan komad tkanine bačen zbog greške mjerenja, radionica prihvaća DXF bez ručnog crtanja.

---

## 3. Kako to izgleda korisniku (tijek rada)

1. **Novi posao.** Upiše kupca, ime broda, marinu. Odabere **model broda** iz baze (pretraga:
   "Bavaria 46", "Lagoon 42"). Ako ga nema, kreira novi model na licu mjesta.
2. **Varijanta.** Odabere godište/izvedbu (npr. Bavaria Cruiser 46 2015–2018, 4 kabine).
   Aplikacija pokaže shemu broda: kokpit, salon, kabine, paluba.
3. **Mapa elemenata.** Ako je model već obrađen, na shemi su svi jastuci označeni i imenovani.
   Ako nije, korisnik ih **crta prstom**: povuče obris svakog jastuka preko sheme (ili preko
   fotografije kokpita koju je upravo snimio), imenuje ga, odredi tip (sjedalo, naslon, madrac,
   ležaj za sunčanje) i debljinu. To postaje **predložak modela** za sve buduće brodove istog tipa.
4. **Mjerenje.** Za svaki element bira metodu:
   - **Kamera + markeri** (ravni jastuci, mjeri se prostor ili stari jastuk položen na ravno),
   - **Folija + mreža** (kao do sada; slika se uzorak na papiru),
   - **Ručno** (upiše dimenzije pravokutnika/trapeza, za jednostavne elemente).
   Aplikacija odmah pokaže konturu preko fotografije i korisnik je prstom ispravi gdje treba.
5. **Kontrola.** Za svaki element: gabarit, opseg, usporedba s predloškom modela (upozorenje ako
   odstupa više od zadanog praga), procjena greške mjerenja. Zrcaljenje lijevo/desno jednim
   dodirom.
6. **Izvoz.** Poslužitelj generira: nacrt (PDF), krojne šablone (DXF/PDF 1:1), nesting na širinu
   role, list za rezanje spužve, popis materijala. Radionica preuzima s linka.
7. **Arhiva.** Sve ostaje uz brod (trup) i uz model. Sljedeći isti model kreće s gotovim predloškom.

---

## 4. Baza brodova ("download najčešćih brodova")

### 4.1 Što se realno može preuzeti, a što ne

- **Može (javno):** popis modela, proizvođač, godine proizvodnje, duljina, širina, broj kabina,
  varijante rasporeda. Izvori: sailboatdata.com, stranice proizvođača, popisi flota čarter
  kompanija u Hrvatskoj (Nava, Croatia Yachting, Adriatic Charter, Sunsail/Moorings, Angelina,
  Pitter, Kiriacoulis …), agregatori (yachtcharterfleet, boataround).
- **Ne može (autorsko pravo):** tvornički tlocrti i crteži rasporeda. Njih otvorimo kao
  referencu dok crtamo vlastitu shemu, ali ih ne ugrađujemo u proizvod.
- **Ne postoji nigdje:** dimenzije jastuka po modelu. To je upravo ono što ovaj softver stvara
  i što s vremenom postaje najvrjedniji dio baze.

Zaključak: "download" u praksi znači **skripta koja jednom povuče javne specifikacije za
startni popis od ~50 modela** i **ručno nacrtane sheme** koje rastu s poslovima.

### 4.2 Startni popis modela (za seed skriptu)

Popis je sastavljen prema tome što dominira hrvatskim čarter flotama; prije unosa treba
provjeriti godišta i varijante na terenu.

| Proizvođač | Jedrilice (monotrup) |
|---|---|
| Bavaria | Cruiser 34, 37, 41, 46, 50, 51; C38, C42, C45, C50, C57 |
| Beneteau | Oceanis 35.1, 38.1, 41.1, 45, 46.1, 48, 51.1; Oceanis Yacht 54; Sun Loft 47 |
| Jeanneau | Sun Odyssey 349, 380, 410, 419, 440, 449, 469, 490, 519 |
| Hanse | 348, 388, 418, 458, 508, 548 |
| Dufour | 360, 382, 390, 412, 430, 460, 470, 512, 530 |
| Elan | Impression 40, 45, 50; E4, E5; GT5 |
| Salona | 38, 41, 44, 46 |
| More | 40, 55 |
| Grand Soleil | 43, 46 |

| Proizvođač | Katamarani |
|---|---|
| Lagoon | 40, 42, 450 F/S, 46, 50, 52 |
| Fountaine Pajot | Lucia 40, Isla 40, Astrea 42, Elba 45, Saona 47, Tanna 47, Saba 50 |
| Bali | Catspace, 4.1, 4.2, 4.3, 4.4, 4.6, 4.8, 5.4 |
| Nautitech | 40 Open, 46 Open |
| Leopard | 40, 42, 45, 50 |
| Excess | 11, 12, 15 |

Motorne jahte i gliseri (Merry Fisher, Antares, Prestige …) idu u bazu kasnije, isti model podataka.

### 4.3 Struktura podataka baze brodova

```
Proizvođač  →  Model  →  Varijanta (godište od–do, raspored: 3/4/5 kabina, kokpit s/bez stola)
                              └→  Zona (kokpit, salon, prova, krma L/D, paluba, flybridge)
                                     └→  Predložak elementa (šifra, naziv, tip, nominalni obris,
                                                           debljina, materijal, napomene)
Trup (konkretan brod)  →  Posao  →  Izmjereni element (obris mm, metoda, greška, fotografije)
```

Ključna stvar: **varijanta**. Isti model s drugom godinom ili rasporedom kabina ima druge jastuke.
Predložak vezan uz varijantu, a ne uz model, štedi nam krive pretpostavke.

### 4.4 Akcije

- [x] Startni popis u `data/brodovi.csv`: 90 modela (59 jedrilica, 31 katamaran), s duljinom, širinom,
      godištima i brojem kabina iz javnih specifikacija. **Brojke treba provjeriti** prije nego
      postanu "istina" u bazi; do tada su orijentacijske.
- [x] `data/seed_boats.py` provjerava CSV (duplikati, tipovi, raspon dimenzija, godine) i ispisuje
      JSON. Punjenje baze se dodaje kad baza postoji (faza 1).
- [ ] Odlučiti kako se crtaju sheme: prazna shema po tipu broda (jedrilica/katamaran, generički
      tlocrt) na koju se elementi slažu prstom. Ne treba precizna geometrija broda, samo
      prepoznatljiv raspored.
- [ ] Za prvih 5 modela nacrtati sheme i predloške ručno na tabletu. Odabrani po tome što ih
      je u hrvatskim čarter flotama najviše i što pokrivaju oba tipa broda:
      1. **Bavaria Cruiser 46** (2014–2020, 4 kabine),
      2. **Beneteau Oceanis 46.1** (2018–, 4 kabine),
      3. **Jeanneau Sun Odyssey 440** (2018–, 4 kabine),
      4. **Lagoon 42** (2016–, 4 kabine),
      5. **Bali 4.2** (2020–, 4 kabine; veliki setovi vanjskih ležajeva).
      Ako se u prvim tjednima pojavi drugi model, on ide na popis umjesto zadnjeg.
- [ ] Uvoz postojećih uzoraka iz `izlaz/konture_mm.json` kao prvih predložaka pod
      "nepoznati model"; kad se sjetiš s kojeg su broda, premjeste se jednim klikom.

---

## 5. Sučelje: odabir broda i crtanje prstom

### 5.1 Ekrani

1. **Popis poslova** (aktivni, arhiva, pretraga po kupcu/brodu).
2. **Odabir broda**: pretraga s tipkovnice, filtri (proizvođač, tip, duljina), "dodaj novi".
3. **Shema broda** s zonama; svaka zona zasebni tab (kokpit, salon, kabina prova …). Na shemi su
   elementi kao obojani poligoni sa šifrom. Boje = status (nije mjeren / mjeren / potvrđen /
   problem).
4. **Editor elementa** (crtanje prstom):
   - crta se poligon točku po točku ili slobodnim potezom koji se automatski pojednostavi,
   - alati: pomicanje točke, brisanje točke, zaokruživanje ugla (radijus), izravnavanje na 90°,
     zrcaljenje, kopiranje elementa (lijevi → desni),
   - podloga: shema broda **ili fotografija** (korisnik snimi kokpit i crta preko slike; to je
     samo mockup, ne mjerenje),
   - polja: šifra, naziv, tip, debljina, materijal lica/trake, patent, keder, napomena.
5. **Mjerenje elementa** (poglavlje 6).
6. **Pregled i izvoz** (poglavlje 8).

### 5.2 Tehnologija

- **Frontend:** React + TypeScript, canvas kroz **Konva.js** (dobar touch, pomicanje točaka,
  zoom prstima). PWA s **service workerom** i **IndexedDB** za offline: sve što se nacrta i
  slika sprema se lokalno i sinkronizira kad ima mreže.
- **Fotografije:** `<input capture>` / MediaDevices API; slike se čuvaju u punoj rezoluciji
  (potrebne za mjerenje), umanjeni prikaz se radi na tabletu.
- **Tablet:** Android, Chrome kao preglednik (PWA, kamera, IndexedDB sve radi). Za crtanje je
  dobar bilo koji tablet od 11" (Samsung Galaxy Tab S9/S9 FE ili A9+ kao jeftinija opcija).
  **Kamera na Android tabletima je u pravilu slaba** (8 MP, bez stabilizacije). Zato mjerenje
  kamerom (metoda B) planiramo tako da se fotografija može snimiti **mobitelom** (isti PWA,
  ista prijava, isti posao) i da tablet služi za crtanje i pregled. Kalibracija leće se radi po
  uređaju, pa se oba mobitela (tvoj i kolegin) kalibriraju jednom.

### 5.3 Akcije

- [x] Umjesto wireframea odmah radna verzija (`app/`), jer je jeftinije mijenjati živo sučelje.
- [x] Skelet PWA: navigacija (poslovi, novi posao, posao, element, mjerenje), service worker za
      ljusku. **Nije još:** offline red za podatke i prijava korisnika (faza 2).
- [x] Editor poligona na canvasu: dodir dodaje točku, povlačenje pomiče, ukloni zadnju, očisti,
      zrcali L↔D, zrcalna kopija elementa. **Nije još:** zaokruživanje ugla i 90° (za obris u mm,
      ne za skicu; ide uz metodu B).
- [x] Shema broda: generički tlocrt jedrilice i katamarana (canvas), zone kao filtar.
- [x] Obrazac elementa (šifra, naziv, zona, tip, debljina, napomena).
- [ ] Test na stvarnom tabletu na suncu (čitljivost, veličina dodirnih točaka).

---

## 6. Mjerenje kamerom

Ovo je tehnički najteži dio i tu plan ima jasan redoslijed: prvo ono što sigurno radi, pa
ono što daje najviše uštede vremena, pa ono što je eksperiment.

### 6.1 Pregled metoda

| Metoda | Što se mjeri | Točnost | Kad koristiti | Faza |
|---|---|---|---|---|
| A. Folija + papir s mrežom | uzorak precrtan na foliju | 1–2 mm | zakrivljeni i složeni oblici, provjereno | 2 |
| B. Fotografija odozgo + ArUco markeri | ravni prostor za jastuk ili stari jastuk na ravnom | 2–4 mm | većina sjedala, ležajeva, madraca | 3 |
| C. Ručne mjere | pravokutnik/trapez | ovisi o čovjeku | jednostavni komadi, brza provjera | 1 |
| D. LiDAR / fotogrametrija (iPad Pro, ARKit) | 3D ploha | 5–10 mm | nasloni, zakrivljeni ležajevi | 6 |

Stav prema D: LiDAR na iPadu daje oko 1 cm točnosti, što je premalo za kroj, ali je odlično za
**oblik** zakrivljene plohe; kombinacija LiDAR oblik + nekoliko ručnih mjera za skaliranje je
realan put, ali tek kad A i B rade u proizvodnji.

### 6.2 Metoda A: folija + mreža u aplikaciji

Postojeći cjevovod, ali bez ručnog `config.py`:

1. Korisnik slika uzorak na papiru s mrežom (aplikacija traži: cijeli uzorak i barem 2 oznake
   brojeva na osima u kadru, bez sjene preko crvenih linija).
2. Na fotografiji dodirne **ishodište mreže** (0,0) i jednu točku **unutar uzorka**. Aplikacija
   pita koji smjer je os x (dodir na oznaku "50" na x osi). Iz toga se izračunaju `origin_px`,
   `xdir`, `ydir` i približni `px_per_cm`.
3. Poslužitelj vrti `detect_grid → rectify → extract_outline` i vraća konturu + kontrolnu sliku.
4. Korisnik vidi konturu preko ispravljene slike, prstom miče točke ako treba, potvrdi.

Akcije:
- [x] `krojevi/` prepakiran u Python paket `jastuk_cv` s API-jem `measure_grid(img, origin_px,
      x_axis_px, seed_px) -> GridMeasurement`; konfiguracija je JSON uz fotografije
      (`fotke/elementi.json`), regresijski test na 4 fotografije daje iste konture.
- [x] Automatska procjena `px_per_cm` iz razmaka detektiranih linija (unutar 15 % ručnih vrijednosti
      na sve 4 fotografije; ručni unos i dalje moguć).
- [ ] Robusnost: sjene, folija koja sjaji, dvostruke linije (slučaj `1F LICE`), papir koji nije
      cijeli u kadru. Test na svim postojećim fotografijama + 20 novih.
- [x] Vraćanje "ocjene pouzdanosti" (`GridMeasurement.quality()`: broj čvorova, ostatak homografije,
      debljina poteza, px/cm). Pragovi za "ponovi sliku" se određuju u fazi 2.

### 6.3 Metoda B: fotografija odozgo s markerima (glavna nova metoda)

**Ideja.** Na ravnu plohu (ležaj bez jastuka, sjedalo kokpita, stol) polože se 4–8
**ArUco markera** poznate veličine (tiskani na krutim karticama, npr. 80 × 80 mm, s magnetom
ili gumom da ne klize). Jedna fotografija odozgo. Markeri daju točan položaj ravnine i mjerilo,
pa se slika ispravi u tlocrt 1 px = 1 mm. Rub prostora za jastuk se onda prepozna
poluautomatski i korisnik ga ispravi prstom.

**Zašto markeri, a ne "samo kamera".** Iz jedne fotografije bez referentne skale nema mjere.
Markeri su najjeftinija i najtočnija referenca; rade na suncu i u sjeni, ne trebaju kalibraciju
od strane korisnika.

**Koraci obrade.**
1. Detekcija markera (OpenCV `aruco`, rječnik 4x4_50), sub-pikselno dorađeni uglovi.
2. Kalibracija leće: intrinzični parametri po modelu tableta/telefona (jednom, šahovnicom);
   ako nema, ravninska homografija iz markera + korekcija distorzije iz EXIF modela leće.
3. Homografija ravnina → slika; ako ima ≥ 6 markera, TPS kao u `grid.py` za lokalne greške.
4. Ispravljanje slike u tlocrt 1 mm/px.
5. **Segmentacija elementa:** korisnik dodirne unutrašnjost. Poslužitelj vrti model za
   segmentaciju na dodir (Segment Anything / MobileSAM) i/ili klasični GrabCut; rezultat je maska →
   kontura → glađenje + uglovi (postojeći `contour.py`).
6. Kontura se prikaže preko slike, korisnik pomiče točke, izravnava kutove, zaokružuje uglove.
7. **Provjera mjerila:** aplikacija traži da se u kadru nađe i referentna letva 1000 mm (ili
   dva markera na poznatom razmaku) i izračuna grešku. Ako je > 3 mm, traži novu fotografiju.

**Ograničenja koja se moraju reći korisniku u aplikaciji.**
- Ploha mora biti ravna. Ako je zakrivljena (naslon), aplikacija za taj element predlaže metodu A.
- Kut snimanja: unutar 15° od okomice na plohu; aplikacija u živoj slici pokazuje "ok / nagni".
- Cijeli element + svi markeri u kadru; širina kadra do ~2,2 m s telefonske kamere ako želimo
  0,5 mm/px.
- Prepreke (rukohvati, stol, jastuk susjednog elementa) zaklanjaju rub; rješenje je
  crtanje tog dijela prstom po slici.

**Što se mjeri: prostor ili stari jastuk?** Oboje, i to se bilježi. Kad se mjeri prostor,
aplikacija primjenjuje **pravila radionice**: npr. spužva = prostor − 5 mm po strani, navlaka =
spužva − 2 % zbog napetosti. Pravila su konfigurabilna po tipu elementa i materijalu.

Akcije:
- [x] Dizajn markera: `markeri/aruco_5x5_80mm_a4.pdf` (12 kom, kartice 100 mm, marker 80 mm, DICT_5X5_50),
      provjereno rasterizacijom da je marker točno 80 mm. Tisak, laminat i magnet: na tebi.
- [x] Modul `jastuk_cv/markers.py`: `fit_plane` (homografija iz svih markera bez kalibracije),
      `rectify_plane` (1 px = 1 mm), dorada uglova markera i ruba na 50 % prijelaza (nepristrano
      na zamućenje). Na sintetičkoj sceni: mjerilo 0,01 %, rub < 1 mm.
- [ ] Kalibracija za tablet + mobitele; postupak da se doda novi uređaj (slikaj šahovnicu 15 puta,
      aplikacija sama izračuna parametre). Prvi uređaj: **Samsung Galaxy S25 Ultra**. Za mjerenje se
      koristi glavna kamera (široki kut i tele ne), u 12 MP ili 50 MP načinu, s isključenim
      "optimizatorom scene" i HDR-om jer mijenjaju lokalni kontrast; kalibracija vrijedi po
      kombinaciji uređaj + kamera + rezolucija, pa aplikacija to čita iz EXIF-a i odbija sliku iz
      nekalibrirane kombinacije.
- [x] Segmentacija na dodir, klasično: rast po boji od dodira + GrabCut dorada + dorada ruba;
      kartice markera isključene. MobileSAM ostaje opcija ako klasika zakaže na stvarnim jastucima.
- [x] Ručna korekcija konture prstom na ispravljenoj slici (pomakni, dodaj, obriši, izravnaj
      između dvije točke, poništi, zum s dva prsta). Vrijedi za obje metode.
- [ ] Živi pomoćnik za snimanje (nagib iz žiroskopa, prepoznavanje markera na tabletu u JS-u
      preko OpenCV.js, samo da kaže "svi markeri vidljivi").
- [ ] Laboratorijski test: ploča 2 × 1 m s poznatim oblicima; izmjeriti grešku u 30 fotografija,
      pod raznim kutovima i svjetlom. Cilj ≤ 3 mm na 95 % mjerenja. **Sljedeći korak, treba
      tiskane markere i S25 Ultru.**
- [ ] Terenski test na 3 broda, usporedba s folijom.

### 6.4 Metoda C: ručne mjere

Obrazac: pravokutnik, trapez, pravokutnik sa zaobljenim uglovima, "L" oblik. Upiše se nekoliko
brojeva, generira se obris. Koristi se i za brzu korekciju: "gabarit je 1240 × 620, kut 90°".

### 6.5 Metoda D (kasnije): LiDAR / fotogrametrija

- Kako ste na Androidu, LiDAR znači kupnju jednog iPada Pro samo za tu svrhu; alternativa na
  Androidu je ARCore Depth API (slabija točnost) ili fotogrametrija ispod.
- iPad Pro s LiDAR-om + ARKit mesh → izdvajanje plohe → razvijanje u ravninu (developable
  surface) → skaliranje ručnim mjerama.
- Alternativa bez LiDAR-a: fotogrametrija iz 10–20 fotografija s markerima (OpenMVG/Meshroom).
- Ovo je istraživački dio; ne obećavati klijentima dok ne prođe test.

---

## 7. Prepoznavanje i obrada konture (zajedničko svim metodama)

Sve metode završe s poligonom u mm. Onda ide isti postupak, većinom već napisan u `contour.py`:

1. Uzorkovanje 1 mm → Gaussovo glađenje → Douglas-Peucker (0,3 mm).
2. **Uglovi**: detekcija i klasifikacija (oštar, zaobljen s radijusom, tup). Korisnik može
   "zaključati" kut na 90° ili zadati radijus (kao `square_corner`).
3. **Simetrija**: ako je element označen kao simetričan, izračunati os i simetrizirati; lijevi/desni
   parovi kao zrcalo.
4. **Usporedba s predloškom modela**: preklapanje s nominalnim obrisom; odstupanje po rubu u mm;
   upozorenje ako je > 20 mm igdje (vjerojatno krivi element ili kriva varijanta).
5. **Sanity provjere**: opseg, površina, gabarit u razumnim granicama za tip elementa; samo-presjeci.
6. Spremanje: polilinija mm, metoda, procjena greške, ID fotografije, korisnik, vrijeme.

Akcije:
- [ ] Izdvojiti geometriju u modul `jastuk_geom` (bez OpenCV-a), pokriti testovima na
      postojećim konturama iz `izlaz/konture_mm.json`.
- [ ] Klasifikacija uglova s radijusom (sada se detektira samo početak/vrh/kraj).
- [ ] Usporedba s predloškom (Hausdorffova udaljenost po rubu, prikaz u boji).

---

## 8. Nacrti i krojne šablone

### 8.1 Od obrisa do kroja

Za svaki element radionica treba:

- **Lice** (gornja ploha) = obris + dodatak za šav (npr. 10 mm, konfigurabilno).
- **Dno** = lice (ili lice s otvorom za patent), s opcijom druge tkanine (mrežasta).
- **Trake / bočnice** = razvijeni opseg × debljina + dodatak, podijeljen na segmente prema
  uglovima (sadašnja `TRAKA` u `outputs.py`), s oznakama uglova i položajem patenta.
- **Zarezi (notches)** na licu i traci na istim duljinama luka da se šav složi.
- **Smjer tkanine** (strelica) i oznaka lica/naličja.
- **Spužva**: obris bez dodatka, s pravilom radionice (npr. +0 ili −3 mm), debljina, vrsta.
- **Popis materijala**: m² tkanine po vrsti, m keder-a, dužina patenta, spužva m³/ploče.

### 8.2 Nesting (slaganje na rolu)

- Ulaz: širina role iz tablice materijala (poglavlje 8.5; zadano 137 cm), smjer tkanine
  (dozvoljene rotacije 0/180 ili slobodno), razmak između komada (zadano 15 mm).
- Algoritam: za početak greedy "bottom-left" s rotacijama 0/90/180/270; kasnije genetski
  (SVGnest logika) ili libnest2d. Cilj je dobra, ne savršena iskoristivost; radionica i tako
  gleda i po potrebi pomakne.
- Izlaz: duljina role koja treba, slika slaganja, DXF s položajima.

### 8.3 Izlazne datoteke

| Datoteka | Sadržaj |
|---|---|
| `nacrt.pdf` | pregled cijelog broda po zonama, tablica elemenata s gabaritima, fotografije |
| `kroj_1_1.dxf` | svi komadi 1:1 u mm, slojevi po elementu i tipu (LICE/DNO/TRAKA/SPUZVA), tekst šifre u komadu |
| `kroj_1_1.pdf` | **glavni izlaz**: 1:1 slijepljen iz A4 ili A3 stranica, oznake preklopa i križići za poravnanje, kontrolni kvadrat 100 mm na svakoj stranici; ista datoteka ispisana u kopirnici na A0 daje jedan list |
| `nesting_<tkanina>.dxf/.pdf` | složeno na rolu |
| `spuzva.dxf/.pdf` | list za rezanje spužve |
| `kroj.plt` (HPGL) | tek kad se kupi ploter (faza 6); do tada DXF pokriva vanjsko rezanje |
| `materijal.xlsx/csv` | popis materijala i količina |
| `element.json` | sve u mm za arhivu/druge alate |

Akcije:
- [ ] Proširiti `outputs.py`: dodatak za šav po tipu, zarezi, smjer tkanine, tekst u DXF-u.
- [ ] Trake: podjela po uglovima s tolerancijom, otvor za patent, oznake na traci.
- [ ] Spužva: zasebni sloj i list.
- [ ] Nesting v1 (greedy), prikaz u aplikaciji, ručno pomicanje komada prstom.
- [ ] PDF 1:1 s tilingom na A4/A3 (oznake preklopa, križići za lijepljenje, kontrolni kvadrat
      100 mm na svakoj stranici; ispis u "stvarnoj veličini" bez skaliranja, uputa u PDF-u).
      Ovo je prvi izlaz koji se radi, jer bez plotera je to jedini put do stola za krojenje.
- [ ] Popis materijala i cjenik po m² kao temelj za ponudu.

### 8.4 Pravila radionice: početne vrijednosti (ti odlučuješ kasnije, ovo je start)

Sve je u tablici `workshop_rules` i mijenja se u aplikaciji bez programera. Brojevi su uobičajeni
u nautičkoj tapetariji i usklađeni s onim što već radite (offset 10 mm i traka 90 mm u
`outputs.py` odgovaraju šavu 10 mm i debljini 70 mm).

| Pravilo | Zadano | Napomena |
|---|---|---|
| Dodatak za šav | 10 mm | na svim rubovima lica, dna i traka |
| Spužva prema izmjerenom prostoru | −5 mm po strani (unutrašnjost), −3 mm (kokpit) | jastuk mora ući bez guranja; kokpit tjesnije zbog vjetra |
| Navlaka prema spužvi | −2 % duljine i širine (vinil), −1 % (tkanina) | napetost, bez nabora |
| Širina trake | debljina + 2 × šav | 70 mm spužva → 90 mm traka |
| Razmak komada u nestingu | 15 mm | |
| Patent | na donjoj/stražnjoj traci, duljina = najduža ravna stranica − 100 mm | spiralni patent 5 mm, plastika |
| Keder | opcija po elementu, duljina = opseg lica (+ opseg dna ako je obostrano) | |
| Debljina spužve, kokpit sjedalo | 50 mm | zatvorenoćelijska ili HR pjena s dren-tkaninom |
| Debljina spužve, kokpit naslon | 40 mm | |
| Debljina spužve, ležaj za sunčanje | 50 mm | |
| Debljina spužve, salon sjedalo | 90 mm | HR 35 kg/m³ |
| Debljina spužve, salon naslon | 60 mm | |
| Debljina spužve, madrac kabine | 100 mm | HR 30–35 kg/m³ |
| Prag upozorenja prema predlošku | 20 mm | odstupanje ruba od nominalnog obrisa modela |

### 8.5 Materijali: početna tablica

| Materijal | Širina role | Tipična upotreba | Smjer |
|---|---|---|---|
| Marine vinil (Spradling Silvertex, Nautolex i sl.) | 137 cm | kokpit, ležajevi, vanjski nasloni | slobodno |
| Sunbrella Marine / Plus | 137 cm (neke 152 cm) | kokpit, sunčališta, navlake | uzduž |
| Mrežasta dren tkanina (Phifertex, Batyline) | 137–150 cm | dno vanjskih jastuka | slobodno |
| Unutarnja tkanina (Alcantara-tip, mikrofibra) | 140 cm | salon, kabine | uzduž |
| Dren spužva / podložna mreža (3D mesh) | 100–150 cm | ispod vanjskih jastuka | slobodno |

Svaki materijal ima cijenu po m, pa popis materijala odmah daje trošak; ponuda je onda mali korak.

---

## 9. Arhitektura sustava

```
[Tablet: PWA]  ── HTTPS ──>  [API: FastAPI]  ──>  [PostgreSQL]  (brodovi, elementi, poslovi, korisnici)
    │ offline: IndexedDB          │              [MinIO/S3]     (fotografije, DXF, PDF)
    │ crtanje: Konva canvas       └──> [Worker: Celery/RQ + Redis] ──> jastuk_cv (OpenCV, SAM)
    └ kamera: MediaDevices                                        ──> jastuk_geom (shapely)
                                                                  ──> jastuk_out (ezdxf, matplotlib, nesting)
```

- **Poslužitelj:** jedan VPS (Hetzner, 4 vCPU / 16 GB, ~40 €/mj) u Dockeru; Caddy za HTTPS;
  nightly backup baze i MinIO-a na drugi disk/S3.
- **Korisnici:** dvoje (ti i kolega), oba s punim pravima; e-mail + lozinka, bez složenih uloga
  u fazi 1. Svaka promjena pamti tko ju je napravio, pa se vidi tko je što izmjerio.
- **Sinkronizacija:** svaki objekt ima `updated_at` i `device_id`; uređaj šalje promjene u redu.
  Budući da vas dvoje možete istodobno raditi na istom brodu (tablet + mobitel), sukobi se
  rješavaju **po elementu**: zadnja potvrda pobjeđuje, ali sve verzije konture ostaju i mogu se
  vratiti jednim dodirom.
- **Obrada slika:** posao u redu, status u aplikaciji (čeka / obrađuje / gotovo / greška),
  kontrolna slika za svaki korak.

---

## 10. Model podataka (glavne tablice)

```
builders(id, name)
boat_models(id, builder_id, name, type[sailboat|catamaran|motor], loa_m, beam_m, years_from, years_to, source_url)
boat_variants(id, model_id, name, years_from, years_to, cabins, notes)
zones(id, variant_id, code, name, schematic_svg)
element_templates(id, zone_id, code, name, kind[seat|back|mattress|sunbed|other], thickness_mm,
                  nominal_outline_mm(jsonb), symmetric, mirror_of_id, fabric_face, fabric_side, notes)
hulls(id, variant_id, boat_name, customer_id, hin, notes)
jobs(id, hull_id, status, created_by, created_at, delivered_at)
photos(id, job_id, device_id, path, exif(jsonb), taken_at)
measurements(id, job_id, template_id, method[grid|markers|manual|lidar], photo_id,
             outline_mm(jsonb), error_est_mm, params(jsonb), confirmed_by, version)
patterns(id, measurement_id, part[face|bottom|strip|foam], outline_mm(jsonb), seam_mm, notches(jsonb))
exports(id, job_id, kind, path, created_at)
workshop_rules(id, kind, fabric, seam_mm, foam_offset_mm, cover_shrink_pct, roll_width_mm)
```

---

## 11. Faze i redoslijed radova

### Faza 0: priprema (1 tjedan)

- [x] Odluke iz poglavlja 13 (tablet, ploter, širine rola, prvi modeli): donesene.
- [ ] Repo: monorepo `app/` (PWA), `api/` (FastAPI), `cv/` (postojeći `krojevi/` prepakiran),
      `docs/`. CI: lint + testovi na postojećim fotografijama.
- [ ] Wireframe ekrana, standard šifri elemenata, popis pravila radionice.

### Faza 1: baza brodova + odabir + crtanje prstom (3–4 tjedna)

- [x] Seed baze brodova iz CSV-a (automatski pri prvom pokretanju poslužitelja).
- [x] PWA skelet (bez prijave i offline reda; vidi 5.3).
- [x] Odabir broda (varijante još nisu zaseban entitet; godište i kabine su na modelu).
- [x] Editor poligona prstom, obrazac elementa, zrcaljenje, zrcalna kopija.
- [ ] Metoda C (ručne mjere): API prima ručni obris (`PATCH /elements/{id}` s `outline_mm`), ekran
      s obrascem pravokutnik/trapez još nije napravljen.
- **Gotovo kada:** na tabletu se može otvoriti posao, izabrati Bavaria 46, nacrtati 30
  elemenata kokpita i salona i sve to sinkronizirati na poslužitelj.
- **Stanje:** radi od kraja do kraja u pregledniku (prolaz s dodirima u `tools/ui_walkthrough.py`).
  Ostaje test na stvarnom tabletu, prijava i offline red.

### Faza 2: metoda A u aplikaciji (2 tjedna)

- [x] `jastuk_cv` paket, `POST /api/elements/{id}/measure` (sinkrono, ~2 s po slici; worker kad
      zatreba).
- [x] Ekran: slikaj, dodirni ishodište, os x, unutrašnjost (lupa za finu doradu); prikaz konture
      na ispravljenoj slici; ocjena kvalitete; ručna korekcija točaka konture prstom.
- [x] Izvoz DXF/PDF po poslu (`POST /api/jobs/{id}/export`).
- **Gotovo kada:** kompletni set za jedan brod prođe kroz aplikaciju bez uređivanja `config.py`.

### Faza 3: metoda B, markeri (4–6 tjedana)

- [ ] Markeri, kalibracija, `measure_markers`, segmentacija na dodir.
- [ ] Živi pomoćnik za snimanje.
- [ ] Laboratorijski test točnosti, izvještaj.
- [ ] Pravila radionice (prostor → spužva → navlaka).
- **Gotovo kada:** na ploči 2 × 1 m greška ≤ 3 mm u 95 % slučajeva, i na jednom brodu izmjereno
  ≥ 10 elemenata kamerom bez folije.

### Faza 4: krojevi, nesting, izvozi (3–4 tjedna)

- [ ] Lice/dno/trake/spužva s dodacima i zarezima.
- [ ] PDF 1:1 tiling (prvo), nesting v1, popis materijala s cijenama.
- **Gotovo kada:** radionica sašije komplet za jedan brod isključivo iz izlaza aplikacije.

### Faza 5: pilot (4 tjedna, preklapa se s 4)

- [ ] 5 brodova (bar 2 katamarana), svaki element mjeren s dvije metode radi usporedbe.
- [ ] Dnevnik grešaka, popravci, podešavanje pragova i pravila.
- [ ] Kolega radi jedan brod sam, od odabira modela do izvoza; sve gdje zapne ide na popis popravaka.

### Faza 6: proširenja (nakon pilota)

- LiDAR/3D za naslone i zakrivljene ležajeve.
- HPGL/PLT izvoz i izravno slanje na ploter ili rezač, kad se kupi.
- Ponude i računi iz popisa materijala.
- Fotografije ugrađenih jastuka uz trup (za sljedeći isti brod i za marketing).
- Više radionica / više jezika, ako se softver ikad nudi drugima.

Ukupno do kraja pilota: **oko 4–5 mjeseci** jednog developera, uz redovito sudjelovanje nekoga iz
radionice (bar 2 sata tjedno za testiranje i odluke).

---

## 12. Rizici i kako ih držimo pod kontrolom

| Rizik | Vjerojatnost | Kako ga rješavamo |
|---|---|---|
| Kamera + markeri ne postigne ±3 mm na terenu | srednja | Metoda A ostaje u aplikaciji kao rezerva; laboratorijski test prije terena; prag greške u aplikaciji koji traži ponovnu sliku. |
| Zakrivljeni elementi (nasloni, 3D lice) | sigurna | Označeni u predlošku kao "folija"; ne obećavamo kameru za njih do faze 6. |
| Predlošci modela ne odgovaraju jer se brodovi razlikuju po godištu/opremi | visoka | Predložak je na varijanti; usporedba s predloškom samo upozorava, nikad ne zamjenjuje mjerenje. |
| Rad offline i sinkronizacija (izgubljeni podaci) | srednja | IndexedDB + red slanja + verzije; testirati s ugašenim Wi-Fijem od prvog dana. |
| Sunce i sjene na fotografijama | visoka | Upute u aplikaciji, provjera pouzdanosti, dopušteno ponoviti sliku, ručna korekcija prstom uvijek moguća. |
| Autorska prava na tlocrte | niska ako se držimo plana | Ne pohranjujemo tvorničke crteže; samo vlastite sheme. |
| Ovisnost o jednom developeru | srednja | Dokumentacija u repou, testovi na fotografijama, jednostavan stack. |

---

## 13. Odluke (donesene)

| Pitanje | Odluka | Posljedica u planu |
|---|---|---|
| Tablet | **Android** | PWA u Chromeu; fotografije za mjerenje s mobitela jer tablet ima slabu kameru (5.2) |
| Ploter | **Nema ga** | PDF 1:1 slijepljen iz A4/A3 je glavni izlaz; DXF za vanjsko rezanje; HPGL u fazi 6 (8.3) |
| Tkanine i role | Zadano 137 cm, tablica materijala u 8.5 | mijenja se u aplikaciji |
| Pravila radionice | Početne vrijednosti u 8.4 | mijenjaju se u aplikaciji, ne u kodu |
| Prvih 5 modela | Bavaria Cruiser 46, Oceanis 46.1, Sun Odyssey 440, Lagoon 42, Bali 4.2 | sheme i predlošci u fazi 1 (4.4) |
| Korisnici | Ti i kolega | dva računa, puna prava, sukobi po elementu s poviješću (9) |

| Mobitel za fotografije | Samsung Galaxy S25 Ultra | glavna kamera, kalibracija po kombinaciji kamera + rezolucija (6.3) |

Još bi dobro došlo, ali ne blokira: s kojeg su broda uzorci u `fotke/` i koji mobitel ima kolega.

---

## 14. Prvi koraci (ovaj tjedan)

1. ~~Prepakirati `krojevi/` u paket s testovima na 4 postojeće fotografije.~~ Gotovo: `jastuk_cv/`,
   `tests/`, 17 testova, konture identične.
2. ~~CSV startnog popisa brodova + seed skripta.~~ Gotovo: `data/brodovi.csv` (90 modela, prvih 5
   označeno prioritetom), `data/seed_boats.py`.
3. Wireframe 6 ekrana za pregled na Android tabletu.
4. Naručiti tisak ArUco markera (dizajn je pola sata, tisak i laminat par dana) da budu spremni
   za fazu 3.
5. ~~Faza 1 i 2 u prvoj radnoj verziji.~~ Gotovo: `api/` + `app/`, cijeli tijek posao → crtanje →
   mjerenje → izvoz radi u pregledniku.
6. ~~Faza 3, metoda B: markeri, PDF za tisak, mjerenje jednim dodirom, ručna korekcija konture.~~
   Gotovo u kodu i na sintetičkoj sceni. Sljedeće: ispiši `markeri/aruco_5x5_80mm_a4.pdf`, slikaj
   S25 Ultrom nekoliko jastuka i ležajeva s markerima i pošalji fotografije; na njima se podešava
   segmentacija i mjeri stvarna točnost. Zatim kalibracija kamere (šahovnica), prijava, offline red.
