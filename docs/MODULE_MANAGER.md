# MODULE_MANAGER.md — L'allenatore come attore (base, Fase 2d)

> Primo contenuto del modulo `manager/` (GAME_DESIGN §3.1-§3.2): l'allenatore ESISTE nel
> motore (la sua qualità muove le scelte di formazione) e il presidente-utente può
> assumerlo/licenziarlo. Il rapporto manager↔presidente bidirezionale (fiducia, dimissioni,
> promesse) resta Fase 4.

## 1. Qualità dell'allenatore → formazione (engine)

Ogni club IA schiera l'XI scelto dal SUO allenatore. Qualità `q = reputation/100`:

```
p(scelta subottimale) = POOR_PICK_MAX · (1 − q)      // POOR_PICK_MAX = 0.35
subottimale = un titolare (a caso) resta fuori, gioca il primo sostituto
```

Un tecnico da 90 sbaglia formazione ~3% delle volte; uno da 30 ~25%. Effetto piccolo per
partita, reale su 38 giornate. Il tiro usa lo stream `perfRng` (calibrazione ri-verificata).
In **modalità presidente puro** anche il TUO club schiera l'XI del tuo allenatore (per
questo assumerne uno buono conta); da manager/entrambi la formazione resta tua.

## 2. Costo dello staff tecnico (finanze)

Uscita annuale a ledger (`other`, nota "staff tecnico"): `0.4M + (rep/100)^2 · 6M`
(~0.6M un traghettatore, ~5.5M un big). Dentro `runLeagueEconomy`.

## 3. Assumi/licenzia (CLI presidente: `staff`, `fire`, `hire <k>`)

- `staff`: il tuo tecnico (reputazione, etichetta carattere, ex-giocatore) + il mercato
  dei liberi (generati ~12 senza panchina + i licenziati).
- `fire`: l'allenatore va nel pool dei liberi; subentra un **traghettatore** (rep 40)
  finché non assumi (v1: nessuna buonuscita — arriverà coi contratti staff).
- `hire <k>`: prende un libero dal pool (il vecchio, se c'è, viene liberato).
- I club IA non cambiano allenatore (carosello panchine = capitolo futuro col mercato IA).

## 4. Validazione

- Stesso club, tecnico pessimo vs ottimo → punti medi peggiori col pessimo (su più seed).
- Bande di calibrazione per-lega ancora verdi col poor-pick attivo.
- `hire`/`fire` muovono `Manager.clubId` correttamente; il pool dei liberi esiste dal worldgen.
- Costo staff a ledger per ogni club.

---

## 5. Stili tattici (v1) — l'identità dell'allenatore

Ogni `Manager` ha uno `style` (core, doc-first): `wings | pressing | catenaccio | possession
| counter | motivator | youth`. Assegnato alla generazione con bias dal carattere
(temperamento alto → pressing/ali; compostezza alta → catenaccio/possesso; leadership alta →
motivatore). Potenza dello stile: `p = (rep/100) × fit`, dove **fit** = quanto la rosa sa
interpretarlo (media normalizzata degli attributi chiave, clamp [0.3, 1]).

Effetti partita (moltiplicatori sul motore xG, tutti ≤ ~10% a piena potenza):

| Stile | Attributi-fit | Effetto |
|---|---|---|
| Ali (`wings`) | pace+dribbling di MF/FW | tiri propri ×(1+0.10p), qualità propria ×(1−0.05p) |
| Pressing | stamina+workRate della rosa | tiri propri ×(1+0.08p), qualità propria ×(1+0.04p), qualità CONCESSA ×(1+0.06p) |
| Catenaccio | marking+tackling+positioning dei DF | tiri concessi ×(1−0.10p), qualità concessa ×(1−0.06p), tiri propri ×(1−0.06p) |
| Possesso | passing+decisions dei MF | tiri concessi ×(1−0.08p), qualità propria ×(1+0.04p) |
| Contropiede | pace+finishing dei FW | tiri propri ×(1−0.06p), qualità propria ×(1+0.10p) |
| Motivatore | — | nessun effetto tattico: morale del club recupera più in fretta e pressione piazza attenuata (futuro aggancio §18) |
| Sviluppatore (`youth`) | — | nessun effetto tattico: tutto in crescita (sotto) |

## 6. Crescita differenziata dallo staff (richiesta utente)

L'invecchiamento per-attributo (SPEC §11) riceve un **bonus di bottega** additivo, solo in
crescita, mai oltre il potenziale:

```
boost(attr, giocatore) = DEV_K × (rep/100) × carisma × risultati × pesoStile(attr, ruolo)
  DEV_K = 1.2 punti-attributo/anno (massimo teorico sugli attributi-bersaglio)
  carisma  = 0.5 + 0.5·(0.7·leadership + 0.3·socialità)      // il tecnico che "arriva"
  risultati = clamp(1 + 0.5·(posAttesa − posFinale)/10, 0.7, 1.3)   // chi overperforma insegna
  pesoStile = 1 sugli attributi-bersaglio del ruolo-bersaglio, 0 altrove
```

Bersagli per stile: catenaccio → DF su marking/tackling/positioning · pressing → tutti su
stamina/workRate · ali → MF/FW su pace/dribbling · possesso → MF su passing/decisions ·
contropiede → FW su pace/finishing · **sviluppatore → TUTTI gli attributi degli U22 (peso
0.6)** · motivatore → nessuno. Esempio: 3 stagioni sotto un catenacciaro da 85 che
overperforma ≈ +4/5 punti extra di marcatura per i difensori.

### Validazione
- Difensori sotto catenacciaro bravo crescono su marking/tackling più degli attaccanti su
  finishing (stesso mondo, stile cambiato → la crescita si sposta).
- Il fit conta: stesso stile, rosa adatta vs inadatta → effetti partita diversi.
- Calibrazione per-lega ancora in banda (stili mescolati nel mondo, effetti piccoli;
  la normalizzazione per media-lega assorbe l'inflazione lenta degli attributi).
