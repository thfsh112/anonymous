const API=APP_CONFIG.supabaseUrl.replace(/\/$/,'')+'/rest/v1';
const KEY=APP_CONFIG.publishableKey;
const BASE_HEADERS={apikey:KEY,'Content-Type':'application/json',Accept:'application/json'};
let menus=[];
const seats=Array.from({length:35},(_,i)=>i+1).filter(n=>n!==14);
const $=id=>document.getElementById(id);
const tokenKey=(menuId,seat)=>'class-lunch-order-token:'+menuId+':'+seat;

function toast(t){const el=$('toast');if(!el)return;el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function getToken(menuId,seat){try{return localStorage.getItem(tokenKey(menuId,seat))||''}catch{return''}}
function setToken(menuId,seat,token){try{localStorage.setItem(tokenKey(menuId,seat),token)}catch{}}
function removeToken(menuId,seat){try{localStorage.removeItem(tokenKey(menuId,seat))}catch{}}
function today(){return new Date().toLocaleDateString('en-CA')}
function isExpired(m){if(!m?.cutoff_at)return false;const d=new Date(m.cutoff_at);return !isNaN(d)&&d.getTime()<=Date.now()}
async function api(path,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const headers={...BASE_HEADERS,...(options.headers||{})};delete headers.Authorization;
    const r=await fetch(API+path,{...options,headers,signal:controller.signal,cache:'no-store'});
    const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
    if(!r.ok)throw new Error('HTTP '+r.status+'：'+(body?.message||body?.error_description||body?.error||text||'請求失敗'));
    return body;
  }finally{clearTimeout(timer)}
}
async function rpc(name,body){return api('/rpc/'+name,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)})}
function formatDate(v){if(!v)return'';const d=new Date(v+'T00:00:00');return isNaN(d)?v:d.toLocaleDateString('zh-TW',{year:'numeric',month:'numeric',day:'numeric',weekday:'short'})}
function formatCutoff(v){if(!v)return'';const d=new Date(v);return isNaN(d)?'':d.toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function seatOptions(selected=''){return '<option value="">請選擇座號</option>'+seats.map(n=>'<option value="'+n+'"'+(String(n)===String(selected)?' selected':'')+'>'+n+' 號</option>').join('')}
function currentMenu(id){return menus.find(m=>Number(m.id)===Number(id))}
async function fetchMenu(id){const rows=await api('/menus?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1');return Array.isArray(rows)?rows[0]:null}

async function load(){
  const box=$('menus');if(!box)return;box.innerHTML='<div class="loading">載入中…</div>';
  try{
    const data=await api('/menus?select=*&is_active=eq.true&menu_date=gte.'+encodeURIComponent(today())+'&order=menu_date.asc')||[];
    menus=data.filter(m=>String(m.menu_date)>=today());
    $('menuCount').textContent=menus.length+' 份';
    box.innerHTML=menus.length?menus.map(renderMenu).join(''):'<div class="loading">目前沒有開放中的菜單。</div>';
    menus.forEach(scheduleCutoffRefresh);await Promise.all(menus.map(loadOrderPanel));
  }catch(err){
    console.error(err);$('menuCount').textContent='';
    box.innerHTML='<div class="loading">菜單載入失敗：'+esc(err.name==='AbortError'?'連線逾時，請重新整理。':err.message)+'<br><button class="small-btn" type="button" onclick="load()">重新載入</button></div>';
  }
}
function renderMenu(m){
  const image=m.image_url?'<div class="photo-button" role="button" tabindex="0" data-image-url="'+esc(m.image_url)+'" aria-label="點擊查看菜單大圖"><img class="menu-photo" src="'+esc(m.image_url)+'" alt="菜單"></div>':'<div class="menu-photo"></div>';
  return '<article class="menu-card">'+image+'<div class="menu-body"><div class="menu-meta">📅 '+esc(formatDate(m.menu_date))+(formatCutoff(m.cutoff_at)?' · ⏰ 截止 '+esc(formatCutoff(m.cutoff_at)):'')+'</div><div class="order-area" id="orders-'+m.id+'">'+(isExpired(m)?'<div class="closed-order">此菜單已截止</div>':'<div class="loading">訂單載入中…</div>')+'</div></div></article>';
}
function scheduleCutoffRefresh(m){if(!m.cutoff_at)return;const t=new Date(m.cutoff_at).getTime()-Date.now()+1200;if(t>0&&t<2147483647)setTimeout(load,t)}
function orderForm(m,seat='',order=null){
  const disabled=order?.paid?' disabled':'';
  return '<form class="comment-form" id="order-form-'+m.id+'" onsubmit="addComment(event,'+m.id+')"><select id="c-name-'+m.id+'" onchange="seatChanged('+m.id+')" required>'+seatOptions(seat)+'</select><input id="c-item-'+m.id+'" maxlength="100" required placeholder="品項名稱，例如：雞排蛋餅" value="'+esc(order?.item_name||'')+'"'+disabled+'><input id="c-amount-'+m.id+'" type="number" min="0" max="10000" step="1" inputmode="numeric" required placeholder="金額（元）" value="'+(order?esc(order.unit_price):'')+'"'+disabled+'><input id="c-text-'+m.id+'" maxlength="300" required placeholder="留言／備註…" value="'+esc(order?.note||'')+'"'+disabled+'><button class="primary" type="submit"'+disabled+'>'+(order?'儲存修改':'送出訂單')+'</button></form>';
}
async function loadOrderPanel(m,preferredSeat=''){
  const box=$('orders-'+m.id);if(!box)return;
  const menu=await fetchMenu(m.id).catch(()=>m);if(!menu)return;
  if(isExpired(menu)){box.innerHTML='<div class="closed-order">此菜單已截止</div>';return}
  box.innerHTML='<strong>🧾 我的訂單</strong>'+orderForm(menu,preferredSeat);
  if(preferredSeat)await loadSeatState(menu,preferredSeat);
}
async function seatChanged(id){
  const menu=currentMenu(id);if(!menu)return;const seat=$('c-name-'+id)?.value||'';
  if(seat)await loadSeatState(menu,seat);else await loadOrderPanel(menu);
}
async function loadSeatState(m,seat){
  const box=$('orders-'+m.id);if(!box)return;
  if(isExpired(m)){box.innerHTML='<div class="closed-order">此菜單已截止</div>';return}
  box.innerHTML='<strong>🧾 我的訂單</strong><div class="loading">檢查中…</div>';
  try{
    const token=getToken(m.id,seat);let order=null;
    if(token)order=await rpc('get_class_lunch_order',{p_menu_id:m.id,p_student_name:String(seat),p_tracking_code:token});
    if(order){
      box.innerHTML='<strong>🧾 我的訂單</strong><div class="existing-order" data-seat="'+esc(seat)+'"><div><b>✓ 已登記</b></div><div>品項：'+esc(order.item_name)+'</div><div>金額：$'+Number(order.unit_price||0).toLocaleString('zh-TW')+'</div><div>備註：'+esc(order.note||'無')+'</div><div class="order-actions"><button class="small-btn" type="button" onclick="editMyOrder('+m.id+',\''+esc(seat)+'\')">修改訂單</button><button class="small-btn danger" type="button" onclick="cancelMyOrder('+m.id+',\''+esc(seat)+'\')">取消訂單</button></div></div>';
      return;
    }
    const exists=await rpc('class_lunch_order_exists',{p_menu_id:m.id,p_student_name:String(seat)});
    if(exists){
      box.innerHTML='<strong>🧾 我的訂單</strong><div class="existing-order"><b>此座號已經有訂單</b><p class="hint">這台裝置沒有這筆訂單的修改憑證，請使用原本送出訂單的裝置修改或取消。</p></div>';
      return;
    }
    box.innerHTML='<strong>🧾 我的訂單</strong>'+orderForm(m,seat);
  }catch(err){
    console.error(err);box.innerHTML='<strong>🧾 我的訂單</strong>'+orderForm(m,seat)+'<div class="hint">目前無法讀取既有訂單，送出時仍會由資料庫檢查是否重複。</div>';
  }
}
async function addComment(e,id){
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]');if(button.disabled)return;
  button.disabled=true;button.textContent='送出中…';
  try{
    const seat=$('c-name-'+id).value.trim(),item=$('c-item-'+id).value.trim(),amount=Number($('c-amount-'+id).value),note=$('c-text-'+id).value.trim();
    if(!seat||!item||!Number.isInteger(amount)||amount<0||amount>10000||!note)throw new Error('請完整填寫座號、品項、金額與備註');
    const menu=await fetchMenu(id);
    if(!menu||!menu.is_active)throw new Error('此菜單目前未開放');
    if(String(menu.menu_date)<today())throw new Error('此菜單已過期');
    if(isExpired(menu))throw new Error('此菜單已截止');
    const token=getToken(id,seat);
    const order=await rpc('place_class_lunch_order',{p_menu_id:id,p_student_name:String(seat),p_item_name:item,p_unit_price:amount,p_note:note,p_tracking_code:token||null});
    if(order?.tracking_code)setToken(id,seat,order.tracking_code);
    toast(token?'訂單已更新':'訂單已送出：'+seat+' 號 · '+item+' · $'+amount);
    await loadOrderPanel(menu,seat);
  }catch(err){
    console.error(err);toast('送出失敗：'+err.message);button.disabled=false;button.textContent='送出訂單';
  }
}
async function editMyOrder(id,seat){
  const m=currentMenu(id);const token=getToken(id,seat);if(!m||!seat||!token)return toast('找不到這筆訂單的修改憑證');
  try{const order=await rpc('get_class_lunch_order',{p_menu_id:id,p_student_name:seat,p_tracking_code:token});if(!order)return toast('訂單不存在或修改憑證已失效');$('orders-'+id).innerHTML='<strong>🧾 修改訂單</strong>'+orderForm(m,seat,order)}catch(err){toast('讀取訂單失敗：'+err.message)}
}
async function cancelMyOrder(id,seat){
  const m=currentMenu(id),token=getToken(id,seat);if(!m||!seat||!token)return toast('找不到這筆訂單');
  if(!confirm('確定要取消這筆訂單嗎？'))return;
  try{await rpc('cancel_class_lunch_order',{p_menu_id:id,p_student_name:seat,p_tracking_code:token});removeToken(id,seat);toast('訂單已取消');await loadOrderPanel(m,seat)}catch(err){toast('取消失敗：'+err.message)}
}
function openImage(u){const modal=$('imageModal'),img=$('largeImage');if(!modal||!img||!u)return;img.src=u;modal.classList.remove('hidden');document.body.style.overflow='hidden'}
function closeImage(e){if(e&&e.target!==$('imageModal')&&!e.target.classList.contains('close'))return;$('imageModal').classList.add('hidden');$('largeImage').src='';document.body.style.overflow=''}
document.addEventListener('click',e=>{const p=e.target.closest('.photo-button');if(p){e.preventDefault();openImage(p.dataset.imageUrl)}});
document.addEventListener('touchend',e=>{const p=e.target.closest('.photo-button');if(p){e.preventDefault();openImage(p.dataset.imageUrl)}},{passive:false});
document.addEventListener('keydown',e=>{const p=document.activeElement;if((e.key==='Enter'||e.key===' ')&&p&&p.classList.contains('photo-button')){e.preventDefault();openImage(p.dataset.imageUrl)}if(e.key==='Escape')closeImage()});
load();
