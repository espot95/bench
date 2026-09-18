# MODULE_STADIUM.md — Stadio, building e attività commerciali

> Stato: **IMPLEMENTATO** (core/engine/persistence/UI builder; render 3D legge
> capienza+terreno e mostra il **cantiere in corso**: impalcature+pannelli+gru sul settore,
> teli e transenne sul campo, scheletro in cemento fuori dallo stadio per le attività). Costanti economiche **provvisorie**: da
> ricalibrare con `finance-health` quando le attività entreranno nelle simulazioni AI.
> Nota implementazione: catalogo commerciale e ricavi in `core/stadium.ts` (li usa finances);
> progetti/tick/autorità in `engine/stadium.ts`; tick per-lega nel runner.

## 1. Modello dati (src/core)

`Club.stadium: Stadium` sostituisce il campo piatto `stadiumCapacity`.

```ts
type PitchType = 'terra' | 'erba';
type SectorId = 'principale' | 'distinti' | 'curvaNord' | 'curvaSud'
              | 'angoloNE' | 'angoloNO' | 'angoloSE' | 'angoloSO';

interface StadiumSector {
  seats: number;        // 0 = settore non costruito
  tiers: 1 | 2 | 3;     // anelli
  covered: boolean;
}

interface Stadium {
  pitch: PitchType;
  sectors: Record<SectorId, StadiumSector>;
  commercial: CommercialId[];          // attività costruite
  project?: StadiumProject;            // al più UN cantiere alla volta
}

interface StadiumProject {
  kind: 'espansione' | 'copertura' | 'anello' | 'terreno' | 'commerciale';
  target?: SectorId;
  commercial?: CommercialId;
  addedSeats?: number;
  matchdaysLeft: number;               // scala col runner, completa a 0
  cost: number;                        // già scalato dalla cassa all'avvio
}
```

- **`stadiumCapacity(club)` è DERIVATA**: somma dei `seats` dei settori (regola overall §1.2
  di GAME_DESIGN: mai memorizzare un derivato). Il campo legacy sparisce; la worldgen
  genera direttamente settori coerenti con la reputazione (8k–63k attuali → stessi totali).
- Angoli costruibili solo se le due tribune adiacenti hanno `tiers ≥ 2` (catino).
- Migrazione persistence: colonna JSON `stadium` su `clubs`; il loader converte i vecchi
  salvataggi (`stadiumCapacity` → riparto 45/25/15/15 su principale/distinti/curve).

## 2. Progetti di costruzione

Un solo cantiere alla volta. Costo scalato subito (ledger `stadio`), completamento dopo
`matchdaysLeft` giornate simulate dal runner (`tickStadium` accanto a `tickAdaptation`).

| Progetto | Effetto | Costo (provv.) | Durata | Requisiti |
|---|---|---|---|---|
| Espansione settore | +N posti (blocchi 1k/2k/5k) | 900 €/posto ×(1+0.5 se coperto) | 1 giornata / 1.500 posti (min 2) | cassa; max 3 anelli |
| Anello superiore | `tiers+1`, +60% posti settore | 1.400 €/posto nuovo | 6 giornate | settore ≥8k posti |
| Copertura settore | `covered=true` | 350 €/posto | 3 giornate | — |
| Terreno: erba | `pitch='erba'` | 0.8M | 2 giornate | — |
| Attività commerciale | vedi §3 | vedi §3 | 4 giornate | vedi §3 |

- **Autorità (GAME_DESIGN §3/§4)**: nel ruolo PRESIDENTE il progetto parte diretto (vincoli
  hard: cassa ≥ costo + 2×monte ingaggi mensile). Nel ruolo ALLENATORE è una **proposta**:
  accettazione via `evaluateProposal`-like su ambizione presidente, cassa, ROI atteso.
- Effetto piazza: capienza ampliata ⇒ `expectedRank` leggermente più esigente a parità di
  reputazione (lo stadio grande alza le aspettative — coerente con SPEC §18).

## 3. Attività commerciali

Ricavi ricorrenti accreditati in `runWorldEconomy` (voce ledger `commerciale`), scalati su
**affluenza media** (capienza × riempimento derivato da reputazione/posizione) e nazione.

| Attività | Costo | Requisiti | Ricavo/stagione (provv.) |
|---|---|---|---|
| Bar | 0.5M | — | 0.08M × (affluenza/10k) |
| Ristorante | 2M | capienza ≥8k | 0.25M × (affluenza/10k) |
| Hotel | 15M | capienza ≥25k, rep ≥55 | 1.2M × (rep/100) |
| Centro commerciale | 40M | **capienza ≥40k** | 3.5M × (affluenza/20k) |
| Teatro | 8M | capienza ≥15k | 0.6M × (rep/100) |
| Opera | 20M | capienza ≥30k, rep ≥70 | 1.5M × (rep/100), −50% se rep <75 (piazza piccola) |
| Concerti (licenza) | 5M | capienza ≥30k, ≥2 settori coperti | 0.6M × (capienza/10k) una tantum a fine stagione |

Ogni attività è costruibile **una volta**. **Due tipologie** (richiesta utente):

- **Attività DELLO STADIO** (tabella sopra): annesse all'impianto; una volta completate
  l'edificio **nasce nel render 3D** attorno allo stadio (bar/ristorante/hotel/centro
  commerciale/teatro/opera in slot fissi del perimetro; concerti = licenza, nessun edificio).
- **Strutture IN CITTÀ** (`Club.structures: CityStructure[]`): l'utente **clicca sulla mappa**
  della città il punto dove costruire; la posizione è salvata come offset in gradi dal
  centro città (`dx`,`dy` — dato presentazionale persistito, il motore non conosce la
  geografia). Cantiere e edificio compaiono come marker sulla mappa; cliccandoli si apre
  il **render 3D della struttura** (gru+scheletro durante i lavori, edificio a fine lavori).

| Struttura in città | Costo | Requisiti | Ricavo/stagione (provv.) |
|---|---|---|---|
| Negozio del club | 3M | — | 0.5M × (rep/100) |
| Museo del club | 10M | rep ≥ 65 | 0.9M × (rep/100) |

I progetti città usano lo stesso canale (`kind: 'struttura'`, un solo cantiere alla volta,
stesso vincolo di cassa, 5 giornate) e i ricavi entrano nella stessa voce `commerciale`.

### 3.1 Zone di tifo e prezzi (richiesta utente)

- **Zone di tifo**: ogni club ha 4-6 zone deterministiche (hash del nome, niente RNG di
  simulazione) attorno al centro città — `fanZones(name, reputation)` in `core/stadium.ts`,
  ognuna `{dx, dy, r, w}`; più reputazione ⇒ più zone. `fanDensityAt(name, rep, dx, dy)` =
  somma di gaussiane, clampata [0,1]. Durante il **piazzamento** la mappa mostra le zone
  come macchie colorate (rosso=caldissima, arancio, giallo); il motore NON conosce la
  geografia reale — le zone vivono nello stesso spazio di offset dei `CityStructure`.
- **Il luogo conta**: ricavo struttura ×`(0.6 + 0.8·density)` — nel cuore del tifo ~×1.4,
  in periferia ~×0.6.
- **Prezzi** (`CityStructure.price`, default `standard`, gestito cliccando la struttura):
  `popolare` ×0.85 · `standard` ×1.0 · `premium` ×1.35·(0.4+0.6·density) — il premium
  paga solo dove il tifo è denso. Costanti provvisorie (finance-health).

### 3.2 Prezzi dello stadio (richiesta utente)

- **Biglietteria** (`Stadium.ticketPrice`, default `standard`): muove incasso E riempimento.
  `popolare` = biglietto ×0.7, riempimento +0.08 · `standard` = ×1.0 · `premium` =
  biglietto ×1.4, riempimento −0.10 (clamp sui limiti FILL). Il riempimento modificato
  si propaga a TUTTE le attività dello stadio (stadio pieno ⇒ bar pieno) e alla stima
  affluenza dell'economia.
- **Attività dello stadio** (`Stadium.commercialPrices[id]`, default `standard`): stesso
  `priceMultiplier` delle strutture in città ma con il **riempimento** al posto della
  densità di tifo — il premium paga solo se lo stadio è pieno.
- Gestione nel pannello builder della pagina Stadio (sezione Biglietteria + bottoni
  P/S/Premium sulle attività costruite).

### 3.3 Otto settori, nomi e proposte dei tifosi (richiesta utente)

- **Otto settori tutti ampliabili** (nessun vincolo "a catino"): nomenclatura default
  `principale`=Tribuna centrale, `distinti`=Tribuna secondaria, `curvaNord/Sud`=Curve,
  `angoloNE/NO/SE/SO`=**Distinti Nord-Est/Nord-Ovest/Sud-Est/Sud-Ovest**. Il render 3D
  è **per-settore**: ogni spalto è disegnato dai SUOI posti/anelli/copertura — un
  ampliamento si VEDE come spalto nuovo o più alto; torri faro finché le 4 tribune
  principali non sono tutte coperte.
- **Rinomina** (`Stadium.sectorNames[id]`, 2-26 caratteri, `renameSector`): l'utente può
  battezzare ogni settore; il nome custom vince sul default ovunque in UI.
- **Proposte dei tifosi** (`fanNamingProposal`, RNG iniettato): la curva propone di
  intitolare uno spalto SOLO a una vera **bandiera** (rivisto su richiesta utente: niente
  proposte facili). Il core traccia la storia giocatore↔club su `Player`:
  `clubSeasons` (stagioni consecutive nel club, +1 a ogni offseason, **azzerato a ogni
  trasferimento** insieme agli altri due), `titlesWithClub` (+1 ai giocatori del club
  campione di un campionato a fine stagione), `bigSeasons` (+1 se a fine stagione il
  giocatore è a livello da protagonista, overall ≥79). La worldgen semina storie
  pregresse plausibili (permanenze brevi per lo più; rare bandiere con titoli nei club
  blasonati). **Requisiti proposta**: `clubSeasons ≥ 6` E (`titlesWithClub ≥ 1` OPPURE
  `bigSeasons ≥ 3`) E overall ≥ 70; tra gli eleggibili vince il punteggio
  titoli×3 + grandi stagioni + permanenza/2. La motivazione cita gli anni e i meriti.
  Prima le curve non battezzate, poi le tribune; una proposta per stagione, accetta/rifiuta.

### 3.4 Ufficio marketing (richiesta utente)

L'ufficio marketing **esiste già** (richiesta utente): è un edificio fisso della
città (marker "megafono" nell'hub, schermata dedicata `Screen 'marketing'`), niente
cantiere — `'ufficioMarketing'` resta in `CommercialId` solo per i save che l'avevano
costruito. **La biglietteria è inclusa** (il vecchio pannello nello Stadio è un
rimando); i servizi avanzati si **comprano una tantum** (`MKT_FEATURES`, voce ledger
`marketing`, `ClubMarketing.features`): `abbonamenti` "Ufficio abbonamenti" 500k,
`campagne` "Reparto creativo" 750k, `estero` "Desk internazionale" 1.5M
(`hasFeature`). A fare l'efficacia è il **mercato in cui si fa la campagna**: in
patria `officePower = 0.7..1.3` dal blasone (reputazione: un grande nome muove di
più il suo popolo); all'estero decide il mercato scelto per la campagna
internazionale (sotto). Il modello-biglietti si attiva alla prima visita
dell'ufficio (`club.marketing` creato lazy; AI e save mai entrati = formule legacy).
Owner della logica: `src/finances/marketing.ts` (puro, ZERO RNG); dati additivi
`Club.marketing?: ClubMarketing {plan, abbonati, memoria rinnovi, soldOutStreak}` —
i club AI e i save vecchi non lo hanno → formule legacy, byte-identico.

**Prezzo base in €** (`TicketPlan.basePrice`, realismo p.2): l'utente lo sceglie
libero [5..150]; assente = il DEFAULT della lega (`MKT.BASE_PRICE` per nazione e
divisione: Premier 48 > Serie A 35, Championship 26 > Serie B 18). Il pubblico
reagisce allo scostamento dal default (`priceFillDelta`: elasticità 0.45, clamp
[−0.35, +0.12]); l'abbonamento segue il prezzo base.

**Classifica VIVA** (realismo p.1): nel tick per-giornata il riempimento usa la
posizione REALE (`livePosition` dai fixtures giocati; prima della 1ª giornata si va
d'attese) e la forma recente (`recentForm`, ultime 3: `MOMENTUM_FILL` 0.05·[v−s]).

**Listino per classe di gara** (`TicketPlan.prices`): `campionato | cartello | coppa`,
3 fasce (`ticketFactors`). Il **cartello** si riconosce da solo: derby cittadino
(prima parola del nome uguale, i nomi sono "Città Colori"), avversaria con
reputazione ≥ `CARTELLO_REP` 72, o — realismo p.6 — SCONTRO D'ALTA CLASSIFICA
(entrambe nelle prime `CLASH_TOP` 3 della classifica viva, dal giro di boa
`CLASH_FROM` 0.5); incassa ×1.25 e riempie +0.06. La **coppa** riempie
−0.10 ma non è coperta dagli abbonamenti (pagano tutti); `postUserCupGate` usa la
fascia coppa senza il vecchio `GATE_MULT` (il pubblico magro è già nel modello).
**Prezzi per settore** (`sectorPrices`): layer moltiplicativo pesato sui posti veri
(fillDelta a peso `SECTOR_FILL_WEIGHT` 0.5 × `SECTOR_ELASTICITY`, realismo p.5:
curve 1.6, tribuna principale 0.4 — la curva reagisce al prezzo, la tribuna no).

**Abbonamenti**: fascia (`abbPrice`, prezzo = 35€ × 19 gare × sconto 0.72 × fascia) e
tetto `abbCapShare` ∈ [0, 0.85] (restano sempre biglietti singoli). La campagna si
chiude ad **agosto** (`resolveSeasonTickets` in `advanceSeason`): domanda deterministica
da reputazione, **memoria dei rinnovi** (soddisfazione = frazione di classifica finale,
swing ±0.08; aumento di fascia dopo un'annata sotto la metà = −0.10), prezzo
(fillDelta ×1.6 + elasticità € ×1.2), **colpi di mercato** (realismo p.4:
`starSignings` — contratti `startYear ≥ anno−1` con overall ≥ 80, +0.05 a testa max
2, l'effetto-fenomeno) e campagna attiva; incasso **unico e anticipato** (voce
ledger `abbonamenti`). **Zoccolo duro** (realismo p.3): con una base precedente i
rinnovi sono ancorati — floor = vecchi × (0.55 + 0.3·soddisfazione), crescita annua
≤ ×1.25; la **promozione** sfonda il tetto (cap ×2, domanda +0.12 di capienza), la
**retrocessione** buca il floor (×0.6, domanda −0.10). Lo shock arriva da
`advanceSeason` (confronto tier vecchia/nuova lega). Da lì il botteghino per-gara
(`marketingMatchGate` in `tickUserFinances`) vende solo i posti liberi: gli
abbonati entrano gratis.

**Striscia di sold-out**: presenze ≥ 98% capienza → `soldOutStreak++` (azzerata al
primo buco e a ogni estate); da 3 in su hype +0.04 sul riempimento dei paganti.

**Campagne NAZIONALI** (una a stagione, si paga alla scelta, voce ledger `marketing`,
si azzera ad agosto DOPO aver potenziato la campagna abbonamenti): `portaAmico`
(+fill paganti 0.06·power), `curvaPopolare` (+domanda abbonamenti 0.10·power),
`hospitality` (cartello ×(1+0.18·power), richiede rep ≥ 60 e 2 settori coperti),
`spintaCommerciale` (ricavi commerciali ×(1+0.12·power) nel conguaglio).

**Campagna INTERNAZIONALE** (una a stagione, `ABROAD_COST` 1M, voce `marketing`):
si sceglie il mercato-nazione e la spinta arriva al conguaglio dentro
`settleForeignFans` (MODULE_SPONSORS §7): con giocatori del posto la crescita
tifosi dell'anno ×`ABROAD_MULT` 1.6 (cumulabile con tour/sponsor/fan club), senza
nessuno SEMINA il mercato (`ABROAD_SEED` 8k × fama, come i tour — il piccolo
evapora). `ClubMarketing.abroadNation/abroadPaidYear`, azzerata in agosto con la
nazionale. I tifosi conquistati fruttano poi merchandising/negozi/stirpe TV col
sistema-impero esistente.

**PUBBLICITÀ** (richiesta utente, punti A-D; feature `pubblicita` "Regia
pubblicitaria" 600k per A e C):
- **A. Bordocampo**: 4 slot di cartellonistica (6 da 35k posti), offerte annuali
  deterministiche da club+anno (`boardOffers`, brand del pool ±2 taglie, mai già
  sponsor); valore = spettatori-tipo × `BOARD_RATE` 6€ × taglia brand — gli OCCHI
  veri pagano. Contratti 1-2 anni, prima annualità alla firma (voce ledger
  `pubblicita`), le successive a `settleMarketingYear` (advanceSeason).
- **B. Naming rights** (lo slot sponsor 'stadio' resta: qui si vende il NOME):
  2 pretendenti l'anno tra grande/multinazionale, `capienza × NAMING_RATE 22€ ×
  (0.5+rep/100)` all'anno per 5 anni, alla firma annualità + anticipo 0.5; il nome
  diventa "{Brand} Arena" (titolo pagina Stadio) e la CURVA la prende male:
  soddisfazione −`NAMING_SAT_COST` 0.15 (morde i rinnovi abbonamenti).
- **C. Promo della singola gara**: one-shot sulla prossima in casa
  (`ClubMarketing.promo`, consumata nel tick): famiglie (+0.15 fill, biglietto
  ×0.6), omaggio (+0.10, ×0.8), scuole (+0.20, ×0.5 e soddisfazione +0.03).
- **D. Testimonial** (feature `campagne`): un giocatore presta la faccia — fee =
  max(100k, 5% ingaggio lordo annuo) a expense `marketing`; `officePower` ×(1+boost)
  con boost da overall (max +0.25). Se esce dalla rosa la campagna resta ORFANA
  (boost 0). Azzerato ogni estate con promo (settleMarketingYear).

Proiezioni: `expectedLines` in treasury usa `marketingSeasonGate` (abbonamenti + 19
gare all'80/20 campionato/cartello) quando l'ufficio esiste → sostenibilità e
dashboard oneste. Test in `marketing.test.ts` (18), neutralità legacy coperta da
`treasury.test.ts`.

## 4. Render 3D (ui/src/Stadium3D.tsx)

Il render legge `Stadium` (non più la sola capienza): terreno da `pitch`, un cuneo per
settore/anello, tettoie dai `covered`, angoli solo se costruiti, torri faro finché la
copertura non è completa. I 6 livelli estetici emergono dalla struttura:
≤1k terra+tribunetta · ≤3k erba+4 tribunette · <15k provinciale · <40k inglese ·
<60k catino · ≥60k arena. **Cantiere visibile**: il settore in lavori si renderizza in
cemento con gru/impalcatura stilizzata finché `matchdaysLeft > 0`.

## 4b. Manto erboso (richiesta utente)

L'altezza dell'erba del campo di CASA si sceglie **solo prima della 1ª giornata** e vale
tutta la stagione; tocca ENTRAMBE le squadre che giocano su quel campo, ciascuna secondo
il proprio stile (engine `season.ts`: `GrassLength = 'bassa'|'media'|'alta'`, costanti
`GRASS`, applicazione in `pitchStyle` — la generalizzazione di `wornStyle`, moltiplicativa
con l'usura da concerto).

- 🌱 **bassa** — il pallone corre: la deviazione dal neutro dello stile `possession` è
  amplificata (`FAST_POSSESSION` 1.3) + tiri ×`FAST_SHOTS` 1.03; il `catenaccio` è smorzato
  (`FAST_CATENACCIO` 0.85). Manutenzione stagionale `SHORT_UPKEEP` 200k a ledger `other`.
- ⚖ **media** — fattore esattamente 1: i club AI non compaiono mai nella mappa `grass`
  → risultati byte-identici a prima (garanzia di calibrazione, test in `grass.test.ts`).
- 🌾 **alta** — il pallone frena: `possession` smorzato (`TALL_POSSESSION` 0.6, tiri
  ×`TALL_SHOTS` 0.97), `catenaccio` esaltato (`TALL_CATENACCIO` 1.15).

**Irrigazione** (richiesta utente): stesso asse (velocità della palla), cambiabile tra
una giornata e l'altra, MOLTIPLICATIVA con l'erba. `Watering = 'bagnato'|'normale'|
'asciutto'`, costanti `WATER` (bagnato: possession ×1.15 + tiri 1.015, catenaccio 0.92;
asciutto: possession ×0.8 + tiri 0.985, catenaccio 1.08; `WET_COST` 25k di bolletta per
OGNI gara in casa col campo bagnato, addebitata in `playRound` del guscio). Runner
`setWatering`, snapshot `watering` additivo; l'abitudine sopravvive al cambio stagione
(`SessionExtras.watering`, riapplicata ad advanceSeason).

Runner: `setGrass(clubId, length)` ('media' rimuove la voce); persistito nello
`RunnerSnapshot.grass` (assente nei save vecchi = media). Guscio: scelta in
`SessionExtras.grass` {year, length, paid}, azione `chooseGrass` bloccata da
`nextRound() > 1`, reset a ogni estate. UI: card "Manto erboso" nella pagina Stadio
con "?" esplicativo e lucchetto a stagione iniziata. Coppe: per ora il manto vale solo
in campionato (TODO dichiarato: turni di coppa in casa).

## 5. Ordine di implementazione e gate

1. Core: tipi `Stadium`, `stadiumCapacity()` derivata, worldgen a settori, migrazione DB.
2. Engine: `stadium.ts` (catalogo progetti, avvio/tick/completamento, ricavi commerciali
   in `season-economy`), proposte/authority, test unit + `finance-health` ricalibrato.
3. UI: pannello builder nella pagina Stadio (solo builder, niente classifica), render da
   struttura, edifici commerciali sulla mappa, cantiere animato.

Gate: suite verde, `calibrate` invariato (il building non tocca il motore partita),
`finance-health` con bande aggiornate (i ricavi commerciali non devono rompere la
sostenibilità della Serie B né gonfiare la PL oltre le bande esistenti).
