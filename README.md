# Boodschappenapp

Gedeeld boodschappenlijstje voor je gezin met automatische prijsvergelijking en
slim winkelplan voor 1, 2 of 3 winkels — werkt als app op je iPhone/iPad
(installeerbare PWA, geen App Store nodig).

## Wat zit erin

- **Login per gezinslid** (Supabase auth, e-mail + wachtwoord)
- **Eén of meer "gezinnen"** (households) met een uitnodigingscode om mensen erin te krijgen
- **Real-time gedeeld lijstje** — als oma een item afvinkt zie jij dat direct
- **Winkelplan** — kies 1, 2 of 3 winkels en de app berekent het goedkoopste
  scenario via de prijsdata van [WinkelMaatje](https://winkelmaatje.devtien.nl)

## Eenmalige setup

### 0. Node.js installeren (eenmalig op je Mac)

Open Terminal en plak:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
```

Of download de installer van [nodejs.org](https://nodejs.org/en/download).
Check daarna `node -v` (moet 18 of hoger zijn).

### 1. Supabase project aanmaken (gratis)

1. Ga naar [supabase.com](https://supabase.com) en maak een nieuw project
2. Wacht tot het klaar is (~2 minuten)
3. Open **SQL editor → New query**, plak de inhoud van `supabase-schema.sql` en run
4. Ga naar **Settings → API** en kopieer:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Lokaal draaien

```bash
cd boodschappenapp
cp .env.local.example .env.local
# vul de twee Supabase-waarden in
npm install
npm run dev
```

Open <http://localhost:3000>, maak een account, maak een gezin aan, deel de
code met je huisgenoten.

### 3. Op je iPhone/iPad zetten

Twee opties:

**A. Snelste — deploy gratis op Vercel**
1. Push deze map naar een GitHub repo
2. Ga naar [vercel.com/new](https://vercel.com/new), importeer de repo
3. Voeg in Vercel de twee `NEXT_PUBLIC_SUPABASE_*` env-vars toe
4. Open de Vercel-URL op je iPhone in Safari → deel-knop → "Zet op beginscherm"

**B. Lokaal testen vanaf je Mac**
1. Run `npm run dev -- --hostname 0.0.0.0`
2. Vind je Mac's lokale IP (`ipconfig getifaddr en0`)
3. Open `http://<ip>:3000` in Safari op je iPhone
4. Deel-knop → "Zet op beginscherm"

Vergeet niet vóór deploy de PWA-iconen te genereren — zie
`public/icons/README.txt`.

## Hoe het winkelplan werkt

Voor elk item op je lijst zoekt de app via de WinkelMaatje API naar het
goedkoopste matchende product per winkel. Dan probeert hij alle combinaties
van het gevraagde aantal winkels (1, 2 of 3) en kiest die met de laagste
totaalprijs — waarbij elk item naar de goedkoopste van de gekozen winkels gaat.

Items die nergens gevonden worden krijg je apart te zien als "Niet gevonden",
zodat je niet voor verrassingen komt te staan in de winkel.

## Architectuur

| Stuk                | Wat                                                           |
|---------------------|---------------------------------------------------------------|
| Next.js 14 (App Router) | Framework, server components voor auth-gating              |
| Supabase            | Auth, Postgres, RLS, real-time subscriptions                  |
| Tailwind CSS        | Styling, mobile-first                                         |
| WinkelMaatje API    | Productprijzen — `api.scan.devtien.nl/search` en `/stores`    |

Hoofdstukken in de code:
- `src/lib/supabase-*.ts` — Supabase clients (browser + server)
- `src/lib/winkelmaatje.ts` — API client voor prijsdata
- `src/lib/optimizer.ts` — combinatie-zoeker voor goedkoopste winkelplan
- `src/app/lijst/[id]/` — gedeelde lijst met realtime sync
- `src/app/shop/` — winkelplan-resultaat
- `supabase-schema.sql` — DB-schema, RLS-policies en RPC

## Privacy & disclaimer

De WinkelMaatje-API is een publieke endpoint die deze app aanroept; er is
geen officiële API-overeenkomst. Als de eigenaren willen dat dit niet meer
gebeurt, halen we het er weer uit. Prijzen kunnen achterlopen op de echte
winkel — gebruik het als richtprijs, niet als belofte.
