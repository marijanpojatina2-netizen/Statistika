# Objava na kkdinamo.hr/stats (Vercel)

Stranica kkdinamo.hr je na Vercelu, pa se aplikacija objavljuje kao zaseban
Vercel projekt iz ovog repozitorija. Prijava ide preko vlastitog login ekrana
(ime trenera + zajednička klupska lozinka), a provjera je **na serveru**
(`middleware.js`) — bez prijave se ne može ni do jedne datoteke.

Završene utakmice i predlošci rostera spremaju se **u oblak** (Vercel Blob),
pa svi treneri vide zajedničku arhivu i mogu povući iste presete — svaki sa
svog tableta.

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
   | `STAT_PASS` | zajednička lozinka koju će treneri upisivati |
5. **Deploy** → dobiješ adresu tipa `statistika-xxxx.vercel.app`,
   već zaključanu prijavom

> Bez postavljenog `STAT_PASS` stranica je otvorena — obavezno ga postavi.

## 2. Uključi oblak za zajedničku arhivu (2 minute)

U istom projektu:

1. kartica **Storage** → **Create Database** → odaberi **Blob** → ime po
   želji (npr. `statistika-podaci`) → **Create** i **Connect** na projekt
2. **Deployments → ⋯ → Redeploy** (da funkcije dobiju pristup)

To je sve — od tada se svaka završena utakmica i svaki spremljeni predložak
automatski dijele među svim trenerima. Dok oblak nije uključen, aplikacija
radi normalno, ali svaki tablet vidi samo svoje podatke (u aplikaciji tada
piše „Oblak nije uključen").

## 3. Spoji na kkdinamo.hr

**Varijanta A — poddomena `stats.kkdinamo.hr` (najjednostavnije):**
u novom projektu **Settings → Domains → Add** upiši
`stats.kkdinamo.hr`. Ako je glavna domena u istom Vercel računu,
gotovo je odmah; inače Vercel ispiše DNS zapis koji treba dodati.

**Varijanta B — točno `kkdinamo.hr/stats`:**
u projektu **glavne stranice** (kkdinamo.hr) dodaj u njezin `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/stats", "destination": "https://ADRESA-NOVOG-PROJEKTA.vercel.app/stats/" },
    { "source": "/stats/:path*", "destination": "https://ADRESA-NOVOG-PROJEKTA.vercel.app/stats/:path*" }
  ]
}
```

Aplikacija je građena s relativnim putanjama i poslužuje se i na `/` i na
`/statistika/`, pa rade obje varijante bez ponovnog builda.

## 4. Kako treneri koriste

- otvore adresu → **login ekran**: upišu svoje ime i klupsku lozinku
  (jednom po uređaju; prijava vrijedi 180 dana)
- **Dodaj na početni zaslon** → radi preko cijelog ekrana i **offline u
  dvorani** (nakon prve prijave s internetom)
- utakmica koja se upravo piše ostaje na tom tabletu (radi i bez interneta);
  kad se utakmica **završi**, sprema se u zajedničku arhivu u oblaku — ako
  interneta nema, pošalje se sama čim ga uređaj dobije
- ime trenera se upisuje uz svaku spremljenu utakmicu i predložak
  („zapisao: …"), pa se zna tko je što vodio
- više trenera može istovremeno pisati različite utakmice — svaka se sprema
  zasebno i ništa se ne sudara

## 5. Napomene

- Svaki push na granu `claude/basketball-stats-pwa-j3j0zs` automatski
  objavljuje novu verziju na Vercel (kkdinamo.hr/stats)
- Promjena lozinke: Vercel → Project → Settings → Environment Variables →
  uredi `STAT_PASS` → **Redeploy**. Svi treneri se tada moraju ponovno
  prijaviti
- Brisanje utakmice iz arhive briše je **svima** (traži se potvrda)
