# GAME_DESIGN.md — La costituzione del gioco

> Documento di riferimento del progetto. È la **fonte di verità**: ogni sessione di sviluppo
> (Claude Code / Cursor) deve leggerlo prima di scrivere codice. Non è una lista di desideri,
> è il contratto di design. Se un modulo ha bisogno di qualcosa che non è qui, si aggiorna
> QUESTO file prima di implementare, non si improvvisa nel codice.

---

## 0. Visione in una frase

Un simulatore del **mondo del calcio** — non solo di una squadra — in cui il giocatore può
vivere l'ecosistema da tre prospettive diverse (allenatore, presidente, procuratore) all'interno
di un unico mondo coerente, simulato in profondità e guidato da sistemi emergenti.

Il fattore distintivo rispetto a Football Manager **non è il motore partita**: è la
**stratificazione dei ruoli** e la profondità economico-relazionale (agenzie di procuratori,
manipolazione mediatica, scommesse sul potenziale, dinamiche di spogliatoio).

---

## 1. Principi di sviluppo (validi per ogni fase)

1. **Headless prima della UI.** Ogni sistema si valida da CLI (una stagione/campagna simulata,
   output testuale, numeri aggregati credibili) PRIMA di costruire qualsiasi interfaccia.
2. **Attributi, non overall.** Età, carattere, morale agiscono sempre sui singoli attributi.
   L'overall è un valore *derivato e lossy*: si ricalcola, non si modifica direttamente.
3. **Event-driven, non continuo.** Morale, relazioni, prezzi si aggiornano solo a eventi
   rilevanti (partita, trasferimento, fine stagione), mai a ogni tick.
4. **Sparse by default.** Le strutture relazionali (relazioni di spogliatoio, ecc.) memorizzano
   solo ciò che si discosta dal neutro. Il resto non esiste in memoria.
5. **Il tuning è lavoro di design, non di codice.** Ogni sistema nasce con uno strumento di
   diagnostica (simula N stagioni → stampa i numeri di validazione). Non si tara alla cieca.
6. **Pianifica, poi implementa.** Claude Code propone architettura e piano PRIMA di scrivere,
   e aspetta conferma. `CLAUDE.md` è la memoria di progetto, aggiornata a fine sessione.

---

## 2. Il mondo

- **Single-player** (per ora). Multiplayer asincrono valutato in futuro, fuori scope MVP.
- **Un mondo unico per carriera.** All'interno di una carriera il mondo è UNO: giocatori,
  club, calendari, trasferimenti sono condivisi. Gli attori (i ruoli) sono le lenti diverse
  su quello stesso mondo.
- **Salvataggi per carriera.** Dentro la stessa carriera puoi **cambiare ruolo** (es. dopo
  10 stagioni da manager diventi presidente) e il mondo prosegue. Iniziare una **nuova carriera**
  genera un **mondo nuovo** da zero.
- **Il resto del mondo è gestito da IA.** Ogni ruolo non impersonato dall'utente è simulato.

### Struttura standard del mondo (decisione confermata)
- **2 nazioni**: Italia (UE) e Inghilterra (non-UE post-Brexit), ognuna con la propria piramide
  di **2 divisioni da 20 club** → 80 club, ~2000 giocatori. Si lavora su questa struttura;
  altre nazioni/divisioni sono estensioni future della stessa architettura (entità `Nation`).
- Promozioni/retrocessioni (3+3) avvengono **dentro** la piramide di ogni nazione, mai tra nazioni.
- Nazionalità **biased per nazione** (club italiani ~60% ITA, inglesi ~55% ENG), con floor di
  vivaio garantiti perché ogni club possa registrare una lista legale (§6.5).

### Progressione del tempo
- Granularità **giornaliera** (modello FM).
- L'utente **controlla l'avanzamento**: può avanzare fino al prossimo impegno, classificato
  come **importante / medio / non importante**, così salta i periodi vuoti ma si ferma su ciò
  che conta.

---

## 3. I tre ruoli

### 3.1 MANAGER (allenatore) — ruolo tecnico puro
**Controlla:** formazione, tattica, schieramenti, rotazioni, gestione del morale della squadra.
**Osserva:** propri giocatori, avversari, giovanili/primavere, squadre estere (scouting).
**Propone:** segnala giocatori interessanti al presidente / direttore sportivo.
**NON controlla:** acquisti/cessioni (decide il presidente), finanze, contratti.

- Ha **morale individuale** e **carattere** (stessi tratti dei giocatori, vedi §5).
- Può essere un **ex-calciatore** che eredita carattere/morale/stat dal passato da giocatore.
- Il carattere modula il rapporto con giocatori e presidente (un leader estroverso gestisce
  lo spogliatoio diversamente da un tecnico rigido e introverso).
- **Reputazione:** dipende dai risultati e dalla storia. Influisce su chi accetta di essere
  allenato / su quali panchine può ambire.
- **Rapporto manager–presidente bidirezionale:** il presidente può licenziarlo; il manager
  può dimettersi se le aspettative/promesse non sono rispettate.

### 3.2 PRESIDENTE (proprietà / dirigenza) — ruolo gestionale
**Controlla:** l'intero club — finanze, budget, monte ingaggi, strutture/infrastrutture,
sponsor, diritti TV, decisione finale su acquisti e cessioni, assunzione/licenziamento
dell'allenatore, staff, osservatori.
**Decide** in base a: budget disponibile, **carattere del presidente**, ambizioni del club.

Due modalità di gioco:
- **Presidente puro:** delega la parte tecnica/tattica all'allenatore (gestito da IA o assunto).
- **Presidente + manager:** gestisce anche tattica e formazione.
- In generale può **delegare o gestire in prima persona** ogni area (mercato, scouting, tattica).

- Ha **carattere** (es. fumantino/impulsivo vs lucido/stratega) che influenza le decisioni
  di mercato e il rapporto con allenatore e giocatori.

### 3.3 PROCURATORE (agente) — ruolo economico-relazionale
Il ruolo più **unico e complesso**, ed è il vero elemento distintivo del gioco.

**Inizio carriera:** scegli l'**archetipo di partenza**, che determina reputazione e difficoltà:
- *Novizio* (difficoltà alta, zero reputazione),
- *Esperto affermato* (difficoltà bassa, già inserito),
- *Ex-calciatore famoso* (difficoltà media: reputazione di partenza grazie al passato).

**Loop base:**
1. **Cerca** giocatori **liberi** (senza agente) — giovanili, primavere, mercati europei e
   mondiali. La visione è **incerta** (vedi scouting, §7).
2. **Acquisisce** clienti negoziando un contratto procuratore–giocatore (vedi §6.3).
3. **Guadagna:** % fissa sullo stipendio + **fee una tantum** sui trasferimenti + bonus a
   risultati/obiettivi.
4. **Scala** l'agenzia assumendo:
   - **altri procuratori** (lavorano come agenti; l'azienda trattiene una parte delle loro fee),
   - **osservatori** (segnalano giocatori; l'utente decide se metterli sotto contratto).
5. **Costruisce reputazione** dell'agenzia, che sblocca clienti migliori e leve di mercato.

- Un giocatore può **rifiutare** (reputazione insufficiente, agenzia troppo piccola: non puoi
  firmare un fuoriclasse appena iniziato) o **lasciare** l'agente (compenso insufficiente,
  ambizioni sportive non allineate, rapporto deteriorato).

---

## 4. Intersezioni tra ruoli (dove il mondo si tiene insieme)

- **Manager → Presidente:** il manager propone obiettivi/giocatori; il presidente decide se
  e quanto spendere (in base a budget e carattere).
- **Procuratore ↔ Presidente/Manager:** il procuratore negozia i trasferimenti e i contratti
  dei propri clienti con i club interessati.
- **Osservatori** (sia del presidente sia del procuratore) alimentano il flusso di segnalazioni.
- Poiché il mondo è unico, **le azioni di un ruolo IA impattano gli altri**: un giovane preso
  sotto contratto da un procuratore IA non è più "libero" per l'utente, e viceversa.

---

## 5. Sistema di personalità e carattere (condiviso: giocatori, manager, presidenti)

I tratti sono valori nascosti in [0..1]. **Ogni tratto deve avere un effetto meccanico** su un
sistema esistente; un tratto senza effetto si definisce come dato ma resta inerte finché non
esiste il sistema su cui agisce (annotazione `[morde:]`).

### Tratti — Tier A (attivi con invecchiamento/motore)
- **professionalità** `[morde: invecchiamento]` — modificatore primario del delta annuale:
  alta → cresce vicino al potenziale e declina più lento; bassa → spreca potenziale.
- **determinazione** `[morde: invecchiamento sec. + resa]` — contributo secondario alla crescita
  + attenua i cali di morale + bonus quando la squadra è in svantaggio.
- **costanza** `[morde: motore partita]` — controlla la varianza della resa partita-su-partita
  (randomness a livello di giocatore, distinta dalla Poisson/xG a livello di squadra).
- **leadership** `[morde: rating squadra/morale]` — il capitano dà un bonus; l'entità e la
  propagazione dipendono dalla socialità.

### Tratti — Tier B (dato ora, effetto in fasi future)
- **ambizione** `[morde: mercato/contratti/morale]` — alza l'aspettativa di minutaggio e la
  ricerca di club migliori/trofei.
- **lealtà** `[morde: mercato/contratti]` — resistenza alle offerte, propensione a rinnovare.
- **adattabilità** `[morde: trasferimenti]` — velocità di rendimento pieno dopo un trasferimento.
- **compostezza / gestione pressione** `[morde: partite ad alta posta]`.
- **temperamento** `[morde: disciplina/cartellini]`.

### Asse sociale (forma diversa dagli altri tratti)
- **socialità** — scalare continuo [0..1]: 0 = introverso, 1 = estroverso. **Non** è un enum.
- **divergente** — flag raro (~3–5%), **ortogonale** all'asse. Non è "il terzo valore".

Effetto (modulatore di **propagazione**, non additivo):
- **introverso** → isolato dal contagio del morale, poche relazioni ma stabili, leader "con
  l'esempio" (bonus locale).
- **estroverso** → amplifica il contagio (in bene e in male), molte relazioni, leader "vocale"
  (bonus diffuso via morale).
- **divergente** → relazioni ad alta varianza, non segue i cluster prevedibili; rapporto
  volatile con l'allenatore (risponde male alla gestione standard, bene a quella su misura).

### Etichette derivate (mostrate; numeri nascosti)
Es.: "Professionista modello", "Talento sregolato", "Leader nato", "Mercenario", "Discontinuo",
"Trascinatore", "Silenzioso professionista", "Spirito libero". Lo scouting rivela l'etichetta
**con incertezza**, non i numeri grezzi.

### Archetipi manager/presidente
Gli archetipi (es. Perfezionista, Carismatico, Rigido, Visionario, Impulsivo, Stratega) sono
**ispirati a figure storiche reali per comportamento pubblico**, ma **anonimizzati**: si usano
come stampo, poi il mondo viene popolato **proceduralmente** instanziando quegli archetipi su
profili con nomi/cognomi casuali. (Vedi §9 per la nota su diritti/anonimizzazione.)

---

## 6. Sistemi economici e contrattuali

### 6.1 Contratti giocatore–club
- Ogni giocatore ha un contratto: **stipendio, durata, anno di scadenza**.
- A fine stagione i contratti **scalano di un anno**; alcuni vanno in scadenza.
- Danno senso a lealtà e ambizione. Prerequisito del monte ingaggi (finanze).

### 6.2 Finanze del club (ruolo presidente)
- **Entrate:** biglietteria, **sponsor**, **diritti TV**, premi/competizioni, cessioni.
- **Uscite:** monte ingaggi (= somma dei contratti), costi struttura, acquisti.
- **Budget trasferimenti** e **budget ingaggi** come vincoli distinti.
- Gli sponsor/diritti reagiscono ai **risultati sportivi** (un club in crisi perde valore
  commerciale; uno in ascesa attrae). Patrimonio netto del club evolve nel tempo.
- **Strategia emergente:** ricostruire lentamente vs spendere tutto per vincere subito.

### 6.3 Contratto procuratore–giocatore (negoziato, §3.3)
Elementi negoziabili (dipendono dal carattere e dalla reputazione di **entrambi**):
- **% fissa** sullo stipendio,
- **fee una tantum** (es. all'ingaggio/trasferimento verso un club),
- **bonus** a obiettivi/reputazione,
- **durata:** parte corta (1–3 anni), si allunga con fiducia e buoni risultati.
**Rottura:** il giocatore può cambiare agente per compenso insufficiente, reputazione bassa
dell'agente, disallineamento tra ambizione economica e sportiva, o rapporto deteriorato.
Esiste un **morale/rapporto procuratore–giocatore** analogo a quello manager–presidente.

### 6.4 Valore di mercato
- Funzione **base deterministica**: attributi + età + contratto residuo + potenziale.
- Nel mercato "profondo" il prezzo **reale** è quanto qualcuno è disposto a pagare; il valore
  base è solo il **punto di partenza** delle trattative.
- **Valore percepito ≠ valore reale** (vedi §7): manipolabile da reputazione e contesto.

### 6.5 Nazionalità, vivaio e liste (implementato — dettaglio tecnico in docs/SPEC.md §14)
Regole di tesseramento fedeli al modello Serie A, per nazione e **disattivabili**:
- **Lista over-21 max 25** con quote vivaio: ≥8 formati nella nazione, di cui ≥4 nel club
  (`trainedClubId` su ogni giocatore: club-trained / nation-trained / straniero). I posti
  vivaio non coperti **riducono** il tetto: gli stranieri in eccesso restano **fuori lista**
  (non schierabili) anche a rosa piccola.
- **U22 esenti** dalla lista, illimitati e sempre schierabili (età minima 18).
- **Rosa ≠ lista**: la rosa può superare 25 (giovani, futuri prestiti, coppe).
- **Set UE asimmetrico**: in Italia il cap colpisce solo gli extracomunitari; in Inghilterra
  (non-UE) *ogni* straniero. Il **cap extracomunitari** è sui **nuovi tesseramenti/stagione**
  → lo applica il mercato, non la registrazione.
Queste regole danno peso strategico al vivaio (lato presidente) e ai canali di piazzamento
dei giovani (lato procuratore, §7).

### 6.6 Infortuni (implementato — dettaglio tecnico in docs/SPEC.md §12)
- Ogni giocatore ha una **fragilità nascosta** [0..1] (etichette rivelate: "Di cristallo" /
  "Di ferro"), aggravata da età e da profili fisici esplosivi.
- Infortunio **in partita**: il giocatore esce (conta nella timeline eventi), forza una
  sostituzione o lascia in inferiorità se i cambi sono finiti.
- **Gravità** lieve/media/grave → indisponibilità N giornate; il grave lascia un **calo fisico
  permanente** (agisce sugli attributi, mai sull'overall — coerente con §1.2).

---

## 7. Scouting, potenziale e mercato emergente

### Doppio livello di valutazione
- **Valutazione oggettiva** (potenziale reale, **nascosto**).
- **Valutazione di mercato** (ciò che il mondo *crede* valga, **manipolabile**).

### Incertezza
- Ogni report di scout/osservatore è **incerto** e si affina con l'osservazione.
- L'incertezza copre potenziale **e** valore di mercato.

### Scommessa sul potenziale (procuratore)
- Un procuratore può investire favori/risorse su un giovane di alto potenziale ma basso valore
  attuale. È il meccanismo che permette ai **novizi** di crescere scoprendo talenti, evitando
  il "vincono solo i ricchi".

### Contesto istituzionale
- Un giocatore mediocre in un'**academy/club ad alta reputazione** vale di più; uno bravo in
  un contesto sconosciuto vale meno. Il contesto gonfia/deprime il valore percepito.

### Hype, bolle e accountability
- Un procuratore **influente** può gonfiare la valutazione mediatica di un giocatore.
- **Barriera all'ingresso:** solo con **agganci** (relazioni con media/club/figure influenti)
  si può manipolare il mercato. Un novizio è "trasparente", non può gonfiare nulla.
- Le bolle **scoppiano**: se il gap tra percepito e reale si palesa, o se si abusa della leva
  nel breve periodo, la bolla scoppia **rapidamente** e la **reputazione/credibilità** del
  procuratore crolla. Sistema di accountability reale, non "chi frega chi" impunito.

### Guerra dei talenti (leve per acquisire/strappare un giocatore)
Tutte incluse nell'MVP:
1. **Trattativa diretta col giocatore** (per i liberi).
2. **Liberazione dall'agente attuale** pagando una penale.
3. **Partnership tra procuratori** (scambio di favori, reputazione reciproca).
4. **Offerta di crescita professionale** (giocare davvero vs restare in panchina; pesa in base
   all'ambizione del giocatore).
5. **Network/connessioni** (portare il giovane dove trova affinità culturale/connazionali).
6. **Accesso a competizioni/visibilità** (club in Champions, vetrina europea).
7. **Mentoring da ex-giocatore** (un agente ex-calciatore famoso è intrinsecamente più attraente).
8. **Reputazione di "sviluppa-talenti"** (storico di giovani portati in grandi club).
9. **"Debiti"/lealtà** (favori passati rendono il cliente più difficile da strappare).

---

## 8. Sistema morale e spogliatoio (a strati)

### Strato 1 — morale individuale [primo pezzo implementabile]
- Scalare per giocatore. Mosso da: minutaggio vs aspettativa (legata ad **ambizione** e livello),
  risultati squadra vs aspettativa, promesse mantenute/tradite, situazione contrattuale.
- **Decadimento** verso il neutro (gli shock non restano per sempre).
- Effetto **piccolo ma reale** sulla resa (modula i rating att/def; condiziona, non ribalta).
- `determinazione` attenua i cali; `ambizione` alza l'asticella; `socialità` NON agisce qui.

### Strato 2 — relazioni significative [futuro]
- **Solo dentro la stessa rosa.** Struttura **sparsa**: memorizza solo relazioni oltre soglia;
  coppie assenti = neutre. ~25 giocatori → poche decine di relazioni "vive".
- Nascono/crescono per: **affinità culturale** (sotto), successi condivisi, compatibilità di
  personalità. Si deteriorano per: rivalità di ruolo, incompatibilità, effetto divergente.

### Strato 3 — coesione collettiva [futuro]
- **Non memorizzato:** si **calcola on-demand** da Strato 1 (media morali) + Strato 2
  (densità/segno relazioni) + presenza di leader. Evita i problemi di "out of sync".

### Affinità culturale/linguistica (modulatore dello Strato 2) [futuro]
- Modellata per **GRUPPI DI AFFINITÀ** (cluster di nazionalità con lingua/cultura vicine),
  **non** per bandiera e **non** come "carattere nazionale".
- Ogni gruppo ha un **coefficiente di coesione** tarabile ("alcuni gruppi fanno gruppo più di
  altri" — es. lusofoni e ispanofoni/rioplatensi alti; blocco latino-europeo più ampio e
  più debole). Il coefficiente descrive coesione *sociale*, non indole individuale.
- Esempi cluster (sovrapposizioni volute): lusofoni (Brasile, Portogallo, Angola…);
  ispanofoni/rioplatensi (Argentina, Uruguay, Spagna, Colombia…); latini-europei (Italia,
  Spagna, Portogallo, Francia + sudamericani per prossimità); anglofoni; ecc.
- Effetti: relazioni tra membri dello stesso gruppo più rapide/forti (bonus = **max** dei
  coefficienti condivisi, non somma); **massa critica** (≥ N connazionali → bonus al morale
  collettivo che **satura**, così una rosa monoetnica non domina); estroverso amplifica il
  collante, divergente ignora l'affinità.

---

## 9. Motore partita e integrazioni esterne

### 9.1 Evoluzione del motore
- **Stato attuale (Fase 1c): motore xG (Strada 2) — DEFAULT.** Simula occasioni: volume tiri
  (Poisson per squadra) × qualità occasione (LogNormal xG) × finalizzazione per-tiro
  (Bernoulli). **Calibrato sugli aggregati StatsBomb Serie A 2015/16** (§9.2 punto 1;
  `docs/calibration/`, estrattori in `tools/`). Profili per nazione (`XgProfile`): Serie A e Premier League simulano con firme diverse e misurate:
  ITA 42.1/25.4/32.5 vs reale 42.3/25.5/32.2 (gol 2.76 vs 2.73) · ENG 44.6/23.4/32.0 vs reale 44.3/23.7/32.0 (gol 2.84 vs 2.82). Tempo condiviso + game-state (chi è sotto spinge) per la correlazione reale dei punteggi.
  Formule in `docs/SPEC.md` §17; diagnostica `calibrate --engine xg|poisson`.
- Il motore **Poisson + Dixon-Coles** resta come riferimento di regressione nei test
  (selezionabile, `engine/score-engine.ts`).
- **v2 (dopo):** i tiri entrano nella timeline eventi con TIRATORE scelto per attributi
  individuali (finishing vs riflessi GK) — i marcatori emergono dal modello (SPEC §17.4).

### 9.2 Integrazioni e fonti dati
> ⚠️ **Nota trasversale su diritti e licenze.** Nomi reali di giocatori/club/competizioni sono
> coperti da diritti (immagine, marchi) e da GDPR se si trattano dati di persone reali
> identificabili — anche "anonimizzate", se il contesto le rende riconoscibili. La licenza
> collettiva per i giocatori esiste (FIFPRO) ma è onerosa. **Per l'MVP:** usare i dati esterni
> per **calibrare** i sistemi, mantenendo attributi/entità **generati e stilizzati**. Il percorso
> "database di reali anonimizzati" per la versione online resta un'**opzione futura da validare
> con consulenza legale IP/sport prima del lancio**, non una decisione già presa. Verificare
> sempre i termini di licenza/ToS di ogni fonte prima dell'uso commerciale.

1. **StatsBomb** — dati event-level e xG per **calibrare** il motore (distribuzione xG, gol/xG,
   fattore campo, tipi di azione). Fonte primaria per tarare la Strada 2. *(Verificare i termini
   del dataset per l'uso previsto.)*
2. **Transfermarkt (o equivalente)** — valori di mercato e storico trasferimenti per **calibrare**
   il sistema di pricing (trend prezzi/età), ranking club. *(Verificare ToS/licenza.)*
3. **Archetipi manager/presidente** — profili di comportamento ispirati a figure storiche
   (anonimizzati) → instanziazione **procedurale** nel mondo (vedi §5).
4. **API ranking mondiale / Elo** — rating di club e nazionali per **validare** il sistema di
   forza delle squadre e posizionare competitivamente il mondo generato.
5. **Dati geografici e linguistici** — nazionalità, città, lingue per ogni giocatore; mappatura
   ai **gruppi di affinità** e coefficienti di coesione (§8).
6. **Dati di carattere e personalità** — stili di gioco/comportamentali → generazione procedurale
   coerente dei tratti nascosti (§5), mantenendo l'indipendenza voluta tra carattere, potenziale
   e attributi.

---

## 10. Roadmap di implementazione

Priorità scelta: **prima il modello dati core** (tutto dipende da esso), poi il **ruolo manager**
come primo ruolo giocabile completo, poi presidente, poi procuratore.

### FASE 0 — Modello dati core (fondamenta condivise, read-only per gli altri moduli)
Entità: `Player` (con attributi fisici/tecnici, potenziale, tratti §5), `Club`, `League`,
`Season`, `Match`, `Contract`, `FinancialState`, `Manager`, `President`, `Agent/Agency`.
Consegna anche `ARCHITECTURE.md` (come i moduli si connettono, quali dati sono condivisi vs locali).

### FASE 1 — Ruolo MANAGER completo (MVP giocabile)
Motore partita + motore stagione (già presenti, da evolvere a xG), control loop dell'allenatore
(formazione che conta), invecchiamento + potenziale, personalità Tier A, **morale Strato 1**,
scouting con incertezza (base), proposte al presidente (IA).

### FASE 2 — Ruolo PRESIDENTE
Contratti (§6.1) → Finanze/sponsor/diritti TV (§6.2) → mercato lato club (acquisti/cessioni,
decisione con carattere) → gestione allenatore/staff/strutture → modalità presidente puro vs
presidente+manager.

### FASE 3 — Ruolo PROCURATORE
Contratti procuratore–giocatore (§6.3) → scouting/scommessa sul potenziale (§7) → acquisizione
clienti → agenzia (assunzione procuratori/osservatori) → guerra dei talenti (9 leve) → hype/bolle
con barriera d'ingresso (agganci).

### FASE 4+ — Profondità e attivazione dei sistemi "futuri"
Morale Strato 2/3 + affinità culturale, negoziazione a più passi (controproposte) generalizzata,
Dixon-Coles, storytelling/media, eventuale multiplayer asincrono, eventuale integrazione dati
reali anonimizzati (con validazione legale).

### Stato di implementazione (aggiornare a ogni fase)
Il repo contiene già un'implementazione validata (136 test) di parte delle Fasi 0-2, ereditata
dal ciclo di sviluppo precedente e **conforme a questo documento** (dove eccedeva, il documento
è stato esteso: §2 mondo standard, §6.5, §6.6):

- ✅ **Motore xG (Strada 2) — default da Fase 1c**, calibrato su StatsBomb Serie A 15/16
  (esiti/gol/0-0 sovrapposti al reale, §9.1); Poisson + Dixon-Coles come regressione.
- ✅ Fase 1a: scouting con incertezza (MODULE_SCOUTING). ✅ Fase 1b: proposte al presidente
  IA con firma reale svincolati (MODULE_PRESIDENT).
- ✅ Motore stagione/career multi-stagione, promo/retro per nazione, eventi partita
  (marcatori/assist/cartellini/sostituzioni), man-down, squalifiche.
- ✅ Invecchiamento **per-attributo** con curva d'età × personalità × categoria fisico/tecnico;
  ritiri; newgen (popolazione costante).
- ✅ Personalità: Tier A attiva (professionalità, determinazione, costanza, leadership,
  temperamento), Tier B + asse sociale generati (inerti), etichette derivate.
- ✅ Morale Strato 1 (event-driven, decadimento, effetto piccolo sulla resa).
- ✅ Infortuni (§6.6). ✅ Nazioni/liste/quote (§6.5).
- ✅ Economia contratti (lordo/netto, bonus, fee agente come dati), budget club, agenzie
  con clienti, ciclo scadenza/rinnovo AI-passivo, pool svincolati.
- 🔄 **FASE 0 (in corso)**: ristrutturazione nel layout §11, core read-only, overall derivato,
  Manager/President/Agency/FinancialState, ARCHITECTURE.md.
- ⏳ Trattativa via procuratore (era in corso nel ciclo precedente): ripresa dentro le Fasi 2/3.

### Validazione generale (per ogni sistema)
Ogni fase consegna uno strumento diagnostico: simula N stagioni/campagne senza intervento umano
e verifica i target del sistema (età media stabile, popolazione costante, mercato non inflazionato,
morale credibile, carriere che divergono per carattere, ecc.).

---

## 11. Struttura del repository (per lavoro parallelo su Cursor)

```
/football-manager
  /docs
    GAME_DESIGN.md         ← questo file (fonte di verità, letto da TUTTE le sessioni)
    ARCHITECTURE.md        ← binding tecnico tra i moduli (prodotto in Fase 0)
    MODULE_*.md            ← specifica tecnica per singolo modulo
    CLAUDE.md              ← stato globale, aggiornato a fine sessione
  /src
    /core                  ← modello dati condiviso (read-only dopo Fase 0)
    /engine                ← motore partita (read-only per gli altri moduli)
    /manager  /president  /agent   ← logica per ruolo
    /contracts /finances /market /morale /scouting  ← sistemi trasversali
```

**Regola anti-conflitto:** `ARCHITECTURE.md` è rigido. Se un modulo scopre che un dato condiviso
non gli basta, lo si segnala e si aggiorna `GAME_DESIGN.md`/`ARCHITECTURE.md` **prima** di
scrivere codice, mai dopo. Ogni sessione, a fine lavoro, aggiorna `CLAUDE.md` con cosa ha fatto
e quali moduli tocca.
