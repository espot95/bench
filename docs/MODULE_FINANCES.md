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
