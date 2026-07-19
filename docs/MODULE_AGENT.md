# MODULE_AGENT.md — Ruolo PROCURATORE (Fase 3a: mandati + carriera base)

> Spec di `src/agent/` (GAME_DESIGN §3.3, §6.3). Ritmo confermato: finestra pre-stagione
> (azioni libere) → stagione auto-simulata → digest. Concorrenza IA passiva in v1.

## 1. Setup carriera (`procuratore --archetipo`)

| Archetipo | Reputazione | Cassa | Note |
|---|---|---|---|
| `novizio` | 8 | 200k | il percorso duro: solo ragazzini ti ascoltano |
| `esperto` | 55 | 2M | già inserito |
| `ex-calciatore` | 35 | 800k | il nome apre porte (bonus fascino, §3c mentoring) |

L'utente è un'`Agency` REALE nel mondo (`agency-user`): i contratti dei clienti puntano lì
e i flussi esistenti (commissioni su rinnovi) instradano l'incasso senza codice speciale.

## 2. Il vivaio dei senza-agente

`populateAgents` lascia **senza agente i ≤18enni** (i ragazzini non hanno ancora un
procuratore — realistico e necessario: è il terreno di caccia del novizio). Ogni stagione i
newgen nascono senza agente. Semantica: `agencyId undefined` = libero · `null` =
auto-rappresentato (professionalità ≥ 0.8) · id = sotto mandato.

## 3. Mandato (§6.3) — `proposeMandate(world, state, player, terms, rng)`

Termini: `wagePct` [0.05, 0.12] · `years` 1-3 · (fee una tantum incassata sugli ingaggi).
Accettazione: `req = clamp(1.6·(quality − 40), 5, 90)` con `quality = (overall+potential)/2`;
`p = base(0.85) − 0.9·max(0, req − rep)/40 − 2.2·(wagePct − 0.05) − 0.25·(ambition − 0.5)`
(+0.10 se ex-calciatore). Il novizio NON firma il fuoriclasse: barriera reale (GAME_DESIGN §3.3).

## 4. Ciclo stagionale (`runAgentSeason`)

1. Stagione completa (`playAllDivisions` + `advanceOffseason`) — il mondo va avanti da solo.
2. **Incassi**: per ogni cliente con contratto club: `wagePct × stipendio annuale lordo`;
   se ha RINNOVATO quest'anno: + fee una tantum (`agencyCommissionFor`). Ledger personale.
3. **Pulizia mandati**: clienti ritirati/rilasciati dal mondo → mandato decaduto.
4. **Churn**: a mandato scaduto il cliente resta se `rep ≥ req·0.8` e lealtà media, altrimenti
   se ne va (torna senza agente). Rotture anticipate: solo a scadenza in v1.
5. **Reputazione**: deriva verso la qualità del portafoglio:
   `rep += 0.15·(portfolioScore − rep)` con `portfolioScore = media overall clienti (+8 se
   almeno un cliente in massima serie)`; senza clienti decade lentamente.

## 5. CLI (`procuratore`)

`liberi` (senza-agente con stime scouting, prima vista = 1 oss.) · `scout <n>` (altra oss.)
· `firma <n> [pct%] [anni]` · `clienti` · `conti` · `avanza` (stagione + digest) · `quit`.

## 6. Validazione

- Novizio: p(firma) ≈ 0 sul top player, > 0 sul 16enne mediocre; esperto firma la fascia media.
- Incassi = Σ pct×stipendi (mai negativi); rinnovo cliente → fee extra a ledger.
- Churn: mandato scaduto con rep bassa → cliente perso; ritirati/rilasciati puliti.
- 10 stagioni auto (`agent-career` diagnostic): cassa/reputazione evolvono senza esplosioni;
  il motore/calibrazione non sono toccati (l'agente osserva, non simula).

---

## 7. Fase 3b — Osservatori + scommessa sul potenziale

- **Osservatori** (`hireScout`): 300k/anno dalla cassa, entrano nello staff dell'agenzia
  (AgencyStaff role 'scout'). A ogni fine stagione ognuno osserva ~15 senza-agente
  (i più abbordabili) → report nello scouting dell'agente. Licenziabili (`fireScout`).
- **Scommessa** (`invest`): spendi 0.2-0.6M su un TUO cliente giovane (età < 22, sotto il
  potenziale): a fine stagione riceve +1..+3 punti (scala con l'investimento) su 3 attributi
  chiave del ruolo, MAI oltre il potenziale. Il ritorno arriva dai rinnovi (stipendio ↑ →
  la tua % ↑) e dal piazzamento (3c).
- Sotto-procuratori spostati alla 3c (insieme al piazzamento che li giustifica).

---

## 8-9. Fase 3c-3d — Piazzamento, penale, hype/bolle

- 3c (vedi codice `agent/placement.ts`): piazzamento con leve minutaggio/visibilità/mentoring;
  penale di liberazione 25% dell'annuale + resistenza-lealtà.
- **Agganci (3d)**: risorsa-relazioni. Guadagno: +1 per piazzamento riuscito, +1/stagione se
  hai clienti in massima serie (max +2). Novizio parte a 0: è "trasparente", non manipola.
- **Hype** (`hypeClient`): spendi agganci (costo 2·livello successivo, max livello 3) su un
  cliente → il suo valore percepito sale: al piazzamento l'ingaggio strappato è
  ×(1+0.15·livello) → fee e % più alte. È la leva mediatica di GAME_DESIGN §7.
- **La bolla scoppia** (a ogni settle): p(scoppio) = 0.25·livello. Se scoppia: hype azzerato,
  reputazione −6·livello, agganci −1 — l'accountability è reale. Se hai piazzato PRIMA dello
  scoppio, hai incassato: è la scommessa.
