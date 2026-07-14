# MODULE_SCOUTING.md — Scouting con incertezza (base, Fase 1a)

> Specifica tecnica del modulo `src/scouting/` (GAME_DESIGN §7). Il codice deve corrispondere
> a questo documento; se cambi una formula, aggiorna prima qui. Stato: **base Fase 1** —
> copre il doppio livello di valutazione e l'incertezza; scommessa sul potenziale, hype/bolle
> e osservatori d'agenzia arrivano in Fase 3.

## 1. Principi (da GAME_DESIGN §7)

- **Doppio livello**: valutazione oggettiva (potenziale reale, `Player.potential`, NASCOSTO)
  vs valutazione percepita (il report, manipolabile in futuro).
- **Incertezza**: ogni report è una stima rumorosa che **si affina con le osservazioni** ma
  **non diventa mai perfetta** (pavimento di errore).
- **Contesto istituzionale**: lo stesso giocatore in un club di alta reputazione è
  sopravvalutato dal mercato; in un contesto sconosciuto è sottovalutato. Il contesto agisce
  sul **valore percepito**, non sulla stima tecnica.
- L'utente **non vede mai** `playerOverall`/`potential` veri dei giocatori altrui: solo stime.
  I propri giocatori si conoscono esattamente (li alleni ogni giorno).

## 2. ScoutReport (stato LOCALE al modulo — mai nel core)

| Campo | Tipo | Note |
|---|---|---|
| `playerId` | `PlayerId` | |
| `observations` | `number` | quante volte osservato (≥1) |
| `estimatedOverall` | `number` | stima 1-100 (1 decimale) |
| `potentialLow` / `potentialHigh` | `number` | intervallo del potenziale (mai il valore secco) |
| `personalityGuess` | `string` | etichetta carattere STIMATA (può essere sbagliata) |
| `estimatedValue` | `number` | valore di mercato percepito (unità denaro astratta) |

Lo stato del modulo è `ScoutingState = Map<PlayerId, ScoutReport>` (per carriera utente).
Persistenza: tabella `scout_reports` (owner: scouting; implementata in `src/persistence/`).

## 3. Modello di incertezza (event-driven)

Un'osservazione = un evento (partita contro, o scout assegnato per una giornata). A ogni
osservazione il report viene **ricampionato** con deviazione decrescente:

```
sigma(obs)   = max(SIGMA_MIN, SIGMA_0 / sqrt(obs))          # stima overall
sigmaP(obs)  = max(SIGMAP_MIN, SIGMAP_0 / sqrt(obs))        # potenziale
estimatedOverall = clamp( trueOverall + gauss(0, sigma), 1, 100 )
centroP          = clamp( truePotential + gauss(0, sigmaP), 1, 100 )
[potentialLow, potentialHigh] = centroP ± WIDTH_K · sigmaP   (larghezza minima MIN_WIDTH)
```

Etichetta carattere: probabilità di indovinare quella vera
`p(obs) = min(P_MAX, P_0 + P_K · obs)`; altrimenti un'etichetta plausibile a caso dal pool
(`PERSONALITY_LABELS` del core). **`P_MAX < 1`**: non si è mai certi del carattere altrui.

Costanti in `src/scouting/constants.ts` (`SCOUTING`):
`SIGMA_0=9, SIGMA_MIN=2, SIGMAP_0=12, SIGMAP_MIN=3, WIDTH_K=1.8, MIN_WIDTH=6,
P_0=0.35, P_K=0.08, P_MAX=0.9`.

## 4. Valore percepito e contesto istituzionale

```
estimatedValue = baseMarketValue(stimaOverall→curva, età, potenziale stimato, anni residui)
               × (1 + CTX · (clubReputation − REF_REP) / 100)   # contesto, CTX=0.35, REF_REP=55
               × (1 + gauss(0, sigmaV(obs)))                     # rumore che si affina
```

`baseMarketValue` è la **funzione base deterministica** di GAME_DESIGN §6.4 e vive in
`src/market/value.ts` (primo contenuto del modulo market; funzioni pure, importabili da
scouting — vedi ARCHITECTURE §6):

```
curvaOverall  = V_REF · (overall / 70)^ELASTICITY      # V_REF=5M, ELASTICITY=3.5
curvaEtà      = picco 24-27 = 1.0; giovani ≥0.8; oltre 30 decade (×0.82/anno, floor 0.15)
upliftGiovani = 1 + UPLIFT · max(0, potential − overall)/100 se età < 24   # UPLIFT=1.5
fattoreResiduo= 0 anni→0.3 · 1→0.7 · 2→0.9 · ≥3→1.0
value = curvaOverall × curvaEtà × upliftGiovani × fattoreResiduo   (arrotondato a 10k)
```

Il *prezzo reale* di una trattativa (quanto qualcuno paga davvero) NON è qui: arriva col
mercato profondo (Fasi 2-3). Questo è il punto di partenza.

## 5. Fonti di osservazione (Fase 1 base, nel `manage`)

- **Partita giocata contro**: +1 osservazione ai titolari avversari (automatico).
- **Scout assegnato** (1 slot): `scout <indice club>` → +1 osservazione/giornata a tutta la
  rosa del club bersaglio finché non riassegnato.
- Vista: `scout view <indice club>` → rosa con stime (`overall≈`, `pot. [lo-hi]`,
  etichetta stimata, valore percepito); i NON osservati compaiono come `???`.

## 6. Validazione (§ GAME_DESIGN validazione per sistema)

- **Convergenza**: errore medio |stima−vero| decresce con le osservazioni; a 1 oss >> a 20 oss.
- **Mai perfetto**: anche a 50 osservazioni sigma ≥ SIGMA_MIN; etichetta corretta ≤ P_MAX.
- **Copertura intervallo**: il potenziale vero cade in [lo,hi] nella grande maggioranza dei
  casi ad alte osservazioni.
- **Contesto**: stesso giocatore, club a reputazione 85 vs 35 → valore percepito maggiore.
- **Determinismo**: stesso seed → stessi report.
- Diagnostica CLI: `scout-accuracy --seed N` stampa errore medio per numero di osservazioni.
