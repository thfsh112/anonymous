const{createClient}=supabase;
const db=createClient(APP_CONFIG.supabaseUrl,APP_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let student=null,sessions=[],orders=[];
const money=n=>'$'+Number(n||0).toLocaleString('zh-TW');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA');
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2400)}
function fmtDate(v){const d=new Date(v+'T00:00:00');return d.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric',weekday:'short'})}
function fmtCutoff(v){if(!v)return'';return new Date(v).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function expired(s){return !!s.cutoff_at&&new Date(s.cutoff_at).getTime()<=Date.now()}
function validSeat(seat){return Number.isInteger(seat)&&((seat>=1&&seat<=35)||seat===99)}
function internalEmail(seat){return 'seat'+String(Number(seat)).padStart(2,'0')+'@class-lunch.example'}
function authPassword(raw){return 'CLP:'+String(raw)+':2026'}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const seat=Number($('seatLogin').value),raw=$('passwordLogin').value;
  if(!validSeat(seat))return toast('座號不正確');
  if(raw===String(seat).padStart(3,'0')){
    const{data:initData,error:initError}=await db.functions.invoke('class-lunch-init-login',{body:{seat_number:seat,initial_code:raw}});
    if(initError||initData?.error)return toast('初始登入失敗：'+(initData?.detail||initData?.error||initError?.message||'未知錯誤'));
    if(initData?.access_token&&initData?.refresh_token){
      const{error:setError}=await db.auth.setSession({access_token:initData.access_token,refresh_token:initData.refresh_token});
      if(setError)return toast('登入 session 建立失敗：'+setError.message);
      $('passwordLogin').value='';
      return refresh();
    }
  }
  const{error}=await db.auth.signInWithPassword({email:internalEmail(seat),password:authPassword(raw)});
  if(error)return toast('座號或密碼錯誤');
  $('passwordLogin').value='';
  await refresh();
});
$('setupForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('setupName').value.trim(),p1=$('setupPassword').value,p2=$('setupPassword2').value;
  if(!name)return toast('請輸入姓名');
  if(p1.length<4)return toast('新密碼至少 4 碼');
  if(p1!==p2)return toast('兩次密碼不一致');
  const b=e.currentTarget.querySelector('button');b.disabled=true;b.textContent='設定中…';
  const{data,error}=await db.functions.invoke('class-lunch-students',{body:{action:'self_setup',name,password:p1}});
  b.disabled=false;b.textContent='完成設定';
  if(error||data?.error)return toast('設定失敗：'+(data?.detail||data?.error||error.message));
  $('setupForm').reset();toast('設定完成');await refresh();
});
$('logoutBtn').addEventListener('click',async()=>{await db.auth.signOut();student=null;refresh()});

async function refresh(){
  const{data:{user}}=await db.auth.getUser();
  if(!user){
    $('loginBox').classList.remove('hidden');$('setupBox').classList.add('hidden');$('studentApp').classList.add('hidden');$('logoutBtn').classList.add('hidden');
    $('welcomeText').textContent='登入後查看開放中的訂餐。';return;
  }
  const{data:s,error}=await db.from('students').select('id,seat_number,name,active,must_setup').eq('auth_user_id',user.id).maybeSingle();
  if(error||!s||!s.active){await db.auth.signOut();toast('此學生帳號目前無法使用');return refresh()}
  student=s;$('logoutBtn').classList.remove('hidden');$('loginBox').classList.add('hidden');
  if(s.must_setup&&s.seat_number!==99){
    $('studentApp').classList.add('hidden');$('setupBox').classList.remove('hidden');$('welcomeText').textContent=s.seat_number+'號第一次登入設定';
    return;
  }
  $('setupBox').classList.add('hidden');$('studentApp').classList.remove('hidden');
  $('studentIdentity').textContent=s.seat_number+'號 '+(s.name||'');$('welcomeText').textContent='歡迎，'+(s.name||s.seat_number+'號')+'。';
  await loadSessions();
}
async function loadSessions(){
  const [{data:ss,error:se},{data:os,error:oe}]=await Promise.all([
    db.from('meal_sessions').select('id,meal_date,cutoff_at,is_active,menu_template_id,menu_templates(id,name,image_url,active)').eq('is_active',true).gte('meal_date',today()).order('meal_date'),
    db.from('orders').select('id,meal_session_id,item_name,unit_price,note,paid,created_at').order('created_at',{ascending:false})
  ]);
  if(se||oe)return toast((se||oe).message);
  sessions=(ss||[]).filter(x=>x.menu_templates?.active!==false);orders=os||[];$('menuCount').textContent=sessions.length+' 份';
  renderSessions();
}
function renderSessions(){
  $('menus').innerHTML=sessions.length?sessions.map(s=>{
    const o=orders.find(x=>x.meal_session_id===s.id),closed=expired(s);
    const img=s.menu_templates?.image_url?'<div class="photo-button" data-image-url="'+esc(s.menu_templates.image_url)+'"><img class="menu-photo" src="'+esc(s.menu_templates.image_url)+'" alt="菜單"></div>':'<div class="menu-photo placeholder">🍱</div>';
    let body='';
    if(closed){body='<div class="closed-order">此訂餐已截止</div>'+(o?orderSummary(o,true):'')}
    else if(o){body=orderSummary(o,false)}
    else{body=orderForm(s,null)}
    return '<article class="menu-card">'+img+'<div class="menu-body"><h3>'+esc(s.menu_templates?.name||'菜單')+'</h3><div class="menu-meta">📅 '+esc(fmtDate(s.meal_date))+(s.cutoff_at?' · ⏰ 截止 '+esc(fmtCutoff(s.cutoff_at)):'')+'</div>'+body+'</div></article>';
  }).join(''):'<div class="loading">目前沒有開放中的訂餐。</div>';
}
function orderSummary(o,locked){
  return '<div class="existing-order"><b>✓ 已登記'+(o.paid?' · 已付款':'')+'</b><div>品項：'+esc(o.item_name)+'</div><div>金額：'+money(o.unit_price)+'</div><div>備註：'+esc(o.note||'無')+'</div>'+
  (!locked&&!o.paid?'<div class="order-actions"><button class="small-btn" onclick="editOrder('+o.meal_session_id+')">修改</button><button class="small-btn danger" onclick="cancelOrder('+o.meal_session_id+')">取消</button></div>':'')+'</div>';
}
function orderForm(s,o){
  return '<form class="comment-form" onsubmit="saveOrder(event,'+s.id+')"><input id="item-'+s.id+'" maxlength="100" required placeholder="品項名稱" value="'+esc(o?.item_name||'')+'"><input id="amount-'+s.id+'" type="number" min="0" max="10000" step="1" required inputmode="numeric" placeholder="金額" value="'+esc(o?.unit_price??'')+'"><input id="note-'+s.id+'" maxlength="300" placeholder="備註（選填）" value="'+esc(o?.note||'')+'"><button class="primary" type="submit">'+(o?'儲存修改':'送出訂單')+'</button></form>';
}
function editOrder(sessionId){
  const s=sessions.find(x=>x.id===sessionId),o=orders.find(x=>x.meal_session_id===sessionId);if(!s||!o||o.paid)return;
  const card=[...document.querySelectorAll('.menu-card')].find(c=>c.innerHTML.includes('saveOrder(event,'+sessionId+')')||c.innerHTML.includes('editOrder('+sessionId+')'));
  if(card){const old=card.querySelector('.existing-order');if(old)old.outerHTML=orderForm(s,o)}
}
async function saveOrder(e,sessionId){
  e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;b.textContent='儲存中…';
  const item=$('item-'+sessionId).value.trim(),amount=Number($('amount-'+sessionId).value),note=$('note-'+sessionId).value.trim();
  const{error}=await db.rpc('place_class_lunch_order_v2',{p_session_id:sessionId,p_item_name:item,p_unit_price:amount,p_note:note});
  if(error){toast('送出失敗：'+error.message);b.disabled=false;b.textContent='送出訂單';return}
  toast('訂單已儲存');await loadSessions();
}
async function cancelOrder(sessionId){
  if(!confirm('確定取消這筆訂單？'))return;
  const{error}=await db.rpc('cancel_class_lunch_order_v2',{p_session_id:sessionId});
  if(error)return toast('取消失敗：'+error.message);
  toast('訂單已取消');await loadSessions();
}
function openImage(u){$('largeImage').src=u;$('imageModal').classList.remove('hidden');document.body.style.overflow='hidden'}
function closeImage(e){if(e&&e.target!==$('imageModal')&&!e.target.classList.contains('close'))return;$('imageModal').classList.add('hidden');$('largeImage').src='';document.body.style.overflow=''}
document.addEventListener('click',e=>{const p=e.target.closest('.photo-button');if(p)openImage(p.dataset.imageUrl)});
db.auth.onAuthStateChange(()=>setTimeout(refresh,0));refresh();