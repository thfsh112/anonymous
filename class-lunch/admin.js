const{createClient}=supabase;
const db=createClient(APP_CONFIG.supabaseUrl,APP_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const seats=Array.from({length:35},(_,i)=>i+1).filter(n=>n!==14);
const $=id=>document.getElementById(id);
const money=n=>'$'+Number(n||0).toLocaleString('zh-TW');
const today=()=>new Date().toLocaleDateString('en-CA');
function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
async function isAdmin(){const{data:{user}}=await db.auth.getUser();if(!user)return false;const{data}=await db.from('admin_users').select('email').eq('email',user.email).maybeSingle();return!!data}
async function refresh(){
  const ok=await isAdmin();
  $('loginBox').classList.toggle('hidden',ok);$('adminApp').classList.toggle('hidden',!ok);
  $('loginStatus').textContent=ok?'已登入管理者':'登入後才能管理菜單與付款。';
  if(ok){$('menuDate').value=today();await Promise.all([loadMenus(),loadSeatPayments(),loadOrders()])}
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const{error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)toast('登入失敗：'+error.message);else refresh()});
async function logout(){await db.auth.signOut();refresh()}

$('menuForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!(await isAdmin()))return toast('沒有管理權限');
  const f=$('menuImage').files[0];if(!f)return toast('請選擇菜單照片');if(f.size>6*1024*1024)return toast('照片請小於 6MB');
  const ext=(f.name.split('.').pop()||'jpg').toLowerCase(),path=crypto.randomUUID()+'.'+ext;
  const{error:uploadError}=await db.storage.from('menu-images').upload(path,f,{contentType:f.type,upsert:false});
  if(uploadError)return toast('照片上傳失敗：'+uploadError.message);
  const url=db.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  const cutoffValue=$('menuCutoff').value,cutoff_at=cutoffValue?new Date(cutoffValue).toISOString():null;
  const{error}=await db.from('menus').insert({menu_date:$('menuDate').value,cutoff_at,name:'',price:0,description:'',image_url:url,is_active:$('menuVisible').checked});
  if(error)toast('新增失敗：'+error.message);else{toast('菜單新增成功');$('menuForm').reset();$('menuDate').value=today();$('menuVisible').checked=true;await Promise.all([loadMenus(),loadSeatPayments()])}
});

async function loadMenus(){
  const{data,error}=await db.from('menus').select('*').order('menu_date',{ascending:false}).order('created_at',{ascending:false});
  if(error)return toast(error.message);
  $('adminMenuCount').textContent=data.length+' 份';
  $('adminMenus').innerHTML=data.map(m=>'<div class="admin-item">'+(m.image_url?'<img src="'+esc(m.image_url)+'" alt="菜單">':'<div></div>')+'<div><b>菜單</b><br>'+(m.is_active?'前台顯示中':'前台隱藏')+'<br>📅 '+esc(m.menu_date||'未設定')+(m.cutoff_at?' · ⏰ 截止 '+esc(new Date(m.cutoff_at).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):' · 無截止時間')+'</div><div class="actions"><button class="small-btn" onclick="toggleMenu('+m.id+','+(!m.is_active)+')">'+(m.is_active?'隱藏':'顯示')+'</button> <button class="small-btn danger" onclick="deleteMenu('+m.id+')">刪除</button></div></div>').join('')||'<div class="loading">沒有菜單</div>';
}
async function toggleMenu(id,n){if(!(await isAdmin()))return toast('沒有管理權限');const{error}=await db.from('menus').update({is_active:n}).eq('id',id);if(error)toast(error.message);else{await loadMenus();await loadSeatPayments()}}
async function deleteMenu(id){
  if(!confirm('確定刪除這份菜單？相關訂單與舊留言也會一起刪除。'))return;
  const{error}=await db.from('menus').delete().eq('id',id);
  if(error)toast(error.message);else{toast('已刪除');await Promise.all([loadMenus(),loadSeatPayments(),loadOrders()])}
}

async function getTodayData(){
  const[{data:menus,error:me},{data:orders,error:oe}]=await Promise.all([
    db.from('menus').select('id,menu_date,image_url,cutoff_at,is_active').order('menu_date',{ascending:false}),
    db.from('orders').select('id,menu_id,student_name,item_name,quantity,unit_price,note,paid,order_date,created_at,tracking_code').order('created_at',{ascending:false})
  ]);
  if(me||oe)throw new Error((me||oe).message);
  const todayMenus=menus.filter(m=>String(m.menu_date)===today());
  const registered=orders.filter(o=>todayMenus.some(m=>m.id===o.menu_id));
  return{todayMenus,registered};
}

async function loadSeatPayments(){
  try{
    const{todayMenus,registered}=await getTodayData();
    const totalQty=registered.reduce((s,o)=>s+Number(o.quantity||1),0);
    const totalAmount=registered.reduce((s,o)=>s+Number(o.quantity||1)*Number(o.unit_price||0),0);
    const unpaidAmount=registered.filter(o=>!o.paid).reduce((s,o)=>s+Number(o.quantity||1)*Number(o.unit_price||0),0);
    const itemMap=new Map();
    registered.forEach(o=>{const k=String(o.item_name||'未填品項').trim()||'未填品項';itemMap.set(k,(itemMap.get(k)||0)+Number(o.quantity||1))});
    $('statOrders').textContent=registered.length;$('statQty').textContent=totalQty;$('statTotal').textContent=money(totalAmount);$('statUnpaid').textContent=money(unpaidAmount);
    const itemSummary='<div class="item-summary"><div class="today-label">📦 今日品項統計</div>'+Array.from(itemMap.entries()).sort((a,b)=>b[1]-a[1]).map(([name,count])=>'<div class="item-summary-row"><span>'+esc(name)+'</span><strong>× '+count+'</strong></div>').join('')+'<div class="item-summary-total">共 '+totalQty+' 件</div></div>';
    const activeMenus=todayMenus.filter(m=>registered.some(o=>o.menu_id===m.id));
    $('seatPayments').innerHTML=activeMenus.length?itemSummary+'<div class="today-label">今天 · '+today()+'</div>'+activeMenus.map(m=>{
      const rows=registered.filter(o=>o.menu_id===m.id),bySeat=new Map();rows.forEach(o=>{const k=String(o.student_name);if(!bySeat.has(k))bySeat.set(k,[]);bySeat.get(k).push(o)});
      return '<div class="seat-menu"><div class="seat-menu-head">'+(m.image_url?'<img src="'+esc(m.image_url)+'" alt="菜單">':'')+'<div><b>📅 '+esc(m.menu_date)+'</b>'+(m.cutoff_at?'<br><small>⏰ 截止 '+esc(new Date(m.cutoff_at).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+'</small>':'')+'</div></div><div class="seat-grid">'+seats.map(n=>{
        const list=bySeat.get(String(n))||[],amount=list.reduce((s,o)=>s+Number(o.quantity||1)*Number(o.unit_price||0),0),allPaid=list.length>0&&list.every(o=>o.paid),hasUnpaid=list.some(o=>!o.paid);
        return '<div class="seat-card '+(list.length?(allPaid?'seat-paid':'seat-unpaid'):'seat-empty')+'"><b>'+n+'號</b><span>'+(list.length?(allPaid?'✓ 已付款':'未付款'):'未登記')+'</span>'+
          (list.length?list.map(o=>'<div class="seat-order"><strong>'+esc(o.item_name||'未填品項')+'</strong><small>'+money(Number(o.quantity||1)*Number(o.unit_price||0))+(o.note?' · '+esc(o.note):'')+'</small><div><button class="small-btn" onclick="togglePaid('+o.id+','+(!o.paid)+')">'+(o.paid?'改未付':'標記付款')+'</button> <button class="small-btn" onclick="editOrder('+o.id+')">編輯</button> <button class="small-btn danger" onclick="deleteOrder('+o.id+')">刪除</button></div></div>').join(''):'')+
          '</div>';
      }).join('')+'</div></div>';
    }).join(''):'<div class="today-empty">今天還沒有訂單。</div>';
  }catch(err){toast('付款狀態載入失敗：'+err.message)}
}

async function loadOrders(){
  const{data,error}=await db.from('orders').select('id,menu_id,student_name,item_name,quantity,unit_price,note,paid,order_date,created_at,menus(menu_date)').eq('order_date',today()).order('created_at',{ascending:false});
  if(error)return toast('訂單載入失敗：'+error.message);
  $('adminComments').innerHTML=data.map(o=>'<div class="comment-admin"><div class="comment-main"><span class="seat-badge">'+esc(o.student_name)+'號</span><div class="comment-text"><b>'+esc(o.menus?.menu_date||o.order_date||'')+'</b><span><strong>'+esc(o.item_name||'未填品項')+'</strong> · '+esc(o.note||'無備註')+'</span></div><div class="comment-money">'+money(Number(o.quantity||1)*Number(o.unit_price||0))+'<small class="'+(o.paid?'paid-text':'unpaid-text')+'">'+(o.paid?'已付款':'未付款')+'</small></div></div><div class="order-admin-actions"><button class="small-btn" onclick="togglePaid('+o.id+','+(!o.paid)+')">'+(o.paid?'改未付':'標記付款')+'</button><button class="small-btn" onclick="editOrder('+o.id+')">編輯</button><button class="small-btn danger" onclick="deleteOrder('+o.id+')">刪除</button></div></div>').join('')||'<div class="loading">今天沒有訂單</div>';
}

async function togglePaid(id,n){
  if(!(await isAdmin()))return toast('沒有管理權限');
  const{error}=await db.from('orders').update({paid:n}).eq('id',id);
  if(error)toast('付款狀態更新失敗：'+error.message);else{toast(n?'已標記付款':'已改為未付款');await Promise.all([loadSeatPayments(),loadOrders()])}
}
async function editOrder(id){
  if(!(await isAdmin()))return toast('沒有管理權限');
  const{data:o,error}=await db.from('orders').select('id,item_name,unit_price,note,quantity').eq('id',id).maybeSingle();
  if(error||!o)return toast(error?.message||'找不到訂單');
  const item=prompt('品項名稱',o.item_name||'');if(item===null)return;
  const amountText=prompt('金額（元）',String(o.unit_price??0));if(amountText===null)return;
  const amount=Number(amountText);if(!Number.isInteger(amount)||amount<0||amount>10000)return toast('金額必須是 0–10000 的整數');
  const note=prompt('備註',o.note||'');if(note===null)return;
  const{error:ue}=await db.from('orders').update({item_name:item.trim(),unit_price:amount,note:note.trim()}).eq('id',id);
  if(ue)toast('編輯失敗：'+ue.message);else{toast('訂單已更新');await Promise.all([loadSeatPayments(),loadOrders()])}
}
async function deleteOrder(id){
  if(!(await isAdmin()))return toast('沒有管理權限');
  if(!confirm('確定刪除這筆訂單嗎？刪除後今日統計、付款狀態與品項統計都會同步更新。'))return;
  const{error}=await db.from('orders').delete().eq('id',id);
  if(error)toast('刪除失敗：'+error.message);else{toast('訂單已刪除');await Promise.all([loadSeatPayments(),loadOrders()])}
}

db.auth.onAuthStateChange(()=>setTimeout(refresh,0));
refresh();
