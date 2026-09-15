const APP_BUILD_VERSION = process.env.NEXT_PUBLIC_APP_BUILD_VERSION ?? "development";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const version = JSON.stringify(APP_BUILD_VERSION);
  const script = `const WORKER_VERSION=${version};
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)));await self.clients.claim();const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});for(const client of clients)client.postMessage({type:"MENU_WORKER_ACTIVATED",version:WORKER_VERSION})})())});
self.addEventListener("fetch",event=>{const url=new URL(event.request.url);if(event.request.mode==="navigate"){event.respondWith(fetch(event.request,{cache:"no-store"}));return}if(url.origin===self.location.origin&&url.pathname==="/api/menu"){event.respondWith((async()=>{const response=await fetch(event.request);const serverVersion=response.headers.get("x-menu-build-version");if(serverVersion&&serverVersion!==WORKER_VERSION){const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});for(const client of clients)client.postMessage({type:"MENU_BUILD_OUTDATED",version:serverVersion})}return response})())}});`;
  return new Response(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
