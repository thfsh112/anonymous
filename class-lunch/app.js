const API=APP_CONFIG.supabaseUrl.replace(/\/$/,'')+'/rest/v1';
const KEY=APP_CONFIG.publishableKey;
const BASE_HEADERS={apikey:KEY,'Content-Type':'application/json',Accept:'application/json'};
let menus=[];
const seats=Array.from({length:35},(_,i)=>i+1).filter(n=>n!==14);
const $=id=>document.getElementById(id);

function toast(t){
  const el=$('toast');
  if(!el)return;
  el.textContent=t;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),1800);
}
function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
async function api(path,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    // The current Supabase publishable key is sent through the apikey header.
    // Do not send the publishable key as a Bearer JWT.
    const headers={...BASE_HEADERS,...(options.headers||{})};
    delete headers.Authorization;
    const r=await fetch(API+path,{...options,headers,signal:controller.signal,cache:'no-store'});
    const text=await r.text();
    let body=null;
    try{body=text?JSON.parse(text):null}catch{}
    if(!r.ok){
      const message=body?.message||body?.error_description||body?.error||text||('HTTP '+r.status);
      throw new Error('HTTP '+r.status+'：'+message);
    }
    return body;
  }finally{clearTimeout(timer)}
}
function formatDate(v){
  if(!v)return'';
  const d=new Date(v+'T00:00:00');
  return isNaN(d)?v:d.toLocaleDateString('zh-TW',{year:'numeric',month:'numeric',day:'numeric',weekday:'short'});
}
function formatCutoff(v){
  if(!v)return'';
  const d=new Date(v);
  return isNaN(d)?'':d.toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function seatOptions(){
  return '<option value="">請選擇座號</option>'+seats.map(n=>'<option value="'+n+'">'+n+' 號</option>').join('');
}

async function load(){
  const box=$('menus');
  if(!box)return;
  box.innerHTML='<div class="loading">載入中…</div>';
  try{
    const primary='/menus?select=*&is_active=eq.true&order=menu_date.asc%2Ccreated_at.desc';
    const fallback='/menus?select=*&is_active=eq.true&order=menu_date.asc';
    try{
      menus=await api(primary)||[];
    }catch(firstError){
      console.warn('Primary menu query failed, retrying:',firstError);
      menus=await api(fallback)||[];
    }

    $('menuCount').textContent=menus.length+' 份';
    box.innerHTML=menus.length?menus.map(m=>{
      const cutoff=m.cutoff_at?new Date(m.cutoff_at):null;
      const expired=cutoff&&!isNaN(cutoff)&&cutoff.getTime()<Date.now();
      const image=m.image_url
        ?'<div class="photo-button" role="button" tabindex="0" data-image-url="'+esc(m.image_url)+'" aria-label="點擊查看菜單大圖"><img class="menu-photo" src="'+esc(m.image_url)+'" alt="菜單"></div>'
        :'<div class="menu-photo"></div>';
      return '<article class="menu-card">'+image+
        '<div class="menu-body"><div class="menu-meta">📅 '+esc(formatDate(m.menu_date))+
        (formatCutoff(m.cutoff_at)?' · ⏰ 截止 '+esc(formatCutoff(m.cutoff_at)):'')+
        (expired?' · 已截止':'')+
        '</div><div class="comment-box" id="comments-'+m.id+'">留言載入中…</div></div></article>';
    }).join(''):'<div class="loading">目前沒有開放的菜單。</div>';

    await Promise.all(menus.map(loadComments));
  }catch(err){
    console.error('前台載入菜單失敗：',err);
    $('menuCount').textContent='';
    const message=err.name==='AbortError'?'連線逾時，請重新整理。':err.message;
    box.innerHTML='<div class="loading">菜單載入失敗：'+esc(message)+'<br><button class="small-btn" type="button" onclick="load()">重新載入</button></div>';
  }
}

async function loadComments(m){
  const box=$('comments-'+m.id);
  if(!box)return;
  const form='<form class="comment-form" onsubmit="addComment(event,'+m.id+')"><select id="c-name-'+m.id+'" required>'+seatOptions()+'</select><input id="c-item-'+m.id+'" maxlength="100" required placeholder="品項名稱，例如：雞排蛋餅"><input id="c-amount-'+m.id+'" type="number" min="0" step="1" inputmode="numeric" required placeholder="金額（元）"><input id="c-text-'+m.id+'" maxlength="300" required placeholder="留言／備註…"><button>送出訂單</button></form>';
  try{
    const data=await api('/comments?select=*&menu_id=eq.'+encodeURIComponent(m.id)+'&order=created_at.asc')||[];
    box.innerHTML='<strong>💬 留言／訂單</strong>'+
      (data.map(c=>'<div class="comment"><strong>'+esc(c.student_name)+' 號</strong>'+esc(c.content)+'</div>').join('')||'<div class="hint">目前還沒有留言。</div>')+form;
  }catch(err){
    console.error('留言載入失敗：',err);
    box.innerHTML='<div class="hint">留言載入失敗，仍可送出新訂單。</div>'+form;
  }
}

async function addComment(e,id){
  e.preventDefault();
  const n=$('c-name-'+id).value.trim();
  const item=$('c-item-'+id).value.trim();
  const amount=Number($('c-amount-'+id).value);
  const c=$('c-text-'+id).value.trim();
  if(!n||!item||!Number.isFinite(amount)||amount<0||!c)return;
  try{
    const menu=menus.find(x=>x.id===id);
    await api('/orders',{
      method:'POST',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify({
        menu_id:id,student_name:n,item_name:item,quantity:1,paid:false,
        order_date:menu?.menu_date||new Date().toLocaleDateString('en-CA'),
        unit_price:amount
      })
    });
    await api('/comments',{
      method:'POST',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify({menu_id:id,student_name:n,content:item+' · '+c})
    });
    toast('訂單已送出：'+n+' 號 · '+item+' · $'+amount);
    await loadComments(menu);
  }catch(err){
    console.error('送出訂單失敗：',err);
    toast('送出失敗：'+err.message);
  }
}

function openImage(u){
  const modal=$('imageModal'),img=$('largeImage');
  if(!modal||!img||!u)return;
  img.src=u;
  modal.classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeImage(e){
  if(e&&e.target!==$('imageModal')&&!e.target.classList.contains('close'))return;
  $('imageModal').classList.add('hidden');
  $('largeImage').src='';
  document.body.style.overflow='';
}
document.addEventListener('click',e=>{
  const p=e.target.closest('.photo-button');
  if(p){e.preventDefault();openImage(p.dataset.imageUrl)}
});
document.addEventListener('touchend',e=>{
  const p=e.target.closest('.photo-button');
  if(p){e.preventDefault();openImage(p.dataset.imageUrl)}
},{passive:false});
document.addEventListener('keydown',e=>{
  const p=document.activeElement;
  if((e.key==='Enter'||e.key===' ')&&p&&p.classList.contains('photo-button')){
    e.preventDefault();openImage(p.dataset.imageUrl);
  }
  if(e.key==='Escape')closeImage();
});

load();
