// Genera las páginas estáticas de loquenocuentan.com a partir de los datos de index.html.
// Uso: node build.mjs   (y después hacer commit de lo generado; Vercel sirve los archivos tal cual)
import fs from 'fs';
import vm from 'vm';
import crypto from 'crypto';

const SITE = 'https://loquenocuentan.com';
const NAME = 'Lo que no cuentan';
const AUTHOR = 'Fernando Santamaría González';
const REPO = 'https://github.com/lernys/loquenocuentan';
const TODAY = process.env.BUILD_DATE || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const INDEXNOW_KEY = fs.existsSync('indexnow-key.txt') ? fs.readFileSync('indexnow-key.txt', 'utf8').trim() : '';

/* ---------- 1. Datos: se leen del script de index.html ---------- */
let index = fs.readFileSync('index.html', 'utf8');
const script = index.slice(index.indexOf('<script>') + 8, index.indexOf('let topic='));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(script + ';globalThis.__o={TOPICS,PARTIES,FLAGS,S,D,CLAVES,CAMARAS,TSLUG,PSLUG}', ctx);
const { TOPICS, PARTIES, FLAGS, S, D, CLAVES, CAMARAS, TSLUG, PSLUG } = ctx.__o;

const LBL = { p29: 'Programa 29-N', p29p: 'Programa 29-N · vía prensa', pa: 'Programa anterior', doc: 'Documento 2026', dec: 'Declaración 2026', pl: 'Proposición de ley', gob: 'Gobierno / ley' };
const ART = { pp: 'el PP', psoe: 'el PSOE', vox: 'Vox', fa: 'el Frente Amplio', pod: 'Podemos', erc: 'ERC', junts: 'Junts', bildu: 'EH Bildu', pnv: 'el PNV', bng: 'el BNG', cc: 'Coalición Canaria', salf: 'Se Acabó La Fiesta (SALF)', upn: 'UPN' };
const de = p => ART[p].startsWith('el ') ? 'del ' + ART[p].slice(3) : 'de ' + ART[p];
const low = s => s[0].toLowerCase() + s.slice(1);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const abs = u => /^https?:/.test(u) ? u : '/' + u.replace(/^\//, '');
const fecha = iso => { const [y, m, d] = iso.split('-'); return `${+d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]} de ${y}`; };
const lista = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a.join('');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

const P = Object.fromEntries(PARTIES.map(([k, name, color, cand]) => [k, { k, name, color, cand, slug: PSLUG[k], items: [] }]));
const T = Object.fromEntries(TOPICS.map(([k, name]) => [k, { k, name, lname: low(name), slug: TSLUG[k], items: [] }]));

const used = new Set();
const ITEMS = [];
for (const [t] of TOPICS) for (const [p] of PARTIES) {
  ((D[t] || {})[p] || []).forEach((it, i) => {
    const [origin, text, s, notes] = it;
    const src = Array.isArray(s) ? s : S[s];
    const m = /^(p29)/.test(origin) && src && /medidas? ([0-9]+)/.exec(src[0]);
    let id = m ? `${p}-${m[1]}` : `${p}-${TSLUG[t]}-${i + 1}`;
    if (used.has(id)) id = `${p}-${m ? m[1] + '-' : ''}${TSLUG[t]}${m ? '' : '-' + (i + 1)}`;
    let n = 2; const base = id; while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    const item = {
      id, party: p, topic: t, origin, text,
      source: src ? { label: src[0], url: abs(src[1]) } : null,
      notes: notes.map(([f, nx, ns]) => ({
        flag: f, label: FLAGS[f][0], text: nx,
        sources: [].concat(ns || []).map(k => S[k] ? { label: S[k][0], url: abs(S[k][1]) } : /^https?:/.test(k) ? { label: 'Fuente', url: k } : null).filter(Boolean)
      }))
    };
    ITEMS.push(item); P[p].items.push(item); T[t].items.push(item);
  });
}
for (const p of Object.values(P)) {
  p.status = p.items.some(i => i.origin === 'p29') ? 'Programa del 29-N: texto oficial'
    : p.items.some(i => i.origin === 'p29p') ? 'Programa del 29-N: vía resúmenes de prensa'
      : 'Sin programa del 29-N localizado hasta hoy: se muestran declaraciones de 2026, acción de gobierno y programa anterior';
  p.short = p.items.some(i => i.origin === 'p29') ? 'Texto oficial' : p.items.some(i => i.origin === 'p29p') ? 'Vía prensa' : 'Sin programa aún';
}

/* ---------- 2. Fechas reales de modificación ---------- */
fs.mkdirSync('datos', { recursive: true });
const LM_FILE = 'datos/lastmod.json';
const lastmod = fs.existsSync(LM_FILE) ? JSON.parse(fs.readFileSync(LM_FILE, 'utf8')) : {};
const stamp = (url, content) => {
  const hash = crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 12);
  if (!lastmod[url] || lastmod[url].hash !== hash) lastmod[url] = { hash, date: TODAY };
  return lastmod[url].date;
};

/* ---------- 3. Piezas HTML ---------- */
const itemHTML = (it, { who = true, link = false } = {}) => `<article class="item o-${it.origin}" id="${it.id}" data-f="${[...new Set(it.notes.map(n => n.flag))].join(' ')}" style="--pc:${P[it.party].color}">
<div class="tline"><span class="tag">${LBL[it.origin]}</span><a class="perma" href="/${P[it.party].slug}#${it.id}" title="Enlace a esta medida">${link ? 'Ver en la página ' + esc(de(it.party)) : '#' + it.id}</a></div>
<p>${who ? `<b class="who">${esc(P[it.party].name)}.</b> ` : ''}${esc(it.text)}</p>
${it.source ? `<a class="src" href="${esc(it.source.url)}"${/^https?:/.test(it.source.url) ? ' rel="noopener"' : ''}>Fuente: ${esc(it.source.label)}</a>` : ''}
${it.notes.map(n => `<div class="note"><span class="k">${esc(n.label)}</span><span>${esc(n.text)}</span>${n.sources.map(s => `<a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a>`).join('')}</div>`).join('\n')}
</article>`;

const tally = items => {
  const c = {}; items.forEach(i => i.notes.forEach(n => { if (n.flag !== 'ctx') c[n.flag] = (c[n.flag] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
};
const tallyHTML = items => tally(items).map(([f, c]) => `<span class="chip"><b>${c}</b> ${esc(FLAGS[f][0])}</span>`).join('');
const filterHTML = items => tally(items).length ? `<div class="filt" data-filter hidden><span class="fl">Ver solo</span>${tally(items).map(([f, c]) => `<button type="button" class="chip" data-f="${f}" aria-pressed="false"><b>${c}</b> ${esc(FLAGS[f][0])}</button>`).join('')}</div>` : '';

const person = { '@type': 'Person', '@id': SITE + '/metodologia#autor', name: AUTHOR, url: 'https://fernandosantamaria.com', sameAs: ['https://x.com/lernys', 'https://www.linkedin.com/in/fernandosantamaria/'] };
const crumbsLD = list => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + u })) });

const MAIL = 'loquenotecuentann29@gmail.com';
const SOCIAL = [['TikTok', 'https://www.tiktok.com/@loquenocuentan2026'], ['Instagram', 'https://www.instagram.com/loquenocuentann29/'], ['X', 'https://x.com/loquenotecuen29']];
const org = { '@type': 'Organization', '@id': SITE + '/#org', name: NAME, url: SITE + '/', email: MAIL, founder: person, sameAs: SOCIAL.map(s => s[1]) };
const nNotesAll = ITEMS.reduce((a, i) => a + i.notes.length, 0);
const ICON_SVG = '<svg viewBox="0 0 1092 1092" aria-hidden="true"><rect width="1092" height="1092" rx="236" fill="#0f6e74"/><g fill="#fff"><rect x="251" y="272" width="590" height="98" rx="49"/><rect x="251" y="465" width="404" height="98" rx="49"/><rect x="251" y="688" width="263" height="98" rx="49"/></g><circle cx="678" cy="737" r="82" fill="#ffd23f"/></svg>';
const headerHTML = (cur = '') => `<a class="lq-skip" href="#contenido">Saltar al contenido</a>
<header class="lq-top"><div class="lq-in">
<a class="lq-brand" href="/" aria-label="${NAME}, inicio">${ICON_SVG}<span class="lq-word">lo que <b>no cuentan</b></span></a>
<nav class="lq-nav" aria-label="Principal">${[['/#res', 'Comparar', 'comparar'], ['/#temas', 'Temas', 'temas'], ['/#partidos', 'Partidos', 'partidos'], ['/#cuentas', 'Las cuentas que no salen', 'cuentas'], ['/metodologia', 'Metodología', 'metodologia'], ['/datos', 'Datos', 'datos'], ['/dossier', 'Dossier', 'dossier']].map(([h, n, k]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
</div></header>`;
const footerHTML = (date) => `<footer class="lq-foot"><div class="lq-in lq-fgrid">
<div><a class="lq-brand" href="/">${ICON_SVG}<span class="lq-word">lo que <b>no cuentan</b></span></a>
<p class="lq-tag">Qué prometen los partidos · Cada dato con su fuente</p>
<p>Comparador informativo de los programas de las elecciones generales del 29 de noviembre de 2026. Sin afiliación a ningún partido y sin publicidad.</p></div>
<div><h2>Temas</h2><ul class="two">${TOPICS.map(([k]) => `<li><a href="/tema/${T[k].slug}">${esc(T[k].name)}</a></li>`).join('')}</ul></div>
<div><h2>Partidos</h2><ul class="two">${PARTIES.map(([k]) => `<li><a href="/${P[k].slug}">${esc(P[k].name)}</a></li>`).join('')}</ul></div>
<div><h2>Proyecto</h2><ul><li><a href="/metodologia">Metodología y fuentes</a></li><li><a href="/datos">Datos abiertos</a></li><li><a href="/metodologia#errores">Comunicar un error</a></li><li><a href="mailto:${MAIL}">${MAIL}</a></li><li><a href="${REPO}" rel="noopener">Código en GitHub</a></li>${SOCIAL.map(([n, u]) => `<li><a href="${u}" rel="me noopener">${n}</a></li>`).join('')}</ul></div>
</div><div class="lq-in lq-legal"><span>Autor: ${AUTHOR}</span><span>Datos con licencia <a href="https://creativecommons.org/licenses/by/4.0/deed.es" rel="license noopener">CC BY 4.0</a></span><span>Actualizado el <time datetime="${date}">${fecha(date)}</time></span></div></footer>`;
const HEAD_COMMON = `<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png">`;
const pages = [];
function page({ url, title, desc, crumbs = [], body, ld = [], og = 'og.png', content, nav = '' }) {
  const date = stamp(url, content ?? body);
  const canonical = SITE + (url === '/' ? '/' : url);
  const all = [...(crumbs.length ? [crumbsLD([['Inicio', '/'], ...crumbs])] : []), ...ld];
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${HEAD_COMMON}
<meta property="og:type" content="article">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title.replace(' · ' + NAME, ''))}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/${og}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#19212b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap">
<link rel="stylesheet" href="/assets/chrome.css">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/page.js" defer></script>
${all.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c').replace(/__DATE__/g, date)}</script>`).join('\n')}
</head>
<body>
${headerHTML(nav)}
<main class="wrap" id="contenido">
${crumbs.length ? `<p class="crumbs"><a href="/">Inicio</a>${crumbs.map(([n, u], i) => i === crumbs.length - 1 ? ` › <span>${esc(n)}</span>` : ` › <a href="${u}">${esc(n)}</a>`).join('')}</p>` : ''}
${body}
</main>
${footerHTML(date)}
</body>
</html>
`;
  const file = url.slice(1) + '.html';
  fs.mkdirSync(file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.', { recursive: true });
  fs.writeFileSync(file, html);
  pages.push({ url, date });
}

const partyNav = (cur) => `<div class="chips">${PARTIES.map(([k]) => `<a class="party${k === cur ? ' on' : ''}" href="/${P[k].slug}" style="--pc:${P[k].color}"><i></i>${esc(P[k].name)}</a>`).join('')}</div>`;
const topicNav = (cur, prefix = '/tema/', only) => `<div class="chips">${TOPICS.filter(([k]) => !only || only.includes(k)).map(([k]) => `<a class="topic${k === cur ? ' on' : ''}" href="${prefix}${T[k].slug}">${esc(T[k].name)}</a>`).join('')}</div>`;
/* Una clave puede ser texto o [texto, clave de fuente] */
const claveLi = x => { const [t, k] = Array.isArray(x) ? x : [x]; return `<li>${esc(t)}${k && S[k] ? ` <a class="src" href="${esc(S[k][1])}" rel="noopener">${esc(S[k][0])}</a>` : ''}</li>`; };
const camarasHTML = t => CAMARAS.temas.includes(t) ? `<div class="camaras"><h3>Qué mayoría hace falta y qué puede hacer el Senado</h3><div class="scroll"><table class="tbl"><thead><tr><th scope="col">Qué se quiere cambiar</th><th scope="col">Mayoría necesaria</th><th scope="col">¿Puede pararlo el Senado?</th></tr></thead><tbody>${CAMARAS.filas.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="src">Fuente: <a href="${esc(S[CAMARAS.fuente][1])}" rel="noopener">${esc(S[CAMARAS.fuente][0])}</a></p></div>` : '';
const clavesHTML = t => CLAVES[t] ? `<aside class="context"><h2>Contexto: qué existe ya y quién decide</h2><ul>${CLAVES[t].map(claveLi).join('')}</ul>${camarasHTML(t)}</aside>` : '';

/* Recuento de concreción sobre los programas oficiales (misma regla para todos: medida con alguna cifra, plazo o porcentaje). */
const CONCR = { pp: { c: 62, n: 249, ids: [1, 5, 7, 9, 15, 19, 24, 28, 33, 35, 37, 41, 46, 65, 66, 67, 68, 70, 72, 75, 76, 79, 89, 105, 108, 114, 117, 126, 130, 139, 144, 148, 153, 154, 155, 156, 157, 158, 161, 168, 170, 171, 172, 174, 175, 179, 180, 181, 187, 188, 190, 191, 192, 203, 212, 220, 225, 228, 229, 230, 231, 249] }, vox: { c: 5, n: 115, ids: [2, 31, 34, 40, 94], extra: 'Ninguna dice cuánto cuesta ni cuándo se haría.' } , psoe: { c: 57, n: 500, ids: [8, 22, 23, 32, 38, 40, 41, 42, 55, 56, 57, 59, 67, 87, 92, 97, 101, 102, 105, 106, 108, 119, 123, 124, 125, 128, 130, 133, 134, 135, 136, 137, 143, 160, 161, 178, 193, 214, 229, 231, 234, 240, 246, 275, 288, 325, 326, 338, 372, 374, 388, 399, 402, 406, 436, 453, 459], extra: 'Recuento provisional, hecho el día de la publicación.' } };
const pct = k => Math.round(CONCR[k].c / CONCR[k].n * 100);
const concrTile = k => CONCR[k] ? `<div class="tile"><b>${pct(k)} %</b><span>medidas con alguna cifra o plazo</span></div>` : '';
const concrHTML = k => CONCR[k] ? `<aside class="context" id="concrecion"><h2>Cuánto concreta el programa</h2><ul><li><b>${esc(P[k].name)}: ${CONCR[k].c} de ${CONCR[k].n} medidas (${pct(k)} %) llevan alguna cifra, plazo o porcentaje.</b>${CONCR[k].extra ? ' ' + esc(CONCR[k].extra) : ''}</li>${Object.keys(CONCR).filter(x => x !== k).map(x => `<li>Con la misma regla, ${esc(ART[x])}: ${CONCR[x].c} de ${CONCR[x].n} (${pct(x)} %).</li>`).join('')}<li>Recuento propio sobre el texto oficial, que se aplicará a cada programa que se publique. <a href="/metodologia#concrecion">Regla y lista de medidas contadas</a>. <a href="/vox-programa-29n">Ver el programa de Vox página a página</a>.</li></ul></aside>` : '';

/* ---------- 4. Páginas de partido ---------- */
for (const p of Object.values(P)) {
  const topics = TOPICS.map(([k]) => k).filter(k => p.items.some(i => i.topic === k));
  const flagged = p.items.filter(i => i.notes.some(n => n.flag !== 'ctx')).length;
  const desc = `${plural(p.items.length, 'propuesta', 'propuestas')} ${de(p.k)} para las elecciones generales del 29 de noviembre de 2026 (29N), cada una con su fuente y con lo que no cuenta: coste, plazos, lo que ya existe y lo que votó.`;
  page({
    url: '/' + p.slug, og: `og/${p.slug}.png`,
    title: `Qué propone ${ART[p.k]} en las elecciones generales del 29N: programa electoral 2026 · ${NAME}`, desc,
    nav: 'partidos',
    crumbs: [[p.name, '/' + p.slug]],
    ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `Qué propone ${ART[p.k]} para las elecciones del 29-N`, description: desc, inLanguage: 'es', author: person, publisher: org, mainEntityOfPage: SITE + '/' + p.slug, dateModified: '__DATE__', about: { '@type': 'Organization', name: p.name } }],
    content: p.items,
    body: `<header class="hero" style="--pc:${p.color}">
<p class="kicker">Elecciones generales · 29 de noviembre de 2026</p>
<h1>Qué propone ${esc(ART[p.k])} para el 29-N y qué no cuenta</h1>
<p class="lead">${esc(p.status)}.</p>
<div class="tiles"><div class="tile"><b>${p.items.length}</b><span>propuestas localizadas</span></div><div class="tile"><b>${flagged}</b><span>con alguna observación</span></div><div class="tile"><b>${topics.length}</b><span>temas de 15</span></div>${concrTile(p.k)}</div>
</header>${concrHTML(p.k)}
${topics.length ? `<nav class="jump" aria-label="Temas de esta página"><div class="jrow"><span class="fl">Ir a</span>${topics.map(t => `<a href="#${T[t].slug}">${esc(T[t].name)} <b>${p.items.filter(i => i.topic === t).length}</b></a>`).join('')}</div>${filterHTML(p.items)}</nav>` : '<div class="none"><b>Sin propuestas localizadas</b>No se ha encontrado nada de este partido hasta hoy.</div>'}
${topics.map(t => { const its = p.items.filter(i => i.topic === t); return `<section class="block" id="${T[t].slug}"><h2><a href="/${p.slug}/${T[t].slug}">${esc(T[t].name)}</a> <small>${plural(its.length, 'propuesta', 'propuestas')} · <a href="/tema/${T[t].slug}">comparar con el resto</a></small></h2><div class="grid">${its.map(i => itemHTML(i, { who: false })).join('\n')}</div></section>`; }).join('\n')}
<p class="back">Que un partido tenga más observaciones suele indicar que hay más documentación suya, no que sea peor. <a href="/metodologia">Cómo se hace la lectura crítica</a>.</p>
<section class="more"><h2 class="sec">Ver otro partido</h2>${partyNav(p.k)}</section>`
  });

  /* partido × tema */
  for (const t of topics) {
    const its = p.items.filter(i => i.topic === t);
    const d2 = `${plural(its.length, 'propuesta', 'propuestas')} ${de(p.k)} sobre ${T[t].lname} para las generales del 29 de noviembre de 2026, con su fuente y con lo que no cuenta: coste, plazos, lo que ya existe y lo que votó.`;
    const q = `¿Qué propone ${ART[p.k]} sobre ${T[t].lname} para las elecciones del 29-N?`;
    page({
      url: `/${p.slug}/${T[t].slug}`, og: `og/${p.slug}.png`,
      title: `Qué propone ${ART[p.k]} sobre ${T[t].lname} en las elecciones del 29N: programa electoral 2026 · ${NAME}`, desc: d2,
      nav: 'partidos',
      crumbs: [[p.name, '/' + p.slug], [T[t].name, `/${p.slug}/${T[t].slug}`]],
      ld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: its.map(i => `${LBL[i.origin]}: ${i.text}`).join(' ') + ` Fuentes y lectura crítica en ${SITE}/${p.slug}/${T[t].slug}` } }] }],
      content: [its, CLAVES[t]],
      body: `<header class="hero" style="--pc:${p.color}">
<p class="kicker">${esc(p.name)} · ${esc(T[t].name)} · 29-N</p>
<h1>${esc(q)}</h1>
<p class="lead">${esc(p.status)}. ${plural(its.length, 'propuesta localizada', 'propuestas localizadas')} sobre ${esc(T[t].lname)}.</p>
${tally(its).length ? `<div class="chips tally">${tallyHTML(its)}</div>` : ''}
</header>
<div class="grid">${its.map(i => itemHTML(i, { who: true })).join('\n')}</div>
${clavesHTML(t)}
<section class="more"><h2 class="sec">${esc(T[t].name)} en otros partidos</h2><div class="chips">${PARTIES.filter(([k]) => k !== p.k && P[k].items.some(i => i.topic === t)).map(([k]) => `<a class="party" href="/${P[k].slug}/${T[t].slug}" style="--pc:${P[k].color}"><i></i>${esc(P[k].name)}</a>`).join('')}<a class="topic on" href="/tema/${T[t].slug}">Comparar todos</a></div></section>
<section class="more"><h2 class="sec">Más temas ${esc(de(p.k))}</h2>${topicNav(t, `/${p.slug}/`, topics)}</section>`
    });
  }
}

/* ---------- 5. Páginas de tema ---------- */
for (const t of Object.values(T)) {
  const withItems = PARTIES.map(([k]) => k).filter(k => t.items.some(i => i.party === k));
  const desc = `Qué propone cada partido sobre ${t.lname} para las elecciones generales del 29 de noviembre de 2026 (29N): ${withItems.slice(0, 6).map(k => P[k].name).join(', ')}${withItems.length > 6 ? ' y más' : ''}. Tabla comparativa, fuente de cada medida y lo que no cuentan.`;
  const faq = withItems.map(k => ({ '@type': 'Question', name: `¿Qué propone ${ART[k]} sobre ${t.lname} para las elecciones del 29-N?`, acceptedAnswer: { '@type': 'Answer', text: t.items.filter(i => i.party === k).map(i => `${LBL[i.origin]}: ${i.text}`).join(' ') + ` Fuentes y lectura crítica en ${SITE}/tema/${t.slug}#${P[k].slug}` } }));
  page({
    url: '/tema/' + t.slug, og: `og/tema-${t.slug}.png`,
    title: `${t.name} en las elecciones generales del 29N: qué propone cada partido (programas electorales 2026) · ${NAME}`, desc,
    nav: 'temas',
    crumbs: [['Temas', '/#temas'], [t.name, '/tema/' + t.slug]],
    ld: faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }] : [],
    content: [t.items, CLAVES[t.k]],
    body: `<header class="hero">
<p class="kicker">Elecciones generales · 29 de noviembre de 2026</p>
<h1>${esc(t.name)}: qué propone cada partido para el 29-N y qué no cuenta</h1>
<p class="lead">${plural(t.items.length, 'propuesta', 'propuestas')} de ${plural(withItems.length, 'partido', 'partidos')}. Cada una lleva su fuente. La misma regla para todos.</p>
</header>
<nav class="jump" aria-label="Partidos de esta página"><div class="jrow"><span class="fl">Ir a</span>${withItems.map(k => `<a href="#${P[k].slug}" style="--pc:${P[k].color}"><i></i>${esc(P[k].name)} <b>${t.items.filter(i => i.party === k).length}</b></a>`).join('')}</div>${filterHTML(t.items)}</nav>
<section class="tablebox"><h2 class="sec">Comparativa rápida</h2>
<div class="scroll"><table class="tbl"><thead><tr><th scope="col">Partido</th><th scope="col">Propuestas</th><th scope="col">Origen</th><th scope="col">Observaciones más frecuentes</th></tr></thead><tbody>
${PARTIES.map(([k]) => { const its = t.items.filter(i => i.party === k); const tl = tally(its).slice(0, 3).map(([f, c]) => `${FLAGS[f][0]} (${c})`).join(', '); return `<tr><th scope="row"><a href="${its.length ? '#' + P[k].slug : '/' + P[k].slug}"><i style="background:${P[k].color}"></i>${esc(P[k].name)}</a></th><td>${its.length || '<span class="mut">Sin propuesta localizada</span>'}</td><td>${its.length ? esc(P[k].short) : ''}</td><td>${esc(tl) || (its.length ? '<span class="mut">Ninguna</span>' : '')}</td></tr>`; }).join('\n')}
</tbody></table></div>
<p class="mut">Los partidos se ordenan por escaños de 2023, que no es una clasificación. Que un partido tenga más observaciones suele indicar que hay más documentación suya.</p></section>
${clavesHTML(t.k)}
${withItems.map(k => { const its = t.items.filter(i => i.party === k); return `<section class="block" id="${P[k].slug}" style="--pc:${P[k].color}"><h2 class="ph">¿Qué propone ${esc(ART[k])} sobre ${esc(t.lname)}? <small>${esc(P[k].short)} · <a href="/${P[k].slug}/${t.slug}">página propia</a></small></h2><div class="grid">${its.map(i => itemHTML(i, { who: true, link: true })).join('\n')}</div></section>`; }).join('\n')}
<section class="more"><h2 class="sec">Otros temas</h2>${topicNav(t.k)}</section>`
  });
}

/* ---------- 6. Metodología y datos ---------- */
page({
  url: '/metodologia',
  title: `Metodología y fuentes · ${NAME}`,
  desc: 'Quién hace el comparador de programas del 29-N, con qué criterios, qué significa cada etiqueta, qué fuentes se usan y cómo comunicar un error.',
  nav: 'metodologia',
  crumbs: [['Metodología', '/metodologia']],
  ld: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Metodología y fuentes', url: SITE + '/metodologia', author: person, inLanguage: 'es' }],
  body: `<header class="hero"><p class="kicker">Cómo se hace</p><h1>Metodología y fuentes</h1>
<p class="lead">Qué miramos en cada programa, qué significa cada etiqueta y cómo corregimos los errores.</p></header>
<section class="block prose"><h2>Qué es este sitio</h2>
<p>${NAME} compara lo que prometen los partidos para las elecciones generales del 29 de noviembre de 2026 y añade lo que los programas no cuentan: cuánto cuesta, quién lo paga, en qué plazo, si ya existe, si depende de otra administración y si choca con lo que el partido votó o con las cifras oficiales.</p>
<p>No se valora si una propuesta es buena o mala. Se informa de lo que el lector necesita para juzgarla. Cada observación responde a una pregunta comprobable, la misma para todos los partidos.</p></section>
<section class="block prose" id="autor"><h2>Quién lo hace</h2>
<p>El autor es ${AUTHOR}, profesor universitario, con sede en León (España). Es un proyecto personal, sin afiliación a ningún partido y sin publicidad. El código y los datos son públicos en <a href="${REPO}">GitHub</a>.</p></section>
<section class="block prose"><h2>Qué significa cada etiqueta</h2>
<dl class="flags">${Object.values(FLAGS).map(([l, d]) => `<dt>${esc(l)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>
<p>Solo se pone una observación cuando hay un hecho que la respalde: una ley, una votación, una fecha o lo que dice la propia fuente. Si falta, no se pone. Una promesa solo se marca como «quimera» cuando las cifras lo muestran, con la cuenta a la vista.</p>
<p>Que un partido tenga más observaciones suele indicar que hay más documentación suya, no que sea peor.</p></section>
<section class="block prose"><h2>De dónde sale cada propuesta</h2>
<dl class="flags">
<dt>Programa 29-N</dt><dd>Texto oficial del programa para estas elecciones, con número de medida y página.</dd>
<dt>Programa 29-N · vía prensa</dt><dd>El partido ha presentado programa, pero no hemos encontrado un documento oficial accesible. Procede de resúmenes de prensa.</dd>
<dt>Documento 2026</dt><dd>Documento oficial del partido publicado en 2026.</dd>
<dt>Proposición de ley</dt><dd>Iniciativa registrada en el Congreso.</dd>
<dt>Declaración 2026</dt><dd>Declaración pública recogida por la prensa. Pesa menos que un documento firmado.</dd>
<dt>Gobierno / ley</dt><dd>Medida aprobada o impulsada desde el Gobierno.</dd>
<dt>Programa anterior</dt><dd>Programa de 2023 o anterior. Se usa en último lugar, cuando no hay nada más reciente.</dd>
</dl>
<p>Programa y declaraciones se distinguen siempre. No se recoge el pasado personal de los candidatos ni la retórica de mitin: solo medidas, votos y cifras.</p>
<p>Varias propuestas proceden de comparadores independientes (DatosClaros, Política Electoral, Politicheck) que enlazan la fuente original. Conviene abrir el enlace antes de citar una cifra.</p></section>
<section class="block prose"><h2>Límites</h2>
<ul><li>Un programa recoge promesas, no medidas aprobadas.</li>
<li>Los partidos con menos documentación aparecen con más silencios. Eso refleja lo localizado hasta hoy, no necesariamente lo que piensan.</li>
<li>Los partidos se ordenan por escaños de 2023, que no es una clasificación.</li>
<li>Estado actual: ${lista(PARTIES.filter(([k]) => P[k].short === 'Texto oficial').map(([k]) => P[k].name))} con texto oficial. ${lista(PARTIES.filter(([k]) => P[k].short === 'Vía prensa').map(([k]) => P[k].name))} vía prensa. El resto se añadirá el día que publique su programa, con el mismo recuento.</li></ul></section>
<section class="block prose" id="concrecion"><h2>Cómo se cuenta la concreción de un programa</h2>
<p>Una medida cuenta como concreta si su texto compromete al menos una de estas cosas: un importe, una cantidad, un porcentaje, un plazo o fecha para hacerlo, una periodicidad («cada año», «cada trimestre») o un umbral numérico de aplicación (una edad, un número de habitantes, la duración de un mandato).</p>
<p>No cuentan las cifras que solo describen el pasado o la situación actual, los nombres de planes con años («Agenda 2030», «presupuesto 2028-2034») ni las fórmulas vagas como «en la legislatura», «al inicio» o «desde el primer momento». Tampoco cuenta el número de la propia medida.</p>
<p>Que una medida cuente como concreta no significa que diga cuánto cuesta. Solo significa que deja algo que se puede comprobar.</p>
<ul>${Object.keys(CONCR).map(k => `<li><b>${esc(P[k].name)}: ${CONCR[k].c} de ${CONCR[k].n} medidas (${pct(k)} %).</b> Medidas contadas: ${CONCR[k].ids.join(', ')}.</li>`).join('')}</ul>
<p>Es un recuento propio y hay casos discutibles. Si crees que una medida está mal clasificada, escríbenos con su número.</p></section>
<section class="block prose" id="errores"><h2>Cómo comunicar un error</h2>
<p>Si encuentras un error, una fuente rota o una medida que falta, escribe a <a href="mailto:${MAIL}">${MAIL}</a> o abre un aviso en <a href="${REPO}/issues/new">el registro público del proyecto en GitHub</a>. Indica la medida (cada una tiene su enlace propio) y la fuente que lo corrige.</p>
<p>Las correcciones se hacen en público y quedan en el historial del repositorio.</p></section>`
});

const dataDate = stamp('/datos/medidas.json', ITEMS);
const records = ITEMS.map(i => ({ id: i.id, url: `${SITE}/${P[i.party].slug}#${i.id}`, partido: P[i.party].name, tema: T[i.topic].name, origen: LBL[i.origin], texto: i.text, fuente: i.source?.label || '', fuente_url: i.source ? (/^https?:/.test(i.source.url) ? i.source.url : SITE + i.source.url) : '', observaciones: i.notes.map(n => ({ etiqueta: n.label, texto: n.text, fuentes: n.sources.map(s => s.url) })) }));
fs.writeFileSync('datos/medidas.json', JSON.stringify({ titulo: 'Medidas de los partidos para las elecciones generales del 29-N de 2026', autor: AUTHOR, licencia: 'CC BY 4.0', web: SITE, actualizado: dataDate, medidas: records }, null, 1));
const csv = rows => rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
fs.writeFileSync('datos/medidas.csv', '\ufeff' + csv([['id', 'url', 'partido', 'tema', 'origen', 'texto', 'fuente', 'fuente_url', 'num_observaciones'], ...records.map(r => [r.id, r.url, r.partido, r.tema, r.origen, r.texto, r.fuente, r.fuente_url, r.observaciones.length])]));
fs.writeFileSync('datos/observaciones.csv', '\ufeff' + csv([['medida_id', 'partido', 'tema', 'etiqueta', 'texto', 'fuentes'], ...records.flatMap(r => r.observaciones.map(o => [r.id, r.partido, r.tema, o.etiqueta, o.texto, o.fuentes.join(' ')]))]));
const nNotes = nNotesAll;
const dataset = { '@context': 'https://schema.org', '@type': 'Dataset', '@id': SITE + '/datos#dataset', name: 'Medidas de los partidos para las elecciones generales del 29-N de 2026', description: `${ITEMS.length} propuestas de ${PARTIES.length} partidos en ${TOPICS.length} temas, con su fuente y ${nNotes} observaciones críticas (coste, plazos, lo que ya existe, votaciones).`, url: SITE + '/datos', inLanguage: 'es', license: 'https://creativecommons.org/licenses/by/4.0/', isAccessibleForFree: true, creator: person, dateModified: dataDate, temporalCoverage: '2026', spatialCoverage: { '@type': 'Place', name: 'España' }, keywords: ['elecciones generales 2026', 'elecciones 29N', '29-N', 'programas electorales 2026', 'España'], distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: SITE + '/datos/medidas.json' }, { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: SITE + '/datos/medidas.csv' }, { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: SITE + '/datos/observaciones.csv' }] };
page({
  url: '/datos',
  title: `Datos abiertos del comparador del 29-N · ${NAME}`,
  desc: `Descarga en CSV y JSON las ${ITEMS.length} propuestas de los partidos para el 29-N con sus fuentes y observaciones. Licencia CC BY 4.0.`,
  nav: 'datos',
  crumbs: [['Datos', '/datos']], ld: [dataset], content: dataDate,
  body: `<header class="hero"><p class="kicker">Datos abiertos · CC BY 4.0</p><h1>Descarga los datos del comparador</h1>
<p class="lead">Todo lo que se ve en el sitio, en formatos que se pueden reutilizar. Se pide citar la fuente y enlazar.</p>
<div class="tiles"><div class="tile"><b>${ITEMS.length}</b><span>propuestas</span></div><div class="tile"><b>${nNotes}</b><span>observaciones</span></div><div class="tile"><b>${PARTIES.length}</b><span>partidos</span></div><div class="tile"><b>${TOPICS.length}</b><span>temas</span></div></div></header>
<section class="block prose"><h2>Archivos</h2>
<ul><li><a href="/datos/medidas.json">medidas.json</a>: todas las propuestas con sus observaciones anidadas.</li>
<li><a href="/datos/medidas.csv">medidas.csv</a>: una fila por propuesta (identificador, partido, tema, origen, texto y fuente).</li>
<li><a href="/datos/observaciones.csv">observaciones.csv</a>: una fila por observación crítica, enlazada a su propuesta por el identificador.</li></ul>
<p>Datos actualizados el ${fecha(dataDate)}. El historial completo de cambios está en <a href="${REPO}">GitHub</a>.</p></section>
<section class="block prose"><h2>Cómo citar</h2>
<p>Santamaría González, F. (2026). <em>Lo que no cuentan: comparador crítico de los programas del 29-N</em> [conjunto de datos]. ${SITE}/datos</p>
<p>Cada propuesta tiene un enlace estable, por ejemplo <a href="/pp#pp-144">${SITE}/pp#pp-144</a>. Licencia <a href="https://creativecommons.org/licenses/by/4.0/deed.es" rel="license noopener">Creative Commons Atribución 4.0</a>. Los textos de los programas pertenecen a cada partido.</p></section>`
});

/* ---------- 7. Portada: enlaces rastreables y datos estructurados ---------- */
const between = (html, tag, inner, anchor, before) => {
  const a = `<!-- build:${tag} -->`, b = `<!-- /build:${tag} -->`;
  const block = `${a}\n${inner}\n${b}`;
  if (html.includes(a)) return html.slice(0, html.indexOf(a)) + block + html.slice(html.indexOf(b) + b.length);
  const at = html.indexOf(anchor); if (at < 0) throw new Error('ancla no encontrada: ' + anchor);
  return before ? html.slice(0, at) + block + '\n' + html.slice(at) : html.slice(0, at + anchor.length) + '\n' + block + html.slice(at + anchor.length);
};
const homeDate = stamp('/', ITEMS);
const homeLD = [
  { '@context': 'https://schema.org', '@type': 'WebSite', '@id': SITE + '/#web', name: NAME, alternateName: 'loquenocuentan.com', url: SITE + '/', inLanguage: 'es', description: 'Comparador crítico de los programas electorales de las elecciones generales del 29 de noviembre de 2026.', author: person, publisher: org, sameAs: SOCIAL.map(s => s[1]), keywords: ['elecciones generales 2026', 'elecciones 29N', '29-N', 'programas electorales 2026', 'comparador de programas electorales', 'qué propone cada partido'], dateModified: homeDate },
  dataset
];
index = between(index, 'ld', homeLD.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n'), '</head>', true);
index = between(index, 'header', `${headerHTML()}
<section class="lq-hero"><div class="lq-in lq-hgrid">
<div>
<p class="lq-kick">Elecciones generales · 29 de noviembre de 2026</p>
<h1>Qué prometen los partidos y qué <span class="lq-hl">no cuentan</span></h1>
<p class="lq-sub">Coste, plazos, lo que ya existe y lo que votaron. Cada dato, con su fuente. La misma regla para todos.</p>
<form class="lq-search" role="search" id="hform"><input id="hq" type="search" placeholder="Busca una propuesta: alquiler, IRPF, pensiones…" aria-label="Buscar en todas las propuestas"><button class="lq-btn" type="submit">Buscar</button></form>
<p class="lq-go"><a class="lq-btn ghost" href="#res">Comparar por tema</a><a class="lq-btn ghost" href="#partidos">Partido a partido</a><a class="lq-btn ghost" href="#cuentas">Las cuentas que no salen</a></p>
<ul class="lq-stats"><li><b>${ITEMS.length}</b>propuestas</li><li><b>${PARTIES.length}</b>partidos</li><li><b>${TOPICS.length}</b>temas</li><li><b>${nNotesAll}</b>observaciones con su porqué</li></ul>
</div>
<figure class="lq-anat" aria-label="Cómo se lee cada propuesta">
<span class="a-tag">Así se lee cada propuesta</span>
<p class="a-t">La promesa, tal como la escribe el partido</p>
<span class="a-src">Su fuente: programa, medida y página</span>
<div class="a-note"><span>Lo que no cuenta</span><ul><li>¿Cuánto cuesta?</li><li>¿En qué plazo?</li><li>¿Ya existe?</li><li>¿Qué votó el partido?</li></ul></div>
</figure>
</div></section>`, '<main class="wrap"', true);
index = between(index, 'nav', `<section class="dir" aria-labelledby="dt" id="temas">
  <h2 class="lq-h" id="dt"><small>${TOPICS.length} temas</small><span>Tema a tema</span></h2>
  <p class="lq-lead">Cada tema tiene su página, con una tabla que compara a todos los partidos.</p>
  <div class="dirgrid tgrid">${TOPICS.map(([k]) => `<a href="/tema/${T[k].slug}"><i class="ti" data-ico="${k}"></i><b>${esc(T[k].name)}</b><span>${plural(T[k].items.length, 'propuesta', 'propuestas')} · ${plural(new Set(T[k].items.map(i => i.party)).size, 'partido', 'partidos')}</span></a>`).join('')}</div>
</section>
<section class="dir" aria-labelledby="dp" id="partidos">
  <h2 class="lq-h" id="dp"><small>${PARTIES.length} partidos</small><span>Partido a partido</span></h2>
  <p class="lq-lead">Todo lo localizado de cada partido, medida a medida. El orden es el de los escaños de 2023, no una clasificación.</p>
  <div class="dirgrid pgrid">${PARTIES.map(([k]) => `<a href="/${P[k].slug}" style="--pc:${P[k].color}"><b>${esc(P[k].name)}</b><span>${plural(P[k].items.length, 'propuesta', 'propuestas')}</span><em class="s-${P[k].short === 'Texto oficial' ? 'of' : P[k].short === 'Vía prensa' ? 'pr' : 'no'}">${esc(P[k].short)}</em></a>`).join('')}</div>
</section>`, '<section class="mapbox"', true);
index = between(index, 'footer', footerHTML(homeDate), '</main>', false);
index = between(index, 'css', `${HEAD_COMMON}
<link rel="stylesheet" href="/assets/chrome.css">`, '</head>', true);
fs.writeFileSync('index.html', index);
pages.push({ url: '/', date: homeDate });

/* ---------- 8. CSS de las páginas estáticas ---------- */
const vars = index.slice(index.indexOf(':root{'), index.indexOf('*{box-sizing'));
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/site.css', `/* Generado por build.mjs. Las variables de color se copian de index.html */
${vars}*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:16px;line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
h1,h2,h3{font-family:var(--f-disp);margin:0;text-wrap:balance;letter-spacing:-.01em}
a{color:var(--accent)}
.crumbs{margin:0;font-size:.82rem;color:var(--muted)}
.hero{background:var(--navy);color:#fff;border-radius:18px;border-left:14px solid var(--pc,var(--teal-l));padding:26px 26px 24px;display:flex;flex-direction:column;gap:14px;background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.022) 0 2px,transparent 2px 44px)}
.kicker{margin:0;font-size:.74rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--teal-l)}
h1{font-size:clamp(1.7rem,4.4vw,2.7rem);font-weight:800;line-height:1.06;letter-spacing:-.02em}
.lead{margin:0;color:#c9d3dc;font-size:1.05rem;max-width:70ch}
.tiles{display:flex;flex-wrap:wrap;gap:10px}
.tile{background:var(--navy2);border-radius:12px;padding:10px 16px;min-width:120px;border-top:4px solid var(--teal-l)}
.tile b{display:block;font:800 1.9rem/1 var(--f-disp);color:#fff}.tile span{font-size:.8rem;color:#aeb9c4}
.hero .chip{background:transparent;border-color:#46566a;color:#e6ecf1}.hero .chip b{color:var(--yellow)}
.jump{position:sticky;top:0;z-index:6;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 0;display:flex;flex-direction:column;gap:6px;margin-top:-8px}
.jrow,.filt{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;padding:2px}
.jrow::-webkit-scrollbar,.filt::-webkit-scrollbar{display:none}
.fl{flex:none;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);width:62px}
.jump a{flex:none;display:inline-flex;align-items:center;gap:7px;background:var(--paper);border:1.5px solid var(--line);border-radius:999px;padding:5px 12px;font-size:.86rem;color:var(--ink);text-decoration:none;white-space:nowrap}
.jump a:hover{border-color:var(--accent)}.jump a b{color:var(--muted);font-weight:400;font-size:.78rem}
.jump a i{width:11px;height:11px;border-radius:50%;background:var(--pc)}
.filt[hidden]{display:none}
.filt .chip{flex:none;font:inherit;font-size:.8rem;cursor:pointer;white-space:nowrap;background:var(--paper)}
.filt .chip[aria-pressed="true"]{background:var(--crit);border-color:var(--crit);color:var(--paper)}
.filt .clear{flex:none;font:inherit;font-size:.8rem;background:none;border:0;color:var(--accent);text-decoration:underline;cursor:pointer}
.item[hidden],.block[hidden]{display:none}
.more{border-top:1px solid var(--line);padding-top:16px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:.8rem;border:1.5px solid var(--crit-line);background:var(--crit-bg);color:var(--crit);border-radius:999px;padding:3px 10px}
.party,.topic{background:var(--paper);border:1.5px solid var(--line);border-radius:999px;padding:6px 12px;display:inline-flex;align-items:center;gap:8px;font-size:.88rem;color:var(--ink);text-decoration:none}
.party i{width:12px;height:12px;border-radius:50%;background:var(--pc)}
.party:hover,.topic:hover{border-color:var(--accent)}
.party.on{border-color:var(--ink);font-weight:700}.topic.on{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.sec{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;font-family:var(--f-body)}
.block{display:flex;flex-direction:column;gap:10px;scroll-margin-top:110px}
.block>h2{font-size:1.35rem;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
.block>h2 a{color:inherit;text-decoration-color:var(--line)}
.block>h2 small{font:400 .82rem var(--f-body);color:var(--muted)}.block>h2 small a{color:var(--accent)}
.block>h2.ph{border-left:8px solid var(--pc);padding-left:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:10px;align-items:start}
.item{border-radius:12px;padding:12px 14px;background:var(--obg);display:flex;flex-direction:column;gap:7px;scroll-margin-top:110px;border-left:5px solid var(--pc,transparent)}
.item:target{outline:3px solid var(--accent);outline-offset:2px}
.item p{margin:0;font-size:.97rem}
.tline{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.tag{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--oc)}
.perma{font-size:.7rem;color:var(--muted);text-decoration:none}.perma:hover{text-decoration:underline}
.src{font-size:.78rem;color:var(--muted)}
.note{background:var(--crit-bg);border:1px dashed var(--crit-line);border-radius:8px;padding:7px 9px;font-size:.87rem;display:flex;flex-direction:column;gap:2px}
.note .k{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--crit)}
.note a{font-size:.74rem}
.o-pa{--oc:var(--o-pa);--obg:var(--o-pa-bg)}.o-doc{--oc:var(--o-doc);--obg:var(--o-doc-bg)}.o-dec{--oc:var(--o-dec);--obg:var(--o-dec-bg)}.o-pl{--oc:var(--o-pl);--obg:var(--o-pl-bg)}.o-gob{--oc:var(--o-gob);--obg:var(--o-gob-bg)}.o-p29,.o-p29p{--oc:var(--o-p29);--obg:var(--o-p29-bg)}.o-p29p{outline:1px dashed var(--o-p29);outline-offset:-1px}
.context{background:var(--accent-soft);border-radius:14px;padding:16px 20px;border-left:8px solid var(--accent)}
.context h2{font:700 .8rem var(--f-body);text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:8px}
.context ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;max-width:90ch}
.tablebox{background:var(--paper);border-radius:14px;padding:16px 18px}
.scroll{overflow-x:auto}
.tbl{border-collapse:collapse;width:100%;font-size:.92rem}
.tbl th,.tbl td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.camaras{margin-top:14px;background:var(--paper);border-radius:12px;padding:12px 14px}
.camaras h3{font:700 .78rem var(--f-body);text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin:0 0 6px}
.camaras td:last-child{font-weight:600}
.context .src{font-size:.82rem;color:var(--muted)}
.tbl thead th{font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.tbl th a{color:var(--ink);text-decoration:none;display:inline-flex;gap:8px;align-items:center;white-space:nowrap}.tbl th i{width:12px;height:12px;border-radius:50%}
.mut{color:var(--muted);font-size:.85rem}
.none{border-radius:12px;padding:18px;background:repeating-linear-gradient(135deg,var(--empty) 0 10px,var(--hatch) 10px 20px);color:var(--muted);text-align:center}.none b{display:block;color:var(--ink);font-family:var(--f-disp)}
.prose{background:var(--paper);border-radius:14px;padding:20px 24px}.prose>h2{font-size:1.3rem}.prose p,.prose li{max-width:75ch}.prose p{margin:0}.prose ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}
.flags{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0;font-size:.95rem}.flags dt{font-weight:700;color:var(--crit)}.flags dd{margin:0;color:var(--muted)}
.back{color:var(--muted);font-size:.9rem;margin:0}
@media (max-width:560px){.flags{grid-template-columns:1fr}.hero{padding:18px 16px;border-left-width:9px}.fl{display:none}}
`);


/* ---------- 8b. Dossier de presentación ---------- */
page({
  url: '/dossier',
  title: `Dossier: qué es ${NAME}, el comparador de programas electorales del 29N · ${NAME}`,
  desc: `Dossier de presentación de ${NAME}: qué es, cómo funciona, qué ha encontrado en los programas electorales de las elecciones generales del 29 de noviembre de 2026 y quién lo hace.`,
  nav: 'dossier',
  crumbs: [['Dossier', '/dossier']],
  ld: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Dossier de presentación', url: SITE + '/dossier', author: person, publisher: org, inLanguage: 'es' }],
  body: `<style>
.ds{display:flex;flex-direction:column;gap:22px}
.ds h2{font:800 clamp(1.5rem,3.4vw,2.1rem)/1.08 var(--f-disp);letter-spacing:-.015em;margin:0}
.ds-hero{background:var(--navy);color:#fff;border-radius:22px 22px 22px 8px;padding:34px 30px;display:flex;flex-direction:column;gap:18px}
.ds-hero h1{font:800 clamp(2rem,6vw,3.6rem)/.98 var(--f-disp);letter-spacing:-.025em;margin:0;color:#fff}
.ds-hero h1 em{font-style:normal;color:var(--yellow)}
.ds-hero p{margin:0;color:#d5dde5;font-size:1.12rem;max-width:64ch}
.ds-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.ds-stat{border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:2px}
.ds-stat b{font:800 clamp(1.8rem,5vw,2.8rem)/1 var(--f-disp);letter-spacing:-.03em}
.ds-stat span{font-size:.95rem}
.ds-btns{display:flex;flex-wrap:wrap;gap:10px}
.ds-btn{display:inline-block;background:var(--yellow);color:var(--navy);font:800 1rem var(--f-disp);text-decoration:none;padding:12px 20px;border-radius:12px}
.ds-btn.g{background:transparent;color:#fff;box-shadow:inset 0 0 0 2px #46566a}
.ds-sec{border-radius:22px 22px 22px 8px;padding:28px 26px;display:flex;flex-direction:column;gap:16px}
.ds-paper{background:#eef2f5;color:var(--navy)}
.ds-yellow{background:var(--yellow);color:var(--navy)}
.ds-navy{background:var(--navy);color:#fff}
.ds-teal{background:var(--teal);color:#fff}
.ds-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ds-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ds-card{background:#fff;color:var(--navy);border-radius:18px 18px 18px 6px;padding:18px;display:flex;flex-direction:column;gap:8px}
.ds-card .n{font:800 2.6rem/.9 var(--f-disp);color:var(--red)}
.ds-card h3{font:800 1.2rem var(--f-disp);margin:0}
.ds-card p{margin:0;font-size:.98rem;color:#3d4955}
.ds-num{border-radius:18px 18px 18px 6px;padding:18px;display:flex;flex-direction:column;gap:8px}
.ds-num b{font:800 clamp(2.4rem,7vw,3.8rem)/.86 var(--f-disp);letter-spacing:-.04em}
.ds-num p{margin:0;font-size:1rem;line-height:1.3}
.ds-tag{align-self:flex-start;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;color:#fff;background:var(--teal)}
.ds-dash{border:3px dashed var(--red);border-radius:16px;padding:14px 18px;background:#fff6f4;color:var(--navy);display:flex;flex-direction:column;gap:8px}
.ds-dash p{margin:0;font-weight:700}
.ds-tags{list-style:none;margin:0;padding:18px;background:#fff;border-radius:18px;display:grid;gap:8px}
.ds-tags li{display:grid;grid-template-columns:210px 1fr;gap:14px;align-items:center}
.ds-tags b{text-align:center;color:#fff;background:var(--teal);border-radius:999px;padding:5px 10px;font-size:.88rem}
.ds-tags b.r{background:var(--red)}.ds-tags b.k{background:var(--navy)}
.ds-bar{display:flex;flex-direction:column;gap:5px}
.ds-bar div:first-child{display:flex;justify-content:space-between;gap:10px}
.ds-bar i{display:block;height:16px;border-radius:6px;background:#2f3b49}
.ds-bar i i{background:var(--yellow)}
.ds-rules{list-style:none;margin:0;padding:0;display:grid;gap:14px;counter-reset:r}
.ds-rules li{counter-increment:r;display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start}
.ds-rules li::before{content:counter(r);width:44px;height:44px;border-radius:50%;background:var(--yellow);color:var(--navy);font:800 1.3rem var(--f-disp);display:flex;align-items:center;justify-content:center}
.ds-rules b{display:block;font:800 1.15rem var(--f-disp)}
.ds-rules span{color:#d5dde5}
.ds a.in{color:inherit;font-weight:700}
@media (max-width:760px){.ds-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ds-grid3,.ds-grid2{grid-template-columns:minmax(0,1fr)}.ds-tags li{grid-template-columns:minmax(0,1fr);gap:4px}.ds-tags b{justify-self:start}.ds-sec,.ds-hero{padding:22px 18px}}
</style>
<div class="ds">
<header class="ds-hero"><p class="kicker">Dossier de presentación · Elecciones generales del 29 de noviembre de 2026</p>
<h1>Los programas se escriben para no leerse. <em>Nosotros los hemos leído.</em></h1>
<p>${NAME} es un comparador público que pone al lado de cada promesa lo que el programa calla: cuánto cuesta, quién lo decide, si ya existe y qué votó ese partido cuando pudo.</p>
<div class="ds-stats"><div class="ds-stat" style="background:var(--teal)"><b>${PARTIES.length}</b><span>partidos</span></div><div class="ds-stat" style="background:#fff;color:var(--navy)"><b>${TOPICS.length}</b><span>temas</span></div><div class="ds-stat" style="background:var(--yellow);color:var(--navy)"><b>${ITEMS.length}</b><span>propuestas</span></div><div class="ds-stat" style="background:var(--red)"><b>${nNotesAll}</b><span>observaciones con fuente</span></div></div>
<div class="ds-btns"><a class="ds-btn" href="/assets/dossier-lo-que-no-cuentan.pdf">Descargar el dossier en PDF</a><a class="ds-btn g" href="/#res">Abrir el comparador</a><a class="ds-btn g" href="/datos">Datos abiertos</a></div></header>

<section class="ds-sec ds-paper"><h2>No decimos si una promesa es buena. Decimos lo que le falta.</h2>
<div class="ds-grid3"><div class="ds-card"><span class="n">1</span><h3>La promesa</h3><p>El texto del programa, resumido y sin adjetivos.</p></div><div class="ds-card"><span class="n">2</span><h3>La fuente</h3><p>Documento, número de medida y página, con enlace.</p></div><div class="ds-card"><span class="n">3</span><h3>Lo que no cuenta</h3><p>Una etiqueta y el hecho que la respalda.</p></div></div>
<div class="ds-card"><span class="ds-tag">Un ejemplo real · Programa del PP, medida 144</span><h3>Construir un millón de viviendas.</h3><p><a href="/pp#pp-144">Ver la medida con su fuente</a></p>
<div class="ds-dash"><span class="ds-tag" style="background:var(--red)">Lo que no cuenta · Quimera</span><p>Exige 250.000 viviendas al año. En 2025 se terminaron 92.000. No fija plazo ni dinero.</p></div></div></section>

<section class="ds-sec ds-yellow"><h2>Once etiquetas. Once preguntas que cualquiera puede comprobar.</h2>
<ul class="ds-tags"><li><b>Ya existe</b><span>¿Está ya en vigor o aprobado?</span></li><li><b>Sin concretar</b><span>¿Falta cifra, plazo o forma de hacerlo?</span></li><li><b>Sin coste</b><span>¿Dice cuánto cuesta y cómo se paga?</span></li><li><b>Depende de las CCAA</b><span>¿Puede hacerlo el Gobierno solo?</span></li><li><b>Su voto</b><span>¿Qué votó el partido en el Congreso?</span></li><li><b>Sin cumplir o caída</b><span>¿Lo prometió antes y no salió?</span></li><li><b>Otro ámbito</b><span>¿Viene de otro programa, no de las generales?</span></li><li><b class="r">Dato desmentido</b><span>¿La cifra choca con los datos oficiales?</span></li><li><b class="r">Recorta derechos</b><span>¿Choca con la Constitución o los tribunales?</span></li><li><b class="r">Quimera</b><span>¿Exige un ritmo que nunca se ha alcanzado?</span></li><li><b class="k">Contexto</b><span>Un dato que sitúa la propuesta, sin juicio.</span></li></ul>
<div class="ds-dash"><span class="ds-tag" style="background:var(--red)">La regla de fondo</span><p>Si no hay una ley, una votación, una fecha o un dato oficial que la respalde, no hay observación.</p></div>
<p style="margin:0">Las tres etiquetas en rojo exigen más prueba. <a class="in" href="/metodologia">Método completo</a>.</p></section>

<section class="ds-sec" style="background:#fff;border:2px solid #dfe6ec"><h2>Lo que ya hemos encontrado</h2><p style="margin:0;color:#3d4955">Con la misma vara de medir para todos los partidos.</p>
<div class="ds-sec ds-navy" style="padding:20px"><b>Medidas del programa con alguna cifra, plazo o porcentaje</b>
${Object.keys(CONCR).map(k => `<div class="ds-bar"><div><span>${esc(P[k].name)} · ${CONCR[k].c} de ${CONCR[k].n} medidas</span><b>${pct(k)} %</b></div><i><i style="width:${Math.max(pct(k), 2)}%"></i></i></div>`).join('')}
<span style="color:#aeb9c4;font-size:.92rem">El resto de partidos entrará en el recuento el día que publique programa. <a class="in" href="/metodologia#concrecion">Regla y lista de medidas</a>.</span></div>
<div class="ds-grid3"><div class="ds-num" style="background:var(--red);color:#fff"><b>5</b><p>veces votaron PP y Vox contra normas de vivienda desde 2023. Los dos prometen derogar la Ley de Vivienda. <a class="in" href="/tema/vivienda">Ver</a></p></div><div class="ds-num" style="background:var(--yellow);color:var(--navy)"><b>18</b><p>propuestas del PP llevan la etiqueta «ya existe». <a class="in" href="/pp">Ver</a></p></div><div class="ds-num" style="background:var(--teal);color:#fff"><b>18</b><p>promesas y leyes del PSOE llevan la etiqueta «sin cumplir o caída». <a class="in" href="/psoe">Ver</a></p></div></div>
<div class="ds-dash"><span class="ds-tag" style="background:var(--red)">Cómo leer estas cifras</span><p>Más observaciones no significa peor partido. Suele significar que hay más documentación suya.</p></div></section>

<section class="ds-sec ds-navy"><h2>Seis reglas que protegen la neutralidad</h2>
<ol class="ds-rules"><li><div><b>Misma regla para todos</b><span>La pregunta que se hace a un partido se hace igual a los demás.</span></div></li><li><div><b>Cada observación, con su fuente</b><span>Programa, BOE, Diario de Sesiones o sentencia.</span></div></li><li><div><b>Programa y declaraciones, separados</b><span>Lo dicho en la radio pesa menos que un documento firmado.</span></div></li><li><div><b>Solo medidas, votos y cifras</b><span>Nada de pasado personal ni de retórica de mitin.</span></div></li><li><div><b>Lo cierto se dice, favorezca a quien favorezca</b><span>También cuando da la razón al partido criticado.</span></div></li><li><div><b>Los errores se corrigen en público</b><span>Cada cambio queda en el historial del repositorio.</span></div></li></ol></section>

<section class="ds-sec ds-teal"><h2>Quién lo hace y cómo contactar</h2>
<div class="ds-grid2"><div class="ds-card"><span class="ds-tag">Quién lo hace</span><h3>${esc(AUTHOR)}</h3><p>Profesor universitario, León. Proyecto personal: sin partido, sin financiación externa y sin publicidad.</p></div><div class="ds-card"><span class="ds-tag" style="background:var(--red)">Datos abiertos</span><h3>CSV y JSON · CC BY 4.0</h3><p><a href="/datos">Descargar los datos</a>. <a href="${REPO}" rel="noopener">Código público en GitHub</a>.</p></div>
<div class="ds-card"><span class="ds-tag">Contacto y prensa</span><h3><a href="mailto:${MAIL}">${MAIL}</a></h3><p>Para entrevistas, datos a medida o correcciones.</p></div><div class="ds-card"><span class="ds-tag">Redes</span><h3>${SOCIAL.map(([n, u]) => `<a href="${u}" rel="me noopener">${n}</a>`).join(' · ')}</h3><p>Una pieza al día, alternando partidos y temas.</p></div></div>
<p style="margin:0">Después del 29-N, el comparador pasa a seguir el cumplimiento: cada promesa del nuevo Gobierno, con su estado.</p></section>
</div>`
});

/* ---------- 9. sitemap, robots, llms.txt, IndexNow ---------- */
pages.sort((a, b) => a.url.length - b.url.length || a.url.localeCompare(b.url));
fs.writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `<url><loc>${SITE}${p.url}</loc><lastmod>${p.date}</lastmod></url>`).join('\n')}\n</urlset>\n`);
const BOTS = ['Googlebot', 'Bingbot', 'Applebot', 'OAI-SearchBot', 'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'DuckDuckBot', 'CCBot'];
fs.writeFileSync('robots.txt', `# ${NAME}: todo el contenido es público y se puede rastrear, citar y reutilizar (CC BY 4.0).\n${BOTS.map(b => `User-agent: ${b}\nAllow: /\n`).join('\n')}\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync('llms.txt', `# ${NAME}

> Comparador crítico de los programas electorales de las elecciones generales de España del 29 de noviembre de 2026 (29N, 29-N). Recoge ${ITEMS.length} propuestas de ${PARTIES.length} partidos en ${TOPICS.length} temas. Cada propuesta lleva su fuente y, cuando hay un hecho que lo respalde, una observación: coste, plazos, si ya existe, si depende de las comunidades autónomas o si choca con lo que el partido votó. Misma regla para todos los partidos. Autor: ${AUTHOR}. Sin afiliación. Datos con licencia CC BY 4.0. Actualizado el ${fecha(homeDate)}.

Cada medida tiene un enlace estable con ancla, por ejemplo ${SITE}/pp#pp-144. Al citar, conviene distinguir el origen de cada propuesta: programa del 29-N, declaración, proposición de ley, acción de gobierno o programa anterior.

## Método

- [Metodología y fuentes](${SITE}/metodologia): criterios, significado de cada etiqueta, límites y cómo comunicar errores
- [Datos abiertos](${SITE}/datos): descarga en JSON y CSV
- [medidas.json](${SITE}/datos/medidas.json): todas las propuestas con sus observaciones

## Partidos

${PARTIES.map(([k]) => `- [${P[k].name}](${SITE}/${P[k].slug}): ${plural(P[k].items.length, 'propuesta', 'propuestas')}. ${P[k].short}`).join('\n')}

## Temas

${TOPICS.map(([k]) => `- [${T[k].name}](${SITE}/tema/${T[k].slug}): qué propone cada partido sobre ${T[k].lname}, con tabla comparativa`).join('\n')}

## Partido y tema

${pages.filter(p => p.url.split('/').length === 3 && !p.url.startsWith('/tema/')).map(p => `- ${SITE}${p.url}`).join('\n')}
`);
if (INDEXNOW_KEY) fs.writeFileSync(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY + '\n');
fs.writeFileSync(LM_FILE, JSON.stringify(lastmod, null, 1) + '\n');

/* lista para las imágenes de compartir (tools/og.py) */
fs.mkdirSync('tools', { recursive: true });
fs.writeFileSync('tools/og-list.json', JSON.stringify([
  ...PARTIES.map(([k]) => ({ file: `og/${P[k].slug}.png`, kicker: 'ELECCIONES GENERALES · 29 DE NOVIEMBRE', l1: `Qué propone ${ART[k].replace(' (SALF)', '')}`, l2: 'y qué no cuenta', color: P[k].color, foot: `${plural(P[k].items.length, 'propuesta', 'propuestas')}. Cada una, con su fuente.` })),
  ...TOPICS.map(([k]) => ({ file: `og/tema-${T[k].slug}.png`, kicker: 'ELECCIONES GENERALES · 29 DE NOVIEMBRE', l1: T[k].name, l2: 'qué propone cada partido', color: '#ffd23f', foot: `${plural(new Set(T[k].items.map(i => i.party)).size, 'partido', 'partidos')} comparados. Cada dato, con su fuente.` }))
], null, 1));

console.log(`${pages.length} páginas, ${ITEMS.length} medidas, ${nNotes} observaciones. Fecha de compilación: ${TODAY}`);
