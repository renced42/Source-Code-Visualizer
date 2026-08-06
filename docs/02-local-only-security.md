# Lokális működés és hálózati biztonság

## Döntés

A 3D megjelenítő nem használ külső JavaScript-könyvtárat. A térbeli koordinátákat, a kameraforgatást, a perspektivikus vetítést, a csomópontok kirajzolását, az ütközéscsökkentett feliratokat és a találatvizsgálatot a projekt saját `app.js` állománya valósítja meg.

Ezért nincs szükség Three.js, 3d-force-graph, three-spritetext, CDN vagy npm csomag futás közbeni betöltésére.

## Engedélyezett kliensoldali kapcsolat

A frontend kizárólag relatív, azonos originű kérést használ:

```text
POST /api/analysis/zip
```

A feltöltött projekt és az elemzési gráf nem kerül külső szolgáltatáshoz.

## Content Security Policy

A `SecurityHeadersConfiguration` válaszfejléce többek között:

```text
default-src 'self'
script-src 'self'
connect-src 'self'
object-src 'none'
frame-src 'none'
worker-src 'none'
```

A `connect-src 'self'` böngészőoldalon megakadályozza, hogy a kód külső HTTP, WebSocket vagy EventSource kapcsolathoz jusson.

## Statikus ellenőrzés

A következő parancs hibával áll le, ha a frontendben külső URL, abszolút `fetch`, WebSocket, EventSource, XMLHttpRequest, `sendBeacon` vagy worker betöltés jelenik meg:

```bash
./scripts/check-local-only-frontend.sh
```

Az SVG XML namespace (`http://www.w3.org/2000/svg`) nem hálózati kapcsolat, ezért az ellenőrzés ezt az egy szabványos literált engedélyezi.
