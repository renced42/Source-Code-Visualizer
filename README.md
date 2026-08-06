# Source Code Visualizer

Adatbázis nélküli Spring Boot prototípus Java webalkalmazások teljes forráskódjának kapcsolati feltérképezésére.

## Jelenlegi funkciók

- ZIP projektfeltöltés és Zip Slip elleni védelem
- build, target, node_modules, .git és hasonló könyvtárak kizárása
- Java AST elemzés JavaParserrel
- JavaScript/TypeScript import, függvény, REST-hívás és DOM-selector felismerés
- HTML script, stylesheet, form action, id és class felismerés
- CSS selector és @import felismerés
- egységes, memóriában kezelt gráfmodell
- interaktív SVG gráf, keresés, típusszűrés és közvetlen kapcsolatok
- nincs adatbázis, nincs JAR vagy CLASS elemzés

## Indítás

Követelmény: Java 21 és Maven.

```bash
mvn spring-boot:run
```

Ezután: `http://localhost:8080`

## Következő fejlesztési lépések

- pontosabb Java szimbólumfeloldás projektforrásból
- relatív JS/TS importok tényleges fájlhoz kötése
- REST URL-ek normalizálása és Spring endpointok összerendelése
- Thymeleaf attribútumok feldolgozása
- fájl- és könyvtárszintű összecsukható klaszterek
- útvonalkeresés és teljes hatásvizsgálat

## Java nyelvi szint felismerése

A Java elemző nem az Explorer saját fordítási verzióját erőlteti a feltöltött projektre. A forrásfájlhoz legközelebbi modulkonfigurációból állapítja meg a nyelvi szintet:

- Maven: `maven.compiler.release`, `maven.compiler.source`, `java.version`, illetve compiler plugin `release`/`source`
- Gradle: `JavaLanguageVersion.of(...)`, `sourceCompatibility`, `targetCompatibility`
- ismeretlen vagy nem támogatott új verzió esetén: JavaParser `BLEEDING_EDGE`

Ez multi-module projektnél lehetővé teszi, hogy eltérő Java-verziójú modulok is helyesen legyenek elemezve.

## v0.4 interaktív gráf

- Típusonként eltérő csomópontszínek és jelmagyarázat.
- Csomópontok szabad mozgatása egérrel.
- Egérgörgős zoom és háttérhúzásos pásztázás.
- Jobb kattintással a kijelölt csomópont közvetlen kapcsolatainak kibontása.
- Két csomópont közötti legrövidebb útvonal keresése, irányított vagy kétirányú módban.
- Az útvonal csomópontjai és élei kiemelten jelennek meg.


## Elérés

Az alkalmazás alapértelmezett címe: `http://localhost:9090`.


## v0.7 javítások

- A SOURCE_FILE csomópontok a fájlkiterjesztésük alapján kapnak Java, JavaScript, HTML, CSS, konfigurációs vagy SQL színt.
- A szín közvetlen SVG fill attribútumként is beállításra kerül.
- Jobb kattintáskor automatikusan bekapcsol a közvetlen kapcsolatok fókusznézete.
- Stabilabb csomópont-húzás és külön zoom gombok.
- Verziózott CSS/JS URL-ek a böngésző gyorsítótárának elkerülésére.


## Fókuszált kezdőnézet

Az elemzés után az alkalmazás nem rajzolja ki automatikusan a teljes projektet. Megpróbálja felismerni a Spring Boot `@SpringBootApplication` vagy `main` belépési pontot, illetve frontend projekt esetén az `index.html`, `main.js` vagy `app.js` állományt. A gráf alapértelmezetten három kapcsolati szintig jelenik meg. A belépési pont és a mélység a gráf feletti vezérlőkkel módosítható, a **Teljes gráf** gomb pedig szükség esetén minden elemet megmutat.

## v1.0 – alkalmazási folyamatok

- A gráf a frontend API-hívástól a Spring REST endpointon és controller/service metódusokon át a repositoryig követhető.
- A Spring stereotype-ok külön csomóponttípusok: controller, service, repository és entity.
- A mezőinjektálások és a mezőn keresztül végzett metódushívások alapján az elemző feloldott `CALLS` kapcsolatokat készít.
- A Spring Data repository generikus entity típusa `USES_ENTITY` kapcsolatként jelenik meg.
- A Spring Boot belépési pont és a controller komponensek között következtetett component-scan kapcsolat készül.
- A kapcsolatfajták checkboxokkal kapcsolhatók ki és be; a böngésző cookie-ban megjegyzi a beállítást.
- A csomópont- és kapcsolatszámok a kompakt fejlécbe kerültek, a gráf pedig a képernyő nagyobb részét használja.


## v1.2 – Prezi-szerű mélységi navigáció

- Dupla kattintással egy csomópont kerül fókuszba.
- A nézet animáltan ráközelít, majd csak a beállított kapcsolati mélység környezetét mutatja.
- A Vissza gomb az előző fókuszszintre lép.
- A Belépési pont gomb visszatér az alkalmazás gyökeréhez.
- A normál egérgörgős zoom és vászonmozgatás továbbra is használható.


## v1.4 navigáció és nézet

- Stabil v1.2 gráfmegjelenítés.
- Elemzés után csak a felismert belépési pont látható; az alap kapcsolati mélység 1.
- A kapcsolattípusok és zajos csomópontok egy legördülő checkbox-panelen állíthatók.
- CSS selectorok, HTML ID/class DOM-elemek, getterek és setterek alapértelmezetten rejtettek.
- Teljes képernyős gráf és opcionális, Shift+húzással forgatható 3D nézet.
- A csomópontváltások sorrendje előzményként megmarad, a Vissza gombbal bejárható.


## v1.8 – lokális, külső kapcsolat nélküli 3D nézet

A 3D csillagrendszer-nézet saját Canvas 2D projekciós motorral készül. Nem használ Three.js-t, 3d-force-graphot, CDN-t vagy más futás közben letöltött kódot. A csomópontok valódi `x/y/z` koordinátákkal rendelkeznek, a kamera orbitálható és zoomolható.

Biztonsági korlátozások:

- `Content-Security-Policy: connect-src 'self'`
- `script-src 'self'`
- nincs külső script, kép, font vagy stylesheet
- nincs telemetria, analytics, WebSocket, EventSource vagy `sendBeacon`
- a frontend egyetlen hálózati művelete a relatív `/api/analysis/zip` kérés a helyi Spring Boot backendhez

Statikus ellenőrzés:

```bash
./scripts/check-local-only-frontend.sh
```


## Nincs futás közbeni letöltés

Az alkalmazás kizárólag a `127.0.0.1:9090` címen fut, nem használ CDN-t, és futás közben nem tölt le függőséget, könyvtárat, frissítést vagy projektfájlt. A JVM szabványos külső HTTP/HTTPS kapcsolatait az `OutboundNetworkGuard` blokkolja. Részletek: `docs/03-no-download-runtime.md`.


## v2.0 megjelenítési finomítás

A gráfcsomópontokon csak az elem neve jelenik meg. A technikai típus nem ismétlődik meg külön feliratként; továbbra is a szín, forma, ikon, tooltip és részletező panel jelzi.


## v2.1

A jobb kattintásos kapcsolati szűrő csoportfejléceiben külön ✓ (Összes) és ∅ (Egyik sem) művelet érhető el.


## Funkcionális útvonal és riport

A v2.3 verzió a nyers gráf mellett emberileg követhető funkcionális útvonalat készít. A kiválasztott belépési pontból vagy csomópontból megpróbálja végigkövetni a frontend, API, controller/resource, üzleti logika és perzisztencia láncát.

A funkcionális útvonal:

- lépésenként megjeleníti az elemek szerepét;
- felsorolja az érintett állományokat és forráshelyeket;
- jelzi a következtetett kapcsolatokat és figyelmeztetéseket;
- böngészőből nyomtatható;
- helyben generált Markdown fájlba exportálható.

A nyomtatás és a Markdown export nem használ külső szolgáltatást, és nem küld adatot a hálózatra.

## v2.8 – Végrehajtási útvonal kódnézet

A végrehajtási útvonal minden forrásfájlhoz köthető kártyáján `</>` ikon nyit külön kódnézetablakot. A nézet az adott forráshely sorára ugrik, kiemeli azt, és fájltípus szerinti helyi szintaxiskiemelést használ. A forráskód kizárólag az aktív, helyi elemzési munkamenetből olvasható.

## 3D referencia-környezet és kézi pozicionálás (v2.9)

- Kapcsolható semleges tér, rács, csillagmező vagy háttér nélküli 3D környezet.
- Perspektivikus rács, XYZ tengelyek és orientációs jelölés segíti a térbeli tájékozódást.
- `Shift` + bal egérgombos húzás egy csomóponton: mozgatás a kamera nézeti síkjában.
- `Shift` + `Alt` + bal húzás: mozgatás a mélységi tengely mentén.
- `Shift` + egérgörgő egy csomóponton: finom mélységállítás.
- A kézzel pozicionált elemek rögzítettek maradnak az aktuális munkamenetben, az automatikus elrendezés nem húzza vissza őket.
- A **3D pozíciók visszaállítása** gomb újraépíti az automatikus térbeli elrendezést.


## v3.0 – Teljesen helyi AI Chat

A program új **Helyi AI Chat** nézetet tartalmaz. A chat az aktív elemzési munkamenet gráfjából és forráskódjából állít össze célzott kontextust, majd azt kizárólag a helyi Ollama szolgáltatásnak küldi.

Alapbeállítás:

```properties
app.ai.ollama.base-url=http://127.0.0.1:11434
app.ai.ollama.model=qwen2.5-coder-local:7b
app.ai.ollama.context-size=16384
app.ai.ollama.temperature=0.15
```

Biztonsági korlátozások:

- csak `localhost`, `127.0.0.1` vagy `::1` Ollama-cím fogadható el;
- az alkalmazás nem tölt le és nem töröl modellt;
- a chat csak olvasási célú;
- nincs fájlírás, shell, Git- vagy buildművelet;
- a JVM kimenő hálózati védelme továbbra is tilt minden nem helyi HTTP/HTTPS címet;
- a modell csak a relevánsnak értékelt gráfcsomópontokat, kapcsolatokat és legfeljebb nyolc forrásrészletet kapja meg.

Használat:

1. Indítsd el az Ollamát és ellenőrizd, hogy a `qwen2.5-coder-local:7b` modell elérhető.
2. Indítsd el a Source Graph Explorert.
3. Elemezz egy projekt ZIP-et.
4. Nyisd meg a **Helyi AI Chat** fület.
5. Válassz modellt és tedd fel a kérdést.

A válaszok mellett a felhasznált fájl- és sorszámhivatkozások kattinthatók, a beszélgetés Markdownként exportálható.

## v3.2 – Chat időbélyegek és háttérkommunikációs sidebar

- A felhasználói kérdések mellett megjelenik a kérdés pontos helyi ideje.
- Az AI-válaszok mellett megjelenik a válasz pontos helyi ideje.
- A háttérkommunikáció nem a chatüzenetben nyílik le, hanem jobb oldali sidebarban tekinthető meg.
- A sidebar tartalmazza az aktuális feldolgozási lépéseket, az Ollama-kérés összefoglalóját, valamint a teljes kérés- és válasz-JSON-t.
- A sidebar a felső „Háttérkommunikáció” gombbal, illetve az egyes válaszok saját gombjával nyitható meg.


## v3.3 – Lokális hibrid RAG és memóriaalapú vektorindex

- Új, kézzel indítható **RAG index felépítése** művelet a Helyi AI Chat nézetben.
- Embeddingmodell: `qwen3-embedding:0.6b`, kizárólag a helyi Ollama `/api/embed` végpontján.
- A rendszer a gráf csomópontjaiból, metaadataiból és a csomópont körüli forrásrészletekből készít indexdokumentumokat.
- Az embeddingek csak az aktív alkalmazás memóriájában tárolódnak; nincs adatbázis és nincs külső szolgáltatás.
- Kérdéskor exact koszinusz-hasonlóság választja ki a szemantikailag releváns csomópontokat, majd ezt a kulcsszavas és gráfközelségi pontozás egészíti ki.
- A háttérkommunikációs sidebar jelzi, hogy készült-e vektoros RAG keresés, melyik embeddingmodellt használta, mennyi ideig tartott és hány találatot adott.
- Az embeddingmodellek nem jelennek meg a generáló chatmodellek választólistájában.

Konfiguráció:

```properties
app.ai.ollama.embedding-model=qwen3-embedding:0.6b
```

Az index az elemzési munkamenethez kötött. Új projekt elemzésekor újra fel kell építeni.


## v3.4 – RAG index előrehaladás és hátralévőidő-becslés

- Az indexelés közben megjelenik a kész dokumentumok aránya és százaléka.
- Látható az eltelt idő, az átlagos feldolgozási sebesség és a becsült hátralévő idő.
- A becslés a már elkészült dokumentumok átlagsebességéből számolódik, ezért az első néhány batch után stabilizálódik.
- Az embedding batchméret továbbra is 4, mert a kisebb érték több HTTP- és modellhívási többletet okozhat.

## v3.6 – Megszakítható RAG-indexelés és kisebb batch

- Az embedding batch alapértéke `4`, így CPU-s gépen hamarabb frissül az előrehaladás és kisebb egy-egy Ollama-kérés terhelése.
- A batchméret konfigurálható:

```properties
app.ai.ollama.embedding-batch-size=4
```

- Indexépítés közben másodpercenként frissül a feldolgozott dokumentumok száma.
- Új **RAG index készítés leállítása** gomb kérhet szabályos megszakítást.
- A megszakítás az aktuálisan futó, legfeljebb négy dokumentumos embedding batch befejezése után lép életbe.
- A részlegesen elkészült index nem kerül publikálásra. Korábban sikeresen elkészített index újraépítés megszakításakor változatlanul megmarad.


## 3.8 – AI válasz megszakítása

A helyi AI Chat aktív válaszgenerálás közben „Válasz leállítása” gombot jelenít meg. A leállítás megszakítja a böngésző kérését és a backendben futó helyi Ollama HTTP-hívást is.

## 3.9 Tartós és inkrementális RAG-index 

A RAG embeddingek nem csak memóriában élnek. A program a normalizált vektorokat tartalomhash alapján helyi gyorsítótárba menti:

```text
${user.home}/.source-graph-explorer/vector-cache
```

Az indexelés batchenként ment, ezért megszakítás vagy alkalmazás-újraindítás után a már elkészült embeddingek újra felhasználhatók. Új elemzéskor a program:

- kihagyja a változatlan tartalmú dokumentumokat;
- csak az új vagy módosult dokumentumokhoz kér új embeddinget;
- a törölt dokumentumokat nem teszi bele az aktuális memóriaindexbe;
- embeddingmodell-váltáskor automatikusan külön gyorsítótárat használ.

A batchméret továbbra is 4. A kisebb, 1-es batch a mérések szerint nem gyorsabb, mert a feldolgozási időt elsősorban az embeddingmodell CPU-s számítása határozza meg, nem a HTTP batch overhead.
