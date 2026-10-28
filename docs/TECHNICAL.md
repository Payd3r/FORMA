# FORMA

Diario personale senza login: React, TypeScript, Vite, IndexedDB e API Express/SQLite. UI adattiva con sidebar desktop e navigazione mobile, tema chiaro fisso, schede modificabili, carichi precedenti, serie confermate, storico per esercizio e confronti a parità di ripetizioni. Nessun servizio AI.

## Sviluppo

Richiede Node 20.19+ oppure Node 22.12+.

```bash
npm ci
npm ci --prefix server
npm run dev --prefix server
```

In un altro terminale, `npm run dev`. Vite espone l’app su `http://localhost:5173` e inoltra `/api` alla porta 3001. L’API usa `data/fitness.db` rispetto alla directory corrente del processo: specificare sempre `DB_PATH` quando si usa un database esistente. Esempio, dalla radice:

```bash
DB_PATH="$PWD/server/data/fitness.db" npm run dev --prefix server
```

`.env.example` documenta l’override facoltativo `VITE_API_URL`; `FITNESS_DEV_API_TARGET` cambia soltanto il proxy di sviluppo.

## Dati e cambio scheda

La scheda ottobre 2026 è predefinita; quella precedente è archiviata e rimane consultabile. Ogni nuova sessione conserva una copia del giorno, degli esercizi e dei target. Gli esercizi invariati condividono lo storico anche fra giorni e schede; le varianti hanno ID diversi e non ereditano automaticamente carichi non confrontabili. Un carico registrato con meno ripetizioni del nuovo target non viene riproposto alla cieca.

Da **Schede** si possono creare, duplicare, modificare e attivare programmi, scegliendo se mantenere la continuità dei carichi o ripartire con campi vuoti. La scelta non cancella lo storico. Da una sessione si possono sostituire e aggiungere esercizi per la sola seduta oppure anche nella scheda. Le modifiche a una scheda non cambiano le sessioni già iniziate.

La rampa curl è 10/8/6/4/6/8/10, con offset kg 0/2/4/6/4/2/0. Il push down permette uno scalo registrato separatamente. Le assunzioni sui target mancanti sono indicate nella scheda e modificabili.

Le proposte non sono serie eseguite: serve la conferma. Solo le serie confermate alimentano i progressi. Le sessioni completate della vecchia versione, prive di flag, rimangono leggibili come storico. Le sedute vecchie senza snapshot vengono visualizzate usando il programma originale archiviato.

## Sincronizzazione e backup

L’app si apre leggendo IndexedDB, senza aspettare il server. Ogni modifica salva sessione e operazione da inviare nella stessa transazione; l’outbox conserva l’ultima operazione per elemento. Una sola sincronizzazione alla volta, retry al ritorno online/in primo piano e controlli periodici. Le cancellazioni hanno tombstone e si propagano agli altri dispositivi. Schede e relativi target vengono sincronizzati.

La risoluzione dei conflitti è per sessione, con timestamp: prevale l’ultima versione; non è un editor collaborativo di singole serie. Evitare modifiche simultanee alla stessa seduta da dispositivi diversi. L’interfaccia mostra modifiche pendenti, offline e server non raggiungibile.

**Preferenze** consente esportazione di sedute/schede e importazione con validazione. L’importazione aggiunge gli elementi mancanti senza sovrascrivere quelli esistenti; eventuali sedute importate in corso vengono archiviate, mantenendo i flag di conferma.

## PWA e aggiornamenti

La build precachea interfaccia e schermate per l’uso offline. La scoperta di un nuovo service worker mostra un modal: **Aggiorna adesso** attende il salvataggio locale, attiva la nuova versione e ricarica. Si può rimandare e riaprire l’avviso dall’intestazione. Il controllo avviene anche al ritorno nell’app e ogni ora; è disponibile il comando manuale in Preferenze.

Il modal è disponibile dalla nuova versione in avanti. Per passare dalla vecchia PWA, che non contiene ancora questo avviso, può servire una prima riapertura/ricarica dopo la pubblicazione. Service worker richiedono HTTPS o localhost.

## Verifica

```bash
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

I test browser costruiscono la PWA reale e usano una copia separata del database in `/tmp/forma-playwright.db`. Coprono registrazione, virgola decimale, conferma, rampa, scalo, sostituzioni, schede, migrazione IndexedDB v2, offline, backup, concorrenza dell’outbox, sincronizzazione fra dispositivi e aggiornamento reale del service worker. Il database personale in `server/data` non viene modificato dai test.

## Produzione

Ricostruire **sia frontend sia API**: la versione 2 aggiunge snapshot, impostazioni e tombstone. Il volume SQLite esistente va mantenuto; il backend aggiunge le colonne e tabelle mancanti senza eliminare sedute. La migrazione aggiunge nome e snapshot della scheda originale alle sedute precedenti, lasciando invariati tutti i campi preesistenti, incluso `updatedAt`, per non scartare modifiche ancora offline. Le scritture dai vecchi client ricevono automaticamente gli stessi metadati. La libreria di schede viene inizializzata sul server solo se assente.

```bash
docker compose build fitness-web fitness-api
docker compose up -d fitness-web fitness-api
```

Nginx serve `sw.js`, HTML e manifest con cache rivalidabile, e gli asset con hash con cache persistente. L’installazione rimane personale senza autenticazione: l’accesso dipende dalla rete/proxy su cui viene esposta. Le route service-to-service esistenti mantengono il loro token separato.


## Esperienza sessione e recupero

La sessione in corso mostra un solo esercizio. Lo stepper permette navigazione libera, con indicazione delle serie confermate; **Ordine esercizi** cambia l’ordine senza modificare valori o conferme. Il dispositivo ricorda l’esercizio aperto. Le sedute archiviate restano consultabili per intero.

Alla conferma di una serie normale parte il recupero. Il timer conserva una scadenza assoluta in locale, quindi continua correttamente in background e dopo il reload. Si possono aggiungere 30 secondi o saltare il riposo; a timer terminato il pulsante **Inizia serie** registra la fine esplicita del recupero. Solo durate esplicitamente terminate fra 30 e 600 secondi possono essere osservazioni. Non viene scambiato l’intervallo fra due conferme (che include il tempo della serie) per tempo di riposo.

Il tempo proposto usa prima l’eventuale nota di recupero della scheda. Altrimenti servono almeno tre campioni storici dello stesso esercizio, con modalità di carico, target e pesi confrontabili; la serie successiva deve aver raggiunto il proprio target archiviato. Si usa la mediana, limitata a 45–300 secondi. In mancanza di campioni si usa una base esplicita per movimento e target, con 15 secondi aggiuntivi dopo un target mancato. Si tratta di un riferimento modificabile, non di una misura fisiologica.

La mappa **Recupero stimato** rappresenta l’esposizione muscolare recente: serie confermate, contributi secondari ridotti, scali come mezze serie, ultimi 56 giorni, riferimento alla mediana dei giorni personali registrati. Il decadimento di 24 ore è una costante del modello di visualizzazione e non una promessa sul tempo di recupero biologico. Non si inferiscono sonno, dolore, RPE o stato di salute. I dati vecchi senza timestamp della serie usano la data della seduta con attendibilità ridotta. La mappa non ordina gli allenamenti né cambia i carichi.

Le illustrazioni di esercizi e mappa corporea sono SVG custom inclusi nell’app, senza richieste a CDN o servizi AI. Identità FORMA maiuscola e tema chiaro fisso; la vecchia preferenza scura viene ignorata. Roadmap e criteri in `docs/ROADMAP-FORMA.md`.


## Bottom sheet

I dialoghi condivisi usano un bottom sheet in top layer nativo: intestazione e footer restano fissi, il contenuto centrale scorre con overscroll contenuto. Un lock con contatore blocca il documento retrostante e ripristina la posizione alla chiusura anche con più fogli sovrapposti. Il foglio segue `visualViewport` per lasciare le azioni visibili quando si apre la tastiera.

Lo swipe verticale verso il basso può chiudere da qualsiasi area non di editing: all’inizio del movimento si verifica se un antenato può scorrere nella direzione richiesta. Se sì, l’intero gesto resta scroll interno, senza trasformarsi in chiusura al raggiungimento del bordo. Un nuovo gesto verso il basso dalla cima può chiudere. Input, textarea e select mantengono le proprie interazioni; richieste asincrone in corso impediscono la chiusura. Supportati Escape, focus nativo, pulsante Chiudi e preferenza di movimento ridotto.

La nuova icona kettlebell/F è un SVG locale, con favicon SVG/PNG/ICO e varianti PWA normali e maskable. I file hanno nomi nuovi per evitare la vecchia cache immutable. Il cambio tab riporta in alto, anche quando viene riselezionato il tab corrente.

Tutti i flussi applicativi (conferme, selezione esercizi, storico, importazione e aggiornamento) condividono `BottomSheet.tsx`; i vecchi componenti e gli stili modal sono rimossi. L’intestazione non ha una X: chiusura dal footer, dal gesto, da Escape o dal backdrop. Il backdrop copre oltre i bordi del viewport; durante l’apertura vengono coordinati colore del documento e `theme-color`, poi ripristinati, per evitare una fascia chiara sopra la PWA. La configurazione iOS usa `viewport-fit=cover` e status bar traslucida.
