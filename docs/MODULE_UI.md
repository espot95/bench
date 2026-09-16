# MODULE_UI.md — La grafica (visione confermata dall'utente)

> `ui/` è un GUSCIO (stesse regole di `cli/`): importa il motore come libreria, MAI logica
> di gioco. Stack: Vite + React + TS strict + Tailwind, motore **in-browser** (Web Worker),
> salvataggi IndexedDB + cloud Supabase + export file (§5). Tauri opzionale a fine corsa.
> Nessun server nostro (Supabase è BaaS: Auth + Postgres/RLS + Storage).

## 1. Principio: POCHE informazioni, un LUOGO da esplorare

- **NO pagine dense.** La home è una **dashboard essenziale** tarata sul ruolo scelto.
- Il cuore è la **MAPPA delle strutture** (SVG procedurale, cliccabile): ogni edificio apre
  il SUO dettaglio. I menu esistono ma sono secondari (nav minimale).
- Le **infrastrutture del presidente** (GAME_DESIGN §3.2, future) diventeranno upgrade
  VISIBILI sulla mappa (lo stadio cresce, il centro sportivo si amplia).

## 2. Dashboard per ruolo (solo l'essenziale)

| Ruolo | Card in home |
|---|---|
| Allenatore | prossima partita · posizione · morale squadra · infortunati · ultimo risultato |
| Presidente | cassa+budget · posizione · allerta austerità · contratti in scadenza · allenatore(fit) |
| Procuratore | cassa · reputazione · agganci · mandati in scadenza · occasioni (liberi caldi) |

## 3. La mappa per ruolo (edificio → dettaglio)

**Allenatore (centro sportivo del club):** Stadio (giornata/report/classifica) · Campo
d'allenamento (rosa/formazione/morale) · Palazzina scouting (osservatori/report) · Sede
(proposte al presidente, mercato/bid) · Infermeria (infortunati) · Settore giovanile (U22/lista).

**Presidente (il club intero):** Stadio (biglietteria/capienza) · Uffici (finanze/ledger/
alloca) · Sala trattative (acquisti/cessioni/rinnovi) · Panchina (staff/hire-fire, stile+fit)
· Centro sportivo (rosa) · [lotto vuoto: "strutture future"].

**Procuratore (l'agenzia in città):** Ufficio (clienti/mandati/investimenti) · Sala stampa
(hype/bolle) · Scrivania scouting (liberi/osservatori) · Banca (conti/ledger) · Aeroporto
(piazzamenti nei club).

## 4. Stadi di consegna

UI-0 scaffolding+worker · UI-1 allenatore (mappa+dashboard+giornata) · UI-2 presidente ·
UI-3 procuratore · UI-4 salvataggi (FATTO, §5) + polish(+Tauri). Estetica: dark gestionale,
accenti di stato (morale/pressione/forma), stemmi/kit procedurali (mondo fittizio, zero diritti).

## 5. Salvataggi (UI-4 — IMPLEMENTATO)

Formato: `SaveFile v1` del codec puro (ARCHITECTURE §4-bis). La UI (`ui/src/saves/`) parla
con un'unica interfaccia `SaveStore { list, load, put, remove }` e due backend:

| Backend | Dove | Note |
|---|---|---|
| **Locale** (`local.ts`) | IndexedDB `bench-saves` (localStorage non basta: ~2.7 MB/save) | sempre attivo, offline. **Autosave** nello slot `autosave` dopo OGNI giornata (nota "autosalvato · g.N" nella barra dell'hub) |
| **Cloud** (`supabase.ts`) | Supabase: tabella `saves` (metadati, RLS `user_id = auth.uid()`) + bucket privato `saves` (`{uid}/{id}.json.gz`, gzip nativo `CompressionStream`) | acceso solo se `ui/.env.local` ha `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; auth **magic link / codice OTP** via email, nessuna password, nessun server nostro |
| **File** | export `.bench.json.gz` (o `.json` se il browser non comprime) / import (riconosce gzip dai magic bytes) | per backup e scambio tra dispositivi |

Flussi: menu → **Continua partita** (`SavesScreen`: tab Locale/Cloud, card con stemma,
Carica/Elimina/Esporta, Importa file, ☁️↑ locale→cloud, 💾↓ cloud→locale, login/logout) ·
hub → **💾** (`SaveDialog`: salva con nome in locale/cloud, esporta, **esci al menu**).
Schema versionato in `supabase/migrations/0001_saves.sql`. Attivazione cloud in 3 passi:
(1) creare il progetto Supabase ed eseguire la migrazione nel SQL editor; (2) Authentication
→ URL Configuration: Site URL/Redirect = origine dell'app (es. `http://localhost:5173`);
(3) copiare `ui/.env.example` → `ui/.env.local` con URL + anon key, riavviare `npm run dev`.
Semplificazioni v1: nessuna sincronizzazione automatica locale↔cloud (è esplicita, per
card); un salvataggio cloud = un blob intero (niente delta). Multi-utente: già isolato per
account dalla RLS.

## 6. Passaggio di stagione (multi-stagione — IMPLEMENTATO)

A stagione finita la barra dell'hub mostra **"⏭ Chiudi la stagione"** al posto di ▶ Gioca.
Tutto il lavoro è nel motore, **la stessa funzione della CLI** (`engine/career.ts`):
- `closeSeason(world, season, seed, year)`: le altre divisioni giocano la loro stagione
  (seed da `seed+year+indice lega`), poi `advanceOffseason` (conti, legacy, invecchiamento,
  ritiri, rinnovi/svincoli AI-passivi — anche sul tuo club —, giovani, promo/retro, budget
  del presidente). Deterministico (testato: due chiusure identiche, bande di popolazione
  come `career.test`).
- `offseasonSummary(...)`: digest **piatto** dal punto di vista del club (posizione ed
  esito ⬆/⬇/salva, classifica finale, verdetti di ogni lega — campione/promosse/retrocesse
  —, bilancio ricavi/costi/netto, cassa e budget della stagione nuova, ritiri e svincolati
  della tua rosa, giovani promossi). Salvabile: è in `SessionExtras.offseason`.
- Shell (`game.ts` `advanceSeason`): chiusura → `year+1` → nuova `Season`/runner nella lega
  in cui il club **si ritrova** (promo/retro gestite) → miglior XI → azzera lo stato
  per-stagione (offerte, trattativa aperta, viaggio, proposta curva); **restano** gazzetta,
  shortlist e **pre-accordi** (si onorano alla finestra estiva, MODULE_MARKET §8.5).
- UI: `OffseasonScreen` (classifica con zone promo/retro colorate, bilancio, "chi se ne
  va", verdetti del mondo, ⚠ austerità se cassa < 0) con un solo bottone "▶ Stagione N+1";
  la schermata **persiste nel salvataggio** finché non la archivi (ricaricando ci torni).
  Chiusura in-browser ~1-2 s sul main thread con bottone in stato "⏳ Le altre divisioni
  giocano…" (Web Worker rimandato).
- Autosave subito dopo la chiusura ("autosalvato · nuova stagione").

Semplificazioni v1 dichiarate: rinnovi del tuo club AI-passivi (il tab rinnovi in Sede è
un capitolo a sé); niente report partita/formazione (TODO UI-1).

## 7. Calendario & agenda (richiesta utente — IMPLEMENTATO)

Il tempo di gioco resta round-based nel motore; la PRESENTAZIONE del tempo vive nel
guscio. `ui/src/calendar.ts`: mappa deterministica round→data (giorno 0 = 10 agosto,
campionato la domenica dalla prima domenica ≥ 24/8, coppe il mercoledì dopo
`stage.afterRound`), `fmtDay`/`fmtDayLong`. Sessione: `day` (offset giorno corrente,
derivato dal round per i save vecchi), sincronizzato da `playRound`; estate = giorno 0.

- **Agenda** (`agendaView`): partite (avversario, casa/trasferta), turni di coppa (solo
  se in corsa), apertura/deadline delle finestre di mercato, offerte AI e proposte
  concerti in scadenza, call fissate, rapporti del DS, estate e fine stagione.
- **Teletrasporto** (`goToDay`): si salta solo in avanti e MAI oltre il prossimo impegno
  obbligatorio — la prossima partita o una call fissata (`jumpLimit`). UI:
  `CalendarScreen` (schermata 📅 dall'HUD, che mostra la data corrente).
- **Call** (`PlannedCall` in SessionExtras): i tavoli di trattativa si aprono SOLO
  all'appuntamento. Presidenti (`requestCall`, integrata in `startNegotiation`): attesa
  1-5 giorni (hash deterministico), +2 se il club venditore è blasonato (rep ≥75),
  1 al deadline day; i presidenti VECCHIO STAMPO (temperament ≥0.6 o ambition ≤0.35)
  non fanno call: ti vogliono in sede → il tavolo si apre solo col viaggio (✈ `bookTrip`,
  costo e sconto in-persona esistenti). Procuratori (`startRenewalTalk`): attesa 0-3
  giorni, sempre telefonica. Le call si annullano dall'agenda (`cancelCall`); quelle
  arretrate restano valide e si mostrano come "oggi".
