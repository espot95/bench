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

## 4. Render 3D (ui/src/Stadium3D.tsx)

Il render legge `Stadium` (non più la sola capienza): terreno da `pitch`, un cuneo per
settore/anello, tettoie dai `covered`, angoli solo se costruiti, torri faro finché la
copertura non è completa. I 6 livelli estetici emergono dalla struttura:
≤1k terra+tribunetta · ≤3k erba+4 tribunette · <15k provinciale · <40k inglese ·
<60k catino · ≥60k arena. **Cantiere visibile**: il settore in lavori si renderizza in
cemento con gru/impalcatura stilizzata finché `matchdaysLeft > 0`.

## 5. Ordine di implementazione e gate

1. Core: tipi `Stadium`, `stadiumCapacity()` derivata, worldgen a settori, migrazione DB.
2. Engine: `stadium.ts` (catalogo progetti, avvio/tick/completamento, ricavi commerciali
   in `season-economy`), proposte/authority, test unit + `finance-health` ricalibrato.
3. UI: pannello builder nella pagina Stadio (solo builder, niente classifica), render da
   struttura, edifici commerciali sulla mappa, cantiere animato.

Gate: suite verde, `calibrate` invariato (il building non tocca il motore partita),
`finance-health` con bande aggiornate (i ricavi commerciali non devono rompere la
sostenibilità della Serie B né gonfiare la PL oltre le bande esistenti).
