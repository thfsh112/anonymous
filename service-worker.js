const CACHE_NAME="anonymous-mailbox-v1.18.7";
const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .catch(()=>null)
  );
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==="navigate"){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put("./index.html",copy));
          return response;
        })
        .catch(()=>caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached)return cached;
      return fetch(event.request).then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
        }
        return response;
      });
    })
  );
});

self.addEventListener("push",event=>{
  let payload={
    title:"匿名信箱",
    body:"你收到一則新的匿名訊息",
    tag:"new-anonymous-message",
    data:{url:"./"}
  };

  if(event.data){
    try{
      payload={...payload,...event.data.json()};
    }catch{
      try{payload.body=event.data.text()||payload.body}catch{}
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title||"匿名信箱",{
      body:payload.body||"你收到一則新的匿名訊息",
      icon:"./icons/icon-192.png",
      badge:"./icons/icon-192.png",
      tag:payload.tag||"new-anonymous-message",
      renotify:true,
      data:payload.data||{url:"./"}
    })
  );
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification.data?.url||"./";

  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if("focus" in client){
          client.navigate(target).catch(()=>null);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
