# MODULE_FINANCES.md — Finanze del club (Fase 2a)

> Specifica di `src/finances/` (GAME_DESIGN §6.2). Il ciclo economico è **event-driven**:
> gira UNA volta per stagione, nell'off-season, sulla stagione appena conclusa. Il codice
> deve corrispondere a questo documento.

## 1. Ciclo stagionale (`runWorldEconomy`, chiamato da `advanceOffseason`)

Per ogni club, sulla classifica finale della sua divisione:

### Entrate (ledger `incomes`)
| Voce | Formula |
|---|---|
| `gate` | capienza × riempimento × 19 gare casa × prezzo · riempimento = clamp(0.4 + 0.55·(rep−40)/55 + bonusPosizione, 0.25, 1) |
| `sponsor` | base nazione × (rep/100)^2 × moltiplicatore risultato (titolo 1.3 · top-4 1.15 · retrocessa 0.7) |
| `tv` | pool nazionale del tier: **50% parti uguali + 50% merito** (lineare per posizione). ENG ≈ 3× ITA; tier 2 molto più povero |
| `prize` | premio piazzamento (scala col tier) |

### Uscite (ledger `expenses`)
| Voce | Formula |
|---|---|
| `wages` | monte ingaggi effettivo × 52 |
| `facilities` | costo/posto × capienza stadio |

`cash += entrate − uscite`. Ledger **potato** alle ultime 3 stagioni (sparse by default).

## 2. Politica di budget (`applyBudgetPolicy`, dopo rinnovi e promo/retro)

Il presidente (carattere!) trasforma i conti in budget per la stagione nuova:
```
reinvest       = 0.35 + 0.4 · ambition          (l'ambizioso reinveste, il prudente accumula)
transferBudget = max(0, cash) × reinvest × TRANSFER_SHARE
wageBudget     = max( monteIngaggi attuale,  ricaviStagione × (WAGE_SHARE_BASE + 0.15·ambition) )
AUSTERITÀ (cash < 0): transferBudget = 0, wageBudget = monteIngaggi (congelato)
```
Il monte ingaggi non può scendere sotto i contratti in essere (non si stracciano).

## 3. Scala salariale allineata ai ricavi

La generazione ingaggi passa a curva **convessa sulla reputazione**
(`(rep/100)^1.6`): club piccoli ~35k/sett. medi (bill ~45M/anno ≈ ricavi), top club
~105k medi (bill ~140M vs ricavi ~180M). Senza questo, i piccoli sono in perdita
strutturale perenne.

## 4. Validazione (`finance-health` CLI + `finances.test.ts`)

- Ogni club a fine stagione ha TUTTE le voci a ledger; la cassa si muove.
- ENG incassa ~3× ITA dalla TV (somme di lega); tier 2 povero rispetto al tier 1.
- Su 10 stagioni: nessuna spirale (cassa minima limitata, austerità che morde),
  ricavi correlati alla posizione, promosse che respirano.
- Il ledger non cresce oltre 3 stagioni di voci.
- Calibrazione motore intoccata (l'economia non tocca gli stream di simulazione).

## 5. F1 — Il BILANCIO VERO del presidente (richiesta utente: "come nella realtà")

> Owner: `finances/treasury.ts`. Per il CLUB UTENTE spariscono i budget come concetto:
> c'è la CASSA, un FIDO bancario e una regola di SOSTENIBILITÀ. I club AI restano al
> modello a budget (il loro "consiglio" alloca) e al conguaglio annuale — bande salve.

### 5.1 Cassa unica, fido, sostenibilità (i freni realistici)
- **Fido**: la cassa può scendere fino a −`OVERDRAFT_SHARE`(0.35)·ricaviAttesi
  (min 8M); sul rosso maturano **interessi** (8%/anno, addebitati pro-quota a giornata,
  voce `interessi`). Oltre il fido, la banca dice no: vincolo macchina.
- **Sostenibilità (squad-cost, stile UEFA)**: monte stipendi ≤ `SQUAD_COST_CAP`(0.8)
  × ricavi attesi. Stato: ok < 0.7 ≤ allerta < 0.8 ≤ blocco (niente aumenti né nuovi
  ingaggi finché non rientri; i contratti in essere non si stracciano).
- **Specchi derivati**: per NON toccare i cento call-site dei vincoli macchina,
  `transferBudget` e `wageBudget` del club utente diventano VISTE (`syncUserBudgets`):
  `transferBudget := max(0, cassa + fido)` · `wageBudget := max(bill, ricaviAttesi×CAP/52)`.
  Tutti i check esistenti continuano a funzionare, ma ora li guida il tesoro.
  `alloca` muore. RicaviAttesi = somma incassi anno precedente, o proiezione alla
  posizione attesa (rank reputazione) per la prima stagione.

### 5.2 Flussi PER GIORNATA (solo club utente, `tickUserFinances` nel runner)
Stesse formule dell'economia annuale (§1), spalmate: **stipendi** = bill×52/giornate,
ogni giornata; **botteghino** a ogni partita in casa (= gate stagionale / 19, riempimento
alla posizione attesa v1) con **costi del matchday** (voce `matchday`,
`MATCHDAY_COST_PER_FAN`=4/spettatore); **TV quota-uguale** in 3 tranche (g.1, metà,
ultima); **sponsor base** in 2 tranche; **interessi** sul rosso. Deterministico, zero RNG
(salvataggi byte-identici). Voce `coppa` accesa da F3 (MODULE_CUPS §5); voci `eventi` e
`ritiro` accese da F4 (MODULE_EVENTS §5: tour/concerti/pubblicità, ritiro estivo).

### 5.3 Conguaglio di fine stagione (`settleUserSeason`, dentro advanceOffseason)
Il club utente ESCE dal conguaglio annuale (niente doppio conteggio) e riceve solo ciò
che non è stato spalmato: **TV quota-merito** (posizione finale), **premio campionato**,
**bonus/malus sponsor da risultato** ((mult−1)×base), **mutualità** tier-2, **ricavi
commerciali**, e le uscite annuali **impianti + staff tecnico**. `applyBudgetPolicy`
salta il club utente (specchi via sync). I suoi `ClubSeasonAccounts` = somme del ledger
dell'anno (il riepilogo di fine stagione torna a quadrare).

### 5.4 Acquisti col fido
I check di cassa dei percorsi UTENTE usano `spendingRoom = cassa + fido`:
`executeDeal` (M3), `checkHardConstraints` (commissioni), `startProject` (stadio).
Nota dichiarata: `checkHardConstraints` serve anche ai compratori AI in `collectOffers`
→ anche loro godono del fido (effetto piccolo, offerte per i tuoi leggermente più
frequenti; monitorato dalle bande career).

### 5.5 Validazione
- Somma dei gate per-partita ≈ gate annuale alla stessa posizione (±20%: posizione
  attesa vs finale); stipendi spalmati = bill×52 esatto; AI senza voci infra-stagione.
- Dopo il conguaglio: tv+premio+sponsor totali coerenti col vecchio modello annuale.
- Rosso oltre il fido → spesa rifiutata; monte oltre il cap → rinnovo con aumento
  rifiutato dal vincolo macchina esistente; interessi maturano solo sul rosso.
- Bande `finance-health` e career INTATTE (AI immutata); salvataggio mid-season ancora
  byte-identico (tick deterministico).

## 6. F2b — Plusvalenze e ammortamenti (valore contabile del cartellino)

> Owner: `finances/book-value.ts` (puro, derivato — GAME_DESIGN §1.2: l'unica memoria
> è `Contract.transferFee`, scritto alla firma da `executeTransfer` per TUTTI i club).

### 6.1 Valore contabile (derivato, mai memorizzato)
- `durata = endYear − startYear + 1` (stagioni coperte). `stagioniResidue(year)` =
  clamp(endYear − year + 1, 0, durata) — la stagione corrente conta come residua.
- **Ammortamento lineare**: quota annua = `transferFee / durata`.
  `bookValue(contract, year) = transferFee × stagioniResidue / durata` — pieno alla
  firma, zero dopo la scadenza. Vivaio e parametri zero: `transferFee` assente → 0.

### 6.2 Plusvalenza alla cessione (`executeTransfer`, lato venditore)
La CASSA incassa sempre l'intera fee (i flussi non cambiano); il ledger si spacca:
- fee ≥ residuo → `transfer_out` = residuo (recupero del valore a bilancio, salta se 0)
  + voce **`plusvalenza`** = fee − residuo. Somma = fee → ogni somma esistente
  (ricavi attesi, conti dell'anno, bande AI) è INVARIANTE per costruzione.
- fee < residuo → `transfer_out` = fee con nota `minusvalenza X` (nessuna voce di
  spesa: non esce cassa, è una svalutazione). Vendere il vivaio = plusvalenza pura.

### 6.3 Ammortamenti nella sostenibilità (squad-cost UEFA vero)
`sustainability`: ratio = (monte ingaggi × 52 + `squadAmortization`) / ricavi attesi,
dove `squadAmortization` = Σ quote annue dei contratti in rosa. `capWeekly` (specchio
`wageBudget`) = max(0, ricavi×CAP − ammortamenti)/52: un colpo da 60M su 3 anni pesa
20M/anno sul cap per tre stagioni. Solo club utente (l'AI resta a budget, bande salve).

### 6.4 Rinnovo = spalma
Al rinnovo (negoziato `applyRenewal` o AI `renewContract`) il residuo si trasferisce:
`transferFee := bookValue(contract, annoRinnovo)` PRIMA di spostare le date → la quota
si ri-ammortizza sulla nuova durata (rinnovare un big abbassa il peso annuo — la leva
vera delle società).

### 6.5 Validazione
- Ammortamento lineare a zero oltre scadenza; vivaio = plusvalenza piena; split che
  somma ESATTAMENTE alla fee; minusvalenza annotata senza voce di spesa.
- Sostenibilità che sale dopo un grande acquisto e cap settimanale che scende.
- Rinnovo: residuo conservato, quota annua ridotta con durata più lunga.
- Ammortamenti FUORI dal ledger (il ledger è cassa; l'ammortamento non è monetario):
  vivono solo in sostenibilità e viste. UI: card "Rosa a bilancio" in Finanze.
