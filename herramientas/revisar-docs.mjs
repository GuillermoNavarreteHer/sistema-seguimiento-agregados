#!/usr/bin/env node
/*
  Revisa la documentación (*.md) del repositorio:
    • enlaces e imágenes relativos que existan (y anclas #… dentro del archivo destino)
    • tablas con el mismo número de columnas en cada fila
    • diagramas Mermaid compilados con el compilador REAL (mermaid + navegador)
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  Uso: npm run revisar:docs   (requiere npm install y npx playwright install chromium)
*/
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const errores = [], diagramas = [];
const mds = [];
(function rec(d) { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) { if (!['node_modules', '.git'].includes(n.name)) rec(p); } else if (n.name.endsWith('.md')) mds.push(p); } })(RAIZ);

// Anclas al estilo GitHub: minúsculas, sin puntuación, espacios → guiones
const ancla = (t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
const anclasDe = (archivo) => new Set(fs.readFileSync(archivo, 'utf8').split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => ancla(l.replace(/^#+ /, ''))));

for (const md of mds) {
  const rel = path.relative(RAIZ, md), texto = fs.readFileSync(md, 'utf8');
  const sinCodigo = texto.replace(/```[\s\S]*?```/g, (m) => (m.startsWith('```mermaid') ? (diagramas.push([rel, m.slice(10, -3).trim()]), '') : ''));
  for (const m of sinCodigo.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)|<img[^>]+src="([^"]+)"/g)) {
    const destino = m[1] || m[2];
    if (/^(https?:|mailto:)/.test(destino)) continue;
    const [ruta, frag] = destino.split('#');
    const archivo = ruta ? path.resolve(path.dirname(md), decodeURIComponent(ruta)) : md;
    if (!fs.existsSync(archivo)) { errores.push(`${rel}: no existe «${destino}»`); continue; }
    if (frag && archivo.endsWith('.md') && !anclasDe(archivo).has(frag)) errores.push(`${rel}: el ancla «#${frag}» no existe en ${path.relative(RAIZ, archivo)}`);
  }
  // Tablas: todas las filas con el mismo número de columnas que el encabezado
  const lineas = sinCodigo.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (!/^\|.*\|\s*$/.test(lineas[i]) || !/^\|[\s:|-]+\|\s*$/.test(lineas[i + 1] || '')) continue;
    const cols = (l) => l.trim().replace(/\\\|/g, '').split('|').length - 2;
    const n = cols(lineas[i]);
    for (let j = i + 1; j < lineas.length && /^\|/.test(lineas[j]); j++) if (cols(lineas[j]) !== n) errores.push(`${rel}:${j + 1}: la fila tiene ${cols(lineas[j])} columnas y el encabezado ${n}`);
  }
}

// Mermaid con el compilador real
let mermaidOk = 0;
try {
  const { chromium } = await import('playwright');
  const libreria = fs.readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');
  const b = await chromium.launch(), pg = await b.newPage();
  await pg.setContent('<html><body></body></html>');
  await pg.addScriptTag({ content: libreria });
  for (const [rel, codigo] of diagramas) {
    const r = await pg.evaluate(async (c) => {
      try { window.mermaid.initialize({ startOnLoad: false }); await window.mermaid.parse(c); await window.mermaid.render('d' + Math.random().toString(36).slice(2), c); return 'ok'; }
      catch (e) { return String(e && e.message || e).split('\n').slice(0, 3).join(' '); }
    }, codigo);
    if (r === 'ok') mermaidOk++; else errores.push(`${rel}: Mermaid no compila → ${r}`);
  }
  await b.close();
} catch (e) {
  errores.push('No se pudo validar Mermaid (¿npm install y npx playwright install chromium?): ' + e.message.split('\n')[0]);
}

errores.forEach((e) => console.error('✖ ' + e));
console.log(`${mds.length} documentos · ${diagramas.length} diagramas Mermaid (${mermaidOk} compilan) · ${errores.length} error(es)`);
process.exit(errores.length ? 1 : 0);
