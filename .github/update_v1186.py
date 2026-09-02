from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

def need(cond,msg):
    if not cond:
        raise SystemExit(msg)

need("v1.18.6 後台惡意泡泡" not in s,"bubble code already present")
need(">v1.18.5</button>" in s,"v1.18.5 version marker missing")
s=s.replace(">v1.18.5</button>",">v1.18.6</button>",1)

main_tabs='<div class="tabs" id="mainTabs"><button class="tab active" data-main-tab="inbox">收件箱 <span class="badge hidden" id="unreadBadge">0</span></button><button class="tab" data-main-tab="settings">網站設定</button><button class="tab" data-main-tab="events">重要日程</button><button class="tab" data-main-tab="share">分享圖設定</button><button class="tab" data-main-tab="app">App / 通知</button><button class="tab" id="accountSelfTab" data-main-tab="accountSelf">帳號維護</button><button class="tab hidden" id="accountsTab" data-main-tab="accounts">帳號管理</button></div>'
need(main_tabs in s,"mainTabs marker missing")
s=s.replace(main_tabs,main_tabs+'\n<div id="adminBubbleZone" class="hidden" aria-hidden="true"></div>',1)

css=Path('.github/bubble_v1186.css').read_text(encoding='utf-8')
need("</style>" in s,"style close missing")
s=s.replace("</style>",css+"\n</style>",1)

js=Path('.github/bubble_v1186.js').read_text(encoding='utf-8')
need("async function openAdmin(){" in s,"openAdmin marker missing")
s=s.replace("async function openAdmin(){",js+"\n\nasync function openAdmin(){",1)

show_old='''function showView(name){
  $("#publicView").classList.toggle("active",name==="public");
  $("#adminView").classList.toggle("active",name==="admin");
  if(name==="public"){
    closePublicTool();
  }
}'''
show_new='''function showView(name){
  $("#publicView").classList.toggle("active",name==="public");
  $("#adminView").classList.toggle("active",name==="admin");
  if(name==="public"){
    closePublicTool();
    resetAdminBubbles();
  }
}'''
need(show_old in s,"showView block missing")
s=s.replace(show_old,show_new,1)

open_old='''async function openAdmin(){
  const user=await getVerifiedAdmin();
  if(!user){
    $("#loginPanel").classList.remove("hidden");
    $("#adminMain").classList.add("hidden");
    return;
  }
  $("#loginPanel").classList.add("hidden");
  $("#adminMain").classList.remove("hidden");
  $("#adminIdentity").textContent=user.email||"管理員";
  const role=await loadAdminRole();
  $("#adminIdentity").textContent=`${currentAdminName}管理員 · ${user.email||"管理員"}${role==="owner"?" · Owner":""}`;
  await Promise.allSettled([loadMessages(),loadSettings()]);
  startRealtime();
}'''
open_new='''async function openAdmin(){
  const user=await getVerifiedAdmin();
  if(!user){
    resetAdminBubbles();
    $("#loginPanel").classList.remove("hidden");
    $("#adminMain").classList.add("hidden");
    return;
  }
  $("#loginPanel").classList.add("hidden");
  $("#adminMain").classList.remove("hidden");
  $("#adminIdentity").textContent=user.email||"管理員";
  const role=await loadAdminRole();
  $("#adminIdentity").textContent=`${currentAdminName}管理員 · ${user.email||"管理員"}${role==="owner"?" · Owner":""}`;
  await Promise.allSettled([loadMessages(),loadSettings()]);
  startRealtime();
  startAdminBubbles();
}'''
need(open_old in s,"production openAdmin block missing")
s=s.replace(open_old,open_new,1)

logout_old='''  await supabase.auth.signOut();

  $("#adminMain").classList.add("hidden");'''
logout_new='''  await supabase.auth.signOut();

  resetAdminBubbles();
  $("#adminMain").classList.add("hidden");'''
need(logout_old in s,"logout block missing")
s=s.replace(logout_old,logout_new,1)

p.write_text(s,encoding="utf-8")
print("v1.18.6 markers applied")
