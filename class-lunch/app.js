const{createClient}=supabase;
const db=createClient(APP_CONFIG.supabaseUrl,APP_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let student=null,sessions=[],orders=[],menuItems=[],editingSessionId=null;
const money=n=>'$'+Number(n||0).toLocaleString('zh-TW');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA');
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}
function fmtDate(v){const d=new Date(v+'T00:00:00');return d.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric',weekday:'short'})}
function fmtCutoff(v){if(!v)return'';return new Date(v).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function expired(s){return !!s.cutoff_at&&new Date(s.cutoff_at).getTime()<=Date.now()}
function countdown(s){
  if(!s.cutoff_at)return '未設定截止時間';
  const ms=new Date(s.cutoff_at).getTime()-Date.now();
  if(ms<=0)return '已截止';
  const mins=Math.floor(ms/60000),days=Math.floor(mins/1440),hrs=Math.floor((mins%1440)/60),m=mins%60;
  if(days>0)return '剩餘 '+days+'天 '+hrs+'小時';
  if(hrs>0)return '剩餘 '+hrs+'小時 '+m+'分';
  return '即將截止 · 剩餘 '+Math.max(1,m)+'分';
}
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
      if(setError)return toast('登入失敗：'+setError.message);
      $('passwordLogin').value='';return refresh();
    }
  }
  const{error}=await db.auth.signInWithPassword({email:internalEmail(seat),password:authPassword(raw)});
  if(error)return toast('座號或密碼錯誤');
  $('passwordLogin').value='';await refresh();
});

$('setupForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('setupName').value.trim(),p1=$('setupPassword').value,p2=$('setupPassword2').value;
  if(!name)return toast('請輸入姓名');
  if(p1.length<4)return toast('新密碼至少 4 碼');
  if(p1!==p2)return toast('兩次密碼不一致');
  const b=e.currentTarget.querySelector('button[type="submit"]');b.disabled=true;b.textContent='設定中…';
  const{data,error}=await db.functions.invoke('class-lunch-students',{body:{action:'self_setup',name,password:p1}});
  b.disabled=false;b.textContent='完成設定';
  if(error||data?.error)return toast('設定失敗：'+(data?.detail||data?.error||error.message));
  $('setupForm').reset();toast('設定完成');await refresh();
});

$('logoutBtn').addEventListener('click',async()=>{await db.auth.signOut();student=null;refresh()});
$('accountBtn').addEventListener('click',()=>{$('passwordForm').reset();$('accountDialog').showModal()});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));

$('passwordForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const p1=$('newPassword').value,p2=$('newPassword2').value;
  if(p1.length<4)return toast('密碼至少 4 碼');
  if(p1!==p2)return toast('兩次密碼不一致');
  const b=e.currentTarget.querySelector('button[type="submit"]');b.disabled=true;
  const{data,error}=await db.functions.invoke('class-lunch-students',{body:{action:'change_password',password:p1}});
  b.disabled=false;
  if(error||data?.error)return toast('修改失敗：'+(data?.detail||data?.error||error.message));
  $('accountDialog').close();$('passwordForm').reset();toast('密碼已更新');
});

async function refresh(){
  const{data:{user}}=await db.auth.getUser();
  if(!user){
    $('loginBox').classList.remove('hidden');$('setupBox').classList.add('hidden');$('studentApp').classList.add('hidden');$('logoutBtn').classList.add('hidden');$('accountBtn').classList.add('hidden');
    $('welcomeText').textContent='登入後查看開放中的訂餐。';return;
  }
  const{data:s,error}=await db.from('students').select('id,seat_number,name,active,must_setup').eq('auth_user_id',user.id).maybeSingle();
  if(error||!s||!s.active){await db.auth.signOut();toast('此學生帳號目前無法使用');return refresh()}
  student=s;$('logoutBtn').classList.remove('hidden');$('loginBox').classList.add('hidden');
  if(s.must_setup&&s.seat_number!==99){
    $('accountBtn').classList.add('hidden');$('studentApp').classList.add('hidden');$('setupBox').classList.remove('hidden');$('welcomeText').textContent=s.seat_number+'號第一次登入設定';return;
  }
  $('accountBtn').classList.remove('hidden');$('setupBox').classList.add('hidden');$('studentApp').classList.remove('hidden');
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
  if(student?.seat_number===99&&sessions.length){
    const ids=[...new Set(sessions.map(s=>s.menu_template_id))];
    const{data:mi,error:me}=await db.from('menu_items').select('id,menu_template_id,category,name,price,active,sort_order').in('menu_template_id',ids).eq('active',true).order('sort_order').order('id');
    if(me)return toast('讀取菜單品項失敗：'+me.message);
    menuItems=mi||[];
  }else menuItems=[];
  renderSessionPicker();renderSessions();
}
function renderSessionPicker(){
  const sel=$('sessionPicker'),previous=Number(sel.value);
  sel.innerHTML=sessions.map(s=>'<option value="'+s.id+'">'+esc(fmtDate(s.meal_date)+'｜'+(s.menu_templates?.name||'菜單'))+'</option>').join('');
  if(previous&&sessions.some(s=>s.id===previous))sel.value=String(previous);else if(sessions.length)sel.value=String(sessions[0].id);
  sel.disabled=sessions.length===0;sel.onchange=renderSessions;
}
function renderSessions(){
  if(!sessions.length){$('menus').innerHTML='<div class="loading">目前沒有開放中的訂餐。</div>';return}
  const selectedId=Number($('sessionPicker')?.value)||sessions[0].id;
  const s=sessions.find(x=>x.id===selectedId)||sessions[0],o=orders.find(x=>x.meal_session_id===s.id),closed=expired(s);
  const img=s.menu_templates?.image_url?'<div class="photo-button" data-image-url="'+esc(s.menu_templates.image_url)+'"><img class="menu-photo" src="'+esc(s.menu_templates.image_url)+'" alt="菜單"></div>':'<div class="menu-photo placeholder">🍱</div>';
  let state='';
  if(o){
    state='<div class="order-status '+(o.paid?'paid':'pending')+'"><b>'+(o.paid?'✓ 已付款':'已訂餐 · 未付款')+'</b><div>'+esc(o.item_name)+' · '+money(o.unit_price)+'</div><small>'+esc(o.note||'無備註')+'</small></div>';
    if(!closed&&!o.paid)state+='<div class="order-actions"><button class="primary" onclick="openOrderEditor('+s.id+')">修改訂單</button><button class="small-btn danger" onclick="cancelOrder('+s.id+')">取消訂單</button></div>';
  }else if(closed){
    state='<div class="closed-order">此訂餐已截止</div>';
  }else{
    state='<div class="order-status empty"><b>尚未訂餐</b><span>選好餐點後再送出即可。</span></div><button class="primary full-btn" onclick="openOrderEditor('+s.id+')">開始訂餐</button>';
  }
  const deadline='<div class="deadline '+(closed?'closed':'')+'"><span>截止：'+esc(fmtCutoff(s.cutoff_at)||'未設定')+'</span><b>'+esc(countdown(s))+'</b></div>';
  $('menus').innerHTML='<article class="menu-card">'+img+'<div class="menu-body"><h3>'+esc(s.menu_templates?.name||'菜單')+'</h3><div class="menu-meta">📅 '+esc(fmtDate(s.meal_date))+'</div>'+deadline+state+'</div></article>';
}
function openOrderEditor(sessionId){
  const s=sessions.find(x=>x.id===sessionId),o=orders.find(x=>x.meal_session_id===sessionId);
  if(!s||expired(s)||o?.paid)return;
  editingSessionId=sessionId;$('orderDialogTitle').textContent=s.menu_templates?.name||'訂餐';$('orderDialogDate').textContent=fmtDate(s.meal_date);$('orderNote').value=o?.note||'';
  const isTest=student?.seat_number===99;
  $('freeOrderFields').classList.toggle('hidden',isTest);$('testOrderFields').classList.toggle('hidden',!isTest);
  if(isTest){
    const items=menuItems.filter(x=>x.menu_template_id===s.menu_template_id&&x.active!==false);
    if(!items.length)return toast('這份菜單還沒有建立品項，請先到後台辨識／新增');
    $('orderMenuItem').innerHTML=items.map(x=>'<option value="'+x.id+'">'+esc((x.category?x.category+'｜':'')+x.name+'　'+money(x.price))+'</option>').join('');
    const chosen=items.find(x=>x.name===o?.item_name&&Number(x.price)===Number(o?.unit_price))||items[0];
    $('orderMenuItem').value=String(chosen.id);$('selectedItemPrice').textContent=money(chosen.price);
    $('orderMenuItem').onchange=()=>{const x=items.find(i=>String(i.id)===$('orderMenuItem').value);$('selectedItemPrice').textContent=money(x?.price||0)};
  }else{
    $('orderItem').value=o?.item_name||'';$('orderAmount').value=o?.unit_price??'';
  }
  $('orderDialog').showModal();
}
$('orderDialogForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!editingSessionId)return;
  const note=$('orderNote').value.trim(),b=e.currentTarget.querySelector('button[type="submit"]');
  b.disabled=true;b.textContent='儲存中…';
  let error=null;
  if(student?.seat_number===99){
    const r=await db.rpc('place_class_lunch_order_v3',{p_session_id:editingSessionId,p_menu_item_id:Number($('orderMenuItem').value),p_note:note});error=r.error;
  }else{
    const item=$('orderItem').value.trim(),amount=Number($('orderAmount').value);
    if(!item){b.disabled=false;b.textContent='儲存訂單';return toast('請輸入品項')}
    const r=await db.rpc('place_class_lunch_order_v2',{p_session_id:editingSessionId,p_item_name:item,p_unit_price:amount,p_note:note});error=r.error;
  }
  b.disabled=false;b.textContent='儲存訂單';
  if(error)return toast('送出失敗：'+error.message);
  $('orderDialog').close();toast('訂單已儲存');await loadSessions();
});
async function cancelOrder(sessionId){
  if(!confirm('確定取消這筆訂單？'))return;
  const{error}=await db.rpc('cancel_class_lunch_order_v2',{p_session_id:sessionId});
  if(error)return toast('取消失敗：'+error.message);
  toast('訂單已取消');await loadSessions();
}
function openImage(u){$('largeImage').src=u;$('imageModal').classList.remove('hidden');document.body.style.overflow='hidden'}
function closeImage(e){if(e&&e.target!==$('imageModal')&&!e.target.classList.contains('close'))return;$('imageModal').classList.add('hidden');$('largeImage').src='';document.body.style.overflow=''}
document.addEventListener('click',e=>{const p=e.target.closest('.photo-button');if(p)openImage(p.dataset.imageUrl)});
setInterval(()=>{if(student&&sessions.length)renderSessions()},30000);
db.auth.onAuthStateChange(()=>setTimeout(refresh,0));refresh();