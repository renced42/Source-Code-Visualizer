# Futás közbeni letöltések tiltása

A Source Graph Explorer futás közben nem tölt le könyvtárat, függőséget, projektfájlt, frissítést vagy más tartalmat.

## Technikai korlátozások

- A szerver kizárólag a `127.0.0.1:9090` címen figyel.
- `app.security.outbound-network-enabled=false` alapértelmezésben tiltja a JVM szabványos HTTP/HTTPS klienseinek külső címekhez kapcsolódását.
- A böngészős Content Security Policy `connect-src 'self'` értéke csak a helyi alkalmazás API-ját engedi.
- Nincsenek CDN, külső font-, kép-, script- vagy stylesheet-hivatkozások.
- Nincs automatikus dependency-, plugin-, modell- vagy frissítésletöltés.
- A feltöltött ZIP elemzése kizárólag lokális ideiglenes könyvtárban történik.

## Ellenőrzés

```sh
./scripts/check-local-only-frontend.sh
./scripts/check-no-outbound-network.sh
```

A második ellenőrzés tiltott külső URL-eket, böngészős hálózati API-kat és backend HTTP/socket klienseket keres.

## Build és futtatás

A kész, Spring Boot executable JAR futtatása nem tölt le semmit:

```sh
java -jar source-graph-explorer.jar
```

A Maven build önmagában függőségeket tölthet le, ha azok nincsenek a helyi Maven cache-ben. Teljesen offline buildhez előre feltöltött belső repository/cache szükséges, majd:

```sh
mvn -o clean package
```
