const CACHE_PREFIX = 'prj-ide-preview-v4:';
const clientsToSessions = new Map();

function previewPrefix() {
  return new URL('__preview__/', self.registration.scope).pathname;
}
function normalize(path) {
  const out=[];
  for (const p of path.replace(/\\/g,'/').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop(); else out.push(p);
  }
  return out.join('/');
}
function cacheName(id) { return CACHE_PREFIX + id; }
function cacheUrl(path) { return new URL(previewPrefix() + path, self.registration.scope).href; }
function mime(path) {
  const p=path.toLowerCase().split('?')[0].split('#')[0];
  const ext=p.includes('.') ? p.slice(p.lastIndexOf('.')+1) : '';
  return ({html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',wasm:'application/wasm',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',pdf:'application/pdf',mp3:'audio/mpeg',mp4:'video/mp4',webm:'video/webm',ogg:'audio/ogg'})[ext] || 'application/octet-stream';
}
async function getSession(clientId, url) {
  const explicit=url.searchParams.get('session');
  if (explicit) { if (clientId) clientsToSessions.set(clientId, explicit); return explicit; }
  if (clientId && clientsToSessions.has(clientId)) return clientsToSessions.get(clientId);
  if (clientId) {
    const c=await self.clients.get(clientId);
    const s=c?.url ? new URL(c.url).searchParams.get('session') : null;
    if (s) { clientsToSessions.set(clientId,s); return s; }
  }
  return null;
}
async function projectPath(request, clientId) {
  const url=new URL(request.url), prefix=previewPrefix();
  if (url.pathname.startsWith(prefix)) return normalize(url.pathname.slice(prefix.length));
  const session=await getSession(clientId,url);
  if (!session) return null;
  return normalize(url.pathname.replace(/^\/+/,''));
}
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => {
  const d=e.data||{};
  if (d.type==='SET_PROJECT') {
    e.waitUntil((async()=>{
      const id=d.session;
      const cache=await caches.open(cacheName(id));
      const wanted=new Set();
      for (const f of d.files||[]) {
        const path=normalize(f.path); if(!path) continue;
        wanted.add(path);
        const body=f.data instanceof ArrayBuffer ? f.data : new Uint8Array(f.data).buffer;
        await cache.put(cacheUrl(path), new Response(body,{headers:{'Content-Type':mime(path),'Cache-Control':'no-cache'}}));
      }
      const keys=await cache.keys();
      for(const req of keys){ const p=normalize(new URL(req.url).pathname.slice(previewPrefix().length)); if(!wanted.has(p)) await cache.delete(req); }
      if(e.source?.id) clientsToSessions.set(e.source.id,id);
      e.ports?.[0]?.postMessage({ok:true});
    })().catch(err=>e.ports?.[0]?.postMessage({ok:false,error:String(err)})));
  }
  if(d.type==='CLEAR_PROJECT' && d.session) e.waitUntil(caches.delete(cacheName(d.session)));
});
self.addEventListener('fetch', e => {
  const url=new URL(e.request.url), prefix=previewPrefix();
  if (url.origin !== self.location.origin) return;
  const isPreview=url.pathname.startsWith(prefix);
  if(!isPreview && !clientsToSessions.has(e.clientId)) return;
  e.respondWith((async()=>{
    const session=await getSession(e.clientId,url);
    if(!session) return fetch(e.request);
    let path=await projectPath(e.request,e.clientId);
    if(path==='' || path.endsWith('/')) path += 'index.html';
    const cache=await caches.open(cacheName(session));
    const reqUrl=cacheUrl(path);
    let response=await cache.match(reqUrl);
    if(!response) {
      // Common fallback for SPA-like static projects.
      const accept=e.request.headers.get('accept')||'';
      if(e.request.mode==='navigate' && accept.includes('text/html')) response=await cache.match(cacheUrl('index.html'));
    }
    if(response) return response;
    return new Response('Not found: /'+path,{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
