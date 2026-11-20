"use strict";

const cacheName="phaseweave-widget-shell-v1";
const urls=["live-widgets.html","live-widgets.js","style.css","desk.css",
  "widgets.webmanifest","widget-icon-192.png","widget-icon-512.png"]
  .map(name=>new URL(name,self.registration.scope).href);
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(urls)));
});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  const key=new URL(url);
  key.search="";
  if(event.request.method!=="GET"||!urls.includes(key.href))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(!response.ok)return response;
    const copy=response.clone();
    caches.open(cacheName).then(cache=>cache.put(key.href,copy));
    return response;
  }).catch(()=>caches.match(key.href,{cacheName})));
});
