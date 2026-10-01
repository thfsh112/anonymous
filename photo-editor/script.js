const canvas=document.getElementById('canvas');

const CLOUD_API='https://roynzxilxumfzzuezelg.supabase.co/functions/v1/photo-editor-api';
const CLOUD_TOKEN_KEY='marsedit_owner_token_v1';
function getCloudToken(){
 let token=localStorage.getItem(CLOUD_TOKEN_KEY);
 if(!token){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);token=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(CLOUD_TOKEN_KEY,token);}
 return token;
}
function cloudStatus(text){const el=document.getElementById('cloudStatus');if(el)el.textContent=text;}
async function uploadToCloud(){
 if(!original)return;
 cloudStatus('正在上傳到 Supabase…');
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
 if(!blob){cloudStatus('無法建立照片檔案');return;}
 const form=new FormData();form.append('owner_token',getCloudToken());form.append('file',blob,sourceName+'_marsedit.jpg');form.append('original_name',sourceName);
 const res=await fetch(CLOUD_API,{method:'POST',body:form});const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.ok)throw new Error(data.error||'cloud_upload_failed');
 cloudStatus('已同步到 Supabase ✓');return data.photo;
}
async function loadCloudPhotos(){
 const panel=document.getElementById('cloudPanel');if(panel)panel.hidden=false;cloudStatus('正在讀取雲端照片…');
 const res=await fetch(CLOUD_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',owner_token:getCloudToken()})});
 const data=await res.json().catch(()=>({}));if(!res.ok||!data.ok)throw new Error(data.error||'cloud_list_failed');
 const gallery=document.getElementById('cloudGallery');if(!gallery)return;
 if(!data.photos.length){gallery.innerHTML='<div class="cloud-empty">還沒有儲存到雲端的照片</div>';cloudStatus('0 張照片');return;}
 gallery.innerHTML=data.photos.map(p=>'<button class="cloud-photo" data-url="'+p.image_url.replace(/"/g,'&quot;')+'"><img src="'+p.image_url+'" loading="lazy"><span>'+(p.original_name||'photo')+'</span><small>'+([p.camera,p.focal_length,p.aperture,p.iso].filter(Boolean).join(' · ')||'MARSEDIT')+'</small></button>').join('');
 gallery.querySelectorAll('.cloud-photo').forEach(b=>b.onclick=()=>loadCloudImage(b.dataset.url));
 cloudStatus(data.photos.length+' 張照片');
}
function loadCloudImage(url){
 const next=new Image();next.crossOrigin='anonymous';next.onload=()=>{const scale=Math.min(1,1800/Math.max(next.naturalWidth,next.naturalHeight));canvas.width=Math.round(next.naturalWidth*scale);canvas.height=Math.round(next.naturalHeight*scale);original=next;empty.hidden=true;canvas.hidden=false;editor.hidden=false;stageTools.hidden=false;activeCamera=null;activeFilter='Original';render();};next.onerror=()=>cloudStatus('照片載入失敗');next.src=url;
}
document.getElementById('cloud').onclick=async()=>{try{await loadCloudPhotos();}catch(e){cloudStatus('雲端讀取失敗：'+e.message);}};
document.getElementById('cloudRefresh').onclick=async()=>{try{await loadCloudPhotos();}catch(e){cloudStatus('雲端讀取失敗：'+e.message);}};


const ctx=canvas.getContext('2d',{willReadFrequently:true});
const file=document.getElementById('file');
const empty=document.getElementById('empty');
const editor=document.getElementById('editor');
const stageTools=document.getElementById('stageTools');
const adjustPanel=document.getElementById('adjustPanel');
const filterPanel=document.getElementById('filterPanel');
const cameraPanel=document.getElementById('cameraPanel');
const effectPanel=document.getElementById('effectPanel');

let img=new Image();
let original=null;
let sourceName='photo';
let activeFilter='Original';
let activeCamera=null;
let effects={grain:0,vignette:0,warm:0};

const controls=[
 ['exposure','曝光',-100,100,0],
 ['contrast','對比',-100,100,0],
 ['highlights','高光',-100,100,0],
 ['shadows','陰影',-100,100,0],
 ['whites','白色',-100,100,0],
 ['blacks','黑色',-100,100,0],
 ['saturation','飽和度',-100,100,0],
 ['vibrance','自然飽和',-100,100,0],
 ['temperature','色溫',-100,100,0],
 ['tint','色調',-100,100,0],
 ['sharpness','銳利度',0,100,0],
 ['fade','褪色',0,100,0],
 ['grain','顆粒',0,100,0],
 ['vignette','暗角',0,100,0]
];

const values=Object.fromEntries(controls.map(x=>[x[0],x[4]]));

function makeControls(){
 adjustPanel.innerHTML=controls.map(([id,name,min,max,val])=>`
 <div class="row">
  <div class="rowhead"><span>${name}</span><span class="value" id="v-${id}">${val}</span></div>
  <input type="range" min="${min}" max="${max}" value="${val}" data-id="${id}">
 </div>`).join('');
 adjustPanel.querySelectorAll('input').forEach(r=>{
  r.oninput=()=>{
   values[r.dataset.id]=+r.value;
   const v=document.getElementById('v-'+r.dataset.id);
   if(v)v.textContent=r.value;
   activeCamera=null;
   render();
  };
 });
}
makeControls();

/*
 * 真正的像素濾鏡。
 * 每個濾鏡都有自己的：
 * - RGB 色彩偏移
 * - 對比 / 飽和度
 * - 高光與陰影處理
 * - 黑位 / 白位
 * - 色溫
 * - 褪色
 * 不再只是 CSS filter。
 */
const filters={
 'Original':{},
 'Soft Film':{
  exposure:2,contrast:-10,saturation:-8,vibrance:14,
  temperature:5,highlights:-20,shadows:16,fade:5,
  r:3,g:1,b:-1
 },
 'Warm Film':{
  exposure:1,contrast:4,saturation:4,vibrance:8,
  temperature:13,highlights:-16,shadows:8,fade:4,
  r:7,g:1,b:-6
 },
 'Cool Film':{
  exposure:0,contrast:7,saturation:-3,vibrance:8,
  temperature:-16,highlights:-10,shadows:7,fade:2,
  r:-5,g:1,b:9
 },
 'CCD':{
  exposure:4,contrast:18,saturation:22,vibrance:18,
  temperature:-3,highlights:-13,shadows:-5,fade:0,
  r:2,g:1,b:5,sharp:12
 },
 '2000s DC':{
  exposure:5,contrast:13,saturation:-2,vibrance:6,
  temperature:3,highlights:-8,shadows:-2,fade:2,
  r:5,g:2,b:-2,green:3,sharp:5
 },
 'Polaroid':{
  exposure:7,contrast:-14,saturation:-13,vibrance:3,
  temperature:10,highlights:-25,shadows:20,fade:11,
  r:8,g:3,b:-7,matte:12
 },
 'Instax':{
  exposure:9,contrast:-11,saturation:-10,vibrance:0,
  temperature:7,highlights:-21,shadows:19,fade:14,
  r:6,g:4,b:-4,matte:16
 },
 'Night Flash':{
  exposure:-5,contrast:25,saturation:12,vibrance:16,
  temperature:-10,highlights:-23,shadows:-24,fade:0,
  r:-2,g:1,b:8,sharp:8
 },
 'Retro':{
  exposure:2,contrast:-8,saturation:-16,vibrance:5,
  temperature:20,highlights:-17,shadows:15,fade:18,
  r:12,g:3,b:-10,matte:8
 },
 'B&W':{
  exposure:0,contrast:19,saturation:-100,vibrance:0,
  highlights:-17,shadows:8,fade:3,
  mono:1,sharp:5
 },
 'Dazz 風':{
  exposure:-1,contrast:24,saturation:-12,vibrance:16,
  temperature:-24,highlights:-30,shadows:-18,fade:1,
  r:-10,g:3,b:20,sharp:5
 },
 'Faded':{
  exposure:5,contrast:-18,saturation:-25,vibrance:-2,
  temperature:4,highlights:-20,shadows:20,fade:24,
  r:5,g:3,b:1,matte:20
 }
};

const filterDescriptions={
 'Original':'原始照片',
 'Soft Film':'柔霧、低對比、底片感',
 'Warm Film':'暖黃色、柔和底片',
 'Cool Film':'冷藍色、清透感',
 'CCD':'高飽和、數位亮感',
 '2000s DC':'老數位相機、偏綠',
 'Polaroid':'奶油白、褪色、柔和',
 'Instax':'明亮粉霧、拍立得感',
 'Night Flash':'強閃光、高反差',
 'Retro':'復古橘黃、褪色',
 'B&W':'黑白銀鹽感',
 'Dazz 風':'冷青綠、深黑、青藍高光、CCD 顆粒',
 'Faded':'低飽和、霧面褪色'
};

filterPanel.innerHTML='<div class="filter-grid">'+
 Object.keys(filters).map(n=>`
 <button class="filter ${n==='Original'?'active':''}" data-filter="${n}">
  <div class="thumb"></div><small>${n}</small>
 </button>`).join('')+
 '</div>';

filterPanel.querySelectorAll('.filter').forEach(b=>{
 b.onclick=()=>{
  activeFilter=b.dataset.filter;
  activeCamera=null;
  filterPanel.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));
  render();
 };
});

const cameras={
 '35mm 底片':{
  icon:'🎞️',desc:'乳化高光・細顆粒・自然膚色',
  base:{exposure:-2,contrast:2,highlights:-28,shadows:18,saturation:-12,vibrance:10,temperature:8,tint:1,fade:5,grain:30,vignette:10,sharpness:2},
  filter:'Soft Film'
 },
 'CCD 數位相機':{
  icon:'📷',desc:'CCD 偏色・高飽和・數位噪點',
  base:{exposure:2,contrast:22,highlights:-3,shadows:-14,saturation:31,vibrance:22,temperature:-7,tint:-2,fade:0,grain:10,vignette:5,sharpness:18},
  filter:'CCD'
 },
 '2000s 老 DC':{
  icon:'💿',desc:'直打閃光・偏色・日期印字',
  base:{exposure:4,contrast:25,highlights:10,shadows:-22,saturation:18,vibrance:14,temperature:-4,tint:-5,fade:1,grain:18,vignette:13,sharpness:12},
  filter:'2000s DC'
 },
 '拍立得':{
  icon:'🖼️',desc:'乳白黑位・柔焦・粉霧色彩',
  base:{exposure:7,contrast:-22,highlights:-28,shadows:32,saturation:-18,vibrance:0,temperature:14,tint:4,fade:18,grain:8,vignette:8,sharpness:0},
  filter:'Polaroid'
 },
 '日系底片':{
  icon:'🌿',desc:'青綠陰影・亮白・低反差',
  base:{exposure:7,contrast:-14,highlights:-30,shadows:30,saturation:-17,vibrance:18,temperature:-1,tint:-4,fade:9,grain:16,vignette:3,sharpness:2},
  filter:'Cool Film'
 },
 '夜間閃光燈':{
  icon:'⚡',desc:'中心爆閃・背景快速變暗',
  base:{exposure:-6,contrast:34,highlights:12,shadows:-38,saturation:20,vibrance:18,temperature:-11,tint:2,fade:0,grain:16,vignette:22,sharpness:16},
  filter:'Night Flash'
 },
 '復古暖色':{
  icon:'🧸',desc:'琥珀色・奶油高光・重顆粒',
  base:{exposure:2,contrast:-10,highlights:-25,shadows:20,saturation:-21,vibrance:8,temperature:28,tint:5,fade:23,grain:32,vignette:15,sharpness:0},
  filter:'Retro'
 },
 '黑白底片':{
  icon:'🖤',desc:'銀鹽反差・深黑・粗顆粒',
  base:{exposure:-1,contrast:30,highlights:-25,shadows:8,saturation:-100,vibrance:0,temperature:0,tint:0,fade:2,grain:34,vignette:17,sharpness:9},
  filter:'B&W'
 }
};

cameraPanel.innerHTML='<div class="camera-grid">'+
 Object.keys(cameras).map(n=>{
  const c=cameras[n];
  return `
  <button class="camera-card" data-camera="${n}">
   <div class="camera-icon">${c.icon}</div>
   <strong>${n}</strong>
   <small>${c.desc}</small>
  </button>`;
 }).join('')+
 '</div>';

cameraPanel.querySelectorAll('.camera-card').forEach(b=>{
 b.onclick=()=>applyCamera(b.dataset.camera);
});

function applyCamera(name){
 const camera=cameras[name];
 activeCamera=name;
 activeFilter=camera.filter;

 controls.forEach(([id])=>{
  if(camera.base[id]===undefined)return;
  values[id]=camera.base[id];
  const r=adjustPanel.querySelector('[data-id="'+id+'"]');
  const v=document.getElementById('v-'+id);
  if(r)r.value=camera.base[id];
  if(v)v.textContent=camera.base[id];
 });

 filterPanel.querySelectorAll('.filter').forEach(x=>{
  x.classList.toggle('active',x.dataset.filter===activeFilter);
 });

 render();

 cameraPanel.querySelectorAll('.camera-card').forEach(x=>{
  x.style.borderColor=x.dataset.camera===name?'var(--accent)':'';
  x.style.background=x.dataset.camera===name?'var(--accent-soft)':'';
 });
}

effectPanel.innerHTML='<div class="effect-grid">'+
 '<button data-e="grain">顆粒</button>'+
 '<button data-e="vignette">暗角</button>'+
 '<button data-e="warm">漏光暖調</button>'+
 '</div>';

effectPanel.querySelectorAll('button').forEach(b=>{
 b.onclick=()=>{
  const k=b.dataset.e;
  effects[k]=effects[k]?0:50;
  b.classList.toggle('active');
  if(k==='grain')values.grain=effects[k];
  if(k==='vignette')values.vignette=effects[k];
  render();
 };
});

document.querySelectorAll('.tab').forEach(t=>{
 t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  ['adjust','filter','camera','effect'].forEach(x=>{
   document.getElementById(x+'Panel').classList.toggle('hidden',t.dataset.tab!==x);
  });
 };
});

file.onchange=e=>{
 const f=e.target.files[0];
 if(!f)return;
 sourceName=f.name.replace(/\.[^.]+$/,'');
 const u=URL.createObjectURL(f);
 img.onload=()=>{
  const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.round(img.naturalWidth*scale);
  canvas.height=Math.round(img.naturalHeight*scale);
  original=img;
  empty.hidden=true;
  canvas.hidden=false;
  editor.hidden=false;
  stageTools.hidden=false;
  activeCamera=null;
  render();
  URL.revokeObjectURL(u);
 };
 img.src=u;
};

document.getElementById('change').onclick=()=>file.click();
document.getElementById('resetTop').onclick=reset;

document.getElementById('download').onclick=async()=>{
 render();
 const a=document.createElement('a');
 a.download=sourceName+'_marsedit.jpg';
 a.href=canvas.toDataURL('image/jpeg',.94);
 a.click();
 try{await uploadToCloud();}catch(e){cloudStatus('雲端同步失敗：'+e.message);}
};

const before=document.getElementById('beforeBtn');

before.onpointerdown=()=>{
 if(!original)return;
 ctx.drawImage(original,0,0,canvas.width,canvas.height);
};

before.onpointerup=render;
before.onpointercancel=render;
before.onpointerleave=render;

function reset(){
 controls.forEach(([id,,min,max,val])=>{
  values[id]=val;
  const r=adjustPanel.querySelector('[data-id="'+id+'"]');
  const v=document.getElementById('v-'+id);
  if(r)r.value=val;
  if(v)v.textContent=val;
 });
 activeFilter='Original';
 activeCamera=null;
 effects={grain:0,vignette:0,warm:0};
 filterPanel.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x.dataset.filter==='Original'));
 cameraPanel.querySelectorAll('.camera-card').forEach(x=>{
  x.style.borderColor='';
  x.style.background='';
 });
 effectPanel.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
 if(original)render();
}

function clamp(v){
 return Math.max(0,Math.min(255,v));
}

function lerp(a,b,t){
 return a+(b-a)*t;
}

function smoothstep(a,b,x){
 const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
 return t*t*(3-2*t);
}

function rgbToHsl(r,g,b){
 r/=255;g/=255;b/=255;
 const max=Math.max(r,g,b),min=Math.min(r,g,b);
 let h=0,s=0;
 const l=(max+min)/2;
 if(max!==min){
  const d=max-min;
  s=l>0.5?d/(2-max-min):d/(max+min);
  switch(max){
   case r:h=(g-b)/d+(g<b?6:0);break;
   case g:h=(b-r)/d+2;break;
   case b:h=(r-g)/d+4;break;
  }
  h/=6;
 }
 return [h,s,l];
}

function hue2rgb(p,q,t){
 if(t<0)t+=1;
 if(t>1)t-=1;
 if(t<1/6)return p+(q-p)*6*t;
 if(t<1/2)return q;
 if(t<2/3)return p+(q-p)*(2/3-t)*6;
 return p;
}

function hslToRgb(h,s,l){
 if(s===0)return [l*255,l*255,l*255];
 const q=l<0.5?l*(1+s):l+s-l*s;
 const p=2*l-q;
 return [
  hue2rgb(p,q,h+1/3)*255,
  hue2rgb(p,q,h)*255,
  hue2rgb(p,q,h-1/3)*255
 ];
}

function applyColorProfile(r,g,b,f){
 if(!f)return [r,g,b];

 if(f.mono){
  const y=.2126*r+.7152*g+.0722*b;
  r=g=b=y;
 }

 const exposure=f.exposure||0;
 if(exposure){
  const e=Math.pow(2,exposure/100);
  r*=e;g*=e;b*=e;
 }

 const contrast=f.contrast||0;
 if(contrast){
  const c=(contrast+100)/100;
  r=(r-128)*c+128;
  g=(g-128)*c+128;
  b=(b-128)*c+128;
 }

 const sat=(f.saturation||0)/100;
 if(sat){
  const y=.2126*r+.7152*g+.0722*b;
  const s=1+sat;
  r=y+(r-y)*s;
  g=y+(g-y)*s;
  b=y+(b-y)*s;
 }

 if(f.vibrance){
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),range=mx-mn;
  const y=.2126*r+.7152*g+.0722*b;
  const amount=(f.vibrance/100)*(1-range/255);
  r=y+(r-y)*(1+amount);
  g=y+(g-y)*(1+amount);
  b=y+(b-y)*(1+amount);
 }

 if(f.highlights){
  const t=smoothstep(100,255,(r+g+b)/3);
  const k=(f.highlights/100)*t;
  r+=k*(128-r);
  g+=k*(128-g);
  b+=k*(128-b);
 }

 if(f.shadows){
  const t=1-smoothstep(0,150,(r+g+b)/3);
  const k=(f.shadows/100)*t;
  r+=k*(255-r)*.45;
  g+=k*(255-g)*.45;
  b+=k*(255-b)*.45;
 }

 if(f.matte){
  const m=f.matte/100;
  r=lerp(r,Math.max(r,18),m*.22);
  g=lerp(g,Math.max(g,18),m*.22);
  b=lerp(b,Math.max(b,18),m*.22);
 }

 if(f.temperature){
  const t=f.temperature;
  r+=t*.55;
  g+=t*.08;
  b-=t*.55;
 }

 if(f.r)r+=f.r;
 if(f.g)g+=f.g;
 if(f.b)b+=f.b;
 if(f.green)g+=f.green;

 if(f.fade){
  const fde=f.fade/100;
  r=lerp(r,238,fde*.32);
  g=lerp(g,232,fde*.32);
  b=lerp(b,225,fde*.32);
 }

 if(f.mono){
  const y=.2126*r+.7152*g+.0722*b;
  r=g=b=y;
 }

 return [r,g,b];
}

function render(){
 if(!original)return;

 ctx.drawImage(original,0,0,canvas.width,canvas.height);

 let d=ctx.getImageData(0,0,canvas.width,canvas.height);
 const p=d.data;
 const f=filters[activeFilter]||{};

 const ex=Math.pow(2,values.exposure/100);
 const co=(values.contrast+100)/100;
 const sat=(values.saturation+100)/100;
 const temp=values.temperature*.55;
 const tint=values.tint*.3;
 const sh=values.shadows/100;
 const hi=values.highlights/100;
 const whites=values.whites/100;
 const blacks=values.blacks/100;
 const vib=values.vibrance/100;
 const fade=values.fade/100;

 for(let i=0;i<p.length;i+=4){
  let r=p[i]*ex;
  let g=p[i+1]*ex;
  let b=p[i+2]*ex;

  let lum=.2126*r+.7152*g+.0722*b;

  if(sh){
   const amount=sh*(1-lum/255);
   r+=amount*(255-r)*.42;
   g+=amount*(255-g)*.42;
   b+=amount*(255-b)*.42;
  }

  if(hi){
   const amount=hi*Math.max(0,(lum-90)/165);
   r+=amount*(128-r)*.32;
   g+=amount*(128-g)*.32;
   b+=amount*(128-b)*.32;
  }

  if(whites){
   const amount=whites*Math.max(0,(lum-150)/105);
   r+=amount*45;
   g+=amount*45;
   b+=amount*45;
  }

  if(blacks){
   const amount=blacks*Math.max(0,(90-lum)/90);
   r-=amount*38;
   g-=amount*38;
   b-=amount*38;
  }

  r=(r-128)*co+128;
  g=(g-128)*co+128;
  b=(b-128)*co+128;

  lum=.2126*r+.7152*g+.0722*b;
  r=lum+(r-lum)*sat;
  g=lum+(g-lum)*sat;
  b=lum+(b-lum)*sat;

  if(vib){
   const range=Math.max(r,g,b)-Math.min(r,g,b);
   const amount=vib*(1-range/255);
   r=lum+(r-lum)*(1+amount);
   g=lum+(g-lum)*(1+amount);
   b=lum+(b-lum)*(1+amount);
  }

  r+=temp+tint;
  b-=temp-tint;

  if(fade){
   r=lerp(r,242,fade*.22);
   g=lerp(g,235,fade*.22);
   b=lerp(b,228,fade*.22);
  }

  [r,g,b]=applyColorProfile(r,g,b,f);

  if(activeCamera){
   const x=(i/4)%canvas.width;
   const y=Math.floor((i/4)/canvas.width);
   [r,g,b]=applyCameraSignature(r,g,b,x,y,canvas.width,canvas.height);
  }

  if(activeFilter==='Dazz 風'){
   const x=(i/4)%canvas.width;
   const y=Math.floor((i/4)/canvas.width);
   [r,g,b]=applyDazzLook(r,g,b,x,y,canvas.width,canvas.height);
  }


  p[i]=clamp(r);
  p[i+1]=clamp(g);
  p[i+2]=clamp(b);
 }

 ctx.putImageData(d,0,0);

 if(values.sharpness){
  applySharpness(values.sharpness);
 }

 applyEffects();
}

function applyCameraSignature(r,g,b,x,y,w,h){
 const name=activeCamera;
 const lum=.2126*r+.7152*g+.0722*b;
 const shadow=1-smoothstep(45,170,lum);
 const highlight=smoothstep(150,245,lum);
 const nx=(x/w)-.5, ny=(y/h)-.5;
 const edge=Math.min(1,Math.sqrt(nx*nx+ny*ny)*1.55);

 if(name==='35mm 底片'){
  // 35mm: warm highlights, lifted blacks, gentle green/cyan shadow separation.
  r += 7*highlight + 2*shadow;
  g += 2*highlight + 3*shadow;
  b -= 5*highlight - 1*shadow;
  const grain=(Math.random()-.5)*5;
  r+=grain;g+=grain*.85;b+=grain*.75;
  r+=edge*1.5;g+=edge*1.2;b+=edge*.8;
 }

 if(name==='CCD 數位相機'){
  // Early CCD: punchy colour, cyan/blue shadows, clipped whites, chromatic sensor noise.
  r += -4*shadow + 5*highlight;
  g += 2*shadow + 2*highlight;
  b += 10*shadow + 0*highlight;
  const n=(Math.random()-.5)*11;
  r+=n*1.25; g+=n*.9; b+=n*1.35;
  if(lum>215){r+=14;g+=10;b+=8;}
  r=Math.round(r/2)*2;g=Math.round(g/2)*2;b=Math.round(b/2)*2;
 }

 if(name==='2000s 老 DC'){
  // Y2K compact: hard flash center, crushed background, JPEG-ish steps and blue shadows.
  const dx=(x-w*.5)/(w*.5), dy=(y-h*.45)/(h*.55);
  const dist=Math.sqrt(dx*dx+dy*dy);
  const flash=Math.max(0,1-dist);
  r += flash*30 - edge*16;
  g += flash*25 - edge*13;
  b += flash*20 - edge*8;
  r += -6*shadow + 7*highlight;
  g +=  1*shadow + 4*highlight;
  b += 12*shadow + 1*highlight;
  const n=(Math.random()-.5)*15;
  r+=n*1.2;g+=n*.9;b+=n*1.3;
  r=Math.round(r/4)*4;g=Math.round(g/4)*4;b=Math.round(b/4)*4;
 }

 if(name==='拍立得'){
  // Instant: milky blacks, pastel colour, warm paper-like cast.
  const paper=Math.min(1,.28+highlight*.42);
  r=lerp(r,Math.max(r,42),.24);
  g=lerp(g,Math.max(g,39),.24);
  b=lerp(b,Math.max(b,36),.24);
  r+=8*paper;g+=4*paper;b-=2*paper;
  const soft=(Math.random()-.5)*2;
  r+=soft;g+=soft;b+=soft;
 }

 if(name==='日系底片'){
  // Japanese film: airy exposure, cyan-green shadows, creamy highlights.
  r += -5*shadow + 3*highlight;
  g +=  7*shadow + 2*highlight;
  b +=  9*shadow + 4*highlight;
  r-=edge*1.2;g-=edge*.7;b-=edge*.2;
 }

 if(name==='夜間閃光燈'){
  // Night flash: strong central flash falloff + cool dark background + highlight bloom.
  const dx=(x-w/2)/(w/2), dy=(y-h*.43)/(h*.57);
  const dist=Math.sqrt(dx*dx+dy*dy);
  const flash=Math.max(0,1-dist);
  const fall=Math.max(0,dist-.35);
  r += flash*42-fall*46;
  g += flash*38-fall*39;
  b += flash*30-fall*29;
  r += -8*shadow + 10*highlight;
  g += -5*shadow + 8*highlight;
  b += 13*shadow + 5*highlight;
  if(lum>205){r+=15;g+=12;b+=9;}
 }

 if(name==='復古暖色'){
  // Warm vintage: amber mids, faded blacks, heavier analogue texture.
  r += 16 + 7*highlight;
  g +=  6 + 3*highlight;
  b -= 12 + 5*highlight;
  const grain=(Math.random()-.5)*18;
  r+=grain;g+=grain*.8;b+=grain*.65;
  r=lerp(r,Math.max(r,30),.08);g=lerp(g,Math.max(g,27),.08);b=lerp(b,Math.max(b,24),.08);
 }

 if(name==='黑白底片'){
  // Silver-gelatin style: strong luminance contrast + coarse grain.
  const yv=.2126*r+.7152*g+.0722*b;
  const c=(yv-128)*1.18+128;
  const grain=(Math.random()-.5)*20;
  r=g=b=c+grain;
 }

 return [r,g,b];
}
function applyDazzLook(r,g,b,x,y,w,h){
 const lum=.2126*r+.7152*g+.0722*b;
 const shadow=1-smoothstep(55,175,lum);
 const highlight=smoothstep(145,245,lum);
 r += -7*shadow - 3*highlight;
 g +=  2*shadow + 1*highlight;
 b += 13*shadow + 8*highlight;
 if(lum<70){ r-=3; g-=2; b+=2; }
 return [r,g,b];
}

function applySharpness(amount){
 if(amount<1)return;

 const w=canvas.width,h=canvas.height;
 const src=ctx.getImageData(0,0,w,h);
 const s=src.data;
 const out=new ImageData(w,h);
 const o=out.data;
 const strength=amount/100*.55;

 for(let y=1;y<h-1;y++){
  for(let x=1;x<w-1;x++){
   const i=(y*w+x)*4;
   for(let c=0;c<3;c++){
    const center=s[i+c];
    const blur=(
     s[i-4+c]+s[i+4+c]+
     s[i-w*4+c]+s[i+w*4+c]
    )/4;
    o[i+c]=clamp(center+(center-blur)*strength);
   }
   o[i+3]=255;
  }
 }

 ctx.putImageData(out,0,0);
}

function applyEffects(){
 const w=canvas.width,h=canvas.height;


 if(values.grain){
  const d=ctx.getImageData(0,0,w,h);
  const p=d.data;
  const amount=values.grain*.58;

  for(let i=0;i<p.length;i+=4){
   const q=(Math.random()-.5)*amount;
   p[i]=clamp(p[i]+q);
   p[i+1]=clamp(p[i+1]+q);
   p[i+2]=clamp(p[i+2]+q);
  }

  ctx.putImageData(d,0,0);
 }

 if(values.vignette){
  const g=ctx.createRadialGradient(
   w/2,h/2,Math.min(w,h)*.16,
   w/2,h/2,Math.max(w,h)*.76
  );
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(.55,'rgba(20,10,5,0)');
  g.addColorStop(1,`rgba(20,10,5,${values.vignette/100*.58})`);
  ctx.fillStyle=g;
  ctx.fillRect(0,0,w,h);
 }

 if(effects.warm){
  const g=ctx.createLinearGradient(0,h, w*.7,0);
  g.addColorStop(0,'rgba(255,120,55,.24)');
  g.addColorStop(.38,'rgba(255,190,90,.08)');
  g.addColorStop(.7,'rgba(255,255,255,0)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,w,h);
 }

 if(activeFilter==='Dazz 風'){
  const glow=ctx.createRadialGradient(w*.5,h*.42,Math.min(w,h)*.06,w*.5,h*.42,Math.max(w,h)*.72);
  glow.addColorStop(0,'rgba(170,235,255,.09)');
  glow.addColorStop(.45,'rgba(60,170,205,.035)');
  glow.addColorStop(1,'rgba(0,30,45,0)');
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,w,h);
}
applyCameraOverlay();
}

function applyCameraOverlay(){
 if(!activeCamera)return;
 const w=canvas.width,h=canvas.height;

 // 拍立得：真正的白色相框，底部比其他三邊厚。
 if(activeCamera==='拍立得'){
  const snapshot=document.createElement('canvas');
  snapshot.width=w;snapshot.height=h;
  const sctx=snapshot.getContext('2d');
  sctx.drawImage(canvas,0,0);
  const border=Math.max(10,Math.round(Math.min(w,h)*.035));
  const bottom=Math.max(28,Math.round(Math.min(w,h)*.16));
  ctx.fillStyle='#fffdf8';
  ctx.fillRect(0,0,w,h);
  ctx.drawImage(snapshot,border,border,w-border*2,h-border-bottom);
  // 輕微紙張暖色，讓邊框不像純網頁白。
  ctx.fillStyle='rgba(255,247,235,.10)';
  ctx.fillRect(0,0,w,h);
 }

 // 2000s 老 DC：左下角橘色數位日期印字。
 if(activeCamera==='2000s 老 DC'){
  const now=new Date();
  const yy=String(now.getFullYear()).slice(-2);
  const mm=String(now.getMonth()+1).padStart(2,'0');
  const dd=String(now.getDate()).padStart(2,'0');
  const stamp=yy+' '+mm+' '+dd;
  const size=Math.max(12,Math.round(Math.min(w,h)*.032));
  const x=Math.max(8,Math.round(w*.035));
  const y=h-Math.max(10,Math.round(h*.035));
  ctx.save();
  ctx.font='700 '+size+'px "Courier New",monospace';
  ctx.textAlign='left';
  ctx.textBaseline='bottom';
  ctx.shadowColor='rgba(40,10,0,.45)';
  ctx.shadowBlur=1;
  ctx.shadowOffsetX=1;
  ctx.shadowOffsetY=1;
  ctx.fillStyle='#ff7a32';
  ctx.fillText(stamp,x,y);
  ctx.restore();
 }
}

// 顯示目前濾鏡名稱的簡短提示，不影響原本版面。
filterPanel.querySelectorAll('.filter').forEach(b=>{
 const n=b.dataset.filter;
 const small=b.querySelector('small');
 if(small)small.title=filterDescriptions[n]||'';
});
