# ARCHITECTURE.md — Binding tecnico tra i moduli

> Prodotto della **Fase 0** (GAME_DESIGN §10). Questo documento è **rigido**: i nomi e i tipi
> qui sotto sono il contratto tra i moduli. Se un modulo ha bisogno di un dato condiviso che
> non c'è, si aggiorna **prima** `GAME_DESIGN.md` e questo file, **poi** si tocca `src/core`.
> Mai improvvisare nel codice (GAME_DESIGN §11, regola anti-conflitto).

Stack: TypeScript `strict`, Node 22+, ESM (`"type": "module"`, import relativi con estensione
`.js`). Persistenza SQLite (Drizzle + better-sqlite3). RNG seedabile iniettato (mai
`Math.random`/`Date.now` in core/engine).

---

## 1. Mappa dei moduli

```
src/
  core/          Modello dati CONDIVISO — READ-ONLY dopo la Fase 0 (vedi §5)
  engine/        Motore partita/stagione/progressione — read-only per gli altri moduli
  generation/    Worldgen (mondi fittizi deterministici). Scrive il core SOLO alla creazione
  persistence/   Unico punto che conosce SQL/Drizzle. Mappa core ↔ tabelle
  rng/           PRNG mulberry32 + distribuzioni (poisson, gaussian)
  cli/           Guscio: wiring + stampa. MAI logica di gioco
  manager/ president/ agent/            Moduli di RUOLO (placeholder, Fasi 1-3)
  contracts/ finances/ market/ morale/ scouting/   Sistemi trasversali (placeholder)
```

Dipendenze permesse (→ = può importare da):

- `engine → core, rng`
- `generation → core, rng`
- `persistence → core, scouting (tipi ScoutReport)` (nessun modulo importa da persistence tranne cli)
- `cli → tutto` (solo wiring)
- `scouting → core, rng, market (SOLO funzioni pure di pricing, `market/value.ts`)`
- `president → core, rng, engine (roster, letture), market (pricing puro)` — decisioni IA
  (`president/decisions.ts`, spec `docs/MODULE_PRESIDENT.md`)
- `finances → core` — `season-economy.ts` (UNICO owner dei ledger di `FinancialState`, spec
  `docs/MODULE_FINANCES.md`); `engine/progression → finances` (solo `runWorldEconomy` +
  `applyBudgetPolicy` dentro `advanceOffseason`)
- `market → core` — `value.ts` (pricing puro) + `signing.ts` (UNICO autorizzato a spostare
  giocatori/creare contratti da mercato; scrive cassa + ledger `agency_fees`)
- moduli ruolo/sistema futuri → `core, engine (letture), rng`; **mai** l'uno dall'altro senza
  passare da questo documento.

**Regola d'oro** (invariata): core ed engine sono puri e deterministici — niente I/O, niente
console, RNG sempre iniettato come parametro.

## 2. Dati CONDIVISI vs LOCALI

**CONDIVISO** = vive in `src/core/types.ts` (+ `ids.ts`, `attributes.ts`, `personality.ts`,
`nations.ts`, `finance.ts`, `ratings.ts`) ed è visibile a tutti i moduli.
**LOCALE** = vive nella cartella del modulo e NESSUN altro modulo può dipenderne.

Esempi di cosa DEVE restare locale: lo stato di una trattativa in corso (market), i report di
scouting non ancora consolidati (scouting), la memoria tattica dell'AI allenatore (manager),
le code di eventi UI (cli). Se un dato locale deve sopravvivere al salvataggio, si propone qui
la sua tabella e il suo owner.

## 3. Contratto di dato — nomi e tipi ESATTI

Tutti gli ID sono **brand type** su `string` (`src/core/ids.ts`): `PlayerId`, `ClubId`,
`NationId`, `AgencyId`, `StaffId`, `ManagerId`, `PresidentId`, `LeagueId`, `SeasonId`,
`MatchId`, `ContractId`. Costruttori `asPlayerId(...)` ecc. Scala attributi: **1–100**.
Scala tratti/morale/proneness: **[0,1]**. Denaro: **unità astratta intera**; gli stipendi sono
**settimanali lordi**.

### 3.1 Player (`core/types.ts`)

| Campo | Tipo | Note |
|---|---|---|
| `id` | `PlayerId` | |
| `name` | `string` | |
| `age` | `number` | anni interi |
| `nationality` | `string` | codice 3 lettere (es. `ITA`), vedi §3.8 |
| `position` | `'GK'\|'DF'\|'MF'\|'FW'` | `Position` |
| `preferredFoot` | `'L'\|'R'\|'both'` | |
| `attributes` | `Attributes` | vedi §3.2 |
| `potential` | `number` | 1-100, **nascosto** (mai mostrato senza incertezza scouting) |
| `personality` | `Personality` | vedi §3.3, tratti nascosti |
| `injuryProneness` | `number` | [0,1] nascosto |
| `morale` | `number` | [0,1], neutro 0.5 — contenitore Strato 1 (attivo) |
| `agencyId` | `AgencyId \| null` (opz.) | `null` = auto-rappresentato |
| `trainedClubId` | `ClubId \| null` (opz.) | vivaio: club formatore; `null` = estero |
| `contractId` | `ContractId \| null` | |

**NON ESISTE `Player.overall`.** L'overall è DERIVATO: `playerOverall(player)` in
`core/ratings.ts` (`computeOverall(position, attributes)` pesato per ruolo, scala 1-100 con 1
decimale). Chi memorizza o persiste un overall sta violando GAME_DESIGN §1.2.

### 3.2 Attributes (`core/attributes.ts`)

Comuni: `pace, stamina, strength, workRate, positioning, decisions, composure`.
Outfield: `+ finishing, passing, tackling, dribbling, marking`.
GK: `+ reflexes, handling, aerial, oneOnOne`.
Categoria per invecchiamento differenziato: `attributeKind(name)` → `'physical'`
(pace/stamina/strength) `| 'technical'` (tutto il resto, tecnico/mentale).

### 3.3 Personality (`core/types.ts`, condivisa da Player/Manager/President)

Tutti `number` in [0,1] salvo indicato: `professionalism`, `determination`, `consistency`,
`leadership`, `temperament`, `ambition`, `loyalty`, `adaptability`, `composure`,
`socialita` (scalare, 0=introverso 1=estroverso), `divergente` (`boolean`, raro ~4%).
Etichette derivate: `personalityLabel()` in `core/personality.ts` — i numeri grezzi non si
mostrano mai (GAME_DESIGN §5).

### 3.4 Contract (`core/types.ts`)

| Campo | Tipo | Note |
|---|---|---|
| `id` / `playerId` / `clubId` | brand id | |
| `wage` | `number` | **lordo settimanale**, unità astratta. Netto ≈ `netFromGross()` (=×0.5) |
| `startYear` / `endYear` | `number` | la **durata è derivata** (`endYear − startYear + 1`), non memorizzata |
| `signingBonus?` | `number` | una tantum al giocatore (raro) |
| `bonuses?` | `ContractBonuses` | `perAppearance? perGoal? perAssist? trophy? survival?` (tutti `number`) |
| `agencyId?` | `AgencyId \| null` | agenzia che ha intermediato |
| `agencyCommission?` | `number` | fee una tantum all'agenzia alla firma |
| `agencyWagePct?` | `number` | [0,1] quota ricorrente dell'agenzia sullo stipendio |
| `merchandisingPct?` | `number` | [0,1] clausola merch (registrata, payout sospeso) |

### 3.5 Club + FinancialState (`core/types.ts`)

Club: `id, name, shortName, reputation (1-100), stadiumCapacity, finances, elo, playerIds`.

`FinancialState` (GAME_DESIGN §6.2 — struttura, logica in `finances/` futuro):

| Campo | Tipo | Note |
|---|---|---|
| `transferBudget` | `number` | budget acquisti |
| `wageBudget` | `number` | tetto **settimanale** del monte ingaggi |
| `cash` | `number` | liquidità per una-tantum (commissioni, bonus firma) |
| `incomes` / `expenses` | `FinanceEntry[]` | ledger (VUOTI in Fase 0) |

`FinanceEntry`: `{ type: FinanceEntryType, amount: number (positivo), year: number, note? }`;
`FinanceEntryType` = `'gate'|'sponsor'|'tv'|'prize'|'transfer_out'|'wages'|'facilities'|'transfer_in'|'agency_fees'|'other'`.
Helper in `core/finance.ts`: `clubWageBill`, `wageBudgetStatus`, `canAffordWage`,
`deriveFinances(reputation, wageBill)`, `emptyFinances()`, `freeAgents(world)`.

### 3.6 Manager / President (`core/types.ts`)

Manager: `id: ManagerId, name, age, nationality, personality: Personality, morale [0,1],
reputation (1-100), exPlayer: boolean, clubId: ClubId | null`.
President: come Manager **senza** `morale`. Solo dati in Fase 0: l'AI arriva con i moduli
`manager/` e `president/`.

### 3.7 Agency (`core/types.ts`)

`id: AgencyId, name, reputation (1-100), size: 'big'|'small', clientIds: PlayerId[],
staff: AgencyStaff[]`. `AgencyStaff`: `{ id: StaffId, name, role: 'agent'|'scout',
reputation }`. Coerenza: `player.agencyId === agency.id ⇔ player.id ∈ agency.clientIds`
(la persistence ricostruisce `clientIds` dai giocatori: la verità è su `Player.agencyId`).

### 3.8 Nation / League / RosterRules (`core/types.ts`, `core/nations.ts`)

Nation: `id, code ('ITA'/'ENG'), name, euMember: boolean, homeNationality, rosterRules`.
League: `id, name, tier (1=massima), clubIds, nationId?`. `World.leagues` è **piatto,
nation-major poi tier**; piramide per nazione via `leaguesOfNation` / `leaguesByNation`.
`RosterRules`: `enabled, listSize (25), minGoalkeepers (2), minNationTrained (8),
minClubTrained (4), under22Age, nonEuCap: number|null, minPlayAge (18)`.
Classificazione UE: `classifyForNation(nation, nationality)` → `'home'|'eu'|'nonEu'`
(`core/nations.ts`; Inghilterra non-UE → ogni straniero è `nonEu`). Liste/idoneità:
`engine/roster.ts` (`buildRosterList`, `ineligiblePlayers`).

### 3.9 Season / Match / MatchEvent / StandingRow

Invariati dal motore validato: vedi `core/types.ts` + `docs/SPEC.md` §1 (formule §2-§6).
`MatchEventType` = `'goal'|'yellow'|'red'|'sub'|'injury'`.

### 3.10 World (`core/types.ts`) — l'aggregato radice

```ts
interface World {
  leagues: League[];                 // piatto, nation-major poi tier
  nations?: Nation[];
  agencies?: Agency[];
  managers?: Map<ManagerId, Manager>;
  presidents?: Map<PresidentId, President>;
  clubs: Map<ClubId, Club>;
  players: Map<PlayerId, Player>;
  contracts: Map<ContractId, Contract>;
  relationships?: Map<ClubId, RelationshipStore>;   // contenitore §3.11, vuoto
  affinityGroups?: AffinityGroup[];                 // contenitore §3.11, vuoto
}
```
I campi opzionali esistono per permettere mondi minimi nei test; la generazione reale
(`generateWorld`) li popola sempre (tranne i contenitori futuri).

### 3.11 Contenitori dei sistemi futuri (SOLO tipi, zero logica)

- **Morale individuale**: `Player.morale` / `Manager.morale` (già attivo per i player, Strato 1).
- **Relazioni di spogliatoio** (Strato 2): `RelationshipStore = Map<string, number>` con chiave
  `relationKey(a, b)` (ordine-indipendente) e valore [-1,+1]. **SPARSA**: coppia assente =
  neutra. Per club: `World.relationships`.
- **Gruppi di affinità culturale**: `AffinityGroup { id, name, nationalities: string[],
  cohesion: number [0,1] }` — bonus tra due giocatori = **max** dei coefficienti condivisi,
  mai somma (GAME_DESIGN §8). `World.affinityGroups`, vuoto in Fase 0.
- **Coesione collettiva** (Strato 3): NON memorizzata — si calcolerà on-demand.

## 4. Persistenza (SQLite)

Un salvataggio = un file `.sqlite`. Solo `src/persistence/` conosce SQL. Tabelle: `nations`,
`agencies`, `managers`, `presidents`, `relationships` (vuota in Fase 0), `leagues`, `clubs`
(con `transfer_budget/wage_budget/cash/incomes/expenses`), `players` (**senza colonna
overall**), `contracts`, `seasons`, `matches`, `match_events`. Scalari [0,1] su colonne
`REAL` (round-trip esatto). Ledger/staff/personality/attributes come JSON.
Gate: round-trip **deep-equal** (`persistence/repository.test.ts`).

## 5. Read-only dopo la Fase 0

- **`src/core/**` è congelato**: si estende SOLO aggiornando prima GAME_DESIGN.md e questo
  file (nuovi campi additivi e opzionali quando possibile). Nessun modulo muta i TIPI del core;
  lo STATO del mondo si muta solo attraverso i sistemi che ne sono owner (sotto).
- **`src/engine/`** è read-only per gli altri moduli: espone funzioni pure; i moduli di ruolo
  lo usano, non lo modificano.
- **Owner della mutazione dello stato** (chi può scrivere cosa a runtime):
  - attributi/età/ritiri/newgen → `engine/progression.ts`
  - morale player → `engine/morale.ts` (Strato 1)
  - infortuni (attributi fisici) → `engine/injury.ts`
  - elo/risultati/eventi → `engine/season.ts` + `engine/match*.ts`
  - rose/contratti/finanze → oggi `engine/progression.ts` (rinnovi AI); passeranno a
    `contracts/`, `finances/`, `market/` nelle Fasi 2-3
  - `relationships`/`affinityGroups` → NESSUNO in Fase 0 (contenitori vuoti)

## 6. Come si agganciano i moduli futuri

Ogni modulo di ruolo/sistema:
1. legge il mondo (`World`) e le funzioni pure del core/engine;
2. tiene il suo stato locale nella propria cartella (persistito via una tabella proposta qui);
3. muta lo stato condiviso SOLO nei punti di aggancio previsti:
   - **manager/**: produce `SlotAssignment` (già supportato da `engine/lineup.ts` +
     `SeasonRunner.setLineup`), legge scouting, propone trasferimenti (oggetto proposta → president).
   - **president/**: scrive `FinancialState` (ledger), decide su proposte, assume/licenzia
     manager (muta `Manager.clubId`).
   - **agent/**: negozia `Contract` (campi §3.4), muta `Player.agencyId` / `Agency.clientIds`,
     assume `AgencyStaff`.
   - **market/**: unico autorizzato a spostare giocatori tra club (muta `Club.playerIds` +
     `Contract`), rispettando `engine/roster.ts` (liste/quote) e `core/finance.ts` (budget).
   - **morale/**: attiverà Strato 2/3 scrivendo `World.relationships` e leggendo
     `affinityGroups`.
   - **scouting/** (ATTIVO da Fase 1a — spec: `docs/MODULE_SCOUTING.md`): SOLO stato locale
     (`ScoutingState = Map<PlayerId, ScoutReport>`, tabella `scout_reports`); non muta mai il
     core. Legge `market/value.ts` (pricing puro). Il core espone `PERSONALITY_LABELS`
     (pool etichette) da `core/personality.ts` per le stime di carattere.
   - **market/** espone fin d'ora `baseMarketValue()` (`market/value.ts`, GAME_DESIGN §6.4):
     funzione PURA, unica fonte del valore-base; il prezzo reale delle trattative arriverà
     con la logica di mercato (Fasi 2-3).
4. consegna uno strumento diagnostico CLI (GAME_DESIGN §10, validazione).

## 7. Diagnostica e validazione (stato Fase 0)

- `npx tsx src/cli/index.ts world-summary --seed 42 [--minimal]` — genera un mondo e stampa il
  riepilogo end-to-end (entità, distribuzioni, etichette, check overall derivato).
- Suite `vitest`: 137+ test incl. round-trip deep-equal, overall-mai-persistito, bande di
  calibrazione del motore (`engine/calibration.test.ts`), salute career su 15 stagioni.
- Numeri di riferimento del motore (top division): casa ~45% / pari ~25% / ospite ~29%,
  gol ~2.87, campione ~83 pt, ultima ~25 pt. Non toccare `engine/constants.ts` o la
  generazione senza rilanciare `calibrate` + i test.
