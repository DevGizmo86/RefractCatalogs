# RefractCatalogs

Addon **Stremio / Nuvio** che trasforma le liste pubbliche di [Refract](https://getrefract.app/) in cataloghi di film e serie TV. Versione: **0.1.2**.

## Configurazione

1. Apri `/configure` dopo aver avviato il server.
2. Incolla un link pubblico Refract e premi **Aggiungi lista**: viene creata una nuova riga e verificata la lista.
3. Aggiungi altre liste (massimo 30). Ogni riga offre un nome opzionale, la scelta **Film e serie TV / Solo film / Solo serie TV**, pulsanti **↑ / ↓** e **×** per eliminare la riga.
4. Facoltativamente, inserisci la tua **chiave TMDB API v3** nel campo dedicato. Ha priorità sulla chiave del server e viene ripristinata riaprendo la configurazione. Premi **Genera cataloghi**. Usa **Installa su Stremio** oppure **Copia link manifest per Nuvio** e incollalo nella gestione Addon di Nuvio.
5. Il link **Riapri questa configurazione** ripristina tutte le righe nel loro ordine. Anche il pulsante Configura dell'addon apre `/<config>/configure`.

L'aspetto della pagina riprende [DubbedAnimeFeed](https://github.com/DevGizmo86/DubbedAnimeFeed), esaminato al commit `b79ca5c`: pannello scuro sopra uno sfondo viola, installazione Stremio, copia manifest e firma/supporto DevGizmo. L'editor dinamico delle liste è nuovo.

### Liste miste

La pagina pubblica Refract restituisce titolo, anno e locandina per ogni elemento, ma attualmente **non specifica il tipo né gli ID IMDb/TMDB**. L'addon identifica i titoli tramite l'autocompletamento pubblico IMDb, con Cinemeta come alternativa, e distingue il tipo dalla corrispondenza ottenuta. Una riga impostata su **Film e serie TV** espone due cataloghi consecutivi:

- `Nome lista · Film`
- `Nome lista · Serie TV`

Questo mantiene cataloghi omogenei compatibili con entrambe le app. L'ordine relativo dei film e delle serie segue quello della lista Refract. Se una lista contiene solo film, scegliere **Solo film** evita un catalogo serie vuoto e la scansione dell'intera lista per trovare eventuali serie.

La separazione delle liste miste è coperta da test con dati controllati; i link pubblici usati nella verifica live iniziale contengono film. Non è stata ancora verificata una lista pubblica Refract realmente mista. L'addon supporta entrambi i tipi, ma un titolo ambiguo o non presente nei metadati può essere escluso.

### Aggiornamenti

- **Aggiunte/rimozioni di titoli nella stessa lista**: recepite alla scadenza della cache di 30 minuti, oltre all'eventuale cache del client.
- **Aggiunte/rimozioni/riordino di liste o modifica dei tipi**: genera un nuovo link e aggiorna/reinstalla l'addon. L'ordine del manifest segue quello delle righe; l'ordinamento globale della home dipende anche dal client.
- La configurazione è contenuta nel link (Base64URL, **non cifrata**): include link pubblici, modalità, nomi e, se inserita, la chiave TMDB personale. **Non condividere i link del manifest o di configurazione che contengono la tua chiave**. Anche server e client che gestiscono il link possono leggerla.
- La scoperta automatica delle liste tramite username non è inclusa in questa versione.

## Avvio

Richiede **Node.js 22 o superiore**.

```bash
npm ci
npm start
```

Apri `http://localhost:7000/configure`. Per lo sviluppo: `npm run dev`.

| Variabile | Default | Scopo |
| --- | --- | --- |
| `PORT` | `7000` | Porta del server |
| `PUBLIC_URL` | Origine della richiesta | Origine HTTPS canonica dietro reverse proxy |
| `TMDB_API_KEY` | Assente | Matching aggiuntivo, anche tramite locandina, e metadati italiani |

Copia `.env.example` in `.env` se vuoi personalizzarle. La variabile `TMDB_API_KEY` è facoltativa, rimane **sul server** ed è ignorata da Git. La chiave personale inserita nella pagina ha priorità sulla variabile ed è contenuta nel link. Lascia il campo vuoto per rimuoverla e tornare alla chiave del server. Una chiave rifiutata da TMDB attiva il fallback IMDb/Cinemeta; le cache dei cataloghi e dei mapping sono separate per chiave. Senza chiave l'addon usa IMDb/Cinemeta. La localizzazione italiana dei metadati è disponibile solo quando viene usato un risultato TMDB; le schede complete sono fornite da Cinemeta.

## Identificativi, schede e riproduzione

Il resolver usa titolo e anno, rifiuta corrispondenze ambigue e conserva gli ID IMDb (`tt...`). Con TMDB può usare la locandina come prova aggiuntiva e converte gli ID TMDB in IMDb tramite `external_ids`. Non sceglie automaticamente il primo risultato di ricerca.

L'addon fornisce `catalog` e `meta`; le schede complete e gli episodi sono letti da Cinemeta. Gli addon di streaming già installati ricevono i normali ID IMDb. RefractCatalogs non fornisce stream e non sincronizza il progresso di visione verso Refract.

## Limiti e prestazioni

- Dipende dalla struttura HTML delle pagine pubbliche Refract. Non richiede login né usa API private.
- Il servizio di autocompletamento IMDb è accessibile senza login ma non è un'API con contratto pubblico: eventuali cambiamenti richiederanno aggiornamenti. Cinemeta è l'alternativa e fornisce le schede.
- Controlla che il numero di elementi estratti corrisponda a quello dichiarato dalla pagina: una lista troncata o una struttura cambiata produce un errore esplicito.
- I titoli senza corrispondenza sicura vengono esclusi e il numero viene segnalato nei log. Non possono essere associati con certezza a fonti di riproduzione.
- Pagine di **20 risultati**, ricerca interna, deduplica per tipo/IMDb, cache dei mapping e limite globale di otto richieste remote simultanee. Il resolver procede lungo la lista solo quanto serve per riempire la pagina; film e serie condividono i risultati risolti.
- La prima lettura di un catalogo e le ricerche su liste grandi possono essere lente, soprattutto se la lista contiene pochi elementi del tipo richiesto. I mapping rimangono in memoria per sette giorni (30 minuti per titoli non risolti), fino al riavvio o all'espulsione dalla cache.
- La cache è in memoria e limitata; questa prima versione non richiede un database.
- Sono consentiti solo URL HTTPS del dominio esatto `getrefract.app` e del percorso `/list/...`; redirect remoti non vengono seguiti.

## Verifiche

```bash
npm run check
npm test
npm run test:live
```

I test offline verificano l'editor (aggiunta, eliminazione, frecce e riapertura), configurazione/ordine, URL, parsing completo, liste miste, omonimi, errori temporanei, paginazione e endpoint HTTP. La verifica live usa Spooktober 2026 e Top 250 Movies (250 elementi), le prime due pagine della Top 250 e la scheda di Breaking Bad con episodi. I conteggi del controllo live possono cambiare se le liste pubbliche vengono modificate. GitHub Actions esegue i controlli offline a ogni push/PR.

## Hosting

È necessario un server raggiungibile in HTTPS per installarlo da altri dispositivi. Il repository contiene un `Procfile` compatibile con hosting Node/Beamup e un Dockerfile fuori dalla root, come DubbedAnimeFeed, per evitare che Beamup scelga il buildpack Docker.

```bash
docker build -f docker/Dockerfile -t refractcatalogs .
docker run --rm -p 7000:7000 refractcatalogs
```

Per Beamup crea un'app **separata** da DubbedAnimeFeed tramite [beamup-cli](https://github.com/Stremio/stremio-beamup), registra il remote restituito e pubblica con `git push beamup main:master` (destinazione predefinita della CLI Beamup). Non riutilizzare il remote dell'altro addon. Il repository non contiene credenziali. Per automatizzare il deploy, configura la workflow descritta sotto.

## Deploy automatico su tag

La workflow `.github/workflows/deploy-beamup.yml` pubblica su Beamup a ogni push di un tag stabile `vMAJOR.MINOR.PATCH`, per esempio `v0.1.1`. Prima verifica che il tag punti al commit corrente di `main`, che la versione corrisponda a `package.json` e `package-lock.json`, e che sintassi e test passino. Pubblica esattamente il commit del tag, senza push forzati. Le pubblicazioni vengono serializzate.

Crea prima l'app Beamup `refractcatalogs` dalla cartella del progetto. In **Settings → Secrets and variables → Actions → New repository secret**, aggiungi:

| Secret | Valore |
| --- | --- |
| `BEAMUP_REMOTE` | L'output di `git remote get-url beamup` dalla cartella **RefractCatalogs**; termina con `/refractcatalogs` se hai usato quel nome |
| `BEAMUP_SSH_PRIVATE_KEY` | Il contenuto completo della chiave privata SSH autorizzata per il tuo account Beamup |
| `BEAMUP_SSH_KNOWN_HOSTS` | La riga del server `a.baby-beamup.club` nel tuo file SSH `known_hosts` |

Puoi riutilizzare chiave e riga `known_hosts` già usate per DubbedAnimeFeed se sono quelle dello stesso server/account. Il remote deve invece essere quello di **RefractCatalogs**. La chiave deve essere utilizzabile senza passphrase per il deploy non interattivo. In PowerShell, dopo una connessione SSH verificata al server, recupera la riga con:

```powershell
ssh-keygen -F a.baby-beamup.club -f "$env:USERPROFILE\.ssh\known_hosts"
```

La workflow usa il ramo remoto `master`, come la CLI Beamup. Se la tua app usa `main`, aggiungi la **repository variable** `BEAMUP_BRANCH` con valore `main` nella scheda Variables. Non impostare questa variabile al nome dell'app.

Per pubblicare la versione attuale dopo aver configurato i secret:

```powershell
git pull origin main
git tag v0.1.1
git push origin v0.1.1
```

Per una nuova versione, aggiorna prima entrambi i file con `npm version 0.1.2 --no-git-tag-version`, committa e pubblica le modifiche su `main`, poi crea e pubblica il tag `v0.1.2`. L'esito del deploy è nella scheda **Actions → Deploy to Beamup**. I tag già esistenti non vengono ripubblicati automaticamente dopo l'aggiunta della workflow. Una run fallita per secret mancanti può essere rieseguita da Actions dopo averli impostati.

## Fonti

- [Protocollo addon Stremio](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md)
- [Cataloghi e uso di Cinemeta](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/advanced.md)
- [Nuvio](https://github.com/NuvioMedia/NuvioMobile)

Non affiliato a Refract, Stremio o Nuvio. Metadati e locandine appartengono ai rispettivi titolari. MIT — DevGizmo86.
