/**
 * LORE dei club (richiesta utente: "la storia della società più vera possibile").
 * Per ogni nome "Città Colori" del pool: anno di fondazione REALE della tradizione
 * corrispondente e una storia che la evoca — senza nomi propri di persone o società
 * reali (stesso patto dei roster simil-reali: cromie e memoria, niente marchi).
 * I club di fantasia dei vecchi salvataggi non stanno qui: cadono sui template.
 */

export const CLUB_LORE: Record<string, { founded: number; story: string }> = {
  // ---------------------------------------------------------------- Serie A
  'Milano Rossoneri': {
    founded: 1899,
    story:
      'Fondati da un inglese sognatore che volle i colori "rossi come il fuoco e neri come la paura degli avversari". Il Diavolo delle grandi notti europee: nessun club italiano ha alzato più coppe dei campioni. San Siro condiviso col cugino nerazzurro, e mezzo mondo in curva.',
  },
  'Milano Nerazzurri': {
    founded: 1908,
    story:
      'Nati da una scissione di ribelli che volevano il calcio aperto ai giocatori del mondo intero — internazionali fin dal nome. Il Biscione, i cicli leggendari degli anni Sessanta, un triplete entrato nella storia. L’altra metà della Scala del Calcio.',
  },
  'Torino Bianconeri': {
    founded: 1897,
    story:
      'Fondati da un gruppo di studenti liceali su una panchina di corso. La Vecchia Signora: più titoli nazionali di chiunque altro in Italia, lo stile sabaudo di chi considera la vittoria non importante ma l’unica cosa che conta. Una dinastia industriale ne ha custodito il destino per un secolo.',
  },
  'Torino Granata': {
    founded: 1906,
    story:
      'Il mito più struggente del calcio italiano: negli anni Quaranta una squadra leggendaria dominava tutto, finché una sciagura aerea su una collina sopra la città non se la portò via intera. Il Toro, il vecchio Filadelfia, un popolo che da allora non ha mai smesso di ricordare.',
  },
  'Roma Giallorossi': {
    founded: 1927,
    story:
      'Nati dalla fusione dei club della capitale per sfidare lo strapotere del Nord. La Lupa, le radici popolari di Testaccio, poeti e capitani che hanno giurato fedeltà a vita. Un derby che vale una stagione.',
  },
  'Roma Biancocelesti': {
    founded: 1900,
    story:
      'I colori dell’Olimpo scelti dai podisti fondatori: bianco e celeste come la Grecia delle Olimpiadi. L’Aquila, la polisportiva più antica della capitale, uno scudetto di inizio millennio celebrato per settimane.',
  },
  'Napoli Azzurri': {
    founded: 1926,
    story:
      'Il Ciuccio, il golfo, uno stadio che trema come un vulcano. Nessuna città al mondo si identifica con la squadra come questa: quando un fuoriclasse sudamericano la portò due volte sul tetto d’Italia, i vicoli ne fecero una divinità. I murales sono ancora lì.',
  },
  'Firenze Viola': {
    founded: 1926,
    story:
      'Il Giglio sul petto e un colore unico al mondo — dice la leggenda, nato da un lavaggio sbagliato delle vecchie maglie. Il calcio rinascimentale della Fiesole, due scudetti e la vocazione a crescere numeri dieci.',
  },
  'Bergamo Nerazzurri': {
    founded: 1907,
    story:
      'La Dea: la provinciale che ha smesso di esserlo. Vivaio tra i migliori d’Europa, corsa, orgoglio orobico — e la scalata recente che l’ha portata a vincere una coppa europea facendo divertire mezzo continente.',
  },
  'Bologna Rossoblù': {
    founded: 1909,
    story:
      'Lo squadrone che tremare il mondo faceva: sette tricolori tra le due guerre, il dotto calcio emiliano. Il Dall’Ara sotto i portici e una tradizione che ogni tanto si risveglia.',
  },
  'Genova Rossoblù': {
    founded: 1893,
    story:
      'Il club di calcio più antico d’Italia, fondato da inglesi di porto quando il pallone era una stranezza da consolato. Il Grifone: nove titoli pionieristici, la Gradinata Nord tra le più calde del Paese.',
  },
  'Genova Blucerchiati': {
    founded: 1946,
    story:
      'Il cerchio sul petto nato da una fusione del dopoguerra, il "Baciccia" che fuma la pipa. Lo scudetto della banda più romantica dei primi anni Novanta, arrivata a un rigore dal tetto d’Europa.',
  },
  'Verona Gialloblù': {
    founded: 1903,
    story:
      'La favola provinciale per eccellenza: a metà anni Ottanta uno scudetto che nessun algoritmo avrebbe previsto, vinto con undici operai del pallone. Il Bentegodi, la scala di Cangrande, il gialloblù degli Scaligeri.',
  },
  'Udine Bianconeri': {
    founded: 1896,
    story:
      'Tra i più antichi d’Italia, il piccolo grande Friuli. Le Zebrette: mercati geniali ai quattro angoli del pianeta, talenti scovati prima di tutti e rivenduti a peso d’oro, senza mai perdere la faccia.',
  },
  'Cagliari Rossoblù': {
    founded: 1920,
    story:
      'L’isola che si prese uno scudetto storico a cavallo dei Settanta, trascinata dal più elegante e silenzioso dei bomber. I Quattro Mori sul petto, un popolo intero dietro un’unica squadra.',
  },
  'Parma Crociati': {
    founded: 1913,
    story:
      'La provinciale che negli anni Novanta comprò l’Europa: coppe internazionali in serie, fuoriclasse a ogni reparto, poi il crac che azzerò tutto e la risalita dai dilettanti. La croce sul petto non è mai cambiata.',
  },
  'Lecce Giallorossi': {
    founded: 1908,
    story:
      'Il Salento in Serie A: il sole del Via del Mare, un pubblico da categoria superiore e la dignità di chi sale e scende senza mai snaturarsi. Lupi giallorossi del tacco d’Italia.',
  },
  'Empoli Azzurri': {
    founded: 1920,
    story:
      'Il paese-bottega della Toscana: vivaio, idee e conti in ordine. La A conquistata più volte con un decimo dei soldi degli altri, e mezza Serie A che viene qui a far la spesa di talenti.',
  },
  'Monza Biancorossi': {
    founded: 1912,
    story:
      'Un secolo intero a sognare dalla B, nobile provincia della Brianza tra autodromo e Villa Reale. Poi la scalata recente che l’ha portata dove non era mai stata: la massima serie.',
  },
  'Como Azzurri': {
    founded: 1907,
    story:
      'Il lago, il Sinigaglia in riva all’acqua: lo stadio più scenografico d’Italia. Un secolo di ascensore tra le categorie con l’eleganza di chi non ha bisogno di alzare la voce.',
  },
  // ---------------------------------------------------------------- Serie B
  'Palermo Rosanero': {
    founded: 1900,
    story:
      'Il rosa e il nero "del dolce e dell’amaro", come scrissero i fondatori. La Favorita piena, stagioni di A da protagonisti e una tradizione di fantasisti sudamericani lanciati verso il mondo.',
  },
  'Bari Biancorossi': {
    founded: 1908,
    story:
      'Il Galletto e l’astronave bianca sul Mediterraneo, regalo di un mondiale. Piazza calda del Sud, ascensore storico tra A e B con un pubblico che non manca mai.',
  },
  'Salerno Granata': {
    founded: 1919,
    story:
      'Il cavalluccio marino, l’Arechi pieno anche nelle stagioni più amare. Granata come la passione di una città che al calcio non ha mai chiesto il permesso.',
  },
  'Perugia Biancorossi': {
    founded: 1905,
    story:
      'Il Grifo. La squadra dei miracoli di fine anni Settanta: un campionato intero senza mai perdere — e senza vincerlo, beffa unica nella storia. Curva Nord e testardaggine umbra.',
  },
  'Brescia Biancazzurri': {
    founded: 1911,
    story:
      'La Leonessa d’Italia. Qui un fantasista col codino scelse di chiudere la carriera, regalando alla provincia le domeniche più belle della sua storia. La V bianca sul petto azzurro.',
  },
  'Venezia Arancioneroverdi': {
    founded: 1907,
    story:
      'I colori della laguna e uno stadio che si raggiunge in barca, tra i più antichi d’Italia. Il calcio più scenografico del mondo: quando sale l’acqua alta, si gioca lo stesso.',
  },
  'Modena Gialloblù': {
    founded: 1912,
    story:
      'I Canarini della terra dei motori: gente concreta, gioca-corri-taci. Il Braglia è un fortino e la B una seconda casa da cui ogni tanto si evade verso l’alto.',
  },
  'Cremona Grigiorossi': {
    founded: 1903,
    story:
      'La provincia del violino e del torrone: grigiorossa, testarda, con lo Zini attaccato alla città. Ogni tanto sale in A a fare danni, sempre con le proprie idee.',
  },
  'Pescara Biancazzurri': {
    founded: 1936,
    story:
      'Il Delfino dell’Adriatico. Qui un profeta boemo del calcio champagne iniziò a stupire l’Italia: tre punte, pressing e nessuna paura. L’estate, il mare e la A da inseguire.',
  },
  'Catania Rossazzurri': {
    founded: 1946,
    story:
      '"Clamoroso al Cibali!": l’urlo radiofonico più famoso del calcio italiano è nato qui, quando l’Elefante fece cadere i giganti del Nord. Rossazzurri sotto il vulcano.',
  },
  'Cosenza Rossoblù': {
    founded: 1912,
    story:
      'I Lupi della Sila: la B più romantica e ruvida, un tifo da categoria superiore e una città che vive il San Vito come una liturgia del venerdì sera.',
  },
  'Terni Rossoverdi': {
    founded: 1925,
    story:
      'Le Fere: rossoverdi come nessun altro in Italia, i colori dell’acciaio e delle cascate. Città operaia, curva ribollente, due apparizioni in A difese coi denti.',
  },
  'Cesena Bianconeri': {
    founded: 1940,
    story:
      'Il Cavalluccio della Romagna: bianconeri di provincia capaci, da neopromossi, di affacciarsi perfino all’Europa. La Fiorita prima, il Manuzzi poi: sempre pieni.',
  },
  'Ascoli Bianconeri': {
    founded: 1898,
    story:
      'Il Picchio: la provinciale d’assalto degli anni Ottanta che al Del Duca metteva sotto chiunque. Bianconero di marca picena, gestioni vulcaniche e memorabili.',
  },
  'Pisa Nerazzurri': {
    founded: 1909,
    story:
      'Nerazzurri di mare all’ombra della Torre: l’Arena Garibaldi è una bolgia d’altri tempi e il derby coi cugini labronici è tra i più sentiti d’Italia. Presidenze pittoresche, cuore grande.',
  },
  'Livorno Amaranto': {
    founded: 1915,
    story:
      'Amaranto come nessuno al mondo, il porto e una curva che ha sempre mescolato calcio e ideali. Triglie orgogliose: quando risalgono, tutta la Toscana se ne accorge.',
  },
  'Spezia Bianchi': {
    founded: 1906,
    story:
      'Gli Aquilotti del Golfo dei Poeti: un titolo vinto in tempo di guerra che il calcio ufficiale impiegò decenni a riconoscere, e la prima storica promozione tra i grandi strappata ai giganti.',
  },
  'Padova Biancoscudati': {
    founded: 1910,
    story:
      'Lo scudo bianco della città del Santo. Anni Cinquanta d’oro con un mago triestino in panchina e un terzo posto che sapeva di scudetto. All’Euganeo si vive di attese e di memoria.',
  },
  'Vicenza Biancorossi': {
    founded: 1902,
    story:
      'Il Lane, la provincia tessile: un secondo posto leggendario negli anni Settanta trascinato da un bomber di paese, e una coppa nazionale alzata da matricola. Biancorossi col cuore oltre l’ostacolo.',
  },
  'Foggia Rossoneri': {
    founded: 1920,
    story:
      'Qui un boemo col sigaro inventò il calcio più spericolato d’Italia: tre punte, difesa altissima, gol a grappoli — e lo Zaccheria divenne un luna park. Rossoneri di Capitanata, per sempre "quella" Foggia.',
  },
  // ------------------------------------------------------------ Premier League
  'Londra Reds': {
    founded: 1886,
    story:
      'Nati tra gli operai di un arsenale reale a sud del Tamigi, poi migrati a nord della città. I Gunners del cannone sul petto: un’intera stagione da imbattuti entrata nella leggenda, e il calcio più elegante d’Inghilterra.',
  },
  'Londra Blues': {
    founded: 1905,
    story:
      'Fondati in un pub a due passi dallo stadio, nell’ovest dei quartieri buoni. Per decenni nobile eccentrica, poi il nuovo millennio li ha trasformati in potenza globale: coppe d’Europa comprese.',
  },
  'Londra Whites': {
    founded: 1882,
    story:
      'Il gallo appollaiato sul pallone e il bianco candido del nord di Londra. "Osare è fare": il primo double inglese del Novecento porta la loro firma, e il derby coi Reds del nord è una guerra di religione.',
  },
  'Londra Claret': {
    founded: 1895,
    story:
      'Nati tra i cantieri navali dell’East End: i martelli incrociati sul petto lo ricordano ancora. L’accademia che forgiò la spina dorsale dei campioni del mondo del ’66, e un popolo che canta le bolle di sapone.',
  },
  'Manchester Reds': {
    founded: 1878,
    story:
      'Fondati dai ferrovieri, diventati il club più famoso del mondo. La tragedia aerea che spezzò i "ragazzi" più belli d’Europa, la rinascita fino al trono continentale, un tecnico scozzese che vinse per un quarto di secolo. Il Teatro dei Sogni.',
  },
  'Manchester Sky Blues': {
    founded: 1880,
    story:
      'L’azzurro cielo dell’altra metà della città: decenni di ombra e autoironia da "tipico City", poi il nuovo secolo li ha resi la macchina più perfetta d’Europa, con un filosofo catalano alla lavagna.',
  },
  'Liverpool Reds': {
    founded: 1892,
    story:
      '"You’ll Never Walk Alone": la Kop che canta, le notti europee in rimonta impossibile, più coppe dei campioni di qualunque altro club inglese. Qui l’allenatore è un profeta e il calcio una fede.',
  },
  'Liverpool Royal Blues': {
    founded: 1878,
    story:
      'Il blu reale della "Scuola di Scienza", il club-popolo dell’altra sponda dello Stanley Park. Nove titoli, un’anima operaia e il derby più fraterno e crudele d’Inghilterra.',
  },
  'Newcastle Black & Whites': {
    founded: 1892,
    story:
      'Le Gazze del Tyne: cinquantamila cuori ogni sabato da generazioni, per una fede che non ha mai preteso trofei in cambio. Quando St James’ ruggisce, si sente da tutto il nord-est.',
  },
  'Birmingham Claret': {
    founded: 1874,
    story:
      'Tra i fondatori della prima lega calcistica della storia. Claret e azzurro dei Villans: sette titoli d’epoca vittoriana e un trono d’Europa conquistato a sorpresa negli anni Ottanta.',
  },
  'Birmingham Blues': {
    founded: 1875,
    story:
      'I Blues della seconda città: eterni rivali in ombra dei cugini claret, derby tra i più cattivi d’Inghilterra e un inno rubato a una canzone da music-hall: "Keep Right On".',
  },
  'Leeds Whites': {
    founded: 1919,
    story:
      'Il bianco voluto da un condottiero che sognava di farne il Real dello Yorkshire. Squadra durissima e geniale degli anni Settanta: amati, odiati, mai ignorati. "Marching On Together".',
  },
  'Nottingham Reds': {
    founded: 1865,
    story:
      'Il rosso garibaldino scelto in onore dell’eroe italiano — tra i club più antichi del pianeta. Con un allenatore geniale e spavaldo passarono da provinciale a due volte campioni d’Europa in due anni: il miracolo più grande del calcio.',
  },
  'Leicester Blues': {
    founded: 1884,
    story:
      'Le Volpi: la favola del titolo impossibile, vinto da outsider quotati cinquemila a uno, che fece innamorare il mondo intero. La provincia inglese che per una stagione fu regina.',
  },
  'Southampton Red & Whites': {
    founded: 1885,
    story:
      'I Santi del porto: strisce rosse e bianche e un’accademia leggendaria che ha regalato fuoriclasse a mezza Premier. Una FA Cup vinta da sfavoriti nel 1976 che la città festeggia ancora.',
  },
  'Brighton Blue & Whites': {
    founded: 1901,
    story:
      'I Gabbiani: dal quasi-fallimento e dallo stadio perduto — anni a giocare in prestito lontano da casa — alla Premier stabile col calcio più coraggioso della costa sud.',
  },
  'Sheffield Reds': {
    founded: 1889,
    story:
      'Le Lame della città dell’acciaio, dove il calcio organizzato è nato prima che altrove. Bramall Lane è il grande stadio più antico del mondo ancora in attività. Rosso operaio, orgoglio tagliente.',
  },
  'Norwich Yellows': {
    founded: 1902,
    story:
      'I Canarini dell’Anglia: giallo e verde unici nel calcio inglese e "On the Ball, City", l’inno più antico del calcio mondiale, cantato da prima ancora che il club esistesse.',
  },
  'Wolverhampton Old Golds': {
    founded: 1877,
    story:
      'L’oro antico dei Lupi: negli anni Cinquanta sfidarono sotto i riflettori le migliori squadre d’Europa in amichevoli notturne leggendarie — di fatto inventando l’idea delle coppe europee.',
  },
  'Bournemouth Cherry Reds': {
    founded: 1899,
    story:
      'Le Ciliegie della costa: dal quasi-fallimento in quarta serie, con la squadra salvata dai tifosi, alla Premier. La scalata più dolce e improbabile del calcio inglese moderno.',
  },
  // ------------------------------------------------------------- Championship
  'Londra Hoops': {
    founded: 1882,
    story:
      'I cerchi bianco-blu dell’ovest popolare: i Rangers di quartiere, gloriosi e squattrinati, con un secondo posto d’epoca e un piccolo stadio incastrato tra le case che è un gioiello.',
  },
  'Sheffield Blues': {
    founded: 1867,
    story:
      'I Gufi: tra i club più antichi del mondo, l’altra metà della città dell’acciaio. Quattro titoli d’anteguerra, Hillsborough e una rivalità cittadina che divide le famiglie a tavola.',
  },
  'Sunderland Red & Whites': {
    founded: 1879,
    story:
      'I Gatti Neri del Wearside: sei titoli tra Ottocento e anteguerra, e una FA Cup del 1973 vinta da sfavoriti assoluti che l’Inghilterra ricorda come la più grande sorpresa della sua storia.',
  },
  'Portsmouth Blue & Golds': {
    founded: 1898,
    story:
      'Il Pompey della marina: la campana che suona a ogni gol, due titoli a cavallo della guerra e il Fratton Park che è rimasto com’era — per fortuna di chi ama il calcio vero.',
  },
  'Bristol Reds': {
    founded: 1894,
    story:
      'I Pettirossi dell’ovest: porto, sidro e un secondo posto di inizio Novecento che è insieme vanto e tormento. Da un secolo sognano di riportare la città nella massima serie.',
  },
  'Coventry Sky Blues': {
    founded: 1883,
    story:
      'Gli azzurro-cielo della città delle automobili: una FA Cup indimenticabile a fine anni Ottanta, vinta in una delle finali più belle di sempre, e la "Sky Blue Song" cantata da generazioni.',
  },
  'Stoke Red Stripes': {
    founded: 1863,
    story:
      'Tra i professionisti più antichi del mondo: i Vasai delle ceramiche. Il loro stadio è la prova del nove del calcio inglese: "ma saprebbe farlo in una fredda notte di pioggia a Stoke?"',
  },
  'Burnley Clarets': {
    founded: 1882,
    story:
      'Il claret del Lancashire: una cittadina di settantamila anime tra le fondatrici della Football League, due titoli veri e la capacità periodica di far tribolare i giganti a Turf Moor.',
  },
  'Blackburn Blue & Whites': {
    founded: 1875,
    story:
      'I Rovers: un titolo di Premier strappato ai giganti a metà anni Novanta, costruito dai soldi di un acciaiere innamorato del suo club e dai gol di una coppia d’attacco leggendaria.',
  },
  'Bolton Whites': {
    founded: 1874,
    story:
      'I Vagabondi: quattro FA Cup e la storica "finale del cavallo bianco" che inaugurò Wembley davanti a duecentomila persone. Bianco operaio del Lancashire profondo.',
  },
  'Preston Lilywhites': {
    founded: 1880,
    story:
      'I Gigli Bianchi: gli "Invincibili" originali. Vinsero il primo campionato inglese della storia senza perdere una partita e la coppa senza subire gol. Tutto il calcio viene un po’ da qui.',
  },
  'Hull Amber & Blacks': {
    founded: 1904,
    story:
      'Le Tigri dell’Humber: ambra e nero come nessun altro, un porto di pescatori che ha aspettato la massima serie per oltre un secolo — e quando è arrivata, ha sfiorato perfino una coppa.',
  },
  'Middlesbrough Reds': {
    founded: 1876,
    story:
      'Il Boro dell’acciaio: una coppa di lega alzata dopo centoventotto anni di attesa, una finale europea raggiunta con due rimonte impossibili, e il Riverside a un passo dai cantieri.',
  },
  'Derby Black & Whites': {
    founded: 1884,
    story:
      'I Montoni: due titoli negli anni Settanta con in panchina il più geniale e spavaldo degli allenatori inglesi, quello che diceva di essere "nella top one" dei migliori. Bianconero delle Midlands.',
  },
  'Ipswich Blues': {
    founded: 1878,
    story:
      'Il Trattore dell’Anglia: un titolo inglese vinto al primo colpo da neopromossi, una coppa UEFA con due olandesi volanti a centrocampo, e due allenatori partiti da qui per guidare la nazionale.',
  },
  'Watford Yellows': {
    founded: 1881,
    story:
      'I Calabroni: dalla quarta serie al secondo posto d’Inghilterra in quattro anni, spinti da un presidente rockstar che amava il club più dei suoi dischi. Giallo che punge.',
  },
  'Luton Oranges': {
    founded: 1885,
    story:
      'I Cappellai: hanno percorso tutta la piramide inglese, dal non-league alla Premier, due volte, con uno stadio incastrato tra le villette a schiera in cui si entra letteralmente da un vicolo. La resurrezione più incredibile del calcio.',
  },
  'Reading Blue Hoops': {
    founded: 1871,
    story:
      'I Reali del Berkshire: cerchi blu e bianchi e un campionato di seconda serie vinto con un record di punti che resiste ancora. Centocinquant’anni di dignità a un’ora da Londra.',
  },
  'Plymouth Greens': {
    founded: 1886,
    story:
      'I Pellegrini: il verde Argyle unico in Inghilterra, il club più a sud-ovest del Paese e le trasferte più lunghe del calcio inglese. Il Mayflower salpò da qui, e in curva non l’hanno dimenticato.',
  },
  'Barnsley Reds': {
    founded: 1887,
    story:
      'Lo Yorkshire minerario in rosso: una FA Cup d’anteguerra vinta a suon di replay e la promozione cantata da tutto il paese con "it’s just like watching Brazil". Ironia e carbone.',
  },
};
