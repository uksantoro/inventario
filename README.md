# Inventario Sound&Light · Robinson Apulia

Web app (un `index.html`) + una funzione Vercel + database Postgres gratuito di Neon. Tutto nei piani gratuiti, senza carta.

## 1. Pubblica su Vercel
1. Metti questa cartella in un repository GitHub.
2. vercel.com → *Add New → Project* → importa il repo → *Deploy* (Framework: Other, nessun build command).

## 2. Collega il database Neon (gratis)
1. Nel progetto Vercel: scheda **Storage** → **Create Database** → **Neon** (Postgres) → piano Free → connetti al progetto.
   Vercel aggiunge da solo la variabile `DATABASE_URL`.
2. **Settings → Environment Variables**: aggiungi `APP_PASSWORD` con la password che vuoi usare per entrare.
3. **Deployments → Redeploy** per applicare le variabili.

## 3. Primo avvio
Apri l'indirizzo Vercel, inserisci `APP_PASSWORD`. Se il database è vuoto l'app carica da sola i dati attuali (259 righe, 117 acquisti, 15 aree).
Da quel momento ogni modifica va nel database e si vede su PC e telefono. La tabella `app_state` viene creata automaticamente.

## Novità
- Ogni articolo ha **marca**, **modello**, **foto** (tocca la riga per aprire il dettaglio) e può provenire da **più Einkauf**, ognuno con la sua quantità.
- Le foto stanno nella tabella `immagini` (creata da sola), ridimensionate a circa 100 KB ciascuna.

## Note
- Lo spazio usato è minuscolo (circa 100 KB) rispetto ai 0,5 GB del piano Free.
- Se modifichi i dati da due dispositivi insieme, l'app ti avvisa e ti chiede di ricaricare, per non perdere modifiche.
- Dal Menu puoi scaricare un backup JSON.
- Con `api: ""` in `config.js` l'app funziona solo in locale.
