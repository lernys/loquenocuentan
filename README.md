# Lo que no cuentan

Comparador crítico de los programas electorales de las elecciones generales del 29 de noviembre de 2026: qué prometen los partidos y qué no cuentan (coste, plazos, lo que ya existe, lo que votaron). Cada dato, con su fuente.

https://loquenocuentan.com

## Cómo se actualiza

Los datos viven en el script de `index.html`. Tras cambiarlos:

```
node build.mjs                      # regenera páginas de partido y tema, sitemap, robots, llms.txt y datos abiertos
python3 tools/og.py <carpeta-fuentes>   # solo si cambian partidos o temas: imágenes para compartir
```

Se hace commit de lo generado y Vercel lo publica tal cual. `datos/lastmod.json` guarda la fecha real del último cambio de cada página, que es la que sale en `sitemap.xml`.

- Una URL por partido (`/pp`), por tema (`/tema/vivienda`) y por partido y tema (`/pp/vivienda`). Cada medida tiene su ancla (`/pp#pp-144`).
- Datos abiertos en `/datos` (CSV y JSON, CC BY 4.0).
