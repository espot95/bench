# CLAUDE.md — Stato globale del progetto

> Aggiornato a fine sessione (GAME_DESIGN §1.6, §11). Fonti di verità: `docs/GAME_DESIGN.md`
> (design) e `docs/ARCHITECTURE.md` (binding dati). Il `CLAUDE.md` in radice è solo un
> puntatore operativo. Formule/costanti del motore: `docs/SPEC.md`.

## Stato: FASI 0-3 COMPLETE · UI in corso (UI-4 salvataggi FATTO)

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

## UI (in corso) — MODULE_UI.md (visione utente: mappa strutture, no pagine dense)

### UI-0 + primo taglio UI-1 — FATTO
`ui/`: Vite+React+Tailwind v4, TS strict, motore importato da `../src` come libreria PURA
(build verde: 185KB/61KB gzip, tutto in-browser, zero server). `ui/src/game.ts` = wrapper
sessione (guscio, no logica). Consegnato: scelta club → dashboard 4 card (posizione,
prossima partita, morale, ultimo risultato) → **mappa SVG del centro sportivo** con 6
edifici (Stadio→gioca giornata+classifica live, Campo→rosa; scouting/sede/infermeria/
giovanile "in costruzione"). Avvio: `cd ui && npm run dev`.
FATTO ANCHE (richieste utente): **dettaglio giocatore** cliccabile dalla rosa (modal:
attributi reali dei TUOI, contratto, etichetta carattere, morale, infortunio, ambientamento
— potenziale MAI mostrato); **Staff tecnico** — nuovo edificio attivo sulla mappa: core
`Club.staff` (2 preparatori+medico generati, persistiti), **effetto preparatori** = sostegno
fisico dei ≥28enni via canale bottega (MODULE_MANAGER §7), assunzione preparatore (2M dalla
cassa, a ledger). **Vetrina club (home, richiesta utente)**: niente elenchi — un club per schermata
(`ClubShowcase` + `identity.ts`): stemma SVG procedurale (forma/pattern/colori derivati
deterministicamente dal nome), storia del club generata (fondazione, città, soprannome,
tono per fascia di reputazione), mappa della città (fiume/strade/stadio/centro sportivo),
scheda (budget, cassa, capienza, presidente + TIPO presidenza dai tratti, allenatore),
sfondo a gradiente nei colori sociali, animazioni slide tra club + stemma fluttuante.
**Mappe reali** (richiesta utente): Leaflet + tile OSM/CARTO dark; ogni club assegnato
deterministicamente a una CITTÀ REALE della sua nazione (16 italiane / 16 inglesi, i nomi
di città sono liberi da diritti) con stadio e centro sportivo geo-posizionati vicino al
centro; icone piccole ed eleganti (anello nei colori sociali + quadratino) con etichette
minimal. Nota: le tile richiedono rete a runtime (attribution inclusa). **Stemmi classici** (richiesta utente): `Crest.tsx` — tre famiglie araldiche d epoca
(scudo heater con capo+righe sottili, coccarda a doppio anello coi punti cardinali,
ovale con corona d alloro e banda), oro antico/crema/inchiostro, monogramma serif Georgia,
**stella sopra lo stemma per i club con reputazione ≥72**, nastro con anno di fondazione;
palette resa profonda/desaturata (vintage). **Anno di fondazione in 4 stili** (richiesta
utente): `yearStyle` in identity (nastro / targa con rivetti / anno spezzato ai lati /
inciso sotto il monogramma). **Storie in 3 voci narrative per fascia** (richiesta utente,
9 stili totali; fix `[object Object]` da GeoCity). **Attribuzione mappa discreta**: prefisso
Leaflet rimosso, ©OSM/©CARTO reso minuscolo (obbligo di licenza, non rimovibile).
**CityHub (richiesta utente)**: scelto il club, l'hub È la mappa Leaflet della città reale
— tile scure TINTE del colore sociale (filtro `sepia+hue-rotate(id.hue-40)` sul tilePane),
6 strutture geo-posizionate da `identity.ts` (stadio anello / campo quadrato / sede-staff
rombo attivi e cliccabili; scouting/infermeria/giovanile "in costruzione", grigi corsivi);
la vecchia mappa SVG `ClubMap.tsx` è stata rimossa; header e sfondo dell'hub nei colori
sociali. Etichette anti-collisione via `spreadLat` (distanza minima in latitudine ~830 m,
minZoom 12 → mai sovrapposte). **Hub immersivo** (richiesta utente): mappa full-screen
SENZA cornice con vignettatura radiale ai bordi; stemma+nome+soprannome in overlay alto-sx,
chip stato (stagione/posizione/morale) alto-dx, barra "prossima partita + ▶ Gioca" flottante
in basso (si gioca la giornata senza entrare nello stadio), ticker della piazza scorrevole
sul fondo; marker con hover-scale, anello stadio pulsante se c'è partita, `flyTo` di zoomata
al click prima di aprire la struttura, anteprime on-hover (stadio: avversario+capienza;
campo: media rosa+infortunati; sede: budget+cassa via `hubDetails`). Tinta mappa tarata
con l'utente: `brightness(2.5)`, saturate 2.6, niente contrast. **Stadio 3D** (richiesta
utente): `Stadium3D.tsx` con three.js (+OrbitControls, autorotate, notturna) — geometria
100% procedurale che CAMBIA con la capienza: <15k provinciale (1 tribuna coperta+gradinate
basse, angoli vuoti, torri faro), 15-40k all'inglese (4 tribune coperte, 2 anelli, angoli
aperti, torri faro), 40-60k catino continuo (angoli chiusi), >60k arena 3 anelli con anello
di copertura completo; seggiolini alternati nei colori sociali, fascia tetto color accent,
prato con righe di taglio via CanvasTexture. In cima alla schermata Stadio (sopra
classifica+gioca). Estesi 2 livelli bassi (richiesta utente): ≤1k terra battuta con una
tribunetta scoperta sul lato lungo; ≤3k erba con 4 tribunette scoperte — oggi irraggiungibili
(worldgen: 8k–63k), serviranno al sistema building. **Sistema building APPROVATO** e documentato: GAME_DESIGN §6.7 + **`docs/MODULE_STADIUM.md`**
(modello `Club.stadium` a settori con capienza DERIVATA, progetti con costo/durata/requisiti
e un solo cantiere, attività commerciali con ricavi in `runWorldEconomy`, autorità
presidente, render dal modello, ordine: core→engine→UI, costanti provvisorie da calibrare
con finance-health). Pagina Stadio (richiesta utente): SOLO render 3D + pannello builder
(`StadiumBuilder.tsx`, catalogo reale con requisiti verificati, bottoni disattivi finché
il core non c'è); classifica spostata nell'hub — chip "Posizione" cliccabile → pannello
overlay. **Building IMPLEMENTATO** (core→engine→persistence→UI, suite 196/196, lint 0):
`core/types` Stadium/settori/StadiumProject/CommercialId (+ledger 'stadio'/'commerciale');
`core/stadium.ts` stadiumCapacity() DERIVATA + defaultStadium(riparto 45/25/15/15) +
COMMERCIALS+ricavi; **`Club.stadiumCapacity` NON ESISTE PIÙ** (ARCHITECTURE/SPEC aggiornati);
`engine/stadium.ts` quote/startProject(vincolo hard cassa≥costo+8 settimane ingaggi, costo
subito a ledger)/proposeProject(ambizione presidente − peso su cassa, rng iniettato)/
tickStadiumProjects per-lega nel runner (season.ts, accanto a tickAdaptation); economia:
gate+facilities da capienza derivata, +voce 'commerciale' in runLeagueEconomy (0 se niente
attività → calibrazione intatta); persistence: colonna `stadium` JSON al posto di
stadium_capacity (DB vecchi incompatibili, rigenerare i save); `engine/stadium.test.ts`
7 test (derivata+bande worldgen, ciclo cantiere, vincolo cassa, requisiti commerciali,
anello +60%, tick via runner, catalogo); UI: `StadiumBuilder` INTERATTIVO (settori reali
con +1k/+2k/+5k/Copri/Anello, terreno, attività con Costruisci; preventivi in tooltip,
banner cantiere con giornate residue) via `stadiumView/stadiumQuote/buildStadiumProject`
in game.ts; Stadium3D legge pitch dal modello. **Cantieri visibili nel render** (richiesta
utente): `stadiumView.site` → Stadium3D disegna per settore impalcature (tubi+pannelli a
strisce giallo/nero via CanvasTexture cache) + gru a torre dietro l'anello; terreno →
telo bruno+transenne+gru bordocampo; commerciale → scheletro cemento 3 piani + gru FUORI
dallo stadio; angoli → gru+transenna in diagonale. **Due tipologie di strutture** (richiesta
utente, MODULE_STADIUM §3 agg.): (1) attività DELLO STADIO → a fine cantiere l'edificio
NASCE nel render 3D in slot fissi del perimetro (`buildingGroup` in `construction3d.ts`,
condiviso: chiosco bar/vetrina ristorante/torre hotel con finestre accese/mall/teatro
colonnato+timpano/opera con cupola dorata); (2) strutture IN CITTÀ (`Club.structures`:
CityStructure{id,dx,dy} = offset in gradi dal centro, colonna DB `structures` JSON) —
negozio 3M e museo 10M rep≥65, `ProjectRequest kind:'struttura'` 5 giornate, stesso canale
cantiere/cassa/ricavi; UI: bottone "📍 Sulla mappa" → hub in modalità piazzamento
(mirino+banner+Annulla, click = cantiere lì), marker casetta/gru cliccabili →
**`Structure3D` viewer** (modal con render 3D: scheletro+gru in lavori, edificio finito
dopo). **Zone di tifo + prezzi** (richiesta utente, MODULE_STADIUM §3.1): `fanZones(name,rep)`
in core — 4-6 gaussiane deterministiche (hash, no RNG) nello spazio offset dei CityStructure,
`fanDensityAt` [0,1]; ricavo struttura ×`locationFactor(0.6+0.8d)` × `priceMultiplier`
(popolare 0.85 / standard 1 / premium 1.35·(0.4+0.6d) — paga solo nel tifo denso);
`CityStructure.price` persistito nel JSON; in piazzamento la mappa mostra le zone come
aloni rosso/arancio/giallo + legenda nel banner; nel viewer `structureDetail` → etichetta
zona ("nel cuore del tifo"/"di passaggio"/"periferica") e 3 bottoni prezzo con stima
ricavo/stagione (`changeStructurePrice`). **Prezzi dello stadio** (richiesta utente,
MODULE_STADIUM §3.2): `Stadium.ticketPrice` — biglietti popolare(×0.7,+0.08 fill)/standard/
premium(×1.4,−0.10 fill), applicati in season-economy (fill clampato, si propaga alle
attività: stadio pieno ⇒ bar pieno); `Stadium.commercialPrices[id]` — per-attività, stesso
priceMultiplier ma col FILL come densità (premium paga a stadio pieno); setter engine
`setTicketPrice`/`setStadiumActivityPrice`; UI builder: sezione **Biglietteria** (3 bottoni
con stima gate/stagione e % riempimento) + mini-bottoni pop/std/prem sulle attività
costruite (non su concerti=licenza). **Otto settori + nomi + proposte curva** (richiesta
utente, MODULE_STADIUM §3.3): angoli rinominati **Distinti NE/NO/SE/SO** e AMPLIABILI
liberamente (rimosso vincolo catino); default parlanti in `SECTOR_DEFAULT_NAMES`
(Tribuna centrale/secondaria/Curve/Distinti), custom in `Stadium.sectorNames` via
`renameSector` (2-26 char) — ✏️ nel builder (window.prompt), ✦ segna i battezzati;
**render 3D PER-SETTORE**: `Stadium3D sectors prop` → ogni spalto disegnato dai SUOI
posti/anelli/copertura (scala √(posti/ref), tribunette basse ↔ tribune a 3 anelli,
tetto per settore, torri faro finché le 4 tribune principali non sono coperte; legacy
path a livelli se sectors assente) — un ampliamento SI VEDE; **`fanNamingProposal`**
(rng iniettato): a stagione finita la curva propone di intitolare uno spalto al beniamino
(veterano ≥30 più forte, soglia 78 ridotta dall'età; prima le curve non battezzate) —
card nell'hub con Intitola/Rifiuta (`fanProposal`/`resolveFanProposal` in game.ts, una
proposta/stagione). **Stemmi con emblemi civici** (richiesta utente): `ui/src/emblems.tsx`
— 27 emblemi SVG procedurali ispirati all'ICONOGRAFIA CIVICA delle 32 città (MAI stemmi
di club reali): croce S.Giorgio Milano/Genova(grifone)/Londra(+spada S.Paolo), toro Torino,
lupa Roma, cavallo sfrenato Napoli, giglio Firenze, Due Torri Bologna, scala Verona, croce
sarda Cagliari, ippocampo Salerno, ape Manchester, liver bird Liverpool, gufo Leeds,
ingranaggio Birmingham, rosa di York Sheffield, vascello Bristol, arco Nottingham, àncora
Southampton, delfino Brighton, volpe Leicester, faro Sunderland, stella+crescente
Portsmouth, elefante+castello Coventry, leone Bergamo/Norwich, aquila Udine/Palermo,
castello Bari/Newcastle, croce blu Parma. **Redesign MINIMAL** (richiesta utente:
"più creativo ma minimal, che richiami la storia"): Crest riscritto — campo PIENO nel
colore sociale, emblema civico GRANDE in crema con dettagli "inchiostro" (emblems.tsx
convertito a duotono tone+ink, via i colori fissi), keyline sottile, monogramma serif
piccolo e spaziatissimo, pattern ridotti a mezza tinta/filetto/2 righine; terza famiglia
= **GAGLIARDETTO** con banda e occhielli oro (sostituisce l'ovale-alloro); anno in 4
trattamenti minimi in oro (filetti/targhetta outline/split/inciso, con fallback per il
gagliardetto a punta); stella piccola per rep≥72. **Palette storiche per città** (richiesta
utente: colori sì, nomi no): `CITY_KITS` in identity.ts — cromie vintage delle maglie che
ogni città ha reso celebri (rossonero+nerazzurro Milano, granata+bianconero Torino,
giallorosso+biancoceleste Roma, azzurro Napoli, rossoblù+blucerchiato Genova, viola Firenze,
rosanero Palermo, 4 tradizioni Londra, rosso+sky Manchester, claret&blue Birmingham,
blu/oro Leeds-Portsmouth-Leicester, verde/giallo Norwich, sky Coventry…); club stessa
città → kit diversi via hash; hue/accent derivati dal kit via hexToHsl (fallback al
secondario se il primario è neutro-nero) — la tinta della mappa segue i colori veri;
pattern 'half' a velatura 0.4 per non mangiare l'emblema coi secondari chiari.
**Menu principale** (richiesta utente): `MainMenu.tsx` prima della vetrina — voci a
sinistra (Carriera Allenatore attiva; Presidente/Procuratore/Continua "in arrivo"),
sfondo REALISTICO cinematografico (richiesta utente, 3ª iterazione): immagine generata
ad hoc (`ui/public/menu-bg.png`, ~1.6MB — il MONDO-PALLONE acceso dalle luci delle città
che SI INSACCA gonfiando la rete della porta, vista da dietro, riflettore nella nebbiolina,
prato bagnato; lato sinistro nero per il menu),
lenta zoomata `animate-kenburns` 30s alternate + **scena ANIMATA in-browser** (richiesta
utente; video-gen Higgsfield richiede piano a pagamento → CSS): nebbia su 2 piani a
velocità diverse (mist 46s/27s alternate), bagliore del mondo che respira (glow-pulse
6.5s sul punto della rete), 14 particelle di pulviscolo deterministiche che fluttuano nel
fascio (dust, durate/delay scalati per indice), + 2° giro (richiesta utente, più visibile):
cono del riflettore con clip-path e **flicker irregolare** 9s, **12 gocce di pioggerellina**
che cadono dentro il cono (drizzle, rotate 13°, translateY 105vh), **9 riflessi di rugiada**
che brillano sull'erba (twinkle + box-shadow), **riflesso dorato che passa sul titolo**
(title-sheen: background-clip text, sweep ogni 9s), doppio gradiente di raccordo a sx/basso,
voci con text-shadow e backdrop-blur; via il vecchio globo Leaflet+gamba SVG; App: stato
`atMenu` → menu → showcase → hub. Rifiniture utente: pioggia 26 gocce/2 intensità + rugiada
22 riflessi/2 tinte, POI cono di luce disegnato RIMOSSO (resta la pioggia clip-ata nella
zona del fascio); frecce vetrina = SVG (i glifi ◀▶ diventavano emoji su Windows) con bordo
nel colore accent del club. **Sede = centro di controllo della PRESIDENZA** (richiesta
utente: la sede è modalità presidente, non allenatore): marker "Sede del club — Presidenza",
pagina a 4 sezioni — Consiglio (presidente+tipo presidenza da tratti, rep, cassa/budget/
ingaggi-settimana), Finanze (`sedeView` in game.ts: ledger raggruppati per voce con
etichette italiane, tetto ingaggi; nota "prima stagione in corso" se vuoti), Staff
(contenuto di prima), Progetti (riepilogo stadio+cantiere+strutture città, link al builder).
**La carriera UI È la MODALITÀ PRESIDENTE** (chiarimento utente): menu principale con
Carriera Presidente ATTIVA ("governa il club: conti, stadio, città e ambizioni") e
Allenatore "in arrivo"; vetrina: bottone "Presiedi il {club}", righe "Presidenza uscente"
+ "Stile della casa"; Consiglio: card "Tu — Presidente del {club}, subentrato a {NPC}".
Coerente col core: startProject/prezzi/staff usano già l'autorità presidente diretta;
quando arriverà la carriera Allenatore si passerà a proposeProject. **Proposta curva
MERITATA** (richiesta utente, MODULE_STADIUM §3.3 rivisto): `Player.clubSeasons/
titlesWithClub/bigSeasons` (colonne DB nuove, azzerati in executeTransfer+signFreeAgent);
`trackLegacies` in advanceOffseason PRIMA di ageAndDevelop (+1 stagione a tutti, +1 titolo
ai campioni di ogni lega, +1 bigSeason a overall ≥79); worldgen `seedLegacies` POST-PASS
hash-based (stream RNG intatto → calibrazione salva): permanenze u²·13 per lo più brevi,
rare bandiere titolate solo nei club rep≥75; `fanNamingProposal` richiede ≥6 stagioni E
(≥1 titolo O ≥3 annate) E overall ≥70 (costanti in `LEGACY`), score titoli×3+big+stagioni/2,
motivazioni che citano anni e meriti. Suite 200/200. **MERCATO AI ATTIVO M1+M2**
(richiesta utente, MODULE_MARKET §7 + ARCHITECTURE agg. engine/season→market/ai):
`market/ai.ts` puro — finestre estiva g.1-4/invernale g.18-22 (`marketWindowOpen` scala
su stagioni corte, `isDeadlineDay` ×1.6 chance), `squadNeeds` (carenza+qualità+età),
`aiMarketRound` per-lega (mai il club utente; DEAL_CHANCE 0.10; bid=ask×(0.86+0.12·amb);
filiera esistente askingPrice→negotiate→playerAccepts→executeTransfer; tetto rosa
compratore 27, venditore tiene il minimo di reparto; headline procedurali `DealNews`),
`aiOffersForUser` (0.22/giornata finestra, punta i top-5, TTL 2 giornate),
`resolveCounter` (una controrichiesta; soffitto ask×(1+0.15·amb)), `sellToAI`,
`refusalMoraleHit` (Grande Salto rifiutato → morale −0.10·amb·(1−0.5·prof)). Runner:
tick in playRound con **rng dedicato** (partite byte-identiche), RoundResult+={marketNews,
offers}, opzione `RunnerOptions.aiMarket` (OFF nella calibrazione: motore puro a rose
congelate); career.test invarianti a BANDE (rose 21-28, totale ≤+3/stagione — mercato
sposta, youth ricolma). UI: GameSession accumula offers/news; tab **Mercato** in Sede
(stato finestra, offerte con Accetta/Rilancia-a-prezzo-pieno/Rifiuta, gazzetta), ticker
hub con MERCATO APERTO+headline, badge ambra "📨 N offerte" nell'hub → apre il tab.
Suite 205/205. TODO M3: comprare (scouting attivo+shortlist+offerte in uscita), M4
deadline-day theatrics/borsino/rumors; costanti AI_MARKET da rifinire con finance-health.
**Render cinematografico** (richiesta utente, alternativa onesta a Unreal — non integrabile
in stack web, export HTML5 morto): Stadium3D — PCFSoft shadows, HemisphereLight cielo
freddo/rimbalzo prato + luna + **4 SpotLight riflettori** (1 con shadow map 1024), materiali
tutti **MeshStandard** (tetto metallico, bordocampo "bagnato" roughness 0.35), teste fari
in **colore HDR >1** per il bloom, cielo di 550 stelle deterministiche, **FOLLA instanced
per tribuna** (pseudo-caso hash: ~74% riempimento, colori sociali+crema+giacconi, niente
Math.random); post-chain **EffectComposer**: UnrealBloomPass(0.55/0.5/0.82) → FilmPass
grana 0.22 → VignetteShader → OutputPass (ACES). Structure3D: stessa catena leggera +
ombre; construction3d tutto PBR, finestre hotel **emissive** (brillano nel bloom).
**Contesto cittadino attorno allo stadio** (richiesta utente): identity — `CityScale`
piccola/media/grande/metropoli su tutte le 32 città + `ClubIdentity.cityScale/district`
(ENG rep≥70='signorile' Chelsea-style, altrimenti 'operaio'; ITA='storico');
`addCityContext` in Stadium3D (hash-deterministico da città+founded+nickname):
operaio = file di terraced houses mattoni+tetti a falde+comignoli e ~18% vecchie
fabbriche con ciminiera; signorile = townhouse bianche in schiera+ardesia+alberi;
storico = palazzi ocra coi coppi (borgo più basso se piccola) + **campanile**;
grandi/metropoli = **skyline lontano** 6/14 torri con finestre emissive nella foschia
(fog le sfuma); densità 16/30/44/56 per taglia; ground allargato a r430. **Toggle
giorno/notte** (richiesta utente): prop `daylight` su Stadium3D — giorno = cielo #8fa9c4,
HemisphereLight piena + sole direzionale 2.6 con shadow-camera ortho ±260 (ombre lunghe),
fari spenti (teste in metallo chiaro non-HDR), niente stelle, skyline con finestre quasi
spente (0.05), bloom 0.18/soglia 1.0, grana 0.12, vignetta soft; notte = scena precedente;
bottoni 🌙/☀️ sotto il render nella pagina Stadio (stato `dayMode`). **Suolo REALE da
mappa** (richiesta utente): `loadMapGround` — 5×5 tile raster CARTO z16 **nolabels**
(dark di notte / voyager di giorno) centrate sulle coordinate VERE di `id.stadium`,
cucite in CanvasTexture sRGB su piano ~2.2km (1 unità=1 metro, offset sub-tile perché
lo stadio cada nell'origine), receiveShadow, tinta smorzata di notte; async con flag
disposed e **fallback al terreno procedurale se offline**; attribuzione ©OSM/©CARTO
in overlay sul render (obbligo licenza). **CITTÀ VERA IN 3D** (richiesta utente, 2ª
iterazione — "case fatte male"): `loadCityBuildings` via **Overpass API** (way["building"]
around:700m, out geom 3000, cache module-level per coordinate) → impronte reali in metri
locali (est/nord, nord=-Z come la mappa) + altezze da tags height/building:levels o
euristica hash 6-16m (cap 90); radura <150m per lo stadio, taglio >850m;
`buildOsmCity`: ExtrudeGeometry per impronta → **mergeGeometries in 4 bucket di tinta**
(4 draw call, palettes notte/giorno), receiveShadow; al load il gruppo procedurale
(case/campanile/skyline) viene RIMOSSO e disposto — resta come placeholder istantaneo
e fallback offline. **3ª iterazione — la "veste" degli edifici + strade 3D** (richiesta
utente: "scatole senza veste, mappa piatta"): muri costruiti a MANO per lato (GeoAcc:
quad indicizzati, normali esterne via baricentro, UV in moduli reali 6.4m×3.1m con
altezze arrotondate a piani) con **texture di facciata procedurali** per quartiere
(canvas cache: finestre con cornici/traverse/davanzali, persiane verdi storico,
corsi di mattoni operaio, intonaco signorile; k=2 balconcino in ferro; emissiveMap
con finestre ACCESE variabili per k, vive solo di notte) + **piano strada** separato
(moduli 8m: portone ad arco + vetrina, vetrina accesa di notte) + tetti mergiati
(coppi storico / guaina scura ENG, UV in metri repeat 0.12); **strade 3D da OSM
highway** (around 820m): nastri d'asfalto per kind major/minor/foot (larghezze
10/5.5-7/2.4, quote sfalsate anti z-fight, texture asfalto con mezzeria tratteggiata
sulle major, V=metri/10), radura stadio <128m; fondo urbano a noise (base 880m) al
posto della FOTO-mappa — che resta solo come fallback quando Overpass fallisce.
~12 draw call totali per l'intera città. **4ª iterazione — fotorealismo** (richiesta
utente "più realistici, anche librerie esterne"): 6 texture FOTO **CC0 Poly Haven**
bundlate in `ui/public/textures` (brick/plaster/stucco/asphalt/coppi/slate, ~2.7MB;
scaricate via dl.polyhaven.org, pattern `_diff_1k`/`_diffuse_1k`) come BASE delle
texture canvas (photoBg: drawImage+velatura multiply col tono del quartiere, finestre/
portoni disegnati sopra; fallback disegnato se il file manca; cache key photo-aware);
**GTAOPass** nel composer (occlusione ambientale di contatto); **Sky fisico** three
(scattering, turbidity 6) al posto del colore piatto di giorno; **lampioni instanced**
ogni ~45m lungo le strade carrabili di notte (pali + teste HDR nel bloom, cap 320,
lati alternati); photos preloaded con Promise.all insieme ai dati OSM. Nota emersa:
overpass-api.de può dare 504 (sovraccarico) → mirror multipli (kumi.systems) e niente
cache del fallimento (FATTO). **PIPELINE OSM2World** (richiesta utente, dopo ricerca
GitHub — Streets GL/OSM2World/3DTilesRenderer): `tools/bake-cities.ts` (`npm run
bake:cities -- --seed 42 --limit N [--force]`) — per ogni club del seed: Overpass XML
(mirror) → **radura stadio** (via edifici <150m e strade <110m, filtro XML regex) →
**OSM2World** (tools/osm2world/, 478MB GITIGNORED, scaricato da osm2world.org; Java 21;
`convert -i x.osm --lod 2 --config createTerrain=false` — CLI: --input obbligatorio anche
in OVERPASS mode, bbox inutilizzabile → sempre via file) → **gltf-transform optimize**
(draco+webp; scoperta chiave: LOD2 100MB → senza terreno 46MB → ottimizzato **~750KB**)
→ `ui/public/city/{lat}_{lon}.glb` (stessa chiave a 4 decimali del runtime). Gotcha
Overpass da Node: 406/504 con le fetch di default — servono `User-Agent` identificativo
e **`Accept-Encoding: identity`** (il gzip manda in 504 il loro gateway); con curl
funzionava, da qui la diagnosi. Runtime:
GLTFLoader+DRACOLoader (decoder copiati in `ui/public/draco/`), `loadBakedCity` è la
**1ª scelta** (+fondo urbano proprio, receiveShadow, niente castShadow) → fallback 2ª
ricostruzione Overpass runtime → 3ª foto-mappa → 4ª procedurale. **ROLLBACK COMPLETO su giudizio utente** ("è proprio brutto"): rimossi bake script,
tools/osm2world (478MB), ui/public/city, ui/public/draco, npm script, loader GLTF/DRACO
in Stadium3D — si torna alla ricostruzione runtime come 1ª scelta. Lezioni annotate:
O2W latest crasha su tag surface esotici/relation (serviva sanitize), 0.4.0 senza --lod
→ 1.3GB, resa finale comunque non all'altezza delle nostre facciate. **Al suo posto:
TETTI VERI dai tag OSM** (ispirazione Streets GL, implementazione nostra in
buildOsmCity): `roof:shape`/`roof:height` parsati; mapping gabled/gambrel→capanna,
hipped/mansard→padiglione, pyramidal/dome→piramide, flat/skillion→piano; euristica
per i senza-tag (impronta quadrilatera + area<600 + h<25 → capanna, padiglione nei
quartieri signorili); geometria: colmo lungo l'asse maggiore, roofH=clamp(0.32·lato
corto, 1.8-4.2) o dal tag, falde in `roofAcc` (GeoAcc.tri aggiunto, normali via
prodotto vettoriale faceN, UV in metri per la texture coppi/slate), TIMPANI murati
con texture di facciata nel bucket walls; piramidale = ventaglio dal baricentro;
castShadow sulle falde. Rifiniture utente: giorno meno abbagliante (toneMappingExposure
0.72, sky rayleigh 1.0/mie 0.002/turbidity 4, sole 1.9, hemi 0.7) + fog diurno spinto a
750-1800m (era il "velo nebbia": la città arriva a 850m); PCFSoftShadowMap→PCFShadowMap
(deprecato in three r185); **anti-429 Overpass**: query in GET + **Cache API persistente**
('bench-osm-v1': una città scaricata una volta per browser) + cooldown fallimenti 5min
(prima ogni remount ritentava e il server ci ha rate-limitati). Cielo diurno asciugato
su richieste ripetute (rayleigh 0.1, mie 0.0003, turbidity 2, exposure 0.52, sole 1.55);
**strade anche nel fallback procedurale**: 2 circonvallazioni (anelli 230/390m, 48 segmenti)
+ 6 viali radiali (132→460m) in asfalto con la stessa roadTexture — il terreno ha sempre
una rete viaria pure senza dati OSM. **BUG STORICO RISOLTO**: le strade non si sono MAI
viste perché i quad erano avvolti in senso orario visti dall'alto → backface culling;
fix: `side: THREE.DoubleSide` su strade (OSM+fallback) e falde tetti. Cielo diurno:
ABBANDONATO il modello fisico Sky (o alone bianco o buio) → gradiente canvas dipinto come
scene.background (zenit #3f5878 → orizzonte #8496a9), exposure 0.85. "Terra marrone"
diagnosticata: era la texture coppi ANCHE sui tetti piatti → `flatRoofTexture` guaina
grigia per i piatti, coppi solo sulle falde. **Verde e acqua da OSM** (richiesta utente):
query estesa a leisure/landuse/natural/waterway (out geom 9000, URL nuova ⇒ cache
rinnovata) — parchi/prati/boschi come poligoni reali (#3d5a37, y 0.015), acqua
(#2c4a66 riflettente, y 0.02), **alberi instanced** (cono+tronco, point-in-polygon
ray-casting, fitti nei boschi 1/260m² radi nei parchi 1/900m², cap 700, scala variata);
fondo diurno raffreddato #8d9092. **REGRESSIONE GET scoperta e risolta**: l'interpreter
Overpass in GET risponde 406 sistematico (anche query vecchia) → dal passaggio a GET il
browser vedeva SOLO il fallback; tornati al **POST** (verificato 200: l'area del club
Milano ha 1110 building/2631 highway/66 leisure/127 landuse/80 natural/1 waterway) con
**Cache API a chiave sintetica** (`https://bench.cache/osm/{key}-v2`, store bench-osm-v2)
— il POST si fa una volta, la Response viene messa in cache sotto la chiave GET fittizia.
Con Overpass in 504 cronico: **dati di Milano IMPACCHETTATI** in `ui/public/osm/
45.4665_9.1678.json` (1.4MB trimmed: solo way+tags+geometry a 6 decimali, scaricati via
kumi) — il runtime prova PRIMA il file statico `/osm/{key}.json`, poi Cache API, poi
**4 mirror** POST (overpass-api.de, kumi.systems, private.coffee, maps.mail.ru); per
impacchettare altri club basta salvare lo stesso JSON con la chiave giusta. **Verde
invisibile = Z-FIGHTING** (diagnosi con test headless del parser sui dati impacchettati:
161 poligoni verdi prodotti ma a y=0.015 sul base −0.02 → 3.5cm < precisione depth a
400m): quote alzate a decine di cm + foto-mappa sotto la città. **EPILOGO: CITTÀ ELIMINATA
del tutto su scelta utente** ("non mi piace, elimina la città"): rimossi da Stadium3D
tutto il blocco OSM (loadCityData/buildOsmCity/facciate/strade/verde/GeoAcc/textures),
addCityContext procedurale, loadMapGround, asset ui/public/osm e ui/public/textures
(file da 2135→~840 righe). Lo stadio vive nel suo spazio scenografico: campo, tribune
per-settore con folla, riflettori/sole, cielo gradiente/stelle, edifici commerciali
del club negli slot, cantieri con gru. Restano in identity cityScale/district
(inutilizzati, potenziale riuso). canvasTex conservata per il cielo a gradiente. TODO: ricalibrare costanti con finance-health quando l'AI costruirà.

**Angoli curvi + estetica grandi stadi** (richiesta utente: "i distinti si compenetrano
nelle tribune" + "stadi grandi più belli"): i cunei angolari a 45° (dist=66 fisso, len≤26)
compenetravano SEMPRE le tribune nei grandi impianti — il varco reale tra gli spigoli è
~15-20 unità e dipende dalla stazza dei settori adiacenti. Sostituiti con **gradinate CURVE
ad arco** (`LatheGeometry`): `cornerSpan()` ricava inizio/ampiezza/raggio del vuoto dagli
spigoli interni reali delle due tribune adiacenti (per-settore nel path data-driven, default
nel legacy) — ogni punto dell'arco a raggio ≥ r0 è geometricamente FUORI dai corpi delle
tribune (garanzia provata, niente più compenetrazioni) e il catino si chiude in modo
continuo. `addCornerArc`: profilo chiuso rivoluto per anello, testate di cemento alle
estremità, folla instanced sull'arco (hash deterministico, orientata al centro), tettoia
curva con fascia. Materiali double-side clonati per i lathe. Estetica grandi stadi:
**facciata esterna** ≥40k (`addFacade`: muro+costoloni+banda accent EMISSIVA — di notte
anello luminoso nel colore del club), **maxischermi** ≥30k su due angoli opposti
(`addScreens`, schermo HDR nel bloom notturno), **fascia tetto emissiva** di notte ≥40k.
Solo `ui/src/Stadium3D.tsx`; tsc/vite build/biome verdi.

**VIAGGI DI MERCATO — M3 completo** (richiesta utente: sezione con mappa per andare a
trattare in ogni città, ricerca con filtri, "trattativa il più dinamica possibile").
Docs prima: MODULE_MARKET **§8** (status derivato, macchina a stati col mood, ingaggio,
pre-accordi, trasferte/shortlist/DS) + ARCHITECTURE (`market/negotiation → core, rng,
market`). **Engine** `src/market/negotiation.ts` (puro, RNG iniettato): `NEGOTIATION`
consts; `playerMarketStatus` DERIVATO (incedibile = top-2 e club sano ×1.5 ask; vetrina =
surplus reparto/30+ strapagato/cassa < 26 settimane ingaggi/scadenza ×0.85); trattativa
`openNegotiation` (l'incedibile può rifiutare il tavolo; floor privato da
ambition/composure/status/deadline/in-persona) → `offerFee` a MAX 4 giri con **mood**
0..1 (insulto <0.55·ask → mood −0.35 e ask +3%, sotto 0.2 walkout; temperament può
ribaltare il tavolo; concessioni verso il floor con mood/giri; ultimo giro accetta ≥floor
"a malincuore") → `playerAcceptsMove` → stage **wage** (`offerWage`, 2 giri, premio da
ambition+rep-gap, sconto in scadenza, commissione agenzia) → `dealFromState`/`executeDeal`
(vincoli cassa/budget/rosa 27 ri-verificati) — ogni battuta produce log narrativo
{who,text}. `bookTrip` (150k a ledger `other`), `dsSuggestions` deterministico da
squadNeeds. ROLE_TARGET ora esportato da ai.ts. **Test** `negotiation.test.ts` 5 verdi
(status, dinamica mood, vincoli executeDeal, trasferta+DS, determinismo riga-per-riga).
**Shell** game.ts: GameSession += shortlist/preDeals/lastTripRound/negotiation;
searchPlayers (nome/ruolo/nazionalità/campionato/età/prezzo/scadenza), marketClubs (la UI
li colloca via clubIdentity), marketClubSquad, toggle/shortlistRows, dsAdvice,
startNegotiation (1 viaggio/giornata, trasferta pagata anche se il tavolo è rifiutato),
negotiationFee/Wage (rng derivati da seed⊕hash(playerId)), closeNegotiation (finestra
aperta → firma+setLineup+news; chiusa → **pre-accordo**), playRound esegue i pre-accordi
alla prima giornata di finestra (news "onorato/sfumato") e ricorda la shortlist in
gazzetta all'apertura. **UI** `MarketMap.tsx`: mappa d'EUROPA Leaflet scura tinta col
colore sociale, città ITA+ENG attive (anello acceso, la tua in giallo), 12 città estere
"in costruzione 🚧" tratteggiate; pannello sinistro con tab Ricerca(filtri)/Taccuino
★/DS/Accordi; pannello destro città→club→rosa (badge status, ask, ☆, 📠 Tratta / ✈ Vola);
chip finestra-budget-jet-rosa; **NegotiationTable**: chat con bolle per
venditore/agente/tu/sistema, reveal progressivo ("sta scrivendo…", input disabilitato in
attesa), emoji+barra mood, rilanci rimasti, quick-offer −25/−15/−7%/pareggia, stage
ingaggio in k/settimana, esito Firma ora / Deposita pre-accordo / tavolo saltato.
App.tsx: screen 'mercato' + bottone 🧳 nella barra dell'hub. Gates: suite **210/210**
(5 nuovi), biome 0 su 115 file, tsc core+UI, vite build. TODO M4: deadline day
theatrics, borsino/rumors, hype agenti; nebbia di scouting quando arriverà il modulo.

**UI-4 SALVATAGGI — locale + cloud Supabase** (richiesta utente: "partiamo con i
salvataggi" + account Supabase per "un db robusto che scala in caso di utenti").
Docs prima: ARCHITECTURE (dipendenza `persistence/codec` + **§4-bis** formato `SaveFile
v1`), MODULE_UI **§5**. Problema tecnico vero: il `SeasonRunner` teneva lo stato di metà
stagione in una closure non serializzabile (MatchState + 4 stream RNG). **Engine**:
`Rng.getState/setState` + `restoreRng` (`rng/rng.ts`, stato = parola mulberry32 + spare
Box-Muller); `SeasonRunner.snapshot(): RunnerSnapshot` + `createRunner(..., { resume })`
— su resume NIENTE `initialiseElo` (resetterebbe l'Elo evoluto) e `LeagueContext`/
aspettative/stili **ripristinati, non ricalcolati** (baseline congelati a inizio stagione).
**Codec** `persistence/codec.ts` (PURO, zero SQL, mai l'orologio): `encodeWorld/decodeWorld`
(Map→entry array, semantica `agencyId` undefined/null conservata), `encodeSave/decodeSave`,
`saveToText/saveFromText` (validazione + versione). **Test** `codec.test.ts` 4 verdi, il
gate che conta: giocate 9 giornate → salva via testo → ricarica → il resto della stagione
è **byte-identico** su entrambi i rami (season/world deep-equal, marketNews/offers/injuries
uguali giornata per giornata); RNG round-trip con spare in volo; stagione finita ripresa
= finita; versioni sconosciute rifiutate. Misure: mondo 2.1 MB + stagione giocata 0.6 MB
→ **localStorage escluso**, gzip ≈ 0.45 MB. **UI** `ui/src/saves/`: `store.ts`
(interfaccia `SaveStore`, `AUTOSAVE_ID`), `local.ts` (IndexedDB `bench-saves`, wrapper
nativo senza dipendenze), `gzip.ts` (CompressionStream + magic bytes), `supabase.ts`
(`@supabase/supabase-js` — unica dipendenza nuova; client lazy da `VITE_SUPABASE_URL/
ANON_KEY`, `cloudConfigured()` spegne tutto se assenti; magic link `signInWithOtp` +
`verifyOtp` codice; `CloudSaveStore`: blob gzip in bucket privato `saves/{uid}/{id}.json.gz`
+ riga metadati `saves`), `session.ts` (`sessionToSave/saveToSession`: l'unico punto che
legge `Date`; il runner rinasce da `createRunner(..., {resume})`), `SavesScreen.tsx`
(tab Locale/Cloud, card con stemma+lega+giornata+data+peso, Carica/Elimina/Esporta/
Importa, ☁️↑/💾↓, login email + campo codice, logout), `SaveDialog.tsx` (💾 dall'hub:
nome proposto "Club · 2026/27 · g.N", salva locale/cloud, esporta, **esci al menu** —
prima non c'era modo di tornare al menu). App: `atSaves` → `SavesScreen`; `MainMenu`
"Continua partita" ATTIVA; **autosave IndexedDB dopo ogni ▶ Gioca** con nota
"autosalvato · g.N". `supabase/migrations/0001_saves.sql` (tabella + RLS + bucket + 4
policy per cartella utente), `ui/.env.example`, `.gitignore` += `.env.local`,
`ui/src/vite-env.d.ts`. Smoke tsx end-to-end: gioca 3 → salva → gzip → ricarica →
shortlist ripristinata, 35 giornate residue identiche, cassa/gazzetta identiche.
Gates: suite **214/214** (4 nuovi), biome 0 su 125 file, tsc core+UI, vite build.
**NON verificato**: il path cloud end-to-end (servono le credenziali dell'utente —
checklist di attivazione in MODULE_UI §5 — **rimandato dall'utente, TODO aperto**).
TODO: sync automatica locale↔cloud, Web Worker.

**MULTI-STAGIONE in UI** (richiesta utente, subito dopo i salvataggi). Docs: MODULE_UI
**§6**, ARCHITECTURE §4-bis (`session.offseason`). **Engine** `engine/career.ts`:
`closeSeason(world, season, seed, year)` — estratta dalla CLI `manage` (che ora la USA:
un solo punto di verità per la chiusura; seed delle altre divisioni ora da indice-lega,
prima due leghe di pari tier condividevano il seed) → altre divisioni + `advanceOffseason`;
`offseasonSummary(world, club, oldLeague, closed, year, squadBefore)` — digest piatto
(esito ⬆/⬇/salva, classifica, verdetti per lega, bilancio, cassa/budget nuovi, ritiri e
svincolati "miei" riconosciuti dalla rosa catturata PRIMA della chiusura, giovani).
`OffseasonSummary` entra in `SessionExtras.offseason` (codec). **Test**
`close-season.test.ts` 2 verdi (determinismo, bande di popolazione/rose come career.test,
leghe a 20, verdetti coerenti con gli swap, conti = mondo, svincolati davvero fuori).
**Shell** `game.ts` `advanceSeason` (guardia "stagione non finita", anno+1, lega ricavata
da `leagueOfClub`, reset per-stagione; pre-accordi/shortlist/gazzetta sopravvivono).
**UI** `OffseasonScreen.tsx` (sfondo radiale nel colore sociale, classifica con bordo
verde/rosso sulle zone, bilancio + nuova stagione con ⚠ austerità, chi se ne va,
verdetti 🏆⬆⬇, bottone "▶ Stagione 27/28 — Lega"); App: bottone "⏭ Chiudi la stagione"
a stagione finita (setTimeout per far dipingere lo stato ⏳; ~1.2 s misurati), la
schermata resta finché `session.offseason` non viene archiviato → **sopravvive al
salvataggio**. Smoke tsx: 2 stagioni consecutive, save/reload sulla schermata di
riepilogo, stagione 2 e chiusura 2 byte-identiche dopo il reload, ledger a 8 voci.
Gates: suite **216/216** (2 nuovi), biome 0 su 127 file, tsc core+UI, vite build.

**RINNOVI NEGOZIATI COL PROCURATORE** (richiesta utente: "non esiste l'autorinnovo…
trattativa col procuratore… tifoso/mercenario/pensa-in-grande… bonus e rassicurazioni").
Docs prima: **`docs/MODULE_CONTRACTS.md`** (nuovo, spec completa), GAME_DESIGN §6.1
esteso, ARCHITECTURE (deps `contracts → core, rng, market` + `engine/career → finances`).
**Core** (additivo): `ContractBonuses.topFinish` (colonna JSON → zero migrazioni).
**Engine**: `contracts/renewal-negotiation.ts` (puro, costanti `RENEWAL`) — stance
derivata (mai memorizzata): **tifoso** = hash det. con p alta se vivaio (`FAN_P_TRAINED`
0.6, il vivaio è il proxy del "nato lì") ⇒ sconto ~15% e mood alto; **mercenario**
(amb≥.65, lealtà≤.35, forte) ⇒ premio 15-30%, bonus scontati al 50%, **stallo** 3-5
giornate dal 2° giro (al ritorno +8%, o **addio annunciato** se il progetto non convince);
**pensa-in-grande** (amb≥.7) ⇒ `projectConvinces` (pos ≤4 o ≤ rank reputazione) — senza,
i soldi non bastano: servono bonus trofeo+top4 ≥ ask×26 settimane O una promessa.
Macchina 4 giri con mood/insulto/walkout+cooldown/floor privato/"a malincuore" (stile M3);
il PACCHETTO vale: fisso + EV(bonus per ruolo/qualità/probabilità di lega, `outcomeOdds`)
+ promessa (8%); anni desiderati (giovane lungo/mercenario corto) con malus scarto.
Monte ingaggi vincolo macchina (riga sistema, giro non consumato). **Niente autorinnovo**:
`renewOrRelease(..., skipClubId)` → il club utente rilascia SEMPRE gli scaduti non
rinnovati (threaded advanceOffseason→closeSeason, CLI inclusa; il `renew` legacy CLI resta).
**I bonus si pagano**: `finances/bonus-settlement.ts` (core-only, stats come mappa piatta
dall'engine) — gol/assist dai match events, trofeo (1°), top-4, salvezza (solo leghe con
retrocessione), cassa+ledger `other` "bonus contrattuali"; chiamata in `closeSeason` per
ogni lega; `OffseasonSummary.bonusPaid`. Nessun contratto AI ha bonus → bande finanziarie
intatte. **Promesse**: `MarketPromise` nel codec (`SessionExtras` += renewal/renewalNotes/
promises), scadenza = fine della prossima finestra (`promiseDeadline`); mantenute da un
acquisto del reparto ≥ media (hook in closeNegotiation/pre-accordi), tradite →
`moraleShock` (nuovo helper, owner morale) −(0.10+0.10·amb) + stance `betrayed` (+20%
richiesta) + gazzetta. **Shell** game.ts: contractRows/startRenewalTalk (riapre stalli,
cooldown, addii)/renewalOffer/closeRenewalTalk/renewalTableView (floor privato)/
suggestedBonuses/openPromises + dossier `renewalNotes`; advanceSeason pulisce
stalli/cooldown ma conserva tradimenti/addii. **UI** `ContractsPane.tsx` (Sede → tab
**Contratti**): tabella per urgenza (badge rosso scadenza, ❤ tifoso, ★bonus, note stato),
tavolo chat stile NegotiationTable con chip bonus 0×/1×/2× (importi da `suggestedBonuses`),
select anni e promessa di reparto; ticker hub "⚠ N contratti in scadenza"; OffseasonScreen
riga "bonus contrattuali". **Test** 7 nuovi (tifoso<mercenario, pensa-in-grande
rifiuta/firma con garanzie, monte mai violato + determinismo riga-per-riga, stallo/addio,
svincolo certo, promiseDeadline, liquidazione = eventi reali via mondo gemello). Smoke:
rinnovo ❤ con bonus+promessa → reload ok → promessa tradita a fine finestra → 140k di
bonus pagati nell'offseason → 2 scadenze reali l'anno dopo. Gates: suite **223/223**,
biome 0, tsc core+UI, vite build.
**M4 — MERCATO CON MEMORIA** (richiesta utente: "più attivo" + "storicità del rapporto
tra club"). Docs prima: MODULE_MARKET **§9**, ARCHITECTURE (§3.11 `World.clubRelations`),
GAME_DESIGN §6.4. **Rapporti tra club** (`market/relations.ts`, costanti `RELATIONS`):
`World.clubRelations` Map SPARSA con chiave ordine-indipendente — +1 per affare concluso
(bump in `executeTransfer`, unico esecutore), ×0.75 a ogni offseason con pruning <0.1
(decay in `advanceOffseason`), letture clampate a 3. Effetti: trattativa utente (floor
×(1−0.03·rel), mood +0.05·rel, riga "c'è fiducia", l'incedibile NON rifiuta il tavolo a
rel≥1), `collectOffers` fee ×(1+0.02·rel), pretendenti ordinati per rapporto in
`aiOffersForUser`/`solicitOffers`. Persistito nel codec JSON; NON su SQLite v1
(dichiarato). **Domanda AI viva** (`aiMarketRound` ristrutturato in `attemptPurchase`):
spesa scalata chance ×(1+0.9·min(1,budget/60M)·(0.5+amb)) cap 0.35 — il surplus PL
circola; **DUELLI** (p 0.3: rivale con stesso bisogno → ask ×[1.08-1.25], vince
budget×ambizione, headline "DUELLO VINTO"); **EFFETTO DOMINO** (p 0.5: il venditore
reinveste subito l'80% dell'incasso su un sostituto dello stesso ruolo); **SFUMA SUL
GONG** (deadline, p 0.15: l'affare muore alla firma, news fee 0). **Rumors**
(`marketRumors`, runner le accoda a marketNews anche fuori finestra): indiscrezioni
procedurali in finestra + 2 giornate di vigilia, a volte sui TUOI top-5 ("la piazza
trema"); `DealNews.playerId` (additivo) le rende tracciabili. **Borsino** (UI, Sede→
Mercato): ultimi 12 movimenti con freccia ↑/↓/= (fee vs `baseMarketValue`) e 🔥 per i
rumors. **Offerte con memoria**: rifiuti registrati (`SessionExtras.rejectedOffers`) →
lo stesso club può tornare UNA volta con +12% (`returnOffer`, gazzetta "NON MOLLA").
**Canale rinnovi↔mercato**: hot-list = addii annunciati + `wantsOut` (promessa tradita
ad ambizioso ≥0.5 → "CHIEDE LA CESSIONE" in gazzetta e nota nel tab Contratti) →
`solicitOffers` genera offerte AI reali scontate (×0.78) — incassi o li perdi a zero;
lo stallo del mercenario riapre citando un RIVALE REALE (`bestRivalInterest`,
deterministico) e la richiesta sale almeno al suo livello. **Test**: `m4.test.ts` 4
(bump/decay/pruning + tavolo più caldo, stagione di round con duelli/domino/gong e
bande rose 19-28, rumors solo in stagione-di-mercato, hot-offer scontata + rilancio
stesso club, mondo sano dopo offseason); ai.test aggiornato (gong a fee 0);
`coach-styles.test` ora misura il motore a mercato SPENTO (il churn M4 affogava un
effetto ≤10% — stessa scelta della calibrazione). Smoke: 22 news/stagione, borsino 12
righe con trend misti, 13 headline M4, 15→63 coppie di rapporti, save/reload
byte-identico. `finance-health`: nessuna spirale (Serie A 1/20 in rosso, PL solida;
i trasferimenti sono zero-sum sui conti — circola la CASSA). Gates: suite **228/228**
(4 nuovi), biome 0 su 134 file, tsc core+UI, vite build.
**ARCHETIPI + ROSTERPACK "SIMIL-REALE"** (argomento delicato affrontato con l'utente:
niente cloni distribuibili — il problema è la riconoscibilità, non il nome; NIENTE
scraping contro ToS nemmeno lento; StatsBomb Open Data ha Serie A+PL **2015/16 complete**
come fonte lecita di taratura. L'utente HA LETTO e ACCONSENTE a giocatori molto simili
al reale per USO PERSONALE). Docs prima: **`docs/MODULE_ARCHETYPES.md`** (nuovo),
GAME_DESIGN §9.2 (decisione registrata), ARCHITECTURE ("NON ESISTE Player.archetypeId").
**Core** `core/archetypes.ts`: libreria di **17 archetipi** (2 GK, 4 DF, 5 MF, 6 FW) con
etichette/descrizioni da report, **lobi di heatmap gaussiani** su campo normalizzato
(autore = piede destro, `mirrorByFoot` specchia i mancini — l'ala invertita vive sul lato
opposto al piede), bias attributi; `playerArchetype()` **DERIVATO** (mai memorizzato,
regola overall): punteggio sulla FORMA — attributi centrati sulla media del giocatore,
normalizzato sulla massa di bias (la 1ª versione a dot-product nudo falliva: vinceva chi
pesava più attributi, 41% di match → 100% col centering) + tiebreak hash (zero RNG di
worldgen → calibrazione intatta); `archetypeHeatmap()` matrice 12×8 normalizzata.
**`generation/roster-pack.ts`** (puro, rng-free): `PackPlayer` {nome INVENTATO, età,
nazionalità, piede, archetipo, level, standouts, traits, trainedHere, confidence
alta/media/bassa}; `attributesForArchetype` (level + bias×14 + rumore hash ±3);
`applyRosterPack` = **VESTIZIONE** di giocatori già generati (conserva id/contratti/
agenzie/popolazione — zero migrazioni), da applicare PRIMA di createSeason.
**Pack** `ui/src/packs/real-ita.ts` (CONTENUTO PERSONALE, NON DISTRIBUIRE): Milano
nerazzurra (21 profili) + Milano rossonera (20), scritti dalla conoscenza calcistica a
inizio 2026, confidence dichiarate (i 'bassa' si rivedono con l'utente). **Mappatura del
guscio** (`applyRealPacks` in game.ts): città+kitPrimary via identity → UN SOLO club per
pack (più club generati condividono città/kit: vince tier poi reputazione — il 1° smoke
vestiva 4 club coi duplicati, fix). Su seed 42: nerazzurri → "Brumal FC" (A), rossoneri →
"Granverde FC" (A); Leandro=Ala invertita ov89, Lezcano=Punta d'area ov93. **Test**
`core/archetypes.test.ts` 4 (copertura ≥13 archetipi su un mondo, heatmap normalizzate/
specchiate/offensive dove devono, vestizione senza toccare popolazione/contratti,
inferenza ≥80% sugli autorati — di fatto 100%). Gates: suite **232/232**, biome 0 su 139
file, tsc core+UI, vite build; career col pack deterministico.
**FISICO, DUELLI E HEATMAP NEI REPORT** (richiesta utente). Docs prima: SPEC **§19**
(fisico derivato + duelli), MODULE_SCOUTING **§7** (heatmap nel report). **Fisico**
(`core/physique.ts`): altezza DERIVATA (regola overall) da ruolo+forza+dribbling+pace+
hash ±6cm, clamp 165-202 — i piccoletti del mondo SONO i dribblomani, i marcatori
torreggiano; `Player.height` opzionale SOLO se autorato dal pack (`PackPlayer.height`);
`baricentroFactor` [-1..1] e etichetta basso/medio/alto. **Duelli** (`engine/duels.ts`,
costanti `DUEL`): per partita, miglior dribblatore (dribbling+pace, +bonus baricentro
basso) vs difensore più ruvido avversario (tackling+forza+temperamento−compostezza);
intensità × gap di velocità (il lento può solo far fallo). Effetti: **peso-cartellino**
del ruvido ×(1+1.6·I) — stesso meccanismo del temperamento §6.4: REDISTRIBUISCE chi
viene ammonito, la Poisson resta quella → totali di lega invariati per costruzione;
**rischio-infortunio** del dribblatore ×(1+0.9·I·(1−0.5·bassoBari)) cap 0.5 — il
baricentro basso scivola via dal tackle. Planning deterministico dagli XI, zero draw
RNG (stream intatti); threading `planDuels` → `buildMatchScript(…, mods)` in playMatch.
**Heatmap nel report** (`scouting/report.ts scoutedHeatmap`): verità dell'archetipo +
rumore hash con σ = max(0.06, 0.55/√obs) e banda per-osservazione — sgranata a 1,
nitida (mai perfetta) a 20; i TUOI esatti. **UI**: `Heatmap.tsx` (campo verde con
righe, celle arancio, "attacco →", didascalia archetipo·cm·baricentro·osservazioni);
card nel dettaglio giocatore, nel NegotiationTable e nel RenewalTable;
`SessionExtras.observations` (codec) con +1 alla rosa avversaria per partita giocata
contro e +1 all'apertura di un tavolo. **Test**: `duels.test.ts` 4 (altezze per ruolo/
bounded/autorate, duello acceso dal marcatore lento vs ala bassa, cartellini
REDISTRIBUITI mai gonfiati su 400 seed ±5%, dribblatore martellato si fa male di più su
600 seed), `scouting/heatmap.test.ts` (granularità decrescente, mai perfetta,
deterministica). `coach-styles.test` "catenaccio vs ali" portato a **6 stagioni** (con
3 il rumore dei duelli lo ribaltava — effetto ≤10% su base rumorosa, come il gate
formazione §9.4). Smoke: 76 osservazioni dopo 3 giornate, GK con mappa sulla porta,
avversario sgranato a 1 oss., reload identico. Gates: suite **237/237** (5 nuovi),
biome 0 su 144 file, tsc core+UI, vite build.
**F1 — IL BILANCIO VERO DEL PRESIDENTE** (richiesta utente: "gestita come nella realtà,
niente budget trasferimenti/stipendi ma un bilancio"; co-design registrato in
GAME_DESIGN §6.2 — F2 sponsor-contratti+plusvalenze, F3 coppa nazionale, F4 eventi/tour/
ritiro). Docs prima: MODULE_FINANCES **§5**, ARCHITECTURE **§8**. **Architettura chiave**:
per NON toccare i cento call-site dei vincoli macchina, `transferBudget`/`wageBudget`
del club utente diventano **SPECCHI DERIVATI** (`syncUserBudgets`): transferBudget :=
cassa+fido, wageBudget := max(bill, ricaviAttesi×0.8/52) — tutti i check esistenti
funzionano invariati, guidati dal tesoro. **`finances/treasury.ts`** (`FISCAL`): fido =
35% ricavi attesi (min 8M) con **interessi** 8%/anno pro-quota (voce `interessi`);
**sostenibilità squad-cost** ok<0.7≤allerta<0.8≤blocco; ricavi attesi = ledger anno
precedente o proiezione a posizione-attesa (rank reputazione). **Flussi per giornata**
(`tickUserFinances` nel runner, SOLO userClubId, zero RNG → salvataggi byte-identici):
stipendi spalmati (bill corrente), botteghino per gara in casa + **costi matchday**
(4/spettatore, voce `matchday`), TV quota-uguale in 3 tranche, sponsor base in 2,
interessi sul rosso. **Conguaglio** (`settleUserSeason` in advanceOffseason, che SALTA
il club utente da runWorldEconomy/applyBudgetPolicy): TV-merito, premio, bonus/malus
sponsor da risultato, mutualità, commerciale, impianti+staff; accounts = somme ledger
dell'anno (il riepilogo quadra con TUTTO, mercato incluso). **Fonte unica delle formule**:
`clubSeasonLines` estratta da runLeagueEconomy (AI byte-identica). **Fido nei check
utente**: executeDeal/bookTrip (M3), checkHardConstraints (commissioni — nota: anche i
compratori AI in collectOffers ne godono, dichiarato), startProject stadio → "oltre il
fido: la banca dice no". Voci nuove nel core: `coppa` (pronta, F3), `matchday`,
`interessi`. **UI Finanze rifatta**: card Cassa (fido usato/disponibilità), gauge
Sostenibilità (barra, tetto vs bill), Proiezione stagione (ricavi attesi/stipendi/
gestione + consuntivo in corso), conto economico per voce; etichette rinominate
("Stipendi calciatori", "Cartellini"). CLI `alloca` pensionato (messaggio). **Test**
`treasury.test.ts` 4 (somme per-giornata ≈ formule annuali, AI senza flussi strutturali
infra-stagione, conguaglio con quota-merito/staff a ledger, fido+specchi+interessi solo
sul rosso, sostenibilità → blocco con bill gonfiato); 2 test esistenti aggiornati alla
regola nuova (stadio e M3: il blocco è OLTRE il fido, non a cassa bassa). Smoke: cassa
57.6→62.3M in 10 giornate con voci vive, reload identico, specchi=disponibilità,
conguaglio 128.3M ricavi / netto +18.9M, stagione 2 proietta dal ledger vero. Gates:
suite **241/241** (4 nuovi), biome 0 su 146 file, tsc core+UI, vite build.
**F2a — SPONSOR COME CONTRATTI VERI** (richieste utente: brand simil-reali distorti,
~200 in 5 taglie, offerte a scelta, mancato rinnovo su attese deluse, clausole tipo
"compra un giocatore della nazione dell'azienda"; scommesse SOLO per club facoltosi/di
massa con costo rep + malus tifosi; benefico stile-Unicef; rinnovo "a progetto" a stessa
cifra che sale piano). Docs: **`docs/MODULE_SPONSORS.md`**. **Core** (doc-first):
`SponsorSlot/SponsorClause/SponsorContract`, `Club.sponsors?` (solo club utente),
`FinanceEntryType += 'merch'`. **Libreria** `finances/sponsor-brands.ts`: ~200 brand in
5 taglie (micro→multinazionale), tutti i settori, nomi parodici (Al-Miraj Airways,
Samsonix, Bavaria Motors, CocaLoca, McRonald's, Nikaia/Adelphas/Koppa kit maker, Bet360/
ScomMax scommesse, UNIKID/Cuore Rosso benefiche, giù fino a Bar Sport e Joe's Chippy);
`nation` dal pool del mondo abilita la clausola merch. **Meccanica**
`finances/sponsors.ts` (`SPONSORSHIP`): 4 slot con contratti iniziali hash-based ≈
vecchia riga sponsor (quote 45/30/15/10, scadenze SFALSATE); offerte 2-4 per slot
scoperto (taglia ±1 dal rank-reputazione: 82/68/55/45), valore ×(1.5/1/0.55/0.3/0.12);
scommesse eleggibili solo rep≥70 o capienza≥40k, ×1.35 ma rep −1 alla firma e botteghino
−4% finché attive; benefico 0 soldi, botteghino +3% e rep +1 a conguaglio; clausola
merch (15-25% dell'annuo con la nazionalità in rosa — SOLO nazioni ESTERE rispetto alla
lega: per quella di casa sarebbe soldi gratis) e vetrina (multinazionali esigenti, +20%
se top-4); soddisfazione ±(0.2/0.25) su obiettivo, sotto 0.35 il brand NON rinnova
("SCARICA IL CLUB"), altrimenti rinnovo a stessa cifra / progetto ×1.05 / contento
×1.12. **Innesti**: tick tesoreria paga i contratti in 2 tranche (via riga sponsor-base
legacy per AI) e applica il gate-mult sponsor; `settleSponsors` in closeSeason (prima
di advanceOffseason) → `OffseasonSummary.sponsorNews`; il conguaglio salta il vecchio
bonus/malus sponsor quando il sistema è attivo. Ciclo import rotto spostando
`expectedPositionByReputation` in season-economy (treasury la ri-esporta). **Shell/UI**:
`initialSponsors` in newManagerCareer, offerte generate in advanceSeason per gli slot
scoperti (`SessionExtras.sponsorOffers`), Sede → tab **Sponsor** (`SponsorPane`: 4 card
con brand/valore/scadenza/aspettativa/clausola/😊😐😠, pannello offerte con Firma),
sezione "gli sponsor parlano" nell'OffseasonScreen, gazzetta per firme. **Test** 4
(libreria ≥180 e ≥30/taglia, iniziali ≈ baseline ±10% e sfalsati, offerte scalate su
fama e scommesse mai al piccolo su 15 seed, rep/gate per scommesse-benefico, merch solo
con la nazionalità giusta + deluso che non rinnova). Smoke 2 stagioni: contratti che
pagano a tranche, scadenze con "BOOKIFY SCARICA IL CLUB", rinnovo BreezyJet a ×1.12
accanto a offerte rivali, benefica tra le opzioni. Nota emersa: i nomi-club del worldgen
sono misti (un "Northgate Rovers" gioca in Serie A) → il vincolo clausola-estera usa la
nazione della LEGA. Gates: suite **245/245** (4 nuovi), biome 0 su 150 file, tsc
core+UI, vite build.
**F2a-bis — MERCATI ESTERI** (rifinitura utente sulla clausola merch: 'per le nazioni
facili serve invece un mercato-OBIETTIVO — es. un cinese perché l azienda investe lì — e
coi anni i tifosi crescono in quel paese'). MODULE_SPONSORS **§7**. Mondo:
EMERGING_NATIONS (CHN/JPN/USA/KOR/IND), ~4.5% degli stranieri via hash sull id SUL SOLO
percorso foreign (quote-vivaio intatte, stream RNG intatto — 1° tentativo dentro
generatePlayer era codice morto: il worldgen passa SEMPRE la nazionalità). Clausola
'mercato' (multinazionali/grandi, p 0.3): bonus 20-30% con il giocatore in rosa +
crescita fanbase ×2. Club.foreignFans (core additivo): +40k tifosi/stagione col
giocatore (×2 stella ≥80, ×2 sponsor), decay ×0.7 senza, cap 5M, merch = tifosi×2/anno
(headline a 100k/1M) — il mercato resta TUO a sponsor finito (settleForeignFans dentro
settleSponsors). UI: SponsorPane 'I tuoi mercati esteri'. Test: quota emergenti 2-8%,
fanbase compone su 5 stagioni con giocatore+sponsor e decade senza. Suite 246/246.
**F2a-ter — MERCATI CONQUISTATI** (rifinitura utente: 'niente aumento a prescindere — il
piccolo resta a zero per anni, il Manchester decolla, sei in COMPETIZIONE con gli altri
club, e una STIRPE di giocatori della stessa nazione vende i diritti TV lì — somma
piccola ma interessante'). MODULE_SPONSORS §7 riscritto. Core: `ForeignMarket {fans,
streak}` in types.ts, `Club.foreignFans: Record<nazione, ForeignMarket>` (numeri legacy
normalizzati a runtime nei salvataggi). `settleForeignFans` rifatto: crescita = 60k ×
**fama** (rep/100)² × **concorrenza** (0.35+0.65×quota, quota = peso del club / peso
MONDIALE: tutti i club che schierano la nazione, pesati per n° giocatori × stella ×
fama) × stella×2 × sponsor×2; cap 5M×max(0.1,fama); un emergente in rosa APRE il
mercato anche senza sponsor (bug reale trovato dai test: prima non si apriva mai);
**stirpe** = stagioni consecutive, da 3 vende i diritti TV locali (voce `tv` = 120k ×
min(streak,8) × (0.4+fama), ~0.2-1.2M) e si spezza (headline) senza giocatori. UI:
foreignMarketsView con streak+rivali, SponsorPane con 📺 stirpe e ⚔ n rivali. Test
fanbase riscritti in 4: grande conquista/perde, piccolo invisibile 3 anni (zero merch),
mercato affollato frena, TV solo dal 3° anno e <5M. Suite **249/249**, biome, tsc,
vite build, smoke simulate-season.
**F2b — PLUSVALENZE E AMMORTAMENTI** (confermato dall'utente). MODULE_FINANCES **§6**.
Core: `Contract.transferFee?` (scritto da executeTransfer per TUTTI i club — solo dato),
voce ledger `plusvalenza`. `finances/book-value.ts` (puro, derivato §1.2): durata =
endYear−startYear+1, stagioniResidue include la corrente, `bookValue` = fee×residue/durata
(ammortamento lineare), `annualAmortization`, `squadAmortization`, `squadBookValue`.
Cessione (`executeTransfer`): cassa incassa TUTTA la fee ma il ledger si spacca —
`transfer_out` = recupero residuo + `plusvalenza` = fee−residuo (somma = fee → totali
invarianti per costruzione, bande AI salve); fee<residuo → transfer_out = fee con nota
"minusvalenza X" (nessuna spesa fittizia). Vivaio/parametri zero = plusvalenza piena.
Sostenibilità (squad-cost UEFA vero): ratio = (bill×52 + ammortamenti)/ricavi;
capWeekly al netto degli ammortamenti → un 80M su 4 anni pesa 20M/anno sul cap.
Rinnovo = spalma: residuo → transferFee PRIMA di spostare le date (offerRenewal,
applyRenewal negoziato); rinnovo AI post-scadenza AZZERA transferFee (residuo 0, il
cartellino non risorge). Ammortamenti FUORI dal ledger (non monetari): solo
sostenibilità e viste. UI: riga "rosa a bilancio + ammortamenti" nella card
Sostenibilità, etichetta Plusvalenze nel ledger. Test: `book-value.test.ts` 5 (lineare
a zero, split esatto, minusvalenza senza spesa, sostenibilità che morde, rinnovo che
ri-spalma); transfers.test aggiornato (worldgen = plusvalenza piena). Fix lint
pre-esistenti (3 useTemplate unsafe). Suite **254/254**, biome 0, tsc, vite build,
smoke simulate-career 3 stagioni.
**F3 — COPPE NAZIONALI KNOCKOUT** (confermato: 'proprio come Coppa Italia, FA Cup e
Carabao'). Nuovo `docs/MODULE_CUPS.md`; `src/engine/cup.ts` (puro). Tre coppe sulle
leghe esistenti (40 club/nazione, entrambe le divisioni): **Coppa Italia** (tabellone
fisso, teste di serie = prime 8 del tier 1 per reputazione entrano agli OTTAVI, gara
secca in casa della meglio classificata, finale neutra, ×1.2), **FA Cup** (sorteggio
integrale a ogni turno via Fisher-Yates, preliminare alle 16 di rango più basso, ×1.6),
**League Cup** (seeded come la Coppa Italia, ×0.7). 6 turni ai checkpoint
`CUP.AFTER_ROUNDS [3,8,14,20,27,34]`. Partite VERE (buildMatchScript+duelli,
simulateScore, assignGoals, contesto nazionale su lega sintetica con xG del tier 1);
pareggio → rigori deterministici (probabilità dalla forza, clamp ±0.15). **RNG dedicato
per coppa** con stato persistito in `NationalCup.rngState` → campionati byte-identici
con/senza coppe (test dedicato), calibrazione intatta. Limite v1 dichiarato: Elo/
infortuni/squalifiche di coppa non rimbalzano sul campionato. Soldi: premio per turno
superato a ogni vincitrice anche AI (`CUP.PRIZES` ×mult, voce `coppa` accesa), finale
8M/3M ×mult, rep +2/+1, gate utente in casa (×0.8, nota "coppa"). Shell: UI
`SessionExtras.cups` (codec aggiornato, salvi anche a metà coppa), playRound avanza i
turni dovuti + gazzetta (referto gara utente, sorprese, trofeo), chip "Coppa" sulla
mappa → modale tabellone (`cupView`); CLI simulate-season stampa il cammino completo,
`runCareer` gioca le coppe per stagione (`CareerSeason.cupWinners`, 🏆 in
simulate-career). `manage` senza coppe (dichiarato). Test `cup.test.ts` 6 (struttura/
teste di serie, 40→1 con referti, sorteggio FA vs determinismo, premi+rep, byte-identico,
gate+checkpoint). Suite **260/260**, biome, tsc, vite build, smoke season+career.
Nota: il flake noto del test statistico coach-styles si è ripresentato UNA volta nel
run completo (verde in isolamento e nei due run successivi) — da tenere d'occhio.
**COPPE v2 — IL PONTE COL CAMPIONATO** (scelta utente). MODULE_CUPS §2-§3 aggiornati.
Runner (`engine/season.ts`): `unavailableNow(clubId)` (lettura PURA: squalificati +
infortunati alla prossima giornata + fuori lista, niente consumi) e
`applyCupEffects({injuries, fatigued})`; stato `fatiguedUntil` in MatchState e nello
snapshot (`fatiguedUntil?` opzionale → salvataggi pre-coppe ok). Fatica: malus di
squadra `CUP.FATIGUE_MALUS 0.03 × (titolari affaticati/11)` su attacco+difesa nella
giornata successiva, poi evapora — con mappa vuota il fattore è ESATTAMENTE 1 →
calibrazione bit-identica per costruzione. Coppa (`engine/cup.ts`): `playCupStage`
accetta `unavailable` (indisponibili di lega fuori dalla coppa) e `bridge`; il turno
riporta `effects` (infortuni con giornate/gravità) e `participants` (XI per club);
rossi in coppa → `NationalCup.suspended` (serializzato) → saltano il turno di coppa
successivo (squalifiche PER competizione, regola reale); `applySevereHit` SOLO con
bridge:true (1° tentativo lo applicava sempre → il test byte-identico è esploso:
le shell automatiche non devono mutare i giocatori). League Cup sfalsata su
`AFTER_ROUNDS_ALT [2,6,11,17,24,31]` (mai due gare di coppa a settimana). Shell UI:
playRound passa unavailable+bridge, versa effects/fatica nel runner (solo club della
divisione utente) e titola "TEGOLA IN COPPA" per i ko dell'utente. Limiti residui
dichiarati: Elo di coppa fermo, altra divisione senza stato, rotazione automatica.
Test cup 6→9 (indisponibili fuori dalla coppa + rosso che salta il turno dopo,
infortunio che rientra nel runner e fatica che scade+snapshot, fatica che ribalta
almeno un risultato su 12 seed a parità di draw). Suite **263/263**, biome, tsc,
vite build, smoke CLI.
**F4 — L'ESTATE E GLI EVENTI** (design confermato + aggiunta utente: pubblicità per
il pienone ai concerti). Nuovo `docs/MODULE_EVENTS.md`; `src/engine/events.ts` (puro,
solo club utente). **Ritiro** (la città conta): catalogo 10 mete REALI (campo comunale
q40/100k → Dubai q92/3M), effetti = boost forma `1+0.03×q` + infortuni `×(1−0.3×q)`
per 10 giornate via `runner.applyPreparation` (STACK di modificatori club-livello in
MatchState/snapshot: ritiro+tour convivono; injMult innestato nei DuelMods, boost sui
rating effettivi — mappe vuote = fattore 1, calibrazione bit-identica). Voce spesa
`ritiro`. **Tour mondiale**: 16 mete (emergenti+AUS/SAU/MEX/BRA/ARG/RSA+Europa),
`tourQuote/playTour` = 2.5M × fama² × market × affinità (×1.4 tifosi già lì, ×1.2
giocatore della nazione) − viaggio; PUÒ perdere (il piccolo in Cina ci rimette, spesa
`eventi`); gambe pesanti al rientro (lontano: ×0.985 per 2 giornate). Sinergie:
`settleForeignFans(touredNation)` crescita ×1.5 (FANBASE.TOUR_MULT) + SEMINA 5k×fama
senza giocatori; clausola sponsor `tour` (nuovo SponsorClause, clauseFor p 0.2
grandi/multinazionali, saldata in settleSponsors solo con la nazione giusta;
touredNation fluisce guscio→advanceSeason→closeSeason→settleSponsors). **Concerti**:
prerequisito licenza stadio; proposte promoter ai round [4,10,16,22,28,33] (RNG
derivato dal seed, band PARODIA mai persone: Coldplace, Pink Freud, Oasys…), 3 tier
gated su capienza/rep, cachet ×1.25 nelle date scomode; **pubblicità** 3 livelli
(riempimento +0/+0.2/+0.35, costo 0/4/9 per posto — rende a stadio grande e piazza
tiepida, sprecata a stadio pieno); **usura campo** se `homeClash` (data = round di
gara in casa): `applyPitchWear` → in quella gara chi ha stile `possession` (palla a
terra, ENTRAMBE le squadre) ha i mod smorzati ×0.4 verso il neutro + ownShots ×0.96
(`wornStyle` in season.ts; il debug ha mostrato che il flip-test per-partita era poco
sensibile → test sull'intero round). Voci `eventi`/`ritiro` in FinanceEntryType +
etichette UI. Shell: `SessionExtras.summer/concertOffers` (codec), scelte estive
bloccate alla 1ª giornata (`summerLocked`), tab Sede→**Eventi** (`EventsPane`:
prenota ritiro, parti in tour con preventivo, accetta concerto con anteprima
pienone/netto per livello di pubblicità). Test `events.test.ts` 8 (cataloghi, soldi
tour/affinità/perdita, spinta+semina fanbase, clausola tour, stack preparazione in
snapshot + flip, pubblicità concerti + homeClash, usura che punisce solo i
palleggiatori — bit-identico per i catenacciari, spesa ritiro). Suite **271/271**,
tsc, biome, vite build. Settore giovanile RIMANDATO (scelta utente).
**FIX BASEMAP** (segnalazione utente: "manca l'api key per vedere le mappe"): le tile
dark di CARTO (`basemaps.cartocdn.com/dark_all`) ora richiedono una API key → nuovo
`ui/src/basemap.ts`: default OSM standard SENZA chiave, resa scura via filtro CSS
(`invert+grayscale` prima della tinta club in `clubTintFilter`, brightness ricalibrata
×0.55; `plainDarkFilter` per la vetrina città senza tinta); override opzionale
`VITE_BASEMAP_URL`/`VITE_BASEMAP_ATTRIBUTION` in ui/.env.local (documentato in
.env.example) per basemap a chiave già scure. Aggiornati CityHub/MarketMap/CityMap +
attribuzione (solo ©OSM). Da verificare a occhio: la resa dei filtri sulle tile
invertite (tarata alla cieca).
**DASHBOARD FINANZE + STIPENDI ANNUALI** (richiesta utente). `financeDashboard(s)` in
ui/game.ts (vista pura): TUTTE le voci su base ANNUA — entrate/uscite strutturali
ATTESE (stessa fonte del motore: clubSeasonLines alla posizione attesa, sponsor =
Σ contratti attivi, stipendi = bill×52, matchday stimato, ammortamenti flaggati
nonCash fuori saldo) + CONSUNTIVO ledger dell'anno per le voci episodiche (coppe,
merch, eventi, plusvalenze/cessioni, ritiro, cartellini, commissioni, cantieri,
interessi). Totali + **saldo di gestione** + **verdetto "puoi investire?"**
(semaforo: margine, cassa+fido, spazio ingaggi (cap−bill)×52, stato squad-cost, con
le ragioni). Tab Finanze in App: card tesoreria (stipendi/tetto ora in /anno) +
verdetto + toggle **Annuale|Settimanale** (`finBasis`, il componente divide /52) +
tabelle con badge attesi/incassati/spesi/non-cassa + saldo. **Stipendi ANNUALI
ovunque** (motore resta a settimana, conversione solo display ×52): rosa/contratti,
tavolo rinnovi (chiede/oggi/input in M annui → /52), tavolo mercato (richiesta,
bottoni rapidi, input in M annui, accordo), dettaglio giocatore, offseason (tetto/
anno), gazzette pre-accordo/rinnovo, e i DIALOGHI del motore (negotiation.ts +
renewal-negotiation.ts: helper `A(weekly)` = "X.XM l'anno" — K resta per i bonus una
tantum; stringhe pure, zero logica). TODO dichiarato: toggle annuale/settimanale
anche per gli ingaggi (per ora solo annuale, come chiesto). Suite **271/271**, tsc,
biome, vite build.
**HUB TRATTATIVE + DUE CHAT** (richiesta utente: chat col presidente che si CHIUDE
con animazione all'accordo/salto, ingaggio in una NUOVA chat col procuratore, hub con
tutti i tavoli). Solo guscio (motore intatto): `GameSession.negotiations[]` (max 3
tavoli vivi in parallelo; campo `negotiation` legacy migrato al primo accesso da
`allTables`, codec+session aggiornati, azzerati ad advanceSeason). game.ts: start/
fee/wage/close/abandon ora per playerId; `negotiationView(s, playerId)` con
`agentFrom` = indice del primo messaggio `who==='agente'` (lì si SPEZZA il log: zero
cambi al motore); `negotiationHub(s)` = tavoli (stage/mood/fee), rinnovo in corso,
pre-accordi, conteggio offerte AI. MarketMap: tab **🪑 Tavoli** (sostituisce
"Accordi", che vive dentro l'hub) con Riprendi/Vai alla firma/Abbandona/Archivia;
`tableSel` apre il modale per giocatore (key=playerId). NegotiationTable: chat 1 "il
tavolo del presidente" → all'accordo TIMBRO animato "Accordo ✔" (chat-stamp,
cubic-bezier overshoot) + dissolvenza (chat-dimmed) → si chiude nel riassunto verde
("chat CHIUSA — cartellino a X") → chat 2 "nuova chat — il procuratore" entra con
chat-slide-in; salto in fase cartellino = timbro "Saltata ✗" (e in fase ingaggio sul
riquadro procuratore). Typewriter in pausa durante il timbro; riaprendo dall'hub si
rigiocano solo le ultime 2 battute e il presidente parte già chiuso. Nuovo bottone
"⏸ metti in pausa" (modale chiuso, tavolo vivo nell'hub) accanto ad "alzati dal
tavolo" (abbandona). CSS in index.css (stamp-in/chat-in/chat-dim). Nota: riaprire un
tavolo esistente non riaddebita la trasferta (early-return prima di bookTrip).
Suite 271/271, tsc, biome, vite build.
**POLISH ANIMAZIONI** (richiesta utente: esperienza più fluida). Kit CSS in
index.css: ui-in (fade+risalita, .anim-in/.anim-in-slow + delay .d1-.d4 per lo
stagger), modal-pop (overshoot) + backdrop-fade su TUTTI i modali (classifica, coppa,
struttura 3D, dettaglio giocatore, tavolo trattativa, SaveDialog), note-in/toast-in
(toast centrati con -translate-x-1/2: variante translate(-50%)), panel-left/right
(pannelli mercato), transizione+scale(0.96) su button:active GLOBALE (via
prefers-reduced-motion: no-preference), e blocco `prefers-reduced-motion: reduce` che
spegne tutto (ticker incluso). Sparse: card const di App e Offseason (+stagger d1-d3),
wrapper `key={sedeTab}` .anim-in sul contenuto dei tab Sede (rimonta a ogni cambio),
banner msg dei pane, savedNote/buildMsg, schermate ClubShowcase/SavesScreen/Offseason
in anim-in-slow. Solo classi CSS, zero logica. Suite 271/271, tsc, biome, build.
**PLANISFERO DELL'ESTATE** (richiesta utente: ritiri/tour immersivi su mappamondo
con mete che si illuminano). MODULE_EVENTS §5-bis. Cataloghi con coordinate
(RitiroSpot.lat/lon opzionali, 'casa' = città del club; TourDestination obbligatorie
— 1° tentativo: la regex ha saltato le entry multilinea usa/mex, fixate a mano).
Nuovo `ui/SummerMap.tsx`: Leaflet world (basemap keyless + tinta club, worldCopyJump),
apertura cinematografica (parte dalla città del club, flyTo mondo dopo 450ms), anello
"casa tua", pin emoji 🏔/✈ (grayscale idle, hover scale, tooltip con numeri), click →
flyTo + scheda overlay con conferma (Prenota/Parti; nascosta se locked/già deciso),
alla scelta `decorate()`: pin acceso con alone pulsante (pin-glow drop-shadow), gli
altri spenti (pin-off), rotta di volo tratteggiata animata casa→destinazione
(flight-dash su stroke-dashoffset); scelte esistenti decorate al mount (persistono
riaprendo). Badge di stato in alto (Ritiro/Tour scelti). EventsPane: liste sostituite
dalla mappa (prop `id: ClubIdentity` al posto di accent); concerti invariati. CSS in
index.css con blocco reduced-motion. biome-ignore su useExhaustiveDependencies (mappa
one-shot). Suite 271/271, tsc, biome, vite build.
**L'IMPERO SUL PLANISFERO** (richiesta utente: mercati esteri come territori occupati
stile gioco di guerra). MODULE_EVENTS §5-bis esteso. `empireView(s)` in ui/game.ts:
markets (foreignMarketsView + `garrison` = giocatori della nazione in rosa + `rank`
avamposto/colonia/roccaforte/impero alle soglie 20k/100k/1M), `targets` (clausole
sponsor mercato/tour), totali (tifosi, merch, stima TV stirpe). SummerMap:
NATION_COORDS (25 nazioni), per ogni territorio L.circle che respira
(territory-breathe, raggio 180km+√fans×1100 cap 1100km, tinta club o grigio se
scoperto, bordo tratteggiato ⚔ se conteso), rotta di rifornimento tratteggiata verso
casa (supply-path lenta), targa `territory-tag` (nazione · tifosi · rango · ⚔ · 📺)
con tooltip dettagli (guarnigione/rivali/sponsor/decadenza); obiettivi sponsor =
🎯 pulsanti (objective-pulse) con tooltip del brand; bollettino "🌍 il tuo impero"
in basso a sinistra (territori, tifosi, rendita ~merch+TV, contesi, obiettivi).
CSS + reduced-motion. Suite 271/271, tsc, biome, vite build.
**IMPERO V2 COMPLETO + TERRITORI VIVI + GRAFICI** (piano confermato). Docs:
MODULE_SPONSORS §7 (asset), MODULE_EVENTS (impero v2 + grafici). Core additivo:
`ForeignMarket.shops?/fanClubs?`. Motore (sponsors.ts): `maxShopsFor` (0/1/2/4 per
soglie 20k/100k/1M), `buildShop` (2M, spesa 'other') / `foundFanClub` (1M, ≥20k
tifosi, max 3) con guardie; settle: merch ×(1+0.15×negozi), crescita ×(1+0.1×sedi),
decadenza addolcita (DECAY+0.06×sedi cap 0.92), FIDELIZZAZIONE AUTOMATICA (≥100k e
stirpe ≥3 → +1 sede/stagione con headline); `rivalPresence` (top-3 club per peso).
Missioni (engine/events §missioni): `Mission`, `generateMissions` (hash, max 2,
template apri/colonia/roccaforte/stirpe/guarnigione, scadenza 3 anni),
`checkMissions` (compiuta → rep+1 + headline; scaduta cade). `amortizationInYear`
in book-value (piano futuro reale). Shell: SessionExtras `empireHistory`/
`financeHistory` (registrate ad advanceSeason, max 12 anni), `missions` (check+regen
alla chiusura, seed iniziale in newManagerCareer), `territoryPins` (cosmetici;
`syncTerritoryPins` genera pin jitterati per le sedi automatiche); azioni
`buildTerritoryShop`/`foundTerritoryFanClub` (guardia cassa+fido); viste
`territoryView`, `financeTrends` (forecast 5 anni "a bocce ferme": strutturali attese
+ bill corrente + amortizationInYear), empireView esteso (rivalTop, shops/fanClubs,
history, totalHistory, missions). UI: `ui/geo.ts` (NATION_COORDS condivise),
`ui/charts.tsx` SVG zero-dipendenze (Sparkline, SeasonNetBars ±con barre-previsione
tratteggiate, DualLines ricavi/costi — dataviz skill: coppia verde/rossa ΔE deutan
6.5 ⇒ encoding secondario OBBLIGATORIO: costi sempre tratteggiati + etichette
dirette + testo in inchiostro; HBars con aria-label); SummerMap: click sul territorio
→ zoom nazione + pannello (sparkline, rivali, contatori) + PIAZZAMENTO asset col
click (mirino, pin 🏪/🏠, banner), anello rivale rosso tratteggiato (raggio ∝ forza
rivale/tua), sparkline impero nel bollettino; EventsPane: card 🎖 missioni; Finanze:
sezione 📈 (DualLines storia, SeasonNetBars storia+previsione con toggle 3/5 e nota
metodo, composizione entrate/uscite HBars). Test: +2 events (asset nel settle con
auto-sede e retention, missioni deterministiche/premio/scadenza), +1 book-value
(amortizationInYear si esaurisce). Suite **274/274 in sequenziale** (biome, tsc,
vite build ok). ⚠ NOTA INFRA: il test statistico coach-styles fallisce SOLO nei run
paralleli di vitest (verde in isolamento, in coppia con calibration e in
`--no-file-parallelism`, input deterministici identici) — sospetto risorse worker,
non regressione; da investigare a parte (eventuale `fileParallelism: false` in
vitest.config o pool forks dedicato).
**UFFICIO COMMERCIALE + INFLUENZA MONDIALE + FIX MAPPA CITTÀ** (piano confermato,
punto 3 validato: "eliminare" = spodestare il dominante via sorpasso). Nuova
STRUTTURA in città (identity: `ClubIdentity.ufficio`; CityHub: Structure 'ufficio',
marker 'globe'; App: Screen 'ufficio' → `CommercialMap` a tutto schermo; hubDetails
con mercati/tifosi nel mondo). **CommercialMap.tsx**: il planisfero dell'influenza —
zone TUE (empire layer TRASLOCATO da SummerMap, che torna solo estate; EventsPane
senza card missioni), club DOMINANTE per nazione nel SUO colore sociale
(`dominantClubIn` in sponsors.ts = max marketWeight; `influenceView` in game.ts con
dati per clubIdentity), **spione** (selettore club → `clubZones`/`presenceByNation`
→ zone che LAMPEGGIANO nel colore del club scelto, classe zone-flash), territorio
zoom+asset+missioni come prima. **Missioni**: nuovo kind `sorpasso` ("Supera il
{club} nel marketing in {nazione}", rivalClubId/rivalName nel dato, check = mio peso
> suo; rivale sparito = trono vacante) + TUTTI i testi riscritti PER IL GIOCATORE
con campo `hint` (il "come funziona": formula del peso marketing, crescita tifosi,
stirpe) — richiesta utente. **Help component** (`ui/Help.tsx`, button + tooltip CSS
help-pop, a11y: era span+tabIndex → biome noNoninteractiveTabindex → button):
"?" sparsi in CommercialMap (intestazione, impero, spione, missioni, stirpe/negozi/
sedi nel pannello territorio), SummerMap (ritiro/tour), Finanze (verdetto,
squad-cost). **Fix mappa città** (richiesta utente): STADIUM_COORDS reali per le 32
città (San Siro, Olimpico, Maradona, Wembley, Old Trafford… — mai più stadi in
mare; multi-club stessa città = scarto ±0.004; fallback offset per città ignote);
marker strutture con COLORI FISSI ad alto contrasto (STRUCT_COLOR: stadio oro,
campo azzurro, sede magenta, ufficio ciano — niente più colore club mimetico).
Test: +sorpasso in events.test. Suite **274/274 (sequenziale)**, biome, tsc, vite
build. Nota: flake parallelo coach-styles invariato (infra, non regressione).
**NAZIONI-POLIGONO + STEMMI + FIX TOOLTIP** (richiesta utente). Ufficio Commerciale:
via i cerchi — le NAZIONI si illuminano davvero: ui/worldShapes.ts (world-atlas
countries-110m TopoJSON bundlato ~100KB + topojson-client, mapping codice-gioco →
ISO numerico zero-padded, ENG=GBR alla 110m; cache; fallback cerchio se manca la
forma). paintNation() in CommercialMap: poligono per territori TUOI (fillOpacity ∝
√tifosi, click → territorio), nazione del club DOMINANTE nel SUO colore, zone
spiate che lampeggiano. STEMMA VERO + nome sotto per il dominante di ogni nazione
(crestFlagHtml: renderToStaticMarkup(<Crest/>) in divIcon, ⭐ dove domini tu; CSS
.dom-flag/.dom-name, float della vetrina spento). Help: il popover si RIBALTA sotto
se il chip è nel bordo alto (misura getBoundingClientRect al mouseenter) e si
sposta se sfora ai lati (.help-pop.below + marginLeft). Suite 274/274 sequenziale,
biome, vite build. **BARRA AZIONI SUL PLANISFERO + TOOLTIP IN PORTAL** (richiesta utente). Help: il
popover è renderizzato in PORTAL su document.body (position:fixed, z 99999,
.help-pop-portal) — mai più coperto dai pannelli, con flip sotto al bordo alto e
clamp laterale (misura al mouseenter). Ufficio Commerciale: TUTTI gli stati sono
cliccabili (territori tuoi, nazioni dominate, e terre di nessuno con poligono quasi
invisibile) → BARRA AZIONI in basso (focusNation): riepilogo (tifosi tuoi/rango,
dominante o 'terra di nessuno', ? con la ricetta di conquista) + azioni VERE:
🗺 Gestisci territorio (apre pannello+zoom), 🔍 Cerca giocatori {nazione} → apre il
MERCATO col filtro nazionalità già pronto (App.scoutNation → MarketMap
initialNationality, azzerato all'uscita), ✈ Porta il tour qui (chooseTour diretto se
estate aperta, tooltip spiega perché è disabilitato), 🕵 Spia il dominante (setta lo
spione). Suite 274/274 sequenziale, biome, tsc, vite build. **BARRA AZIONI COMPLETA: SPONSOR-NAZIONE + CONFRONTO STORICO** (richiesta utente).
Barra dell'Ufficio Commerciale: alle 4 azioni si aggiungono 🤝 Sponsor {nazione}
(pannello inline: brand del paese da SPONSOR_BRANDS via nationBrands(s, nation) con
stato ✓ firmato con te / → ti sta offrendo / possibile partner, ? sulla meccanica
merch) e 📊 Confronto storico, che appare SOLO cliccando lo STEMMA del club
dominante (focus.viaDominant): barre TU-vs-LORO del peso marketing di oggi + linee
per stagione (DualLines con nuovo unit='peso'). Storia: nuovo
SessionExtras.influenceHistory (per nazione: {year, mine, top, topName}, max 12,
registrato ad advanceSeason per tutte le NATION_COORDS con presenza; la linea 'top'
segue il dominante di ogni anno chiunque fosse) — codec+session. Viste in game.ts:
nationBrands, influenceCompare. Suite 274/274 sequenziale, biome, tsc, vite build.
**PROMEMORIA AL DS** (richiesta utente). Nuova azione 📋 nella barra del planisfero:
lasci una nota su una nazione e in ~2 giornate il DS porta in Gazzetta i 3 migliori
profili di quella nazionalità ALLA TUA PORTATA (engine puro dsNationReport in
market/negotiation.ts: stesso score/filtri di dsSuggestions ma per nazionalità,
senza vincolo di ruolo, zero RNG); i segnalati prendono +2 osservazioni scouting.
Guscio: SessionExtras.dsReminders (max 3, dedup, dueRound=nextRound+1; a cavallo di
stagione le note pendenti si riportano a dueRound 2), leaveDsReminder /
dsReminderPending in ui/game.ts, consegna in playRound, bottone disattivato
('Il DS ci sta lavorando…') finché il rapporto non esce. Docs: MODULE_MARKET §8.6.
Suite 274/274 sequenziale, biome, tsc, vite build.
**NOMI CLUB = CITTÀ + COLORI SOCIALI** (richiesta utente). Via i nomi di fantasia:
CLUB_NAME_POOLS in generation/names.ts (40 combinazioni curate per ITA e ENG, blasoni
nelle prime 20 = prima divisione, mescolate col RNG dentro la divisione; fantasia solo
come fallback per nazioni senza pool). Esempi: Milano Rossoneri/Nerazzurri, Torino
Bianconeri/Granata, Roma Giallorossi/Biancocelesti, Londra Reds/Blues/Whites/Claret/
Hoops, Manchester Reds/Sky Blues. UI identity.ts: il nome si PARSA — città vera dal
nome, maglia = kit del suo appellativo (CITY_KITS ora porta nick per ogni maglia),
soprannome = i colori ('gli Azzurri', 'the Reds'); ~36 città NUOVE (Lecce…Foggia,
Wolverhampton…Barnsley) con coordinate vere di città e stadio. shortName senza doppioni
(MIL/MIR, LON/LOB/LOW/LOR/LOH). Vecchi salvataggi: i nomi di fantasia cadono sul
sorteggio deterministico di prima. applyRealPacks (città+kitPrimary) ora aggancia
SEMPRE il club giusto. La generazione consuma draw RNG diversi → mondo diverso a
parità di seed: rilanciato calibrate (bande ok, campione 82.9 / retro 24.2) e
aggiustati 3 test seed-dipendenti rendendoli robusti al mondo (tetto contract.wage
nel confronto fan/mercenario; ospite forzato catenaccio nel ramo bit-identico
dell'usura campo; rinnovo-accettato con stipendio sotto mercato e monte largo).
tools/names-smoke.ts stampa le 4 leghe. Suite 274/274 sequenziale, biome, tsc, vite build.
**LORE VERA NELLA VETRINA CLUB** (richiesta utente: 'il riepilogo con la storia della
società più vero possibile'). Nuovo ui/src/lore.ts: CLUB_LORE per TUTTI gli 80 nomi del
pool — anno di fondazione REALE della tradizione (Genova Rossoblù 1893, Nottingham Reds
1865, Stoke 1863…) e storia di 2-3 frasi che evoca il club corrispondente SENZA nomi
propri di persone/società reali (Superga, il Grande Torino, gli Invincibili, il
'clamoroso al Cibali', il boemo di Foggia, il presidente rockstar di Watford…).
identity.ts: se il nome parsa, founded e history vengono dalla lore; i club di fantasia
dei vecchi salvataggi restano sui template generici. Verifica incrociata pool↔lore 80/80
senza buchi né orfani. Suite 274/274 sequenziale, biome, tsc, vite build.
**MANTO ERBOSO DELLO STADIO** (richiesta utente). Scelta stagionale dell'altezza
dell'erba di casa, SOLO prima della 1ª giornata, effetto su ENTRAMBE le squadre che
giocano su quel campo (ciascuna per il suo stile): 🌱 bassa = palla che corre (possession
amplificato FAST_POSSESSION 1.3 + tiri 1.03, catenaccio smorzato 0.85; manutenzione
SHORT_UPKEEP 200k a ledger), ⚖ media = fattore ESATTAMENTE 1 (AI mai in mappa →
byte-identico, garanzia calibrazione), 🌾 alta = palla che frena (possession 0.6 +
tiri 0.97, catenaccio 1.15). Engine season.ts: GrassLength/GRASS, wornStyle
generalizzato in pitchStyle (erba poi usura concerto, moltiplicativi), runner.setGrass,
RunnerSnapshot.grass additivo (save vecchi = media). Guscio: SessionExtras.grass
{year,length,paid}, chooseGrass/grassView, lock nextRound()>1, reset a ogni estate.
UI: card 'Manto erboso' nella pagina Stadio con ? e lucchetto. Docs MODULE_STADIUM §4b.
TODO dichiarato: manto nei turni di coppa in casa. grass.test.ts: media bit-identica,
bassa/alta flippano il round, stili non interessati bit-identici, snapshot roundtrip.
Suite 278/278 sequenziale, biome, tsc, vite build.
**IRRIGAZIONE + CALENDARIO/AGENDA + CALL** (richiesta utente, bundle). (1) Irrigazione:
Watering/WATER in season.ts, stesso asse dell'erba e MOLTIPLICATIVA (bagnato: possession
1.15/tiri 1.015/catenaccio 0.92; asciutto: 0.8/0.985/1.08; normale = 1, byte-identico),
runner.setWatering + snapshot additivo, WET_COST 25k a gara in casa bagnata (addebito in
playRound), abitudine persistente tra stagioni, riga nella card Manto erboso. (2)
Calendario: ui/calendar.ts (round→data deterministica: giorno 0 = 10/8, domenica dalla
1ª ≥24/8, coppe mercoledì), SessionExtras.day, agendaView (partite/coppe/finestre/
deadline/offerte/concerti/call/DS/estate/fine), goToDay col clamp al prossimo impegno
OBBLIGATORIO (partita o call), CalendarScreen (📅 nell'HUD con data). (3) Call:
PlannedCall in sessione; startNegotiation ora esige l'appuntamento — primo click fissa
la call (1-5 gg hash, +2 se venditore rep≥75, 1 al deadline); presidenti VECCHIO STAMPO
(temperament≥0.6 o ambition≤0.35) niente call: ti vogliono in sede → tavolo solo con
✈ bookTrip (sconto in-persona esistente); procuratori nei rinnovi 0-3 gg telefonici;
annullo dall'agenda; MarketMap coi bottoni call-aware (📞 Call / 📞 data / 📞 Entra /
✈ ti aspetta). Docs: MODULE_STADIUM §4b (irrigazione), MODULE_UI §7. grass.test.ts 5
test (+ irrigazione bit-identica/flip + snapshot). Suite 279/279 sequenziale, biome,
tsc, vite build.
**ICONE MATERIAL** (richiesta utente). npm material-symbols (font variabile Material
Symbols Rounded, bundlato offline, import in main.tsx), componente Ic (ui/src/Ic.tsx,
em-based + fill per gli stati attivi, icHtml per le divIcon Leaflet, classe .msr-fill
per il FILL dentro stringhe HTML), baseline CSS in index.css. Sostituite le emoji
nella CROMATURA dell'interfaccia: HUD (play_arrow/skip_next/work/calendar_month/save),
giorno-notte (dark_mode/light_mode), card manto+irrigazione (grass/balance/forest,
water_drop/sunny) e lucchetti (lock), agenda (sports_soccer/trophy/swap_horiz/alarm/
payments/mic/call/flight/description/beach_access/sports_score + fast_forward),
mercato (call/flight_takeoff/star con fill sul taccuino), Ufficio Commerciale (public/
military_tech/map/person_search/assignment/flight_takeoff/visibility/handshake/
monitoring/storefront/home/swords) incluse le targhe-territorio nelle divIcon
(camping/flag/castle/crown/swords/tv, stella dominante). Le emoji RESTANO nei testi
narrativi (gazzetta, chat, storie, tooltip di colore). Suite 279/279, biome, tsc, build.
**TRATTATIVE V2: AGENTE VENDITORE + RIFLESSIONE + CONCORRENTI** (richiesta utente).
Diagnosi: la concessione inseguiva l'offerta dell'utente (ask trascinato al floor in
3-4 giri). Ora il presidente è un agente a utilità deterministico: valutazione STABILE,
zona d'accordo (sotto floor×0.9 non concede nulla), curva di concessione da resist
(composure/mood/deadline) spalmata sulla pazienza (3-6 giri), ultimatum unico, 'ci
penso' 1-3 giorni (stage pending + resumeDay in agenda) da cui può uscire un
CONCORRENTE vero (club con bisogno+budget, bid da hash) che alza ask/floor — e se
abbandoni o sfori la pazienza il rivale CHIUDE davvero (executeTransfer + gazzetta).
dsLo/dsHi: la stima del DS della zona, in plancia. Guscio: hearAnswer, auto-resolve
in playRound, abandonNegotiation con beffa, hub/agenda/viste aggiornate; UI: banner
rivale, pannello riflessione con 'Senti la risposta', stima DS. Docs MODULE_MARKET
§8-bis. 4 test nuovi (9/9 nel file). Suite 283/283 sequenziale, biome, tsc, vite build.
**STRUTTURA DELL'AFFARE V3 + AGENTE SULL'INGAGGIO** (richiesta utente). Al tavolo:
CONTROPARTITE (proposeSwap: il venditore accetta solo se gli serve — bisogno ruolo o
overall ≥ sua media — e la valuta SWAP_VALUE 0.85×base DENTRO l'offerta; alla firma
doppio executeTransfer, ledger/plusvalenze veri su entrambi i lati); RECOMPRA
(Contract.buyback additivo nel core; offerta da te = valutazione×1.5 con floor×0.9,
o PRETESA dal presidente sui giovani ≤23 a fee×1.6; esercitata dall'ex club ad
advanceSeason con hash p0.3 se il ragazzo è cresciuto → transfer + gazzetta);
PRESTITO-RITORNO (offerLoanBack: floor×0.93, preDeal con arrivalYear=year+1 onorato
l'estate dopo); RATE 1-3 (setInstallments: +4%/rata relativa, il venditore povero di
cassa rifiuta; venditore pagato subito, tu scadenzi in installmentsDue addebitate a
ogni chiusura). offerFee ora ragiona sull'offerta EFFETTIVA contanti+contropartita
(fix: lastOffer per resolveThink non veniva mai scritto). Ingaggio: agente v2 anche
lì (zona wageFloor×0.85, WAGE_PATIENCE 3, passi decrescenti, wageUltimatum unico).
Guscio: swapCandidates/tableSwap/Buyback/LoanBack/Installments, closeNegotiation
gestisce loanBack+schedule, playRound filtra preDeals per arrivalYear, codec/session
+= installmentsDue. UI plancia: riga Struttura (select contropartita col valore,
+recompra/badge pretesa, +resta 1 anno, select rate, contanti-per-pareggiare).
Docs MODULE_MARKET §8-ter. 4 test nuovi (13/13 nel file). Suite 287/287 sequenziale,
biome, tsc, vite build.
**G1 — STATISTICHE PER GIOCATORE + PAGELLE** (piano G1→G2→G3 confermato: via il
numeretto, valutazione reale). Engine: blocco G1 in player-stats.ts (ATTENZIONE:
stats.ts e player-stats.ts esistevano già — sovrascritti per sbaglio e recuperati da
git, il G1 è stato FUSO in coda a player-stats.ts accanto a topScorers) —
PlayerSeasonStats (28 campi: tiri/SoT/xG/xA/keypass/dribbling/passaggi/progressivi/
recuperi/contrasti/aerei/anticipi/spazzate/errori/cleansheet/subiti/parate/PSxG/km/
cartellini/pagelle), accumulateMatchStats a fine playMatch per TUTTA la lega,
attribuzione deterministica via hash dai totali VERI (tiri/xG esposti additivamente
da xg.ts in MatchResult; gol/assist/minuti veri dagli eventi, minuti da sub/rossi),
pagella 4-10 al mezzo punto. Runner: MatchState.playerStats + snapshot additivo +
runner.playerStats(). UI minima: blocco 'la stagione' nel dettaglio giocatore (media
pagella colorata + statistiche per ruolo GK/DF/altri). Docs SPEC §20. 4 test nuovi
(quadratura gol, invariante portiere, snapshot/resume, marcatori sopra la media).
Suite 291/291 sequenziale, biome, tsc, vite build. PROSSIMO: G2 (fascia+archetipo al
posto dell'overall OVUNQUE, radar percentili di ruolo scouting-gated) poi G3 (valore
= base × forma pagelle/rendimento × coefficiente campionato, bande ±30%).
**G2 — IL NUMERO SPARISCE + RADAR + MOVIMENTI** (richiesta utente, con l'aggiunta
dei movimenti). ui/band.ts (bandOf 6 fasce parlate + starString ★): overall MAI più
mostrato — scheda giocatore col badge-fascia al posto del numerone, attributi a BARRE
senza cifre, rosa/mercato/DS/contratti/contropartite/medie-rosa a stelle. Radar
percentili di ruolo (percentilesFor + ui/Radar.tsx SVG): 6 assi per ruolo dalle stats
G1, percentile midrank vs pari ruolo ≥180', gate scouting ≥3 osservazioni per i non
tuoi, nella scheda e nel tavolo di trattativa accanto alla heatmap. MOVIMENTI senza
palla (playerMovements in core/archetypes.ts, puro/deterministico): 1-3 frasi da
report per i 17 archetipi con varianti da attributi (profondità/mezzaluna, taglio
dentro, sovrapposizione vs terzino bloccato, box-to-box, spalle alla porta…), nella
scheda giocatore. Docs SPEC §20-bis. 1 test nuovo (300 giocatori: 1-3 frasi,
determinismo, coerenza archetipo). Suite 292/292 sequenziale, biome, tsc, vite build.

**G3 — IL VALORE SEGUE IL RENDIMENTO** (richiesta utente, con vincolo esplicito:
la media pagelle muove TUTTI i ruoli). performanceFactor in market/value.ts (FORM,
clamp 0.7-1.3): media pagelle ±22%/punto dal 6 per chiunque + contributo di ruolo
(gol+assist/90 FW-MF, clean-sheet rate DF-GK, xG-evitati GK) × coefficiente campionato
(B ×0.6) × evidenza (<450' verso il neutro); senza stats = 1. Applicato: tavolo
d'acquisto (openNegotiation opts.formFactor su ask/floor/DS + riga 'stagione di
grazia/annata storta'), righe mercato, offerte AI per i tuoi (aiOffersForUser formOf
dal runner), contropartite (proposeSwap/swapCandidates), quotazione in scheda con
±N% forma colorato. AI-AI a valori base (stats solo campionato utente, dichiarato).
Docs SPEC §20-ter. form.test.ts 5 test (universalità 4 ruoli il punto chiave).
Suite 297/297 sequenziale, biome, tsc, vite build. Trittico G1-G2-G3 COMPLETO.
PROSSIMO (dichiarato): settore giovanile come spesa strategica (F4b); coppe nel
`manage` CLI; rotazione manuale in coppa (formazione dedicata); impero v3 (momento-
conquista animato nell'offseason, storia rivali); fix parallelismo vitest;
`tools/statsbomb-archetypes.mjs`; pack Juve/Napoli/City/Arsenal/Liverpool con revisione
insieme; Palazzina scouting in UI; riga-cronaca dei duelli.
Prossimo UI-1: edifici restanti (scouting/mercato-bid/infermeria/giovanile), report
partita, formazione; poi UI-2 presidente, UI-3 procuratore, polish(+Tauri). Web Worker
quando arrivano le sim lunghe. TODO: **prestiti** (rimandati su scelta utente), carosello
panchine AI, svincolati contesi dall'AI, rinnovi v2 (promesse lato allenatore,
`perAppearance` liquidabile quando le presenze saranno tracciate).

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
