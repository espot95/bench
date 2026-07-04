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
| `stadiumCapacity` | number | |
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
- `personality` ∈ [0,1]⁴: `professionalism`, `determination`, `leadership`, `ambition`
  (per ora solo i primi due incidono; gli altri sono per usi futuri).
- Classificazione attributi (`attributeKind`): **FISICO** = `pace`, `stamina`, `strength`;
  **TECNICO/MENTALE** = tutti gli altri.

### 11.2 Delta annuale per attributo

```
base       = uniform(curva_età)          // per attributo, non per giocatore
curva_età:  17-20 [+3..+6] · 21-24 [+1..+3] · 25-28 [0..+1] · 29-31 [-3..-1] · 32+ [-6..-3]
categoria  = (declino && tecnico) ? 0.40 : 1.0        // il tecnico declina lento
mod_pers   = declino ? (1 + s/2 - s·t) : (1 - s/2 + s·t)   con t=(prof+deter)/2, s=0.8
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
