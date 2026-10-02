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

## 8. Formazione con le pedine (richiesta utente — v1)

Campo virtuale SVG (verticale, prato a fasce, linee) con le PEDINE dell'XI colorate
per REPARTO (colori fissi: GK giallo, DF azzurro, MF verde, FW rosso — mai i colori
del club) + la PANCHINA a lato. v1 a slot fissi (LINEUP_SHAPE 4-4-2): l'utente decide
CHI, non dove. Interazione click-click: pedina → pedina = scambio di slot; pedina →
panchinaro = entra (gli indisponibili 🚑 non entrano; "!" ambra = fuori ruolo).
Bottone "XI dell'allenatore" = reset a bestAssignment. Engine additivo:
`runner.lineup(clubId)` (lettura pura del già persistito `lineups`); guscio:
formationView/formationSwap (validateAssignment prima di setLineup)/resetFormation.
UI: tab Formazione|Rosa nel Campo d'allenamento (`FormationPitch.tsx`). Nota
dichiarata: closeNegotiation/pre-accordi resettano a bestAssignment alla firma
(la formazione custom va rifatta dopo un acquisto). PROSSIMO (approfondimenti
concordati da esplorare): moduli/posizioni libere delle pedine, ruoli fini.

### 8-bis. LAVAGNA TATTICA a due fasi (evoluzione richiesta utente)

La formazione v1 diventa una lavagna: **pedine LIBERE trascinabili** (pointer events
SVG) su due FASI — **possesso** e **difesa** — con layout separati per giocatore
(`SessionExtras.board.{possesso,difesa}` per playerId). La **fase difensiva definisce
il modulo nominale**: le fasce verticali (GK ≥445 / DF 330-445 / MF 195-330 / FW <195
su campo 360×520) derivano i ruoli di zona → `SlotAssignment` → `setLineup` (il
portiere è vincolato alla sua zona). Engine: `validateAssignment` ALLENTATA (11 uomini,
1 GK esatto, ≥2 DF, ≥1 MF — moduli liberi: 3-4-3, 5-3-2…; test lineup-shape.test.ts);
il malus fuori-ruolo esistente resta il guardrail. Il modulo si LEGGE dalle pedine
("difesa 4-4-2 · possesso 2-3-5"). **Fit del punto** (`fitAt`): anello verde/ambra/
rosso da ROLE_SPOTS (ruoli fini × zona × lato). **Ruoli giocabili** (`playableRoles`
in core/archetypes, testati): primario dall'archetipo (le ali/terzini col LATO dal
piede, l'invertita sul lato opposto), secondari dagli attributi — mostrati sulla
pedina (sigla primaria), in panchina (niente stelle) e nel pannello. **Pannello**:
fascia parlata + archetipo + corsa + ruoli + RADAR delle abilità senza numeri
(`abilityAxes`: 6 assi, set da portiere per i GK). **Frecce dei MOVIMENTI** per
fase (toggle): path SVG per archetipo — mezzaluna della punta, sovrapposizione,
taglio dentro, inserimento, rientri e pendolo in fase difensiva. Scambi XI↔panchina
col click (chi entra eredita le posizioni in entrambe le fasi). NOTA INFRA scoperta:
il tsc di root NON copre ui/ (vite non typechecka) → nuovo script `npm run check:ui`
(tsc -p ui) OBBLIGATORIO nei gate; sanati errori UI latenti (hint delle missioni,
import doppi).

## 9. La DIRETTA (richiesta utente — IMPLEMENTATA)

La partita dell'utente si può GUARDARE (bottone "Vai allo stadio"; "Rapido" resta
per il risultato immediato). Schermo: XI di casa a sinistra e ospiti a destra
(badge ruolo + eventi che si accumulano: gol/gialli/rossi/frecce dei cambi), campo
al centro con le pedine di entrambe le squadre nei colori sociali (posizioni dai
ruoli fini), sopra la BARRA DEL MOMENTUM che si riempie coi colori delle due
squadre secondo chi spinge (xG delle ultime finestre) e dentro la TELECRONACA;
sotto, il minuto-per-minuto scrollabile (eventi veri + occasioni sintetizzate dai
tiri delle finestre, frasi da hash — deterministiche). Controlli: ritmo ×1/×2/×4,
pausa, "Al 90'", fischio finale con overlay-risultato.

**I cambi CONTANO** (motore, `season.playRoundLive` → `LiveMatchSession`): la gara
è simulata a FINESTRE con lo stesso motore xG (Poisson additivo: λ scalato sui
minuti dà la stessa identica distribuzione della gara intera — comunque la si
affetti), con tempo/forma estratti al fischio d'inizio e game-state che attraversa
le finestre. A ogni pausa ratings e stili sono RICALCOLATI dagli XI e dal piano
correnti: sostituzioni (max 5, click sull'uscente → panchina) e cambi del Piano
partita (via runner.setPlan, già esistente) muovono davvero le finestre restanti.
Cartellini/infortuni/cambi AI vengono dallo script pre-generato (buildMatchScript);
i cambi scriptati dell'UTENTE sono soppressi (decide lui; gli infortuni si coprono
in automatico dalla panchina consumando uno slot, o si resta in dieci). Al fischio:
squalifiche, infortuni, statistiche G1 (λ/tiri sommati), Elo, morale — e la coda
di giornata CONDIVISA col quick-result (afterRound nel guscio; finishRound nel
runner). Il quick-result classico resta BYTE-IDENTICO (la diretta è opt-in; le
sessioni live non si salvano: si chiude la gara prima). Test in
`live-match.test.ts` (4: chiusura giornata completa, determinismo a pari pause,
sostituzioni reali, stagione sana dopo la diretta).

### 9b. Intervallo, recupero, pagelle vive (richiesta utente — IMPLEMENTATI)

- **Intervallo**: il 45' è un'interruzione STRUTTURALE (le finestre si spezzano lì,
  la UI mette in pausa da sola, orologio "INTERVALLO"); un cambio annunciato al 45'
  entra SUBITO (gioco già fermo). Duplice fischio nel racconto col parziale.
- **Recupero**: FULL_TIME = 90 + 1-5' deciso al fischio d'inizio (hash match). Le
  quote-finestra si normalizzano su FULL_TIME → il totale-gara resta IDENTICO
  (stessa distribuzione del quick). I gol oltre il 90' sono attribuiti "al 90'"
  sulle timeline e rimappati sul cronometro vero (90+X); orologio "90+X′".
- **PAGELLE VIVE di tutti e 22** (la richiesta chiave): `LiveMatchSession.
  matchRatings()` fa girare l'attribuzione G1 VERA (accumulateMatchStats) su una
  mappa usa-e-getta coi numeri parziali (xG/tiri/eventi finora) — voto e numeri di
  OGNI giocatore sceso in campo, deterministici e senza draw, che si muovono con
  la gara. UI: chip-voto colorato su ogni riga (dal 10'), e al triplice fischio
  l'overlay PAGELLE completo delle due squadre (voto, minuti, gol/assist/parate)
  col MIGLIORE IN CAMPO. Le statistiche stagionali restano accumulate per TUTTA
  la lega come da G1.

## 10. G4 — IL MONDO CHE GIOCA (statistiche di tutti i giocatori del mondo)

Richiesta utente: "tenere le statistiche di tutti i giocatori del mondo di gioco".
Prima le altre divisioni venivano simulate IN BLOCCO a fine stagione (closeSeason)
e i loro numeri individuali buttati. Ora:

- **Interleave nel guscio**: `GameSession.others[]` tiene stagione+runner di ogni
  altra divisione, creati con gli STESSI seed storici di closeSeason
  (`seed + anno + (i+1)·1000`). In `afterRound` (quick E diretta) ogni altra lega
  disputa la sua giornata, in ordine fisso → tutto deterministico dal seed.
  Il club utente è protetto dal loro mercato AI (`RunnerOptions.protectedClubId`:
  niente saccheggi silenziosi; il mercato AI attraversa le leghe per design).
- **closeSeason legge, non risimula**: `opts.preSeasons` passa le stagioni già
  giocate; classifiche/bonus/verdetti escono dai calendari veri. Il CLI
  (`simulate-career`) resta sul percorso classico (risimula a fine anno).
- **Statistiche mondo**: `worldPlayerStats(s)` fonde gli store G1 di tutte le
  leghe (memoizzata per giornata; un trasferito di gennaio è la SOMMA delle due
  mezze stagioni — `mergeSeasonStats`). Alimenta scheda giocatore, radar
  percentili (pari-ruolo DEL campionato del giocatore, cade il vecchio "fuori
  dal tuo campionato non tracciate"), forma di mercato (`performanceFactor` su
  scala mondo) e la riga pubblica `playerSeasonLine` nel tavolo di trattativa.
- **Storico carriera**: a ogni chiusura, la stagione di OGNI giocatore del mondo
  diventa una riga compatta (`CareerSeasonLine`: anno, club, tier, pres, min,
  gol, assist, media) in `SessionExtras.careerStats` (max 15 righe/giocatore,
  i ritirati escono). La scheda giocatore mostra la tabella CARRIERA; il tavolo
  di trattativa le ultime 3 righe.
- **Salvataggi**: le altre divisioni si salvano come la tua (stagione + snapshot,
  `SessionExtras.otherLeagues`) — le loro mutazioni sono già nel mondo, al load
  si RIPRENDE (niente replay, niente doppi trasferimenti). I save vecchi non le
  hanno mai viste giocare in-season: si creano al load e recuperano le giornate
  passate in un colpo (le mutazioni arrivano una volta sola, come arrivavano in
  blocco a giugno).
- **Nota di compatibilità**: il mercato AI delle altre leghe ora muove il mondo
  DURANTE l'anno, non più tutto a giugno — una carriera con lo stesso seed
  evolve diversamente da prima (determinismo e bande di calibrazione intatti:
  la calibrazione misura leghe isolate e il runner utente non ha draw in più).

### 10b. Classifiche vive di tutto il mondo (follow-up G4)

Dal chip Posizione il pannello classifica ora ha UNA SCHEDA PER DIVISIONE (la tua
marcata ★): tabella aggiornata giornata per giornata, CAPOCANNONIERI (top 5, gol
+assist) e MIGLIORI PAGELLE (top 3, media con ≥3 presenze) di ogni campionato —
`worldTables()` legge classifiche e store G1 veri dei runner interlacciati.
