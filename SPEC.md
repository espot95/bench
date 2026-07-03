# SPEC.md — Modello di dominio e regole del motore

Specifica del motore headless (Fase 1). È la fonte di verità per le formule e le costanti:
il codice in `src/engine/` deve corrispondere a quanto scritto qui. Se cambi una formula,
aggiorna prima questo file.

Convenzioni: attributi giocatore su scala intera **1–20** (stile FM). Tutta la casualità passa
da un RNG seedabile iniettato (vedi §7).

---

## 1. Modello di dominio

### 1.1 Attributes (value object)

Attributi 1–20. Insieme volutamente compatto per la Fase 1 (si estende dopo).

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
| `attributes` | Attributes | 1–20 |
| `overall` | number | **derivato** (§2.1), 1–20 continuo |
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

`overall = clamp( Σ (peso_ruolo[attr] · attr) / Σ peso_ruolo[attr] , 1, 20 )`

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

Entrambi restituiti su scala ~1–20, poi normalizzati rispetto alla **media di lega** (§3).

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
