import { Router } from 'express';

import { buildOpenApiDocument } from './build.js';

/**
 * @file OpenAPI documentation endpoints.
 *
 * - `GET /api/v1/openapi.json` — the generated OpenAPI 3.1 spec (importable into
 *   Swagger UI, Postman, Insomnia, code generators).
 * - `GET /docs` — a self-contained, dependency-free API explorer that renders
 *   the spec (grouped by tag, with auth, parameters, request body and response
 *   schemas). Ships its own CSP so it works under Helmet without external CDNs.
 *
 * The spec is built once and cached for the process lifetime.
 *
 * @module openapi/docs.routes
 */

/** @type {object|null} */
let cachedSpec = null;
/** @returns {object} */
function spec() {
  if (!cachedSpec) cachedSpec = buildOpenApiDocument();
  return cachedSpec;
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dual Music API — Docs</title>
<style>
  :root{--bg:#0b0d12;--card:#151922;--muted:#8b93a7;--fg:#e6e9ef;--line:#232838;--get:#3fb950;--post:#58a6ff;--put:#d29922;--patch:#a371f7;--delete:#f85149}
  *{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
  header{padding:20px 24px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
  header h1{margin:0;font-size:18px}header p{margin:4px 0 0;color:var(--muted)}
  .wrap{max-width:1000px;margin:0 auto;padding:16px 24px 80px}
  .tag{margin:24px 0 8px;font-size:16px;color:var(--fg);border-bottom:1px solid var(--line);padding-bottom:6px}
  .op{border:1px solid var(--line);border-radius:8px;margin:8px 0;overflow:hidden;background:var(--card)}
  .op summary{cursor:pointer;padding:10px 12px;display:flex;gap:10px;align-items:center;list-style:none}
  .op summary::-webkit-details-marker{display:none}
  .m{font-weight:700;text-transform:uppercase;font-size:11px;padding:3px 8px;border-radius:5px;color:#0b0d12;min-width:52px;text-align:center}
  .path{font-family:ui-monospace,Menlo,monospace;color:var(--fg)}
  .lock{margin-left:auto;color:var(--muted);font-size:12px}
  .body{padding:0 14px 14px;border-top:1px solid var(--line)}
  .lbl{color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.04em;margin:12px 0 4px}
  pre{background:#0b0d12;border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;margin:0}
  table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);font-size:13px}
  code{font-family:ui-monospace,Menlo,monospace}
  .req{color:var(--delete);font-size:11px}
</style></head><body>
<header><h1>Dual Music API</h1><p>OpenAPI 3.1 · <a href="/api/v1/openapi.json" style="color:var(--post)">openapi.json</a></p></header>
<div class="wrap" id="app">Loading…</div>
<script>
const COLORS={get:'--get',post:'--post',put:'--put',patch:'--patch',delete:'--delete'};
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function schemaPre(s){return '<pre>'+esc(JSON.stringify(s,null,2))+'</pre>'}
fetch('/api/v1/openapi.json').then(r=>r.json()).then(doc=>{
  const app=document.getElementById('app');app.innerHTML='';
  const byTag={};
  for(const [path,methods] of Object.entries(doc.paths)){
    for(const [m,op] of Object.entries(methods)){
      const t=(op.tags&&op.tags[0])||'Other';(byTag[t]=byTag[t]||[]).push({path,m,op});
    }
  }
  for(const tag of Object.keys(byTag).sort()){
    const h=document.createElement('div');h.className='tag';h.textContent=tag;app.appendChild(h);
    for(const {path,m,op} of byTag[tag].sort((a,b)=>a.path.localeCompare(b.path))){
      const d=document.createElement('details');d.className='op';
      const color=getComputedStyle(document.documentElement).getPropertyValue(COLORS[m]||'--get');
      let inner='<summary><span class="m" style="background:'+color+'">'+m+'</span>'+
        '<span class="path">'+esc(path)+'</span>'+
        (op.security?'<span class="lock">🔒 '+(op.description&&/role/i.test(op.description)?esc(op.description):'auth')+'</span>':'')+
        '</summary><div class="body">';
      if(op.description&&!op.security) inner+='<p style="color:var(--muted)">'+esc(op.description)+'</p>';
      if(op.parameters&&op.parameters.length){
        inner+='<div class="lbl">Parameters</div><table><tr><th>Name</th><th>In</th><th>Type</th><th></th></tr>';
        for(const p of op.parameters) inner+='<tr><td><code>'+esc(p.name)+'</code></td><td>'+p.in+'</td><td>'+esc((p.schema&&p.schema.type)||'')+(p.schema&&p.schema.enum?' ('+p.schema.enum.map(esc).join('|')+')':'')+'</td><td>'+(p.required?'<span class="req">required</span>':'')+'</td></tr>';
        inner+='</table>';
      }
      if(op.requestBody){const sch=op.requestBody.content['application/json'].schema;inner+='<div class="lbl">Request body</div>'+schemaPre(sch);}
      inner+='<div class="lbl">Responses</div><table><tr><th>Code</th><th>Description</th></tr>';
      for(const [code,resp] of Object.entries(op.responses)) inner+='<tr><td><code>'+code+'</code></td><td>'+esc(resp.description||'')+'</td></tr>';
      inner+='</table></div>';
      d.innerHTML=inner;app.appendChild(d);
    }
  }
});
</script></body></html>`;

export const docsRouter = Router();

/** GET /api/v1/openapi.json — the generated spec. */
docsRouter.get('/api/v1/openapi.json', (_req, res) => res.json(spec()));

/** GET /docs — self-contained API explorer (own CSP; no external assets). */
docsRouter.get('/docs', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
  res.type('html').send(PAGE);
});

export default docsRouter;
