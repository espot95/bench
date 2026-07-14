# CLAUDE.md — Stato globale del progetto

> Aggiornato a fine sessione (GAME_DESIGN §1.6, §11). Fonti di verità: `docs/GAME_DESIGN.md`
> (design) e `docs/ARCHITECTURE.md` (binding dati). Il `CLAUDE.md` in radice è solo un
> puntatore operativo. Formule/costanti del motore: `docs/SPEC.md`.

## Stato: FASE 1 — in corso (1a completata)

Piano Fase 1 confermato dall'utente: **1a scouting con incertezza** → **1b proposte al
presidente (IA, firma reale svincolati)** → **1c motore xG (Strada 2, affiancato poi default)**.
Decisioni: granularità giornaliera rimandata (runner event-driven); il Poisson resta riferimento
di regressione dopo il flip a xG.

### 1a — Scouting con incertezza (base) — COMPLETATA
Spec: `docs/MODULE_SCOUTING.md`. Consegnato:
- `src/scouting/report.ts`: `ScoutReport` (stato LOCALE, `Map<PlayerId, ScoutReport>`),
  `observePlayer`/`observeClub` event-driven — ricampionamento con sigma decrescente e
  **pavimento** (mai perfetto), potenziale a **intervallo**, etichetta carattere stimata
  (cap `P_MAX=0.9`), valore percepito = base × **contesto istituzionale** × rumore.
- `src/market/value.ts`: `baseMarketValue()` deterministico (GAME_DESIGN §6.4) — overall
  superlineare, curva età, uplift giovani, fattore contratto residuo. Unica fonte del
  valore-base per i moduli futuri.
- Core additivo: `PERSONALITY_LABELS` esportato (per stime sbagliate plausibili).
- Persistenza `scout_reports` (+ `saveScouting`/`loadScouting`, round-trip testato).
- `manage`: comando `scout` (status) / `scout <pos>` (assegna osservatore) /
  `scout view <pos>` (report con `???` per i mai visti); osservazione **automatica** dei
  titolari avversari dopo ogni partita; desk persistente tra stagioni (RNG dedicato:
  il rumore scouting non tocca gli stream della simulazione).
- Diagnostica: `npx tsx src/cli/index.ts scout-accuracy` (errore 7.2→1.5 con floor,
  copertura ~95%, etichette ≤92%). 147 test verdi (10 nuovi in `scouting/report.test.ts`).

### 1b — Proposte al presidente (IA) — COMPLETATA
Spec: `docs/MODULE_PRESIDENT.md`. Consegnato:
- `market/value.ts` esteso: `expectedWage` (cubo dell'overall × fattore età), `offeredYears`,
  `agencyCommissionFor` (10% dell'annuale lordo, 0 se auto-rappresentato).
- `market/signing.ts`: `signFreeAgent` — UNICO a muovere giocatori (ARCHITECTURE §6):
  materializza i prospetti effimeri, crea il contratto, **scala la cassa** e scrive la prima
  voce di ledger (`agency_fees`). Id contratto deterministico dallo stato del mondo.
- `president/decisions.ts`: `evaluateProposal` — vincoli DURI mai violati (monte ingaggi,
  cassa, quote §6.5 + **cap extra-UE stagionale**, simulazione lista post-firma) + giudizio
  di merito guidato dal carattere (ambizione/compostezza/professionalità sui margini,
  `temperament` = flip impulsivo solo sul merito). Motivazioni in italiano.
- `manage`: comando `market` (pool con stime scouting, prima vista = 1 osservazione; cap
  residuo mostrato) e `market <n>` (proposta → verdetto → firma reale). Pool ricostruito a
  ogni stagione (rilasciati AI + prospetti); `nonEuUsed` azzerato a stagione nuova.
- Gameplay emergente verificato: lo scout sopravvaluta un giocatore (oss. 1), il presidente
  lo boccia sulla valutazione vera — l'incertezza §7 morde davvero.
- 153 test verdi (6 nuovi in `president/decisions.test.ts`: vincoli mai violati su più seed,
  cap ITA vs ENG, carattere che diverge le decisioni, firma con ledger, auto-rappresentati).

### 1c — Motore xG (Strada 2) — COMPLETATA, ORA DEFAULT
Spec: `docs/SPEC.md` §17. Consegnato:
- **Pipeline StatsBomb** (GAME_DESIGN §9.2): `tools/statsbomb-targets.mjs` scarica un campione
  di eventi Serie A 2015/16 dagli Open Data e scrive SOLO aggregati versionati in
  `docs/calibration/statsbomb-serie-a-1516.json` (tiri 15.0/11.7, xG/tiro mediana 0.046
  lognormale, conversione 8.6%, gol 1.47/1.11, 0-0 8.2%). Attribuzione nel file; niente
  dati grezzi nel repo.
- `engine/xg.ts`: volume tiri Poisson (elasticità α/β su att/def) × qualità LogNormal
  (fit sui quantili reali) con tilt di forza γ × finalizzazione Bernoulli per-tiro
  (FINISH_HOME/AWAY assorbono rigori e over-performance casalinga). Man-down riusa
  l'integrazione §6.5 sui volumi. Stessa interfaccia `MatchResult` → pipeline a valle intatta.
- `engine/score-engine.ts`: selettore (`setMatchEngine`), `ENGINE_DEFAULT='xg'`;
  CLI `calibrate --engine xg|poisson`.
- **Risultato**: 46.6/24.5/28.9 vs reale 46.1/25.0/28.9 · gol 2.58 = reale · 0-0 8.1% vs
  8.2% · split casa/trasferta 1.50/1.09 vs 1.47/1.11 · campione 81.6, ultima 25.9.
- `calibration.test.ts` riscritto: gate xG su bande StatsBomb (§17.2) + Poisson come
  riferimento di regressione. **153/153 verdi col nuovo default** (career, formazione,
  eventi, infortuni, morale tutti compatibili).
- v2 rimandata (§17.4): tiri nella timeline con tiratore per attributi individuali.

### 1c-bis — Calibrazione decennale PER LEGA (richiesta utente) — COMPLETATA
- **Volumi ampi**: `tools/football-data-targets.mjs` estrae da football-data.co.uk **11
  stagioni** (2015/16-2025/26, 4.180 partite/lega) per Serie A (I1) e Premier League (E0):
  esiti, gol, 0-0, tiri → `docs/calibration/football-data-leagues-2015-2026.json`.
  Scoperta chiave: il vantaggio-casa moderno è molto più basso della sola 15/16
  (ITA pooled 42.3% vs 46.1%), e le leghe hanno firme diverse (ENG: più gol, meno pareggi).
- **Parametrizzazione per lega**: `XgProfile` per nazione (`XG_PROFILES` in
  `engine/constants.ts`: shotsHome/Away, finishHome/Away, `gsScale`), risolto dal
  `LeagueContext` via `League.nationId`; la FORMA (lognormale xG StatsBomb, elasticità)
  resta condivisa. Nazioni nuove → nuovo profilo o `DEFAULT`.
- **Due meccaniche nuove nel motore** (SPEC §17.1): **tempo condiviso** (un ritmo per
  partita → correla i punteggi) e **game-state per-tiro** (chi è sotto spinge ×(1+GS_PUSH),
  chi conduce gestisce; intensità per-lega `gsScale` — la Serie A gestisce più della PL).
- **Risultato** (30 stagioni sim vs pooled reale):
  ITA 42.1/25.4/32.5 vs 42.3/25.5/32.2, gol 2.76 vs 2.73 · ENG 44.6/23.4/32.0 vs
  44.3/23.7/32.0, gol 2.84 vs 2.82. Gate test: bande per-lega (`REALISM_BANDS`, fonte unica
  CLI+test) + "le leghe sono misurabilmente diverse" + Poisson regression.
- CLI: `calibrate --engine xg --league ita|eng` con bande della lega scelta.
- Gate impatto-formazione (§9.4) reso **statistico** (media gap best-vs-worst XI > 8 pt su
  6 combinazioni, misurato ~17 pt; il singolo seed può invertirsi per varianza, com'è
  giusto in un motore a occasioni).

**FASE 1 (ruolo manager) COMPLETATA**: 1a scouting ✔ · 1b proposte/firme ✔ · 1c xG ✔
· 1c-bis calibrazione decennale per-lega ✔. 149 test verdi.

### Prossimo: FASE 2 — Ruolo PRESIDENTE (GAME_DESIGN §10)
Contratti §6.1 → finanze/sponsor/TV §6.2 → mercato lato club → gestione allenatore/staff →
modalità presidente puro vs presidente+manager. Da pianificare e confermare.

## Storico: FASE 0 — COMPLETATA

Consegne (tutte verificate, 137 test verdi, tsc/biome puliti):

- **A) Struttura repo §11**: `docs/` (GAME_DESIGN, ARCHITECTURE, SPEC, CLAUDE), `src/core`
  (ex `src/domain`), `src/engine`, placeholder con README per `manager/ president/ agent/
  contracts/ finances/ market/ morale/ scouting/`.
- **B) src/core** (READ-ONLY da ora, vedi ARCHITECTURE §5):
  - `Player` con attributi taggati fisico/tecnico (`attributeKind`), `potential` nascosto,
    11 tratti §5 (solo dati), morale [0,1], `agencyId`, `trainedClubId`.
    **`overall` RIMOSSO dallo stato**: derivato via `playerOverall()` (`core/ratings.ts`).
  - `Contract` con lordo settimanale, `startYear`/`endYear` (durata derivata), campi
    agenzia/fee/bonus/merch predisposti (§6.3).
  - `Club.finances: FinancialState` (transferBudget, wageBudget, cash, ledger entrate/uscite
    vuoti — §6.2). Sostituisce i vecchi budget/wageBudget/cash sparsi.
  - `Manager` / `President` (personality riusata, reputazione, flag `exPlayer`; morale sul
    manager). Generati 1+1 per club (solo dati, zero AI).
  - `Agency` (ex `Agent`) con `staff: AgencyStaff[]` (sotto-procuratori/osservatori) + clienti.
  - Contenitori futuri SOLO tipi: `RelationshipStore` sparso (+`relationKey`), `AffinityGroup`,
    `World.relationships`/`affinityGroups` (vuoti).
- **C) Persistenza**: schema aggiornato (tabelle `agencies`/`managers`/`presidents`/
  `relationships`; clubs con finanze; **nessuna colonna overall**; scalari [0,1] su REAL).
  Round-trip **deep-equal su ogni entità** + test "overall mai persistito" verdi.
- **D) docs/ARCHITECTURE.md**: contratto di dato rigido (nomi/tipi esatti), shared vs locale,
  read-only policy, owner delle mutazioni, punti di aggancio dei moduli futuri.
- **E) CLI diagnostico**: `world-summary --seed N [--minimal]` (profilo minimo: 1 nazione,
  1 divisione ~20 club). Stampa struttura, distribuzioni, etichette carattere, check
  overall-derivato, budget e liste.

## Eredità validata (pre-Fase 0, attiva e ricollocata)

Motore Poisson+Dixon-Coles+Elo calibrato (casa ~45%, pari ~25%, gol ~2.87, campione ~83 pt);
stagione/career con promo-retro per nazione; eventi partita; infortuni; invecchiamento
per-attributo con personalità; morale Strato 1; mondo standard 2 nazioni (ITA UE / ENG non-UE)
× 2 divisioni × 20 club con liste/quote vivaio-UE (§6.5); economia contratti, agenzie,
rinnovi AI-passivi, pool svincolati. La trattativa via procuratore era in corso e riprende
nelle Fasi 2/3. Storia di dettaglio: git log + `docs/SPEC.md`.

## Prossima fase: FASE 1 — Ruolo MANAGER completo (GAME_DESIGN §10)

Gran parte è già in piedi (control loop, invecchiamento, Tier A, morale S1). Mancano:
evoluzione motore verso xG (con diagnostica), scouting con incertezza (base), proposte al
presidente (IA). Da pianificare e confermare prima di implementare.

## Sessione corrente — moduli toccati

Fase 0 completa: `docs/*` (nuovi/spostati), `src/domain→src/core` (+nuove entità),
`src/generation` (people/agencies, finances), `src/persistence` (schema v2 + round-trip),
`src/cli` (world-summary), placeholder moduli. Suite 137 verdi; calibrazione invariata
(45.2/25.3/29.4, gol 2.88).
