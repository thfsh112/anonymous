const{createClient}=supabase;
const db=createClient(APP_CONFIG.supabaseUrl,APP_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id),money=n=>'$'+Number(n||0).toLocaleString('zh-TW');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA');
let templates=[],sessions=[],students=[];
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
async function isAdmin(){const{data:{user}}=await db.auth.getUser();if(!user)return false;const{data}=await db.from('admin_users').select('email').eq('email',user.email).maybeSingle();return!!data}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const{error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)return toast('登入失敗');refresh()});
$('logoutBtn').addEventListener('click',async()=>{await db.auth.signOut();refresh()});
document.querySelectorAll('.tab[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab-page').forEach(p=>p.classList.add('hidden'));$('tab-'+b.dataset.tab).classList.remove('hidden')}));

async function refresh(){
  const ok=await isAdmin();$('loginBox').classList.toggle('hidden',ok);$('adminApp').classList.toggle('hidden',!ok);$('loginStatus').textContent=ok?'已登入管理者':'登入後管理菜單、日期、學生與付款。';
  if(!ok)return;
  $('sessionDate').value=today();
  await Promise.all([loadTemplates(),loadSessions(),loadStudents()]);
  renderTemplateSelect();renderSessionList();renderStudentList();renderOverviewSelect();
}
async function loadTemplates(){const{data,error}=await db.from('menu_templates').select('*').order('created_at',{ascending:false});if(error)return toast(error.message);templates=data||[];$('templateCount').textContent=templates.length+' 份';renderTemplateList()}
async function loadSessions(){const{data,error}=await db.from('meal_sessions').select('*,menu_templates(name,image_url)').order('meal_date',{ascending:false}).order('created_at',{ascending:false});if(error)return toast(error.message);sessions=data||[];$('sessionCount').textContent=sessions.length+' 個';renderSessionList();renderOverviewSelect()}
async function loadStudents(){const{data,error}=await db.from('students').select('id,seat_number,name,active,created_at').order('seat_number');if(error)return toast(error.message);students=data||[];$('studentCount').textContent=students.length+' 人';renderStudentList()}

function renderTemplateSelect(){$('sessionTemplate').innerHTML=templates.filter(t=>t.active).map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('')}
function renderTemplateList(){$('templateList').innerHTML=templates.map(t=>'<div class="admin-item">'+(t.image_url?'<img src="'+esc(t.image_url)+'" alt="">':'<div></div>')+'<div><b>'+esc(t.name)+'</b><br><span class="hint">'+(t.active?'使用中':'已停用')+'</span></div><div class="actions"><button class="small-btn" onclick="toggleTemplate('+t.id+','+(!t.active)+')">'+(t.active?'停用':'啟用')+'</button></div></div>').join('')||'<div class="loading">尚無菜單</div>'}
function renderSessionList(){$('sessionList').innerHTML=sessions.map(s=>'<div class="admin-item">'+(s.menu_templates?.image_url?'<img src="'+esc(s.menu_templates.image_url)+'" alt="">':'<div></div>')+'<div><b>'+esc(s.menu_templates?.name||'菜單')+'</b><br>'+esc(s.meal_date)+(s.cutoff_at?' · 截止 '+esc(new Date(s.cutoff_at).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):'')+'<br><span class="hint">'+(s.is_active?'開放':'關閉')+'</span></div><div class="actions"><button class="small-btn" onclick="toggleSession('+s.id+','+(!s.is_active)+')">'+(s.is_active?'關閉':'開放')+'</button></div></div>').join('')||'<div class="loading">尚無日期</div>'}
function renderStudentList(){$('studentList').innerHTML=students.map(s=>'<div class="student-row"><span class="seat-badge">'+s.seat_number+'號</span><div><b>'+esc(s.name)+'</b><br><span class="hint">'+(s.active?'啟用中':'已停用')+'</span></div><div class="actions"><button class="small-btn" onclick="renameStudent(\''+s.id+'\',\''+esc(s.name).replace(/'/g,"\\'")+'\','+s.active+')">編輯</button><button class="small-btn" onclick="resetPassword(\''+s.id+'\')">重設密碼</button></div></div>').join('')||'<div class="loading">尚無學生</div>'}

$('templateForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=$('templateImage').files[0],name=$('templateName').value.trim();if(!f||!name)return;
  if(f.size>6*1024*1024)return toast('圖片請小於 6MB');
  const ext=(f.name.split('.').pop()||'jpg').toLowerCase(),path='templates/'+crypto.randomUUID()+'.'+ext;
  const{error:ue}=await db.storage.from('menu-images').upload(path,f,{contentType:f.type,upsert:false});if(ue)return toast('圖片上傳失敗：'+ue.message);
  const url=db.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  const{error}=await db.from('menu_templates').insert({name,image_url:url,active:true});if(error)return toast(error.message);
  e.target.reset();toast('菜單已存入');await loadTemplates();renderTemplateSelect();
});
$('sessionForm').addEventListener('submit',async e=>{
  e.preventDefault();const cutoff=$('sessionCutoff').value;
  const{error}=await db.from('meal_sessions').insert({menu_template_id:Number($('sessionTemplate').value),meal_date:$('sessionDate').value,cutoff_at:cutoff?new Date(cutoff).toISOString():null,is_active:$('sessionActive').checked});
  if(error)return toast(error.message);toast('訂餐日期已新增');$('sessionCutoff').value='';await loadSessions();
});
$('studentForm').addEventListener('submit',async e=>{
  e.preventDefault();const seat=Number($('studentSeat').value),name=$('studentName').value.trim(),password=$('studentPassword').value;
  const{data,error}=await db.functions.invoke('class-lunch-students',{body:{action:'create',seat_number:seat,name,password}});
  if(error||data?.error)return toast('建立失敗：'+(data?.error||error.message));
  e.target.reset();toast('學生已建立');await loadStudents();
});
async function toggleTemplate(id,n){const{error}=await db.from('menu_templates').update({active:n}).eq('id',id);if(error)return toast(error.message);await loadTemplates();renderTemplateSelect()}
async function toggleSession(id,n){const{error}=await db.from('meal_sessions').update({is_active:n}).eq('id',id);if(error)return toast(error.message);await loadSessions()}
async function resetPassword(id){const p=prompt('輸入新密碼（至少 6 碼）');if(p===null)return;const{data,error}=await db.functions.invoke('class-lunch-students',{body:{action:'reset_password',student_id:id,password:p}});if(error||data?.error)return toast('重設失敗');toast('密碼已重設')}
async function renameStudent(id,name,active){const n=prompt('姓名',name);if(n===null)return;const enable=confirm('按「確定」= 啟用此帳號；按「取消」= 停用此帳號');const{data,error}=await db.functions.invoke('class-lunch-students',{body:{action:'update',student_id:id,name:n,active:enable}});if(error||data?.error)return toast('更新失敗');toast('學生資料已更新');await loadStudents()}

function renderOverviewSelect(){
  const cur=$('overviewSession').value;
  $('overviewSession').innerHTML=sessions.map(s=>'<option value="'+s.id+'">'+esc(s.meal_date+' '+(s.menu_templates?.name||'菜單'))+'</option>').join('');
  if(cur&&sessions.some(s=>String(s.id)===cur))$('overviewSession').value=cur;
  $('overviewSession').onchange=loadOverview;
  if(sessions.length)loadOverview();else $('seatPayments').innerHTML='<div class="loading">尚無訂餐日期</div>';
}
async function loadOverview(){
  const id=Number($('overviewSession').value);if(!id)return;
  const{data:os,error}=await db.from('orders').select('id,student_id,student_name,item_name,unit_price,note,paid,quantity').or('meal_session_id.eq.'+id+',menu_id.eq.'+(sessions.find(s=>s.id===id)?.legacy_menu_id||-1));
  if(error)return toast(error.message);
  const list=os||[],paid=list.filter(o=>o.paid).length,total=list.reduce((a,o)=>a+Number(o.unit_price||0)*Number(o.quantity||1),0);
  $('statOrders').textContent=list.length;$('statPaid').textContent=paid;$('statUnpaidCount').textContent=list.length-paid;$('statTotal').textContent=money(total);
  const bySeat=new Map();
  for(const o of list){const st=students.find(s=>s.id===o.student_id);const seat=st?.seat_number||Number(o.student_name);if(seat)bySeat.set(seat,{...o,name:st?.name||''})}
  const seats=Array.from({length:35},(_,i)=>i+1).filter(n=>n!==14);
  $('seatPayments').innerHTML='<div class="seat-grid">'+seats.map(n=>{const o=bySeat.get(n),st=students.find(s=>s.seat_number===n);return '<div class="seat-card '+(!o?'seat-empty':o.paid?'seat-paid':'seat-unpaid')+'"><b>'+n+'號'+(st?' '+esc(st.name):'')+'</b><span>'+(!o?'未訂':o.paid?'✓ 已付款':'未付款')+'</span>'+(o?'<strong>'+esc(o.item_name)+' · '+money(o.unit_price)+'</strong><small>'+esc(o.note||'')+'</small><div><button class="small-btn" onclick="togglePaid('+o.id+','+(!o.paid)+')">'+(o.paid?'改未付':'標記付款')+'</button> <button class="small-btn danger" onclick="deleteOrder('+o.id+')">刪除</button></div>':'')+'</div>'}).join('')+'</div>';
}
async function togglePaid(id,n){const{error}=await db.from('orders').update({paid:n}).eq('id',id);if(error)return toast(error.message);toast(n?'已付款':'已改未付款');loadOverview()}
async function deleteOrder(id){if(!confirm('確定刪除這筆訂單？'))return;const{error}=await db.from('orders').delete().eq('id',id);if(error)return toast(error.message);toast('已刪除');loadOverview()}
db.auth.onAuthStateChange(()=>setTimeout(refresh,0));refresh();