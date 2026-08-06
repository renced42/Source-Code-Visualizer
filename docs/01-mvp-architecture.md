# MVP architektúra

A prototípus nem használ adatbázist. A feltöltött ZIP ideiglenes könyvtárba kerül, az elemzés eredménye egy HTTP-válaszban visszaadott gráf, majd az ideiglenes forrás törlődik.

## Feldolgozási folyamat

1. ZIP feltöltése.
2. Biztonságos kicsomagolás.
3. Releváns forrásfájlok bejárása.
4. Nyelvspecifikus elemző kiválasztása.
5. Közös `SourceGraph` feltöltése.
6. JSON válasz.
7. SVG-alapú interaktív megjelenítés.

## Tudatos korlátozások

- Nincs JAR/CLASS elemzés.
- Nincs buildfuttatás.
- A Java metódushívások első körben név szerinti, következtetett referenciák.
- A JavaScript és CSS elemzés könnyűsúlyú mintafelismerés; később Tree-sitterrel cserélhető.
- Az elemzési eredmény nem marad meg szerver-újraindítás után.
