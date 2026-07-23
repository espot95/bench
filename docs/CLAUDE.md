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
Prossimo UI-1: edifici restanti (scouting/mercato-bid/infermeria/giovanile), report
partita, formazione, avanzamento stagione/offseason; poi UI-2 presidente, UI-3 procuratore,
UI-4 salvataggi(+Tauri). Web Worker quando arrivano le sim lunghe.

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
