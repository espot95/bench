# SPEC.md — Modello di dominio e regole del motore

Specifica del motore headless (Fase 1). È la fonte di verità per le formule e le costanti:
il codice in `src/engine/` deve corrispondere a quanto scritto qui. Se cambi una formula,
aggiorna prima questo file.

Convenzioni: attributi giocatore su scala intera **1–100**. Tutta la casualità passa
da un RNG seedabile iniettato (vedi §7).

---

## 1. Modello di dominio

### 1.1 Attributes (value object)

Attributi 1–100. Insieme volutamente compatto per la Fase 1 (si estende dopo).

**Comuni a tutti (mentali/fisici):**
- `pace` — velocità
- `stamina` — resistenza
- `strength` — forza fisica
- `workRate` — intensità/lavoro
- `positioning` — posizione
- `decisions` — lettura del gioco
- `composure` — freddezza

**Di movimento (outfield):**
- `finishing` — finalizzazione
- `passing` — passaggio
- `tackling` — contrasto
- `dribbling` — dribbling
- `marking` — marcatura

**Di portiere (GK):**
- `reflexes` — riflessi
- `handling` — presa
- `aerial` — uscite alte
- `oneOnOne` — uno-contro-uno

Un giocatore outfield ha gli attributi comuni + di movimento; un GK ha i comuni + di portiere.

### 1.2 Position

Ruolo macro (Fase 1, semplice): `GK | DF | MF | FW`.
(I ruoli dettagliati e i moduli tattici arrivano in Fase 2.)

### 1.3 Player

| Campo | Tipo | Note |
|---|---|---|
| `id` | `PlayerId` (string) | |
| `name` | string | generato |
| `age` | number | ~16–36 |
| `nationality` | string | codice/nome fittizio |
| `position` | Position | |
| `preferredFoot` | `L \| R \| both` | |
| `attributes` | Attributes | 1–100 |
| `overall` | number | **derivato** (§2.1), 1–100 continuo |
| `contractId` | ContractId \| null | |

### 1.4 Contract

| Campo | Tipo | Note |
|---|---|---|
| `id` | ContractId | |
| `playerId` | PlayerId | |
| `clubId` | ClubId | |
| `wage` | number | salario settimanale (unità astratta) |
| `startYear` | number | |
| `endYear` | number | |

### 1.5 Club

| Campo | Tipo | Note |
|---|---|---|
| `id` | ClubId | |
| `name` | string | |
| `shortName` | string | 3–4 lettere |
| `reputation` | number | 1–100, pilota la forza della rosa in generazione |
| `stadium` | Stadium | settori/terreno/attività/cantiere (MODULE_STADIUM §1); capienza DERIVATA via `stadiumCapacity()` |
| `budget` | number | non usato nel motore Fase 1 |
| `elo` | number | rating dinamico (§4), init da forza rosa |
| `playerIds` | PlayerId[] | rosa |

### 1.6 League

| Campo | Tipo | Note |
|---|---|---|
| `id` | LeagueId | |
| `name` | string | |
| `tier` | number | 1 = massima serie |
| `clubIds` | ClubId[] | ~20 |

### 1.7 Season

| Campo | Tipo | Note |
|---|---|---|
| `id` | SeasonId | |
| `leagueId` | LeagueId | |
| `year` | number | |
| `rngSeed` | number | seed usato → riproducibilità |
| `status` | `scheduled \| in_progress \| finished` | |
| `fixtures` | Match[] | calendario (§5) |

### 1.8 Match (Fixture)

| Campo | Tipo | Note |
|---|---|---|
| `id` | MatchId | |
| `seasonId` | SeasonId | |
| `round` | number | giornata 1..N |
| `homeClubId` | ClubId | |
| `awayClubId` | ClubId | |
| `played` | boolean | |
| `homeGoals` | number \| null | |
| `awayGoals` | number \| null | |

### 1.9 StandingRow (derivata dai Match giocati)

`clubId, played, won, drawn, lost, goalsFor, goalsAgainst, goalDiff, points`.
Punti: vittoria 3, pareggio 1, sconfitta 0.

---

## 2. Rating

### 2.1 Overall del giocatore

`overall = clamp( Σ (peso_ruolo[attr] · attr) / Σ peso_ruolo[attr] , 1, 100 )`

Pesi per ruolo (bozza calibrabile; somma dei pesi per riga è indicativa):

| Attr \ Ruolo | GK | DF | MF | FW |
|---|---|---|---|---|
| reflexes/handling/aerial/oneOnOne (GK) | alto | — | — | — |
| tackling / marking | — | alto | medio | basso |
| passing | basso | medio | alto | medio |
| dribbling | — | basso | medio | alto |
| finishing | — | basso | medio | alto |
| pace | basso | medio | medio | alto |
| positioning / decisions | medio | alto | alto | medio |
| stamina / workRate | basso | medio | alto | medio |
| strength / composure | medio | medio | medio | medio |

I pesi numerici esatti vivono in `engine/ratings.ts` e sono testati contro casi noti.

### 2.2 Forza di squadra: attacco e difesa

Da una rosa si estrae la formazione titolare (i migliori per ruolo secondo un modulo di
default, es. 4-4-2: 1 GK, 4 DF, 4 MF, 2 FW). Da questa si calcolano due scalari:

- `attackRating` = media pesata degli overall, con pesi per reparto **orientati all'attacco**
  (FW alto, MF medio-alto, DF basso, GK trascurabile).
- `defenseRating` = media pesata con pesi **orientati alla difesa** (GK e DF alti, MF medio, FW basso).

Entrambi restituiti su scala ~1–100, poi normalizzati rispetto alla **media di lega** (§3).

### 2.3 Forza effettiva (blend con Elo)

La forza usata in partita fonde forza-rosa ed Elo (per catturare la forma stagionale):

```
strengthEff = (1 - W_ELO) · strengthSquad + W_ELO · strengthFromElo
```

- `strengthFromElo` = mappatura dell'Elo del club sulla stessa scala di `strengthSquad`.
- `W_ELO ≈ 0.25` (costante calibrabile). A inizio stagione Elo ≈ forza-rosa, quindi il blend
  è neutro; con l'andare delle giornate l'Elo devia in base ai risultati → forma.

---

## 3. Normalizzazione di lega

Per rendere le formule indipendenti dalla scala assoluta:

- `avgAttack` = media di `attackRating` su tutti i club della lega.
- `avgDefense` = media di `defenseRating` su tutti i club della lega.

Questi due valori sono calcolati una volta per lega/stagione e passati al motore partita.

---

## 4. Elo

Rating dinamico per club, aggiornato dopo ogni partita.

- **Init**: `elo0 = ELO_BASE + ELO_SPREAD · (strengthSquad - avgStrength) / stdStrength`
  con `ELO_BASE = 1500`, `ELO_SPREAD ≈ 120`.
- **Attesa** (per la squadra di casa, con vantaggio campo in punti Elo `ELO_HFA ≈ 65`):

  ```
  E_home = 1 / (1 + 10^( -(elo_home + ELO_HFA - elo_away) / 400 ))
  ```

- **Aggiornamento** dopo il risultato (S_home ∈ {1, 0.5, 0}):

  ```
  elo_home += K · G · (S_home - E_home)
  elo_away += K · G · ((1 - S_home) - (1 - E_home))
  ```

  con `K ≈ 24` e moltiplicatore margine-di-vittoria `G = 1 + MOV_SCALE · ln(1 + |gd|)`,
  `MOV_SCALE ≈ 0.35`, `gd` = differenza reti.

L'Elo è sia power-ranking mostrato all'utente sia input di `strengthEff` (§2.3).

---

## 5. Calendario (scheduler)

- **Round-robin doppio** (andata + ritorno) col *circle method*.
- N club (N pari, default 20) → `2·(N-1)` giornate, `N/2` partite per giornata.
- Andata e ritorno con casa/trasferta invertite.
- Alternanza casa/trasferta bilanciata il più possibile (accorgimento standard del circle method:
  si scambia casa/trasferta a giornate alterne per il "perno").
- Se N è dispari si introduce un `BYE` (non necessario col default 20).

---

## 6. Motore partita (headless)

Input: `strengthEff` di casa/ospite (attacco+difesa già normalizzati su media lega), RNG.
Output: `(homeGoals, awayGoals)` + eventuali statistiche opzionali.

### 6.1 Gol attesi (λ) — modello Poisson

```
formHome = clamp( gaussian(1, SIGMA_FORM, rng), FORM_MIN, FORM_MAX )
formAway = clamp( gaussian(1, SIGMA_FORM, rng), FORM_MIN, FORM_MAX )

λ_home = MU · HOME · (attack_home / avgAttack) · (avgDefense / defense_away) · formHome
λ_away = (MU / HOME) · (attack_away / avgAttack) · (avgDefense / defense_home) · formAway

λ_home = clamp(λ_home, LAMBDA_MIN, LAMBDA_MAX)
λ_away = clamp(λ_away, LAMBDA_MIN, LAMBDA_MAX)
```

Costanti (calibrabili in `engine/constants.ts`):

| Costante | Valore iniziale | Significato |
|---|---|---|
| `MU` | 1.35 | gol attesi medi per squadra (lega) |
| `HOME` | 1.15 | fattore vantaggio campo sui gol |
| `SIGMA_FORM` | 0.095 | dev. std. del fattore forma per-partita (varianza/sorprese) |
| `FORM_MIN`/`FORM_MAX` | 0.6 / 1.4 | limiti del fattore forma |
| `LAMBDA_MIN`/`LAMBDA_MAX` | 0.15 / 4.5 | limiti di λ |
| `RATING_ELASTICITY` | 1.45 | esponente sui rapporti attacco/difesa: >1 amplifica il peso dei divari di forza |

> I valori sono quelli calibrati (vedi `engine/constants.ts`), non toccare senza rilanciare
> `calibrate` e i test di `calibration.test.ts`. `BLEND_WEIGHT` dell'Elo (§2.3) è 0.35.

> Nota: `(ratio)^RATING_ELASTICITY` permette di aumentare/diminuire quanto la differenza di
> forza incide sul risultato senza toccare il resto.

### 6.2 Campionamento gol + correzione Dixon–Coles

- Si campiona `homeGoals ~ Poisson(λ_home)`, `awayGoals ~ Poisson(λ_away)` (indipendenti).
- **Correzione Dixon–Coles** τ sui punteggi bassi per alzare i pareggi (il Poisson puro
  sottostima 0-0 e 1-1). Come nel paper originale `RHO` è **negativo** (`RHO ≈ -0.13`):
  con ρ<0, τ(0,0) e τ(1,1) risultano >1 (più pareggi bassi) mentre τ(0,1)/τ(1,0) <1.

  ```
  τ(0,0) = 1 - λ_home·λ_away·RHO
  τ(0,1) = 1 + λ_home·RHO
  τ(1,0) = 1 + λ_away·RHO
  τ(1,1) = 1 - RHO
  τ(x,y) = 1  altrimenti
  ```

  Implementazione: si costruisce la matrice di probabilità congiunta P(x,y) per x,y in 0..MAXG
  (es. MAXG=8), la si moltiplica per τ, si rinormalizza, e si campiona da questa distribuzione
  con l'RNG. Questo è deterministico dato il seed e mantiene la varianza sotto controllo.

### 6.3 Esito

`homeGoals > awayGoals` → vittoria casa; `=` → pareggio; `<` → vittoria ospite.
Dopo il match si aggiorna l'Elo (§4).

### 6.4 Eventi partita (marcatori, assist, cartellini)

Gli eventi usano un **RNG separato** derivato dal seed della stagione
(`eventsSeed = mix(rngSeed)`), distinto dall'RNG che campiona lo score. I **marcatori/assist**
sono un layer narrativo sopra lo score già deciso (non lo toccano); i **cartellini** invece
sono generati *prima* dello score, perché i minuti delle espulsioni alimentano l'effetto
uomo-in-meno (§6.5) ed escludono gli espulsi dai gol successivi. Ordine di generazione per
match: **cartellini → score(con timeline espulsioni) → marcatori/assist**.

Input: gli 11 titolari *disponibili* di ciascuna squadra (best XI, §2.2, meno gli squalificati)
+ lo score + l'RNG-eventi.

- **Marcatori**: per ogni gol di una squadra si estrae un marcatore tra i suoi titolari,
  con peso `pesoRuoloGol[pos] · (finishing/50)` (GK ≈ 0). La somma dei gol dei giocatori di
  una squadra è **esattamente** pari al suo score (invariante testata).
  `pesoRuoloGol = { GK:0, DF:0.10, MF:0.35, FW:1.0 }`.
- **Assist**: con probabilità `ASSIST_RATE ≈ 0.75` il gol ha un assist, assegnato a un
  compagno **diverso** dal marcatore, peso `pesoRuoloAssist[pos] · (passing/50)`.
  `pesoRuoloAssist = { GK:0.05, DF:0.4, MF:1.0, FW:0.7 }`.
- **Cartellini**: per squadra, `nGialli ~ Poisson(YELLOW_LAMBDA ≈ 1.7)` e
  `nRossiDiretti ~ Poisson(RED_LAMBDA ≈ 0.06)`; destinatario pesato `pesoRuoloCartellino[pos]`
  (`{ GK:0.2, DF:1.0, MF:0.85, FW:0.5 }`).
  - **Doppio giallo → rosso**: il 2° giallo nella stessa partita genera *anche* un rosso
    (espulsione) allo stesso minuto; da lì il giocatore è escluso da ulteriori cartellini.
  - Un giocatore già ammonito ha peso ridotto (`BOOKED_CAUTION ≈ 0.3`) per un ulteriore
    giallo: modella la prudenza/sostituzione, così i doppi gialli sono realisticamente rari
    (i gialli totali restano ~3.4/partita, i rossi ~0.2/partita di cui ~45% da doppio giallo).

**Espulsione — conseguenze (livello 1).** I cartellini sono generati *prima* dei gol, così:
- un **espulso non segna né serve assist dopo il minuto del rosso** (escluso dal pool marcatori
  per i gol a minuto ≥ rosso; lo score resta invariato, un altro compagno segna);
- l'espulso è **squalificato per la partita successiva** del suo club. In `engine/season.ts`
  l'XI titolare è ricalcolato **per-partita** dai giocatori disponibili (rosa − squalificati),
  quindi la squalifica **indebolisce leggermente** la squadra in quel match (forza-rosa dall'XI
  disponibile; la media di lega resta fissa dagli XI a pieno organico). Effetto sulla
  calibrazione trascurabile (rossi ~0.2/partita).
- *Non* ancora modellato (livello 3): niente sostituzioni.
- **Minuti**: ogni evento riceve `minute = int(1,90)`; l'assist condivide il minuto del gol.
  La lista è ordinata per minuto.

Aggregazioni di stagione (in `engine/player-stats.ts`, pure): capocannonieri, assist-man,
tabella cartellini — calcolate dagli eventi di tutti i match, come la classifica dai risultati.

### 6.5 Effetto uomo in meno (livello 2)

Una squadra in inferiorità numerica segna meno e concede di più. Poiché i minuti delle
espulsioni sono noti *prima* dello score (§6.4), si **redistribuiscono i gol attesi** lungo la
partita invece di campionare da un λ costante:

1. Si calcolano i λ base `λ_home`, `λ_away` come in §6.1 (forza + forma), **senza clamp**.
2. Si spezza `[0,90]` a ogni minuto-espulsione (unione dei rossi delle due squadre). In ogni
   segmento `[t0,t1]` con `hDown`/`aDown` = uomini in meno di casa/ospite a inizio segmento:

   ```
   rate_home = λ_home · OWN^hDown · OPP^aDown
   rate_away = λ_away · OWN^aDown · OPP^hDown
   ```

   con `OWN = 0.80` (segni meno per ogni tuo uomo in meno) e `OPP = 1.25` (l'avversario segna
   di più). Si integra pesando per la durata del segmento `(t1−t0)/90`, poi si clampa
   (`LAMBDA_MIN/MAX`) e si campiona lo score come in §6.2.

Proprietà: senza rossi (≈80% dei match) `λ` è identico a §6.1 → i risultati non cambiano; con un
rosso l'effetto è proporzionale alla frazione di partita giocata in inferiorità (un rosso al 10'
pesa molto più di uno all'80'). Il totale gol è quasi conservato (redistribuzione: `OWN·OPP≈1`),
quindi la media-gol di lega resta in banda; verificato ri-lanciando `calibrate`.

### 6.6 Sostituzioni e riequilibrio tattico (livello 3)

Ogni squadra effettua `SUB_MIN..SUB_MAX` (3–5) cambi, distribuiti su **3 finestre** temporali
(`SUB_WINDOWS ≈ [40-52], [55-68], [70-84]`; più cambi possono condividere lo stesso minuto).
Chi esce è un giocatore di movimento in campo (peso verso overall più basso, "stanco/debole");
chi entra è il miglior panchinaro nello stesso ruolo. La panchina = rosa disponibile − XI
(esclusi squalificati).

Si costruisce una **timeline di presenza** per giocatore `[entry, exit)`: i titolari da 0, un
espulso esce al minuto del rosso, un sostituito esce al minuto del cambio, un subentrato entra
al suo minuto. L'attribuzione gol (§6.4) usa questa timeline: **solo chi è in campo al minuto
del gol** può segnare/assistere → i subentrati possono segnare (super-sub, ~9% dei gol), chi è
uscito no. I cartellini restano sui soli titolari (semplificazione).

**Riequilibrio tattico su rosso di DF/GK.** Se è espulso un difensore o il portiere, la squadra
usa un cambio per **togliere un attaccante** e inserire un difensore (o il portiere di riserva
se è stato espulso il GK). Da quel minuto la squadra gioca "riassettata": nell'effetto uomo in
meno (§6.5) usa moltiplicatori più difensivi — `OWN_RESHAPE = 0.70` (attacca ancora meno,
avendo sacrificato un attaccante) e `OPP_RESHAPE = 1.15` (concede meno di un 10-uomini che non
si riassetta). Un rosso a un FW/MF non innesca il riassetto (moltiplicatori standard §6.5).

I cambi di routine (senza rosso) **non hanno effetto sul punteggio** (niente affaticamento nel
modello): servono all'attribuzione gol e al tabellino. Calibrazione riverificata: invariata.

---

## 7. Determinismo e RNG

- Un solo `Rng` seedabile (mulberry32) attraversa generazione e simulazione.
- Distribuzioni fornite dal modulo `rng/`: `uniform`, `int`, `gaussian` (Box–Muller),
  `poisson` (Knuth per λ piccoli), `pick`/`shuffle`.
- Il `seed` di una stagione è salvato in `Season.rngSeed`: rieseguire con lo stesso seed
  riproduce identici risultati. Requisito per test e per la validazione statistica.

---

## 8. Validazione (gate prima della UI)

Il comando `calibrate` simula molte partite/stagioni e verifica che i numeri siano realistici.
Bande obiettivo (campionato a 20 squadre, 38 giornate):

| Metrica | Banda attesa |
|---|---|
| Vittorie casa | 43–48% |
| Pareggi (media lega) | 24–28% |
| Vittorie ospite | 26–32% |
| Media gol / partita | 2.5–2.9 |
| % partite con 0-0 | 6–10% |
| Punti campione (media su molte stagioni) | ~78–90 (singola stagione fino a ~95+) |
| Punti ultima retrocessa (media) | ~22–32 |
| Correlazione forza-rosa ↔ posizione finale | forte e monotona |
| Capocannoniere di lega (gol) | ~18–28 tipico (punte eccezionali ~35–40) |
| Quota gol per reparto | FW 55–65% / MF 25–35% / DF 5–12% / GK ~0 |
| Cartellini gialli / partita (totale) | ~3–4 |
| Cartellini rossi / partita (totale) | ~0.15–0.30 |
| Gol con assist | ~70–80% |

> Nota sui pareggi: due squadre **pari** pareggiano di più (~28%) della media di lega
> (~25%), che include molte partite squilibrate. La media di lega è la metrica di riferimento.
>
> Nota su campione/retrocessa: nel calcio reale lo spread è ampio a *entrambi* gli estremi
> (es. Premier 2023-24: campione 91, ultima 16). La media del campione ~80 riflette che alcune
> stagioni sono più combattute; le punte per singola stagione arrivano a 90-99.

Punteggi più frequenti attesi (ordine indicativo): 1-1, 2-1, 1-0, 0-0, 2-0, 0-1.

Test automatici (`vitest`):
- **Unit**: overall/rating su input noti; scheduler (ogni squadra gioca 2·(N-1), una volta
  casa e una ospite contro ciascuna avversaria); Elo (somma rating conservata a meno del MOV).
- **Statistici (Monte Carlo, seed fisso)**: su ≥20k partite tra squadre pari, home/draw/away e
  media gol dentro le bande; tra squadra forte e debole, la forte vince con probabilità attesa.

---

## 9. Fase 2 — Control loop del giocatore (manager, CLI)

Trasforma la simulazione in gioco: l'utente allena **una** squadra. Ancora nessuna UI (input
testuale), nessun mercato, nessuna multi-stagione, nessuna AI avversaria (le altre squadre
schierano il loro **miglior XI naturale**).

### 9.1 Ciclo

1. Scelta della squadra da allenare tra quelle della lega.
2. **Formazione impostata una volta** a inizio stagione (sticky): resta valida per tutte le
   giornate finché l'utente non la cambia esplicitamente.
3. L'utente avanza di una giornata: la sua partita e tutte le altre della giornata sono simulate
   col motore esistente (round-by-round).
4. Output: risultato della sua partita, risultati delle altre, classifica aggiornata.
5. Ripete fino a fine stagione → classifica finale.

### 9.2 Formazione a slot (4-4-2) — perché conta

L'utente **assegna i giocatori a slot espliciti**: 1 `GK`, 4 `DF`, 4 `MF`, 2 `FW`
(`LINEUP_SHAPE`). La forza att/def della sua squadra è calcolata dagli 11 schierati usando il
**rating-nel-ruolo**, non l'overall naturale:

```
effectiveOverall(player, slot) =
  player.overall                          se slot == ruolo naturale
  computeOverall(slot, attributi)         se entrambi di movimento (es. FW messo in DF)
  player.overall · OOP_GK_PENALTY (0.30)  se mismatch GK↔movimento (portiere fuori ruolo)
```

`attack`/`defense`/`overall` della squadra = medie pesate (pesi di reparto §2.2) di questi
`effectiveOverall`. Conseguenze volute:
- **Riserve** (overall bassi) → rating più bassi → risultati peggiori.
- **Ruoli sbagliati** (attaccante in difesa, nessun vero portiere) → `effectiveOverall` bassi in
  quegli slot → difesa/attacco crollano.

Le **avversarie** usano il miglior XI naturale (slot = ruolo naturale → `effectiveOverall =
overall`): identico al calcolo Fase 1, quindi **calibrazione invariata**.

### 9.3 Squalifiche con formazione sticky

Se un titolare in formazione è squalificato per una giornata (§6.4), viene **auto-sostituito**
solo per quel match dal miglior panchinaro disponibile per quello slot; la formazione base resta
invariata (il giocatore rientra alla giornata dopo). L'auto-sostituzione è segnalata nell'output.

### 9.4 Validazione (il criterio richiesto)

Comando non-interattivo di confronto: **stessa stagione, stesso seed**, simulata due volte —
una con il **miglior XI** (scelte sensate) e una con una **formazione scadente** (riserve +
ruoli invertiti) — con i due piazzamenti finali affiancati. Il piazzamento della squadra
dell'utente deve risultare **nettamente migliore** con le scelte sensate. Codificato in un test
automatico (`good.position < bad.position` con margine).

---

## 10. Fase 2b — Career multi-stagione (piramide + progressione)

Multi-divisione con promozioni/retrocessioni + evoluzione delle rose nel tempo. **Mercato
rimandato** (i giocatori restano al club; le rose cambiano solo per età/ritiri/giovanili).

### 10.1 Piramide di divisioni

`World.leagues: League[]` ordinate per tier (indice 0 = tier 1). Default **2 divisioni da 20**.
Generazione a piramide (`generation`): reputazioni **sfalsate per tier** (`bottomForTier`,
`rangeForTier`) con sovrapposizione → la vetta della B ≈ la coda della A (forza media A ~69 vs
B ~57). Ogni divisione è simulata **indipendentemente** come una lega da 20 (contesto/Elo/
classifica per lega, §3-§4): la calibrazione di ciascuna divisione resta quella di §8. Elo
re-inizializzato per divisione a ogni stagione (la forma vive dentro la stagione).

### 10.2 Progressione di fine stagione (`engine/progression.ts`)

Ordine in `advanceOffseason` (puro, RNG iniettato, muta il mondo):

1. **Promo/retrocessioni** (`promoteRelegate`): tra tier adiacenti, le ultime `PROMO_COUNT = 3`
   della divisione superiore scendono, le prime 3 dell'inferiore salgono (scambio di club interi
   con le loro rose). Ogni divisione resta a 20 club.
2. **Invecchiamento + sviluppo** (`ageAndDevelop`): età +1; variazione dell'overall guidata da
   età e **`potential`** (§1.3): ≤21 crescono molto verso il potenziale, ≤24 crescono, 25-29
   plateau, ≥30 declino crescente. Il delta è applicato agli **attributi** (fisici in calo più
   rapido dopo i 30), poi si ricalcola l'overall.
3. **Ritiri** (`retire`): probabilità crescente con l'età (`retireProbability`; inizio 32,
   portieri 34; quasi certa verso i 38-39). I ritirati escono da players/contracts/rosa.
4. **Leve giovanili** (`youthIntake`): ogni club rigenera giovani (16-19, reputazione = club) per
   riportare ogni reparto ai target di `SQUAD_COMPOSITION` → rose sempre a 25.

### 10.3 Loop di carriera

- **`engine/career.ts`**: `playAllDivisions` (simula tutte le divisioni di un anno) + `runCareer`
  (N stagioni auto con off-season tra una e l'altra).
- **CLI `manage`** ora è **multi-stagione**: giochi la tua divisione, a fine anno le altre sono
  auto-simulate per alimentare promo/retro, si applica la progressione, e continui — la tua
  squadra può **salire o scendere di categoria**. La formazione è ricalcolata (miglior XI) a
  inizio stagione perché la rosa cambia.
- **CLI `simulate-career --seasons N`**: report auto (campioni per divisione, promo/retro, ritiri/
  giovani, salute del mondo).

### 10.4 Validazione (gate)

Su molte stagioni consecutive (`career.test.ts`): divisioni sempre a 20 club, **rose sempre a
25**, **età media stabile** (~23-28), campione della divisione top realistico ogni stagione
(§8), e promo/retro effettive (3+3) ogni anno. Più i test unitari su ogni fase della
progressione (giovani crescono, vecchi calano, ritiri solo ≥32).

*Non* modellato (fase successiva): mercato/trasferimenti, contratti che scadono, coppe,
infortuni/morale.

---

## 11. Invecchiamento & personalità per-attributo (`engine/progression.ts`)

Modello di progressione che **sostituisce** lo sviluppo semplice della Tappa B. Principio
cardine: età e personalità agiscono sui **singoli attributi**, MAI sull'overall (derivato, si
ricalcola). Il "tipo" di giocatore non è programmato: emerge da **dove** ha gli attributi alti +
il declino differenziato.

### 11.1 Dati statici (alla creazione)

- `potential` (1-100): tetto di crescita.
- `personality`: tratti nascosti in [0,1]; tassonomia completa in **§11.6**. Regola di ferro:
  **un tratto senza effetto meccanico non si implementa** (si definisce il dato e si collega
  l'effetto quando arriva il sistema su cui agisce). I tratti NON toccano l'overall.
- Classificazione attributi (`attributeKind`): **FISICO** = `pace`, `stamina`, `strength`;
  **TECNICO/MENTALE** = tutti gli altri.

### 11.2 Delta annuale per attributo

```
base       = uniform(curva_età)          // per attributo, non per giocatore
curva_età:  17-20 [+3..+6] · 21-24 [+1..+3] · 25-28 [0..+1] · 29-31 [-3..-1] · 32+ [-6..-3]
categoria  = (declino && tecnico) ? 0.40 : 1.0        // il tecnico declina lento
mod_pers   = declino ? (1 + s/2 - s·t) : (1 - s/2 + s·t)   con s=0.8
             t = 0.7·professionalità + 0.3·determinazione   // prof primaria, deter secondaria
delta      = base · mod_pers · categoria + gaussian(0, 0.8)
```

- **Personalità sign-aware** (nota di design): un singolo moltiplicatore <1 rallenterebbe *sia*
  crescita *sia* declino. Per ottenere "cresce di più verso il potenziale **e** declina di meno",
  in crescita `t` alto → moltiplicatore >1, in declino `t` alto → moltiplicatore <1.
- **Vincolo potenziale**: in crescita l'attributo non supera `max(valore_attuale, potential)`
  (i specialisti già oltre il potenziale non crescono ma non vengono forzati giù).
- Overall ricalcolato dagli attributi dopo i delta.

Comportamenti **emergenti** (non hardcodati): l'attributo-firma di un velocista (`pace`) sfuma
in fretta, quello di un funambolo/regista (`dribbling`, `passing`, `finishing`) regge a lungo;
due giocatori identici con personalità opposta divergono nettamente in ~10 stagioni.

> Onestà sul limite: l'emergenza del "tipo" vive a livello di **attributo** (dove sta davvero
> il tipo). L'`overall` è una media *pesata per ruolo*: tra due giocatori dello **stesso ruolo**
> il calo di overall è simile (stessi pesi), anche se i loro attributi-firma decadono in modo
> molto diverso. Un rating per-ruolo che valorizzi gli attributi effettivi renderebbe visibile
> il divario anche nell'overall — rimandato (richiederebbe di rivedere `computeOverall`).

### 11.3 Ciclo off-season (ordine)

`advanceOffseason`: 1) età +1 · 2) `developAttributes` per ogni giocatore · 3) **ritiri**
(`retireProbability`: da 33 outfield / 35 GK, +boost se `overall<50` e età≥31, certo a 40) ·
4) **newgen** (`youthIntake` rimpiazza i ritirati mantenendo **costante il totale**, 16-19enni
con potenziale+personalità propri) · 5) **promo/retrocessioni** (§10.2).

### 11.4 Validazione (gate, `progression.test.ts` + `career.test.ts`)

Unit: giovani crescono / vecchi calano; **fisici declinano più dei tecnici**; **tecnico invecchia
meglio del fisico** a pari overall; **personalità opposte divergono** da attributi identici;
crescita mai oltre il potenziale; ritiri per età/rating.
Salute su **15 stagioni auto**: età media stabile (~23-28), **totale giocatori costante**,
distribuzione età realistica (molti 23-28, pochi 17enni e 34+), campione top sempre in testa.

### 11.5 Parametri tarabili (`PROGRESSION` in `progression.ts`)

`TECH_DECLINE_FACTOR=0.4`, `NOISE_SD=0.8`, `PERSONALITY_SPAN=0.8`, soglie ritiro
(`RETIRE_START_OUTFIELD=33`, `RETIRE_START_GK=35`, `RETIRE_SLOPE=0.15`, `WEAK_VETERAN_*`,
`RETIRE_CERTAIN_AGE=40`).

---

## 11-bis. Sistema personalità esteso — tassonomia dei tratti

Estende il blocco personalità di §11. **Ogni tratto ∈ [0,1] deve avere un effetto meccanico su
un sistema esistente**: un tratto senza effetto si *definisce* soltanto e si collega quando arriva
il sistema che tocca (annotazione `[morde: …]`). I tratti non toccano l'overall: agiscono su
crescita/declino, resa in partita, o comportamento off-pitch.

### 11.6 Tassonomia (a livelli di attivazione)

**TIER A — attivi ora** (invecchiamento + piccole aggiunte al motore):

| Tratto | `[morde:]` | Effetto |
|---|---|---|
| `professionalism` | invecchiamento — **già attivo** | modificatore primario del delta (§11.2). Alta → cresce vicino al potenziale, declina lento. |
| `determination` | invecchiamento (secondario) + resa | contributo minore al modificatore (peso 0.3 vs 0.7); *[+ bonus resa quando la squadra è sotto — vedi §11.7 nota]*. |
| `consistency` | motore partita | controlla la **varianza** di resa partita-per-partita (§11.7). Bassa → alterna prestazioni sopra e sotto il suo livello. |
| `leadership` | rating squadra | il **capitano** (leadership più alta tra i titolari) dà un piccolo bonus ai rating att/def (§11.7). |

`temperament` è **attivo ora** (la disciplina esiste, §6.4): vedi §11.7.

**TIER B — definiti ora, effetto collegato in fasi future** (dato generato, inerte finché non
arriva il sistema):

| Tratto | `[morde:]` | Effetto futuro |
|---|---|---|
| `ambition` | mercato + contratti | vuole club/trofei più grandi; irrequieto se la squadra non compete. |
| `loyalty` | mercato + contratti | resiste alle offerte, rinnova più facile, sconto "affezione". |
| `adaptability` | mercato/trasferimenti | quanto in fretta rende al pieno dopo un trasferimento (penalità temporanea che decade). |
| `composure` (gestione pressione) | partite ad alta posta | resa nelle gare "importanti" (finali, spareggi, derby). Inerte finché tutte le partite pesano uguale. |

**TIER C — opzionale, puro colore**: `sportsmanship`/controversia [morde: morale + media] —
**non generare nemmeno il dato** finché non esiste un sistema morale.

### 11.7 Effetti sul motore (TIER A da attivare)

- **`consistency` → varianza di resa (per-giocatore, per-partita).** Distinta dalla Poisson (che
  è a livello gol/squadra): è una randomness a livello di **giocatore**. A ogni partita, il
  contributo di ciascun titolare ai rating att/def della squadra è scostato da un tiro di
  rendimento: `resa = overall · (1 + rumore)`, `rumore ~ gaussian(0, K·(1−consistency))`. Zero-medio
  → la calibrazione aggregata regge (da riverificare), ma aumenta la varianza dei risultati e crea
  giocatori "discontinui". RNG dedicato e deterministico.
- **`leadership` → bonus capitano.** Capitano = titolare con leadership massima; moltiplicatore
  piccolo (es. `1 + L·λ`, `λ` piccolo) ai rating att/def della squadra. Tutte le squadre hanno un
  capitano → effetto quasi neutro sull'aggregato, ma misurabile (§11.10).
- **`temperament` → propensione cartellini.** `cardWeight × (0.5 + temperament)`: sposta *chi*
  viene ammonito/espulso (giocatori "caldi" nel mirino), non *quanti* (il conteggio è Poisson,
  media temperamento 0.5 → fattore 1.0), quindi le bande cartellini di §8 restano invariate.
- **`determination` → bonus "sotto di un gol": RIMANDATO** (confermato). Il motore decide lo score
  prima (Poisson, §6), senza stato "in svantaggio" durante la gara: il bonus condizionato non è
  naturale nel modello attuale. In questa fase la determinazione è solo secondaria
  sull'invecchiamento; l'effetto-partita si collegherà con uno stato di gara più ricco.

### 11.8 Personalità derivata (etichetta, numeri nascosti)

I valori grezzi **non si mostrano**. Si espone un'**etichetta** composita dai cluster (stile
manageriali reali). Regole indicative (da tarare):

| Etichetta | Condizione |
|---|---|
| "Professionista modello" | professionalità alta + determinazione alta |
| "Talento sregolato" | professionalità bassa + potenziale alto |
| "Leader nato" | leadership alta + determinazione alta |
| "Mercenario" | ambizione alta + lealtà bassa |
| "Discontinuo" | consistency bassa |
| "Trascinatore" | estroverso + leadership alta (§11.10) |
| "Silenzioso professionista" | introverso + professionalità alta |
| "Anima della festa" | estroverso + determinazione bassa (rischio distrazione) |
| "Spirito libero" / "Testa calda" | `divergente` (secondo il mix) |
| "Nella media" | nessun cluster netto |

Lo **scouting** rivelerà l'etichetta con incertezza (stima che si affina osservando il giocatore).
Finché non c'è un sistema scouting: si mostra l'etichetta diretta (piena certezza), e l'incertezza
è rimandata.

### 11.9 Generazione dei tratti

- Tratti indipendenti in [0,1], **distribuzione centrata** (massa "nella media", code rare agli
  estremi) — non `uniform` piatta come nella prima bozza.
- **Indipendenza voluta** da potenziale e attributi: un talento pigro o un brocco disciplinato sono
  i casi interessanti, non bug. Ammessa **solo** una debole correlazione professionalità↔determinazione.
- Tier C (`sportsmanship`) non generato finché non serve.

### 11.4-bis Validazione aggiuntiva (oltre §11.4)

- **Professionalità** correla con lunghezza di carriera e % di potenziale raggiunto.
- **Consistency** correla con la varianza delle prestazioni stagionali del giocatore.
- **Bonus capitano** (leadership) misurabile: stessa rosa, con e senza capitano forte → differenza
  piccola ma **non nulla** nei risultati.
- **Distribuzione etichette** plausibile: pochi "Professionista modello"/"Talento sregolato", massa
  "Nella media".

### 11.10 Asse sociale: `socialita` (continuo) + `divergente` (flag)

Estende la personalità con un **asse sociale** dalla forma diversa dagli altri tratti.

- **Forma del dato**: `socialita ∈ [0,1]` **continuo** (0 = molto introverso … 1 = molto
  estroverso; le sfumature contano, non è un enum). `divergente`: **flag raro** (~3–5%)
  **ortogonale** all'asse — un giocatore può essere divergente a qualsiasi socialità.
- **Principio meccanico**: la socialità **non è additiva** — è un **modulatore di propagazione**.
  Non genera morale/leadership; decide se questi agiscono **localmente** (introverso) o si
  **diffondono** a tutto lo spogliatoio (estroverso). `divergente` = imprevedibilità e **alta
  varianza** nelle dinamiche relazionali.
- **`[morde:]` quasi tutto in sistemi FUTURI** (morale/coesione con relazioni pairwise, rapporto
  giocatore-allenatore, trattative/mercato, media) — **nessuno esiste ancora** → il dato si
  **genera ora e resta inerte**. Unico gancio attivabile ora: **modalità del bonus capitano**.

Effetti per modalità (attivi col futuro sistema morale):

| Modalità | Morale / spogliatoio | Leadership | Trattative |
|---|---|---|---|
| **Introverso** (bassa) | isolato dal contagio (poco influenzato in bene/male), diffonde poco | guida **con l'esempio** → bonus **locale/da prestazione**, non si diffonde | pragmatico, difficile da influenzare con leve relazionali, bassa esposizione media |
| **Estroverso** (alta) | **amplificatore** del morale in **entrambe** le direzioni (contagio ×) | guida **vocalmente** → bonus **diffuso** a tutti via morale | più vocale/più richieste, ma sensibile alle leve relazionali; alta presenza media |
| **Divergente** (flag) | **alta varianza**: catalizzatore unico o destabilizzante | fuori dalla logica di cluster | motivazioni non ovvie, esito imprevedibile; rapporto allenatore volatile |

- **Gancio attivabile ORA (minimo)**: `captainBonusMode(capitano)` = `local` (introverso) /
  `diffused` (estroverso), in base a socialità. Finché non c'è il morale collettivo si implementa
  **solo la scelta di modalità** (predisposizione): il bonus capitano numerico (§11.7) **resta
  invariato**; l'effetto diffuso pieno arriverà col sistema morale.
- **Generazione**: `socialita` **centrata** (code introverse/estroverse rare); `divergente` flag
  raro ~3–5% **indipendente** da socialità e da tutti gli altri tratti.
- **Validazione (FUTURA, col morale)** — criteri d'accettazione annotati, **non eseguibili ora**:
  uno spogliatoio con un **estroverso scontento** peggiora il morale collettivo più di uno con un
  introverso egualmente scontento; un **capitano estroverso** produce un effetto-squadra più ampio
  di un introverso di pari leadership (locale vs diffuso); i **divergenti** mostrano varianza
  relazionale nettamente più alta della media.

---

## 12. Infortuni (`engine/injury.ts` + motore partita + progressione)

Gli infortuni tolgono giocatori dal campo (subito) e dalla selezione (giornate successive), con
gravità che dipende dalla **predisposizione** del giocatore — il "talento di cristallo".

### 12.1 Predisposizione (statico, nascosto)

- `injuryProneness ∈ [0,1]` sul giocatore (campo a sé, **non** in `personality`: è medico).
  Generato **centrato** con code rare (alta = fragile, bassa = di ferro).
- **Predisposizione effettiva** al momento del tiro:
  `eff = clamp01(injuryProneness + max(0, età−29)·AGE_K + max(0, pace−75)/100·PACE_K)`
  (più fragili gli anziani e gli esplosivi puri).
- Etichetta derivata (`injuryLabel`, mostrata in rosa): **"Di cristallo"** (eff molto alta),
  **"Di ferro"** (molto bassa), altrimenti niente.

### 12.2 Infortunio in partita (effetto immediato)

Durante `buildMatchScript` (RNG-eventi, prima dello score), per ogni titolare: `chance(BASE_PROB ·
pronenessFactor(eff))`. Se infortunato al minuto `t`:
- **Esce dal campo** a `t` (nella timeline di presenza → non segna più dopo `t`, §6.4).
- **Rimpiazzo**: se restano cambi (budget 5, condiviso con le sostituzioni ordinarie/tattiche),
  entra il miglior panchinaro del suo slot (evento `sub`). Se i cambi sono **finiti**, la squadra
  resta **in inferiorità** dal minuto `t` (il minuto entra nella lista man-down, §6.5).
- Evento `injury` nel tabellino.

### 12.3 Gravità → durata + calo permanente

Alla lesione si estrae la **gravità** con quota che sale con `eff` (i "cristallo" collezionano i
gravi):

| Gravità | Prob. base | Durata (giornate) | Effetto permanente |
|---|---|---|---|
| Lieve | ~70% | 1–2 | nessuno |
| Media | ~25% | 3–8 | nessuno |
| Grave | ~5% (sale con `eff`) | 10–30 | **−physical permanente** |

- **Indisponibilità**: il giocatore è escluso dalla selezione per `durata` giornate (riusa il
  meccanismo disponibilità delle squalifiche §9.3; se è nell'XI fisso viene auto-sostituito e
  segnalato come *infortunato*). Stato per-stagione nel runner (una lesione lunghissima "guarisce"
  a fine stagione — la persistenza cross-stagione è un rimando).
- **Calo permanente (gravi)**: riduce gli attributi **fisici** (pace/stamina/strength) di poco
  (`SEVERE_HIT`), applicato una volta; **gravi ripetuti si sommano** → è ciò che spezza la carriera
  di un cristallo (promesse mai mantenute). Overall ricalcolato. Si integra con la progressione §11.

### 12.4 Parametri tarabili (`INJURY` in constants)

`BASE_PROB` (~0.01/titolare/partita), quote gravità e loro shift con `eff`, durate per gravità,
`SEVERE_HIT`, `AGE_K`, `PACE_K`, budget cambi (5, condiviso).

### 12.5 Validazione (gate)

- **Proneness alta → molte più partite saltate** in carriera di una proneness bassa (misurabile).
- **Tasso infortuni gravi** più alto per i "cristallo".
- **Calo permanente**: chi subisce gravi perde attributi fisici (e overall) rispetto a chi no.
- **Tasso aggregato realistico**: ~pochi indisponibili per rosa in ogni momento.
- **Calibrazione**: gli infortuni colpiscono tutte le squadre ~uguale + uomo-in-meno raro →
  ri-verificare che le bande di §8 reggano (ri-calibrazione).

---

## 13. Sottosistema morale

Dà una dinamica di stato agli individui, agganciandosi ai tratti di personalità (§11). **Strato 1
attivo ora**; strati 2-3 + affinità culturale sono **specifica futura** (§13.6, dipendono dal
mercato che non esiste ancora).

### 13.1 Strato 1 — morale individuale [ATTIVO]

- **Dato**: `Player.morale ∈ [0,1]`, neutro **0.5** (scelta: coerente con i tratti; alto = carico,
  basso = giù). Stato **persistente**, salvato col resto; i newgen nascono a 0.5.
- **Aggiornamento EVENT-DRIVEN** (mai continuo): si applica solo a eventi rilevanti, in pratica
  **a fine giornata** per i giocatori del club che ha giocato.

### 13.2 Cosa muove il morale

Δmorale = somma di contributi, poi rientro al neutro (§13.3):

1. **Risultato partita**: vittoria alza, sconfitta abbassa, pari ~neutro; **peso maggiore per chi
   ha giocato** (titolare > subentrato > non impiegato).
2. **Minutaggio vs aspettativa** (leva principale): l'aspettativa dipende da **`ambition`** (§11) e
   dal **rating del giocatore rispetto alla rosa** (è un titolare atteso?). Impiego classificato
   come `titolare | subentrato | non impiegato | indisponibile` (infortunato/squalificato →
   **neutro**, non è colpa sua). `attesa = f(rank_rating, ambition)`; `resa_impiego ∈ {1, 0.5, 0}`.
   Δ ∝ `(resa_impiego − attesa)`. Big ambizioso in panchina → scende; riserva che gioca → sale.
3. **Andamento squadra**: posizione in classifica **vs aspettativa** (dalla reputazione del club);
   sopra le attese alza, sotto abbassa (contributo minore, applicato periodicamente).
4. *(gancio futuro: promesse allenatore, situazione contrattuale — NON ora)*

### 13.3 Rientro al neutro (decay)

A ogni aggiornamento il morale torna un po' verso 0.5 (`morale += (0.5 − morale)·DECAY`), così gli
shock (una batosta) **non restano bloccati**: si smaltiscono gradualmente.

### 13.4 Effetto sul gioco (piccolo ma reale)

Il morale entra in `matchStrength` (§11.7) come **piccolo modificatore** del contributo del
giocatore ai rating att/def: `×(1 + (morale − 0.5)·MORALE_EFFECT)`, `MORALE_EFFECT` piccolo
(morale alto = lieve bonus, basso = lieve penalità). **Condiziona, non ribalta** — da ri-calibrare
tenendo le bande di §8 (a inizio mondo il morale è 0.5 → fattore 1.0, quindi impatto ~nullo).

### 13.5 Interazione con la personalità (tratti già definiti in §11)

- **`ambition`**: alza l'aspettativa di minutaggio (più ambizioso → più facile scontentarsi).
- **`determination`**: **attenua i cali** di morale (i determinati reggono i momenti no).
- **`socialita`**: **nessun effetto** sullo strato 1 (agirà come contagio sugli strati 2-3).

### 13.6 Validazione (strato 1)

- Big ambizioso in panchina per molte giornate → morale **in calo**.
- Riserva che gioca stabilmente → morale **in salita**.
- Dopo una sconfitta pesante il morale **rientra gradualmente**, non resta bloccato in basso.
- A parità di situazione, un giocatore **molto determinato cala meno** di uno poco determinato.
- Effetto sulla resa **misurabile ma piccolo**: una squadra con morale medio alto rende un po'
  meglio di una demoralizzata, senza ribaltare i valori di forza.

---

## 13-bis. Morale — strati 2 e 3 + affinità culturale [SPECIFICA FUTURA — NON IMPLEMENTARE]

Annotato per non perdere il design. **Nessuna logica ora**: dipende dal mercato/trasferimenti
inesistente.

### Strato 2 — relazioni significative (set SPARSO, solo intra-rosa)

- Si memorizza una relazione **solo se supera una soglia di significatività**; ogni coppia assente
  è neutra (0). ~25 giocatori/rosa → poche decine di relazioni "vive", non centinaia.
- Nascono/crescono per: **affinità culturale** (sotto), successi condivisi, compatibilità di
  personalità; si deteriorano per: rivalità di ruolo, incompatibilità.

### Strato 3 — coesione collettiva

- **Non memorizzata**: calcolata **on-demand** da strato 1 (media morali) + strato 2 (densità/segno
  relazioni) + presenza di leader.

### Socialità come modulatore di propagazione (non additivo)

- **estroverso** = amplifica il contagio del morale (in bene e in male), molte relazioni;
- **introverso** = isolato dal contagio, poche relazioni ma stabili;
- **divergente** = relazioni ad alta varianza, fuori dai cluster prevedibili.

### Affinità culturale/linguistica (modulatore dello strato 2)

- Le relazioni positive nascono più facilmente per **prossimità linguistico-culturale**, modellata
  con **GRUPPI DI AFFINITÀ** (cluster di nazionalità che condividono lingua/cultura) — **non** bonus
  per singola bandiera, **non** "carattere nazionale".
- Ogni nazionalità ∈ uno o più gruppi (es. Portogallo ∈ lusofoni ∈ latini-europei).
- Ogni gruppo ha un **COEFFICIENTE DI COESIONE** tarabile ("alcuni gruppi fanno gruppo più di
  altri": es. lusofoni e ispanofoni/rioplatensi alti, blocco latino-europeo più ampio e più
  debole). Descrive la coesione **sociale del gruppo**, non l'indole dei singoli.
- Cluster d'esempio con sovrapposizioni volute: lusofoni (BRA, POR, ANG…); ispanofoni/rioplatensi
  (ARG, URU, ESP, COL…); latini-europei (ITA, ESP, POR, FRA + sudamericani per prossimità);
  anglofoni; ecc. (brasiliano+portoghese > brasiliano+italiano).
- Effetti: (1) relazioni tra membri dello stesso gruppo più rapide/forti, **bonus = max dei
  coefficienti condivisi**, non somma; (2) **massa critica**: ≥ N connazionali/gruppo → piccolo
  bonus al morale collettivo che **satura** (una rosa monoetnica non deve avere morale infinito né
  dominare); (3) un **estroverso** del gruppo amplifica il collante, un **divergente** ignora
  l'affinità.
- Vincoli: l'affinità è **un input tra tanti** (personalità, minutaggio, successi restano
  determinanti); due connazionali che competono per lo stesso posto possono comunque sviluppare
  rivalità.

---

## 14. Nazioni, nazionalità/UE, rose e liste (Fase 2f)

Irrobustimento strutturale: il mondo diventa **multi-nazione**, con vivaio e limiti UE reali.
Base per il mercato (§15, futuro).

### 14.1 Nation (nuova entità)

- `Nation { id, code (es. ITA/ENG), name, euMember: boolean, homeNationality, rosterRules }`.
- `World.nations: Nation[]`. Le leghe restano piatte in `World.leagues` ma con `League.nationId`;
  la piramide di una nazione = le sue leghe ordinate per tier.
- Default: **Italia** (`ITA`, UE) + **Inghilterra** (`ENG`, **non-UE** post-Brexit), **2 divisioni da 20
  ciascuna** → 4 divisioni, 80 club, ~2000 giocatori.
- **Promo/retrocessioni per-nazione** (tra le divisioni della stessa nazione). Simulazione per-lega
  invariata (§3-§4); career simula tutte le divisioni.

### 14.2 Nazionalità, UE, vivaio

- Set UE (dei nostri codici): `ITA,FRA,GER,ESP,POR,NED,BEL,CRO` = UE; il resto (`BRA,ARG,ENG,SRB,
  MAR,SEN,URU,COL`) = extra-UE. **Inghilterra non-UE**: lì *ogni* straniero pesa sui permessi; in
  Italia solo gli extracomunitari.
- Generazione **biased per nazione**: club italiani ~60% `ITA`, inglesi ~55% `ENG`, resto stranieri
  (mix UE/extra). Reputazioni a piramide **per nazione**; forza comparabile tra nazioni.
- **`Player.trainedClubId: ClubId | null`**: club che l'ha prodotto → *club-trained*; *nazionale*
  = `trainedClubId` è un club di quella nazione; straniero → `null` (formato all'estero).

### 14.3 Lista vs Rosa

- **Rosa** (`Club.playerIds`) = ampia (può superare 25): U22, riserve, futuri prestiti/coppe.
- **Lista over-21** = **max 25** con quote; **U22 esenti** (illimitati, fuori lista). **Min 18**
  schierabili.
- **Solo lista registrata + U22 sono schierabili** in campionato; gli over-21 fuori lista non
  giocano. AI: auto-registra i migliori 25 nel rispetto delle quote.
- **`RosterRules` per nazione, disattivabili** (off → solo min 18 / max rosa flat).

### 14.4 Quote lista (Serie A-like, fedeli — §14.5 le tara in gioco)

- Lista 25, **min 2 GK**; **≥ N_nazionali** formati nella nazione (di cui **≥ N_club** nel club).
  Implementazione (`engine/roster.ts`): i posti vivaio si modellano come **slot liberi**
  (`listSize − minNationTrained`, es. 17): al massimo 17 non-nazionali entrano in lista, così gli
  stranieri in eccesso restano **fuori lista** (non schierabili) anche a rosa ≤ 25 — esattamente
  il meccanismo Serie A. Il tetto effettivo "si riduce" se mancano i vivaio.
- **Cap extracomunitari** (`nonEuCap`): è un cap sui **nuovi tesseramenti/stagione**, non sul totale
  in lista → **lo applica il mercato (2g)**, non la registrazione. In Inghilterra (`euMember=false`)
  conta *ogni* straniero come non-UE; in Italia solo gli extracomunitari (`classifyForNation`).
- **U22** (età < `under22Age`) fuori lista, illimitati, sempre schierabili (≥ `minPlayAge`).
- Config in `RosterRules` per nazione (Italia e Inghilterra con parametri propri), **disattivabile**
  (`enabled=false` → solo `minPlayAge`). Nel motore l'idoneità entra nel set "indisponibili" del
  runner (`ineligiblePlayers`), quindi i fuori-lista non vengono schierati.

### 14.5 Validazione (2f) — ESITO

- Mondo: 2 nazioni × 2 divisioni × 20; 80 club; promo/retro **dentro** ogni nazione. ✔
- Generazione: bias nazionalità per nazione (ITA 60% / ENG 55%); **floor vivaio garantiti**
  (≥5 club-trained, ≥11 nation-trained per rosa) → ogni club registra una **lista legale** e
  nessuno finisce fuori lista su mondo fresco (invariante testata → calibrazione salva);
  stranieri con `trainedClubId=null`. ✔
- **Calibrazione top invariata** (§8): casa 45.3% / pari 25.4% / ospite 29.3%, gol 2.87,
  campione 82.8, ultima 24.8 — tutto in banda. ✔
- Liste: fuori-lista scattano solo su rose sbilanciate (troppi stranieri / pochi vivaio),
  U22 esenti, `minPlayAge` sempre attivo, toggle off = solo min-età. Testato in
  `engine/roster.test.ts`. ✔

---

## 15. Mercato & procuratori (Fase 2g) — SPECIFICA (implementazione dopo 2f)

Solo **svincolati** nell'MVP. Pool ibrido: prospetti generati + non-rinnovati. Trattativa **via
procuratore**: agenzie grandi rigide + deal a pacchetto; piccole elastiche + giovani in prova;
**auto-procuratore** se `professionalism ≥ 0.8`. Contratto esteso: lordo (netto ~50%), durata
0.5–10 anni, commissione una-tantum + %-ingaggio, bonus a obiettivi (presenze/gol/assist/trofeo/
salvezza), bonus-firma raro, clausola merch (registrata, payout sospeso). Due budget per club
(monte-ingaggi + cassa). Prestiti (secco/diritto/obbligo/diritto→obbligo, fee a presenza) = dopo.
Le firme rispettano lista/quote/extracomunitari (§14).

### 15.0 Decisioni (confermate)

- **AI passivo**: i club AI rinnovano la maggior parte dei contratti, ne lasciano scadere alcuni
  (→ pool svincolati) e ricambiano le rose col vivaio; **il mercato attivo è solo dell'utente**.
  Rendere l'AI un attore di mercato attivo/entusiasmante = **capitolo dedicato futuro**.
- **Budget da reputazione**: monte-ingaggi + cassa derivati dalla reputazione (con spread). Il
  monte-ingaggi di un mondo fresco è calcolato con **headroom sul monte-salari corrente** → nessun
  club nasce sforato.
- **Pool svincolati realistico**: perlopiù comprimari/riserve, rari colpi; non-rinnovati + prospetti.
- **`nonEuCap`** = cap sui **nuovi tesseramenti/stagione** (non sul totale lista, §14.4) → morde qui.

### 15.1 Sotto-stadi

- **2g-1 Economia & contratti**: `Contract` esteso (lordo, bonus, firma, merch, campi agente),
  `Club` con `wageBudget`+`cash`, helper economia (`domain/finance.ts`), svincolati come giocatori
  fuori rosa. Additivo, **comportamento invariato** (calibrazione/career intatte).
- **2g-2 Agenti & pool**: entità `Agent` (reputazione/dimensione/assistiti), `agentId`/auto-agente;
  ciclo **scadenza/rinnovo** a fine stagione (AI passivo) → assemblaggio pool svincolati.
- **2g-3 Trattativa**: offerta→accetta/rilancia/rifiuta; agenzie grandi rigide+pacchetti, piccole
  elastiche+prova, auto-agente diretto; commissioni; firme rispettano lista/quote/`nonEuCap`+budget.
- **2g-4 Bonus & CLI**: payout bonus a fine stagione; schermata mercato nel `manage` + vista finanze.

---

## 17. Motore xG — Strada 2 (Fase 1c, GAME_DESIGN §9.1)

Sostituisce la generazione del punteggio Poisson-diretta con una **simulazione di occasioni**:
tiri → xG per tiro → gol campionati per-tiro. Calibrato sugli aggregati StatsBomb Serie A
2015/16 (`docs/calibration/statsbomb-serie-a-1516.json`, estratti con
`tools/statsbomb-targets.mjs`; solo aggregati nel repo, mai dati grezzi).

### 17.1 Modello (v1 — livello squadra)

Input identici al Poisson (§6): rating att/def efficaci normalizzati su media lega, RNG.

```
1) VOLUME TIRI (per squadra):
   λ_home = SHOTS_HOME · (att_h/avgAtt)^ALPHA · (avgDef/def_a)^BETA · form_h
   λ_away = SHOTS_AWAY · (att_a/avgAtt)^ALPHA · (avgDef/def_h)^BETA · form_a
   tiri ~ Poisson(λ), clampati [SHOTS_MIN, SHOTS_MAX]
   form = clamp(gauss(1, SIGMA_FORM), FORM_MIN, FORM_MAX)   (come §6, varianza di giornata)

1-bis) TEMPO CONDIVISO: un fattore di ritmo comune moltiplica ENTRAMBI i volumi
   (partite aperte/bloccate) → correla i punteggi e alza i pareggi al livello reale:
   tempo ~ clamp(gauss(1, TEMPO_SIGMA)); form_side = tempo × clamp(gauss(1, SIGMA_FORM))

2) QUALITÀ OCCASIONE (per tiro):
   xg ~ LogNormal(MU_XG, SIGMA_XG) clampato [XG_MIN, XG_MAX]
   → fit sui quantili reali: mediana 0.046, q90/q50 ≈ 4.07 ⇒ MU_XG=ln(0.046), SIGMA_XG≈1.10
   tilt di forza: xg' = clamp( xg · (att/defAvversaria)^GAMMA , XG_MIN, XG_CAP )
   (le squadre forti creano occasioni PIÙ PULITE, non solo più numerose)

3) FINALIZZAZIONE (per tiro, con GAME-STATE):
   i tiri si giocano INTERLACCIATI con punteggio corrente: chi è sotto spinge
   (×(1+GS_PUSH·gsScale)), chi conduce gestisce (×(1−GS_SIT·gsScale)) — feedback
   negativo che comprime i margini come nel calcio vero.
   gol ~ Bernoulli( clamp(xg' · finish_side · gameState, 0.01, 0.95) )
   finishHome/finishAway assorbono rigori (~0.3/partita) e la conversione di lega;
   la finalizzazione per-TIRATORE arriva nella v2 (§17.4).
```

### 17.1-bis Profili per lega (parametrizzazione per nazione)

I LIVELLI sono per-lega (`XgProfile` in `engine/constants.ts`, risolto dal
`LeagueContext` via `League.nationId → Nation.code`); la FORMA (lognormale xG,
elasticità, tempo, GS_PUSH/SIT) è condivisa:

| Campo | ITA | ENG | Note |
|---|---|---|---|
| shotsHome / shotsAway | 13.24 / 11.02 | 13.91 / 11.47 | football-data 2015-26 |
| finishHome / finishAway | 1.31 / 1.33 | 1.33 / 1.27 | conversione + spinta casa |
| gsScale | 1.0 | 0.25 | la Serie A gestisce il punteggio più della PL |

Nazioni nuove: aggiungere un profilo (o eredita `DEFAULT`). Raffinamento per-divisione
(es. Serie B ≠ Serie A) possibile in futuro con chiavi per-lega.

### 17.2 Target di validazione — PER LEGA, su 11 stagioni reali (2015/16-2025/26)

Fonte: football-data.co.uk, 4.180 partite per lega
(`docs/calibration/football-data-leagues-2015-2026.json`, estrattore
`tools/football-data-targets.mjs`). Bande in `REALISM_BANDS` (`engine/constants.ts`),
unica fonte per CLI e test. Pooled reali → simulato (30 stagioni):

- **Serie A**: 42.3/25.5/32.2, gol 2.73 (1.48/1.25), 0-0 6.9% → sim 42.1/25.4/32.5,
  gol 2.76 (1.49/1.27), 0-0 7.5%
- **Premier League**: 44.3/23.7/32.0, gol 2.82 (1.55/1.27), 0-0 6.3% → sim 44.6/23.4/32.0,
  gol 2.84 (1.57/1.26), 0-0 6.8%
- Le due leghe devono restare **misurabilmente diverse** (gate: PL più gol e meno pareggi).
- campione ~78–92 pt, ultima ~20–33; l'impatto formazione (gate §9.4) resta.
- La forma della distribuzione xG/tiro resta dal fit StatsBomb 15/16 (unica fonte
  open a livello-tiro); i livelli decennali vengono da football-data.

### 17.3 Introduzione affiancata

`MATCH.ENGINE` in `engine/constants.ts` seleziona il default; `calibrate --engine xg|poisson`
confronta i due sullo stesso mondo. **Il default resta `poisson` finché le bande §17.2 non
tengono**; poi si flippa e il Poisson resta come riferimento di regressione nei test.
Tutta la pipeline a valle (eventi, cartellini, infortuni, man-down §6.5, morale) è invariata:
il motore produce lo stesso output `(homeGoals, awayGoals)`.

### 17.4 v2 (dopo il flip): tiri nella timeline

I tiri diventano eventi con minuto e TIRATORE scelto per attributi (finishing/positioning vs
marking/riflessi GK individuali): i marcatori emergono dal modello (via `assignGoals` deprecata),
`consistency`/morale agiscono per-occasione. Richiede ricalibrazione della distribuzione
marcatori (quota gol FW/MF/DF §6.4).

---

## 18. Pressione della piazza (GAME_DESIGN §5)

Effetto per-giocatore sul contributo in partita (`matchStrength`), bidirezionale e filtrato
dal carattere. Derivato, event-driven, mai memorizzato.

### 18.1 Pressione del club

```
pressioneBase = clamp( (reputation − REP_LO) / (REP_HI − REP_LO), 0, 1 ) · BASE_MAX
sottoAspettativa = max(0, posizioneCorrente − posizioneAttesa) / 10   (attesa = rank reputazione)
piazzaPressure = clamp( pressioneBase + UNDER_K · sottoAspettativa, 0, 1 )
```

Prima giornata: solo pressioneBase. La posizione corrente è quella della giornata precedente.

### 18.2 Effetto sul giocatore

```
sensibilità = SENS_BASE + (1 − SENS_BASE) · max(professionalità, ambizione)
              // il menefreghista (entrambe basse) sente poco — ma mai zero
risposta    = 2·(compostezza − 0.5) + LEAD_K · 2·(leadership − 0.5)
              // fragile < 0 → malus · leader/compostezza alta > 0 → bonus
effetto     = clamp( K · piazzaPressure · sensibilità · risposta, MALUS_CAP, BONUS_CAP )
se effetto < 0: effetto ×= 1 − DET_ATT · (determinazione − 0.5)   // la grinta attenua i cali
contributo giocatore ×= (1 + effetto)
```

Costanti (`engine/constants.ts`, `PRESSURE`): `REP_LO=40, REP_HI=90, BASE_MAX=0.7,
UNDER_K=0.3, SENS_BASE=0.35, K=0.22, LEAD_K=0.5, MALUS_CAP=−0.30, BONUS_CAP=+0.15,
DET_ATT=0.5`.

Casi di riferimento (piazza caldissima, pressure≈1):
- fragile che ci tiene (comp 0.1, prof 0.8): ≈ −18/25% → il bomber si dimezza, non sparisce;
- menefreghista (comp 0.3, prof/amb 0.15): ≈ −4/6% → calo piccolo ma reale;
- Ronaldo-type (comp 0.95, lead 0.9): ≈ +12/15% → la piazza lo accende;
- provincia tranquilla (pressure ≈ 0.15): tutti quasi neutri.

### 18.3 Validazione

- `risposta` è ~a media zero sulla popolazione (tratti centrati) → bande di calibrazione
  per-lega (§17.2) invariate — verificato dai gate esistenti.
- Test archetipi: fragile crolla SOLO in piazza calda; menefreghista cala poco ovunque;
  leader guadagna in piazza calda; provincia ≈ neutra.
- Il caso utente: bomber 25+ gol con carattere debole trasferito in piazza calda → stagione
  dimezzata; con carattere forte → si ripete o migliora (`scorer-repeat` §17.4 futuro).
