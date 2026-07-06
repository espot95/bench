# CLAUDE.md

Guida operativa per lavorare su questo repo. Tienila aggiornata: quando cambiano stack,
convenzioni o stato del progetto, aggiorna la sezione corrispondente.

## Cos'è

Gioco manageriale di calcio **single-player, locale, offline**, ispirato a Football Manager.
UI solo a menù/tabelle/schermate dati: **niente 3D, niente game loop realtime**.
Prima si costruisce e si valida un **motore headless** (dominio + simulazione), poi arriva la UI.

## Stack

- **Linguaggio/runtime**: TypeScript (`strict`), Node 22+ (dev su Node 23), ESM (`"type": "module"`).
- **Esecuzione dev**: `tsx`. **Build**: `tsc`.
- **CLI**: `commander`.
- **Persistenza**: **SQLite** via **Drizzle ORM** (`better-sqlite3` come driver, sincrono) +
  `drizzle-kit` per le migrazioni. Il salvataggio È un file `.sqlite`.
- **Test**: `vitest`.
- **Lint/format**: `biome`.
- **RNG**: PRNG seedabile scritto in casa (mulberry32) + distribuzioni (Poisson, Gauss).
  **Non** si usa `Math.random`.

## Perché queste scelte (per non rimetterle in discussione)

- **TS e non Java/Spring**: single-player locale, nessun server/concorrenza. Il motore puro TS
  viene poi **riusato tale e quale** come libreria dalla futura UI React.
- **SQLite e non Postgres**: nessun server, il save è un file portabile, `better-sqlite3` è
  sincrono (ideale per simulare tante partite in loop). Drizzle dà lo schema tipato/migrazioni
  ("strutturato") e, se un giorno servisse il cloud, la sintassi è quasi identica a Postgres →
  migrazione localizzata in `persistence/`.

## Architettura: functional core, imperative shell

Regola d'oro: **dominio e motore sono puri e deterministici; persistenza e CLI sono il guscio.**

```
src/
  rng/          PRNG seedabile + distribuzioni (poisson, gaussian)          [puro]
  domain/       entità e value object: Player, Club, League, Season,
                Match, Contract, Attributes; calcolo rating/overall         [puro, no I/O]
  engine/       motore partita, Elo, scheduler, classifica, motore stagione [puro, deterministico]
  generation/   generatore dati fittizi (nomi, attributi, rose)             [usa rng]
  persistence/  schema Drizzle + repository (map dominio<->tabelle)          [guscio]
  cli/          comandi commander, wiring, stampa report                    [guscio]
```

### Invarianti (NON violare)

1. **`engine/` e `domain/` non fanno I/O**: niente accesso al DB, niente `console`, niente `fs`.
2. **Niente `Math.random` / niente `Date.now()` dentro engine e domain**: l'RNG è **iniettato**
   come parametro. Ogni simulazione è riproducibile dato un `seed`.
3. **Il DB si tocca solo in `persistence/`**, dietro repository. Il resto del codice non conosce
   Drizzle né SQL.
4. **La CLI non contiene logica di gioco**: solo wiring (genera → simula → salva → stampa).

## Convenzioni di codice

- ESM puro, import con estensione esplicita `.js` nei path relativi (TS + `moduleResolution: NodeNext`).
- Preferire funzioni pure + tipi/`interface`/`type`; niente classi con stato mutabile condiviso nel core.
- ID come `string` (tipizzati con brand type dove utile, es. `PlayerId`, `ClubId`).
- Nessun numero magico sparso: le costanti del motore stanno in `engine/constants.ts` e sono
  documentate in `SPEC.md`.
- Attributi giocatore: scala **1–100**.
- Nomi file: `kebab-case`. Nomi tipi: `PascalCase`. Funzioni/variabili: `camelCase`.

## Comandi (aggiornare man mano che esistono davvero)

```bash
npm install
npm run dev -- <comando>     # esegue la CLI via tsx
npm test                     # vitest
npm run lint                 # biome check
npm run build                # tsc
npm run db:generate          # drizzle-kit: genera migrazioni dallo schema
```

CLI (Fase 1). **Su PowerShell/Windows NON usare `npm run dev -- <args>`**: il wrapper
`npm.ps1` interpreta `--` come separatore di parametri e scarta i flag che seguono (es.
`--seed` sparisce, resta solo il valore → "too many arguments"). Invocare `tsx` direttamente:

```powershell
# PowerShell / Windows (forma consigliata)
npx tsx src/cli/index.ts simulate-season --seed 42     # classifica + statistiche di una stagione
npx tsx src/cli/index.ts calibrate --matches 20000     # report Monte Carlo per validare il motore
npx tsx src/cli/index.ts simulate-season --seed 7 --save partita.sqlite
npx tsx src/cli/index.ts show-table --file partita.sqlite
npx tsx src/cli/index.ts manage --seed 42              # gioca una stagione come allenatore (interattivo)
npx tsx src/cli/index.ts manage-compare --seed 1 --club 10  # validazione: miglior XI vs XI scadente
```

```bash
# Bash/macOS/Linux: anche `npm run dev -- ...` funziona
npm run dev -- simulate-season --seed 42
```

In alternativa, dopo `npm run build`: `node dist/cli/index.js simulate-season --seed 42`.

## Stato del progetto

Roadmap a fasi (MVP incrementale). **Regola**: non si passa alla UI finché il motore stagione
non è credibile e testato (statistiche nelle bande realistiche, vedi SPEC.md §Validazione).

- [x] **Fase 0 — Scaffolding**: tooling, struttura, `rng/` con test, CLAUDE.md + SPEC.md.
- [x] **Fase 1 — Motore headless (CLI, no UI)** — completata, in attesa di revisione umana
  - [x] 1a Dominio + Attributes + calcolo rating (`src/domain/`)
  - [x] 1b Generazione dati fittizi: 1 lega, 20 club, rose da 25 (`src/generation/`)
  - [x] 1c Motore partita (Poisson + Dixon–Coles + Elo + varianza) + test statistico (`src/engine/match.ts`)
  - [x] 1d Motore stagione: scheduler + simulazione + classifica + Elo (`src/engine/`)
  - [x] 1e Persistenza SQLite (Drizzle): salva/ricarica mondo + stagione (`src/persistence/`)
  - [x] 1f CLI `simulate-season` / `calibrate` / `show-table` (`src/cli/`)
  - [x] **Gate**: test verdi incl. `engine/calibration.test.ts` (bande di realismo su 40 stagioni)
- [x] **Fase 2a — Eventi partita** (marcatori, assist, cartellini) — completata
  - [x] `MatchEvent` nel dominio; `engine/match-events.ts` (puro, RNG-eventi separato → calibrazione intatta)
  - [x] `engine/player-stats.ts`: capocannonieri, assist, cartellini
  - [x] persistenza `match_events` + output CLI (classifica marcatori + tabellino)
  - [x] Doppio giallo → rosso (espulsione): 2° giallo genera anche un rosso, giocatore escluso;
    `BOOKED_CAUTION` rende rari i doppi gialli (rossi ~0.2/partita, ~45% da doppio giallo)
  - [x] Espulsione livello 1: espulso non segna dopo il rosso + **squalifica giornata dopo**
    (XI ricalcolato per-partita dai disponibili in `season.ts`; calibrazione invariata)
  - [x] Espulsione livello 2: **effetto uomo in meno** sul punteggio (`integrateManDown` in
    `match.ts`): in inferiorità segni meno (`×0.80`/uomo) e concedi di più (`×1.25`), integrato
    sui segmenti tra i rossi. Cartellini generati prima dello score; calibrazione riverificata.
  - [x] Espulsione livello 3: **sostituzioni** (3–5 per squadra in 3 finestre) con timeline di
    presenza → i subentrati segnano (~9% dei gol), chi esce no; **riequilibrio tattico** su rosso
    di DF/GK (attaccante fuori, difensore/GK dentro → moltiplicatori "riassettati" in §6.5).
    Evento `sub` (con `subOutId`) in dominio/persistenza/tabellino.
  - [x] 65 test verdi totali; bande eventi in `engine/match-events.test.ts`, effetti in `match.test.ts`
  - [ ] Semplificazione aperta: niente rigori/autogol distinti; cartellini solo sui titolari;
    cambi di routine senza effetto sul punteggio (niente affaticamento/infortuni)
- [x] **Fase 2 — Control loop del giocatore (manager, CLI)** — completata, vedi SPEC.md §9
  - Utente allena una squadra; formazione a **slot 4-4-2 impostata una volta** (sticky, editabile);
    avanza giornata per giornata; mostra risultato + altri + classifica (`engine/season.ts` runner,
    `cli/manage.ts`).
  - Forza dell'utente dagli 11 schierati col **rating-nel-ruolo** (`engine/lineup.ts`): riserve e
    ruoli sbagliati abbassano i rating. Avversarie = miglior XI naturale → calibrazione invariata.
  - Comandi `manage` (interattivo) + `manage-compare` (best vs scadente, stesso seed → piazzamenti
    affiancati). 75 test verdi incl. gate impatto formazione in `engine/lineup.test.ts`.
  - Nota CLI: input via `cli/manage.ts` usa un lettore a coda su `node:readline` (non
    `readline/promises`, che perde righe con stdin da pipe).
- [x] **Fase 2b — Career multi-stagione** (mercato rimandato) — completata
  - [x] **Tappa A — Fondamenta multi-divisione**: `World.leagues: League[]` (piramide 2 divisioni
    da 20), generazione a piramide con reputazioni sfalsate (`bottomForTier`/`rangeForTier`), forza
    media A>B; simulazione **per-divisione** (contesto/Elo/classifica per lega → calibrazione top
    invariata); `createSeason(world, league, ...)`, runner deriva la lega da `season.leagueId`;
    campo `Player.potential`; persistenza multi-lega + CLI a due divisioni. 77 test verdi.
  - [x] **Tappa B — Career** (vedi SPEC.md §10): `engine/progression.ts` (promo-retro 3+3,
    invecchiamento+sviluppo su `potential`, ritiri, leve giovanili) + `engine/career.ts`
    (`runCareer`). `manage` **multi-stagione** (la tua squadra sale/scende di categoria);
    `simulate-career --seasons N`. 85 test verdi incl. gate salute mondo (`career.test.ts`:
    rose sempre 25, età media stabile, campione realistico, promo/retro effettive).
  - [ ] Semplificazione aperta: mercato rimandato; nessun contratto in scadenza (i giocatori
    restano al club finché non si ritirano).
- [x] **Fase 2c — Invecchiamento & personalità per-attributo** (SPEC.md §11) — completata
  Sostituisce lo sviluppo semplice della Tappa B (che agiva sull'overall) con un modello **per
  singolo attributo** in `engine/progression.ts` (`developAttributes`):
  - Età/personalità agiscono sui **singoli attributi**, MAI sull'overall (derivato). Nessun
    "tipo giocatore" hardcodato: emerge da dove ha gli attributi alti + declino differenziato.
  - Statici: `potential` + **`personality`** (professionalità, determinazione, leadership,
    ambizione ∈ [0,1]); `attributeKind` classifica FISICO (pace/stamina/strength) vs TECNICO.
  - `delta = curva_età × mod_personalità(sign-aware) × fattore_categoria(tecnico 0.4 sul declino)
    + rumore`; crescita mai oltre `max(attuale, potential)`.
  - Ciclo `advanceOffseason`: età+1 → `developAttributes` → ritiri (età/rating, certo a 40) →
    newgen (totale giocatori **costante**) → promo/retro.
  - 94 test verdi incl. §11 gate (`progression.test.ts`: fisici calano più dei tecnici, tecnico
    invecchia meglio, personalità diverge carriere identiche, cap potenziale) + salute su 15
    stagioni (`career.test.ts`). Persistenza: colonna `personality`. Calibrazione mondi freschi
    invariata. Parametri tarabili in `PROGRESSION`.
  - [x] **Personalità estesa** (SPEC.md §11.6-11.8): tassonomia completa a livelli. TIER A attivo:
    `professionalism` (invecchiamento primario), `determination` (secondario), `consistency`
    (varianza resa per-partita in `matchStrength`), `leadership` (bonus capitano), `temperament`
    (peso cartellini §6.4). TIER B generato ma inerte (`ambition/loyalty/adaptability/composure`).
    Generazione **centrata** (media di 3 uniformi), debole corr. prof↔deter. `personalityLabel`
    (`domain/personality.ts`) mostrata nella vista `squad`; numeri grezzi mai esposti.
    Costanti `PERSONALITY` (`PERF_K=0.06`, `CAPTAIN_LAMBDA=0.03`). `determination`-bonus-partita
    e Tier C rimandati. 99 test verdi incl. `personality.test.ts`; calibrazione invariata.
  - [x] **Asse sociale** (SPEC.md §11.10): `socialita` [0,1] continuo (modulatore di propagazione,
    non additivo) + `divergente` flag raro ~4%, generati **centrati/indipendenti** ma **inerti**
    (mordono sul futuro sistema morale). Unico gancio ora: `captainBonusMode` (`local`/`diffused`
    da socialità) — solo predisposizione, i numeri del bonus capitano restano invariati. Etichette
    estese (Trascinatore, Silenzioso professionista, Anima della festa, Spirito libero/Testa calda).
    109 test verdi; nessuna ri-calibrazione (nessun effetto meccanico attivo).
- [x] **Fase 2d — Infortuni** (SPEC.md §12) — completata (`engine/injury.ts`)
  - `Player.injuryProneness` [0,1] centrata (code "Di cristallo"/"Di ferro" via `injuryLabel`);
    `effectiveProneness` = base + età + pace esplosiva.
  - **In-match** (`buildMatchScript`): ogni titolare può infortunarsi → **esce** (timeline §6.4) e
    forza una **sostituzione** (budget 5 condiviso), o **uomo in meno** (§6.5) se i cambi sono finiti.
    Evento `injury` nel tabellino.
  - **Gravità** (lieve/media/grave, coda grave ∝ proneness) → **indisponibilità** N giornate
    (`injuredUntil` nel runner, unione con squalifiche); **grave = calo fisico permanente**
    (`applySevereHit`, si somma → spezza il "cristallo").
  - Costanti `INJURY`; persistenza `injury_proneness`; CLI: etichetta in `squad`, infortuni per
    giornata nel `manage`. 106 test verdi incl. `injury.test.ts` (fragili si fanno più male,
    coda grave, calo permanente, indisponibile la giornata dopo). Calibrazione invariata (~0.28
    infortuni/partita). `determination`-bonus e persistenza injury cross-stagione rimandati.
- [x] **Fase 2e — Morale, strato 1 (morale individuale)** (SPEC.md §13) — completata (`engine/morale.ts`)
  - `Player.morale` [0,1] neutro 0.5, persistente. `updateMoraleForClub` **event-driven** a fine
    giornata: risultato + **minutaggio-vs-attesa** (leva principale, `attesa=f(rank,ambition)`) +
    andamento classifica-vs-reputazione + **rientro al neutro** (`DECAY`). `determination` attenua
    i cali, `socialita` inerte (strati 2/3).
  - Effetto piccolo sulla resa in `matchStrength` `×(1+(morale−0.5)·EFFECT)`; costanti `MORALE`.
    Persistenza colonna `morale`; CLI: etichetta (`moraleLabel`) nella vista `squad`.
  - 115 test verdi incl. `morale.test.ts` (§13.6: big in panchina cala, riserva che gioca sale,
    rientro dopo shock, determinato cala meno, effetto piccolo). Calibrazione riverificata (campione
    83.3, bande OK). Strati 2/3 + affinità culturale = specifica futura (§13-bis, dipende dal mercato).
- [x] **Fase 2f — Nazioni, nazionalità/UE, rose e liste** (SPEC.md §14) — completata
  - Mondo **multi-nazione**: entità `Nation` (Italia UE + Inghilterra **non-UE** post-Brexit),
    2 divisioni da 20 ciascuna → 4 divisioni/80 club. `League.nationId`; promo-retro **per-nazione**.
  - Generazione **biased** per nazione (nazionalità), set UE, `Player.trainedClubId` (vivaio
    club/nazione vs straniero).
  - **Lista vs Rosa**: rosa ampia; **lista over-21 max 25** con quote vivaio (club/nazione),
    cap extracomunitari, **U22 esenti**; disattivabile. AI auto-registra i 25 legali.
  - [x] 2f-1 fondamenta nazioni — completata. `Nation` (`domain/nations.ts`, Italia UE + Inghilterra
    non-UE), `World.nations` + `League.nationId` (leghe piatte, raggruppabili per nazione),
    `Player.trainedClubId`. Generazione a 2 nazioni × 2 divisioni × 20 (80 club), nazionalità
    biased per nazione (ITA 60% / ENG 55%), **floor vivaio garantiti** (≥5 club-trained, ≥11
    nation-trained per rosa → lista legale possibile da subito). Promo-retro **dentro** ogni
    nazione (`leaguesByNation`), youth academy = club-trained. Persistenza `nations` +
    `nation_id` + `trained_club_id`; CLI etichetta nazione. 116 test verdi, calibrazione top
    invariata (casa 45.1% / pari 25.6% / ospite 29.3%, gol 2.87, campione 82.8, ultima 24.7).
  - [x] 2f-2 liste/quote — completata (`engine/roster.ts`). **Lista over-21 max 25** con quote
    vivaio modellate a **slot liberi** (`listSize−minNationTrained`): gli stranieri oltre il tetto
    finiscono **fuori lista** (non schierabili) anche a rosa ≤25 — meccanismo Serie A. **U22 esenti**
    e sempre schierabili (≥`minPlayAge`); `RosterRules` **disattivabile** (`enabled=false` → solo
    min-età). Idoneità agganciata al set "indisponibili" del runner (`ineligiblePlayers`, statico
    per stagione) → **zero effetto su mondi freschi** (floor di generazione tengono gli stranieri
    sotto il tetto → calibrazione invariata 45.3/25.4/29.3, gol 2.87). `nonEuCap` = cap sui **nuovi
    tesseramenti** → lo applica il mercato (2g), non la registrazione. CLI: vista `squad` mostra
    nazionalità + tag `LST`/`U22`/`FUO` + riepilogo quote. 121 test verdi (`roster.test.ts`).
- [~] **Fase 2g — Mercato & procuratori** (SPEC.md §15) — in corso. Solo **svincolati**; **AI
  passivo** (mercato attivo AI = capitolo futuro); budget **da reputazione**; pool **realistico**.
  - [x] 2g-1 economia & contratti — completata. `Contract` esteso (`signingBonus`, `bonuses`
    obiettivi, `agentId`/`agentCommission`/`agentWagePct`, `merchandisingPct`; tutti opzionali),
    `Club.wageBudget`+`cash` (da reputazione, `deriveBudgets` = headroom `1.2×` sul monte-salari →
    ogni club nasce in-budget con margine), helper `domain/finance.ts` (netto ~50%, `clubWageBill`,
    `wageBudgetStatus`, `canAffordWage`, `freeAgents`), svincolati = giocatori fuori rosa. `AgentId`
    brand. Persistenza colonne club/contract. **Additivo, comportamento invariato** (worldgen
    byte-identico → calibrazione intatta). 128 test verdi (`finance.test.ts`).
  - [ ] 2g-2 agenti (`Agent`, `agentId`/auto-agente se `professionalism≥0.8`) + ciclo scadenza/
    rinnovo a fine stagione → pool svincolati (non-rinnovati + prospetti).
  - [ ] 2g-3 trattativa (offerta→accetta/rilancia/rifiuta; agenzie grandi rigide+pacchetti, piccole
    elastiche+prova, auto-agente; commissioni; firme rispettano lista/quote/`nonEuCap`+budget).
  - [ ] 2g-4 payout bonus a fine stagione + schermata mercato/finanze nel `manage`.
- [ ] **Fase 3+ (dopo)**: trasferimenti tra club + prestiti, coppe, media → **UI React (Vite)**.

Numeri di riferimento del motore calibrato (media su molte stagioni): casa 45% / pari 25% /
ospite 28%, media gol ~2.8, campione ~80 pt (punte 90-99), ultima ~25 pt. Parametri in
`src/engine/constants.ts` + generazione in `src/generation/generate-world.ts`: non modificarli
senza rilanciare `npm run dev -- calibrate` e i test di `calibration.test.ts`.

### Log decisioni

- Attributi su scala 1–100 (era 1–20 in prima bozza, cambiato su richiesta).
- SQLite + Drizzle confermato (no Postgres in Fase 1).
- Motore partita: Poisson con correzione Dixon–Coles + Elo per la forma + varianza per-partita.
