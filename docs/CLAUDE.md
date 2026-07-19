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

### Interludio — Pressione della piazza (idea utente) — COMPLETATA
Spec: GAME_DESIGN §5 ("Pressione della piazza") + SPEC §18. Motivazione: i trasferimenti
muovono già forza ed Elo (verificato: XI schierato + `initialiseElo` da forza rosa), e i
bomber d'élite già si ripetono (probe: FIN 100 → 23→15, 25→22; gli overperformer regrediscono
alla media, realistico). Mancava il **crollo/exploit condizionato dal carattere**:
- `engine/pressure.ts`: `clubPressure` (reputazione + sotto-aspettativa, derivata mai
  memorizzata) + `pressureEffect` **bidirezionale** = K · pressione · **sensibilità**
  (max(professionalità, ambizione) — il menefreghista sente poco) · **risposta**
  (compostezza + leadership — fragile → malus fino a −30%, leader → **bonus** fino a +15%,
  il "Ronaldo al Real"). Determinazione attenua i cali. Cap asimmetrici.
- Agganciato in `matchStrength` (arg opzionale) con pressioni per-club aggiornate a ogni
  giornata dal runner (`refreshPressures`).
- **~Media zero sulla popolazione** → calibrazione per-lega invariata (verificato: ITA
  41.8/25.6/32.7, ENG 44.6/23.4/32.0, tutte le bande OK). 155 test verdi
  (6 nuovi in `pressure.test.ts`: archetipi fragile/menefreghista/Ronaldo, provincia
  neutra, determinazione che attenua, media-zero).
- Rimandati (motivati): rampa adattabilità post-trasferimento (quando esisteranno i
  trasferimenti tra club, Fase 2-3); etichetta "piazza" visibile nel manage (UI futura);
  pressione per-tiratore (arriverà con xG v2 §17.4).

## FASE 2 — Ruolo PRESIDENTE (in corso)

Piano confermato: 2a finanze → 2b mercato tra club (con rampa adattabilità + **pressione del
cartellino**, registrata in GAME_DESIGN §5) → 2c modalità presidente → 2d gestione allenatore.
Decisioni: TV/premi proporzionati al reale (PL ~3× ITA) per nazione; cessioni in 2b con
offerte IA passive-responsive; scelta ruolo a inizio carriera nel CLI.

### 2a — Finanze vive — COMPLETATA
Spec: `docs/MODULE_FINANCES.md`. Consegnato:
- `src/finances/season-economy.ts` (owner dei ledger, ARCHITECTURE): ciclo annuale in
  `advanceOffseason` — entrate (biglietteria da capienza/riempimento, sponsor con
  moltiplicatore risultato, **TV 50% uguale + 50% merito** con pool per nazione/tier,
  premi, **mutualità tier-2**) e uscite (monte ingaggi ×52, struttura); cassa evolve;
  ledger potato a 3 stagioni.
- `applyBudgetPolicy`: budget nuova stagione dal **carattere del presidente** (ambizioso
  reinveste, prudente accumula); **austerità** a cassa negativa (transfer 0, monte congelato,
  rinnovi con **tagli** −5/20%); transferBudget cappato a 1× ricavi.
- Taratura: curva salari convessa `(rep/100)^2.2` (i piccoli pagano da piccoli), rinnovi a
  drift neutro. Risultato 10 stagioni: Serie A 1/20 in rosso (netto +25M), Serie B in lotta
  ma limitata (mutualità 10M + austerità), Championship 0/20, PL surplus +133M/anno —
  **gap noto**: manca la spesa mercato IA, la assorbirà la 2b.
- CLI `finance-health`; 162 test verdi (7 nuovi in `season-economy.test.ts`: voci complete,
  mutualità solo tier-2, TV ENG≈3×ITA, austerità/ambizione, niente spirali, ledger potato,
  PL ≫ ITA). `OffseasonReport.accounts` esposto.

### 2b — Mercato tra club (lato acquisti) — COMPLETATA
Spec: `docs/MODULE_MARKET.md`. Consegnato:
- `market/transfers.ts`: `askingPrice` (valore base × premio-importanza × carattere del
  presidente venditore: il lucido non svende, l'ambizioso incassa; scadenza contratto che
  schiaccia la fee), `negotiateTransfer` single-shot (accetta/contro a metà strada/rifiuta;
  il fumantino può far saltare tutto; il prudente non insegue i rilanci),
  `playerAcceptsMove` (rifiuta piazze troppo più piccole se non in scadenza),
  `executeTransfer` (rose+contratti+soldi su ENTRAMBI i ledger: `transfer_in`/`transfer_out`,
  cassa e transferBudget scalati), id contratti deterministici.
- **Ambientamento** (GAME_DESIGN §5): `TransferStatus` sul core (`rampTotal/rampRemaining/
  pricePressure`, transiente ma persistito) — rampa 3-17 giornate da `adaptability`,
  **pressione del cartellino** = f(overpay × reputazione compratore) che si somma alla
  pressione-piazza e passa dallo stesso filtro caratteriale (`pressureEffect`); decade a
  ogni giornata (`tickAdaptation` nel runner). Anche gli svincolati hanno la rampa (tag 0).
- `president/decisions.ts`: `evaluateTransferProposal` = gate 1b (merito/quote/monte) +
  negoziazione fee + vincoli cassa/budget MAI violati + accettazione giocatore.
- `manage`: comando `bid <pos> <n>` — **solo su giocatori osservati** (lo scouting morde),
  racconto della trattativa, ambientamento annunciato ("il prezzo gli pesa addosso").
- **Cessioni rimandate alla 2c** (il manager NON controlla le vendite — GAME_DESIGN §3.1;
  arrivano con la modalità presidente). 168 test verdi (7 nuovi in `transfers.test.ts`).

### 2c — Modalità PRESIDENTE giocabile — COMPLETATA
Spec: `docs/MODULE_PRESIDENT.md` §7. Consegnato:
- **Ruolo a scelta**: `manage --role manager|presidente|entrambi` + alias `preside`.
  Presidente puro: formazione all'allenatore IA; entrambi: tutto.
- `president/decisions.ts`: estratto `checkHardConstraints` (monte/cassa/quote/cap) —
  usato dall'IA E dall'utente-presidente: **i vincoli sono macchina per chiunque**, il
  merito in modalità presidente è dell'utente ("Firmato per tua decisione").
- **Cessioni**: `market/offers.ts` `collectOffers` — compratori IA passive-responsive
  (upgrade per loro, budget/cassa/quote LORO mai violati, gap reputazione rispettato),
  fee = richiesta × (0.85+0.25·ambizione compratore), max 3 offerte. CLI `sell <n>` →
  offerte → `sell ok <k>` esegue (soldi in cassa, `transfer_out` a ledger).
- **Rinnovi**: `contracts/renewals.ts` (primo contenuto del modulo contracts) —
  `renew <n>`: expectedWage + durata per età, rifiuto dei tagli >10%, monte macchina.
- **Finanze**: `finanze` (cassa/budget/bill/esercizio) + `alloca <±M>` (sposta
  trasferimenti↔tetto ingaggi settimanale, mai sotto il bill).
- `bid` in modalità presidente: offerta libera in milioni (`bid <pos> <n> [M]`, default
  90% della richiesta), contro-offerte auto-chiuse se dentro budget (§7.2).
- Semplificazioni dichiarate (§7.2): cap extra-UE dei compratori IA non tracciato (v1).
- 173 test verdi (5 nuovi in `offers.test.ts`: budget compratori mai violati, niente
  offerte per il veterano di fondo rosa, esecuzione col denaro nel verso giusto,
  rinnovo nel tetto, rifiuto del taglio). Smoke completo in game.

### 2d — Gestione allenatore — COMPLETATA
Spec: `docs/MODULE_MANAGER.md`. Consegnato:
- **La qualità dell'allenatore muove le formazioni** (`applyCoachPick` nel runner): ogni
  club IA schiera l'XI del SUO tecnico — p(subottimale) = 0.35·(1−rep/100), un titolare a
  caso resta fuori (tecnico da 90 ≈3% errori, da 30 ≈25%). In **presidente puro** anche il
  TUO club schiera l'XI del tuo allenatore: assumerne uno buono conta davvero.
- **Mercato panchine**: ~12 allenatori liberi dal worldgen (`populatePeople`); CLI
  presidente `staff` (tuo tecnico + liberi), `fire` (esonero → pool, subentra
  traghettatore), `hire <k>`. I club IA non cambiano tecnico (carosello = capitolo futuro).
- **Costo staff a ledger**: 0.4M + (rep/100)²·6M l'anno (voce `other` "staff tecnico").
- Verifica: tecnico da 95 > tecnico da 15 in punti su più seed; **calibrazione per-lega
  ancora 5/5** col poor-pick attivo. 175 test verdi (`coach.test.ts`).
- Rimandati (motivati): rapporto fiducia manager↔presidente, dimissioni, promesse (Fase 4);
  effetto carattere-tecnico sul morale squadra (col morale Strato 2).

**FASE 2 (ruolo presidente) COMPLETATA**: 2a finanze ✔ · 2b mercato tra club ✔ ·
2c modalità presidente ✔ · 2d gestione allenatore ✔.

### 2d-bis — Stili tattici & bottega dell'allenatore (richieste utente) — COMPLETATA
Spec: `docs/MODULE_MANAGER.md` §5-§6, GAME_DESIGN §5. Consegnato:
- **Core**: `Manager.style` (`CoachStyle`: wings/pressing/catenaccio/possession/counter/
  motivator/youth), assegnato in generazione con bias dal carattere (temperamento→pressing/ali,
  compostezza→catenaccio/possesso, leadership+socialità→motivatore), draw stream-safe.
  Persistito (colonna `style`, default legacy 'motivator').
- **Effetti partita** (`engine/coach-styles.ts`): moltiplicatori xG per lato (volume/qualità
  propri e concessi, ≤10%) scalati da `p = rep/100 × FIT rosa` (media attributi-chiave per
  ruoli-chiave, clamp [0.3,1]) — il catenaccio senza difensori non è catenaccio. Threading:
  runner (`state.styles`) → `simulateScore` → `simulateMatchXg`; il Poisson li ignora.
- **Bottega** (`coachDevBoost` in `progression.ageAndDevelop`): bonus crescita additivo =
  `1.2 × rep/100 × carisma(leadership/socialità) × risultati(attesa−finale, clamp 0.7-1.3)`
  sugli attributi-bersaglio dei ruoli-bersaglio (catenaccio→DF marking/tackling/positioning,
  ecc.); **sviluppatore → tutti gli attributi U22 ×0.6**; mai oltre il potenziale.
- CLI `staff`: stile + fit ("Contropiede (rosa adatta)"), liberi con stile visibile.
- **Verifiche**: catenaccio concede meno delle ali (stesso club, più seed); la crescita si
  SPOSTA con lo stile (catenacciaro→DF marking/tackling ≫; contropiedista→FW finishing ≫);
  risultati e carisma amplificano; youth solo U22. **Calibrazione per-lega ancora 5/5 con
  gli stili attivi** (ITA 41.9/25.1/33.1, gol 2.75). 181 test verdi (6 nuovi).
- Stili futuri dichiarati: maestro tattico, sergente di ferro, verticale; effetto-morale del
  motivatore si aggancia quando il morale legge lo staff.

## FASE 3 — Ruolo PROCURATORE (in corso)

Piano confermato: 3a mandati+carriera → 3b osservatori+scommessa potenziale → 3c piazzamento
+ 6 leve guerra talenti → 3d hype/bolle. Decisioni: finestra pre-stagione + digest;
agenzie IA passive in v1 (i clienti si strappano solo con la penale, 3c).

### 3a — Mandati + carriera base — COMPLETATA
Spec: `docs/MODULE_AGENT.md`. Consegnato:
- **Terreno di caccia**: i **≤18enni nascono senza agente** (worldgen + newgen); semantica
  `agencyId`: undefined=libero · null=auto-rappresentato · id=sotto mandato (persistenza
  con sentinella 'SELF').
- `agent/career.ts`: archetipi (novizio 8/200k · esperto 55/2M · ex-calciatore 35/800k,
  +10% fascino), agenzia utente REALE nel mondo ('agency-user'); `proposeMandate`
  (accettazione = base − scarto reputazione-richiesta − %-alta − ambizione: **il novizio non
  firma il fuoriclasse, testato p=0 su 20 tentativi**); `settleAgentSeason`: incassi
  % stipendi annui + fee sui rinnovi (ledger personale), pulizia ritirati/rilasciati,
  churn a scadenza mandato (reputazione vs richiesta × lealtà), reputazione che deriva
  verso la qualità del portafoglio.
- CLI `procuratore --archetipo`: liberi (top prospettive + "alla tua portata", stime
  scouting), scout, firma <n> [pct] [anni], clienti, conti, avanza (stagione+digest).
  Smoke novizio: 4 ragazzini al 6% → 351k prima stagione, rep 8→15.
- 184 test verdi (3 nuovi: barriera novizio, incassi/fee a ledger, churn).

### 3b — Osservatori + scommessa sul potenziale — COMPLETATA
Spec: MODULE_AGENT §7. `hireScout` (300k/anno, AgencyStaff role scout, ~15 report
automatici sui senza-agente più abbordabili a ogni stagione); `investInClient` (0.2-0.6M
su clienti <22 sotto il potenziale → +1..+3 su 3 attributi chiave del ruolo alla stagione
dopo, MAI oltre il tetto); CLI `osservatore`/`investi <n> <M>` + digest esteso.
Sotto-procuratori spostati in 3c (dichiarato). 186 test verdi (2 nuovi).

### 3c — Piazzamento + leve guerra dei talenti — COMPLETATA (nucleo)
`agent/placement.ts`: **`placeClient`** — scansiona i club (reputazione desc), primo
affare che il presidente IA approva (flussi 1b/2b, vincoli macchina) E che il cliente
accetta: leva **minutaggio** (l ambizioso rifiuta la panchina: gap > 6 vs media rosa),
**visibilità** (rep-gap via playerAcceptsMove), **mentoring ex-calciatore** (salva i
rifiuti marginali, p=0.35); trasferimento/firma reali, **fee a TE** (cash+ledger).
**`poachClient`** (leva penale): 25% dell annuale all agenzia, convincimento = reputazione
vs richiesta − **lealtà** (leva debiti). CLI `piazza <n>`. Rimandati dichiarati:
sotto-procuratori e partnership (capitolo agenzia/IA attiva), network connazionali
(affinità §8), CLI penale (con 3d). 188 test verdi (2 nuovi).

### 3d — Hype, bolle e agganci — COMPLETATA
MODULE_AGENT §9. **Agganci** (+1 per piazzamento, +1/stagione con clienti in massima serie,
max +2): il novizio parte a 0 ed è trasparente (barriera GAME_DESIGN §7). **hype <n>**
(costo 2·livello, max 3): ingaggio strappato al piazzamento ×(1+0.15·livello) → fee/% su.
**Bolla**: p(scoppio)=0.25·livello a ogni settle → hype azzerato, reputazione −6·livello,
agganci −1. Piazzare PRIMA dello scoppio = incassare la scommessa. CLI hype/conti/digest
(💥 BOLLA SCOPPIATA). 189 test verdi.

**FASE 3 (ruolo procuratore) COMPLETATA**: 3a mandati ✔ · 3b osservatori/scommessa ✔ ·
3c piazzamento/penale/leve ✔ · 3d hype/bolle ✔. Tre ruoli giocabili sullo stesso mondo.

### Prossimo: FASE 4 — profondità (morale S2/S3+affinità, rapporto manager↔presidente,
negoziazione multi-passo, mercato IA attivo, sotto-procuratori/partnership, xG v2 tiratori)
Contratti procuratore–giocatore §6.3 → scommessa sul potenziale §7 → acquisizione clienti →
agenzia (procuratori/osservatori) → guerra dei talenti (9 leve) → hype/bolle. Da pianificare.
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
