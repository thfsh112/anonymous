from pathlib import Path
import re

p=Path('index.html')
s=p.read_text(encoding='utf-8')

def req(old,new,count=1):
    global s
    if old not in s:
        raise SystemExit('missing marker: '+old[:180])
    s=s.replace(old,new,count)

req('>v1.18.2</button>','>v1.18.3</button>')

old_tabs='<div class="tabs" id="mainTabs"><button class="tab active" data-main-tab="inbox">收件箱 <span class="badge hidden" id="unreadBadge">0</span></button><button class="tab" data-main-tab="settings">網站設定</button><button class="tab" data-main-tab="events">重要日程</button><button class="tab" data-main-tab="share">分享圖設定</button><button class="tab" data-main-tab="app">App / 通知</button><button class="tab hidden" id="accountsTab" data-main-tab="accounts">帳號維護</button></div>'
new_tabs='<div class="tabs" id="mainTabs"><button class="tab active" data-main-tab="inbox">收件箱 <span class="badge hidden" id="unreadBadge">0</span></button><button class="tab" data-main-tab="settings">網站設定</button><button class="tab" data-main-tab="events">重要日程</button><button class="tab" data-main-tab="share">分享圖設定</button><button class="tab" data-main-tab="app">App / 通知</button><button class="tab" id="accountSelfTab" data-main-tab="accountSelf">帳號維護</button><button class="tab hidden" id="accountsTab" data-main-tab="accounts">帳號管理</button></div>'
req(old_tabs,new_tabs)

marker='<section id="accountsPanel" class="hidden">'
self_panel='''<section id="accountSelfPanel" class="hidden">\n  <div class="panel account-self-panel">\n    <div class="account-admin-head">\n      <div>\n        <div class="small">每位管理員只能修改自己的登入資料。</div>\n        <h3>帳號維護</h3>\n      </div>\n      <span class="admin-role-badge">MY ACCOUNT</span>\n    </div>\n    <div class="account-security-note">可修改自己的管理員名稱、登入 Email 與密碼。既有密碼無法讀回；若不需要變更密碼，密碼欄請留空。</div>\n    <div class="account-self-card">\n      <div class="account-self-grid">\n        <div class="field"><label>管理員名稱</label><input id="selfAdminName" type="text" maxlength="30" autocomplete="off" placeholder="管理員名稱"></div>\n        <div class="field"><label>登入帳號（Email）</label><input id="selfAdminEmail" type="email" autocomplete="username" placeholder="name@example.com"></div>\n        <div class="field"><label>設定新密碼</label><input id="selfAdminPassword" type="password" autocomplete="new-password" placeholder="留空代表不變；至少 8 碼"></div>\n        <div class="field"><label>再次輸入新密碼</label><input id="selfAdminPasswordConfirm" type="password" autocomplete="new-password" placeholder="再次輸入；不改密碼可留空"></div>\n      </div>\n      <div class="account-create-actions"><span class="status-line" id="selfAccountStatus"></span><button class="primary" id="saveSelfAccountBtn" type="button">儲存我的帳號</button></div>\n    </div>\n  </div>\n</section>\n\n'''
req(marker,self_panel+marker)

req('<div class="small">僅主帳號可新增、修改或刪除後台登入帳號。</div>\n        <h3>帳號維護</h3>', '<div class="small">僅主帳號可新增、修改或刪除所有後台登入帳號。</div>\n        <h3>帳號管理</h3>')
req('新增後可登入同一個後台，但不會看到「帳號維護」。','新增後可登入同一個後台，也能使用「帳號維護」修改自己的資料；只有主帳號會看到「帳號管理」。')

css='''\n/* ===== v1.18.3 帳號維護 / 帳號管理 ===== */\n.account-self-panel{max-width:780px;margin:0 auto}\n.account-self-card{margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:18px;background:#fff}\n.account-self-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.account-self-grid .field{margin:0}\n@media(max-width:620px){.account-self-grid{grid-template-columns:1fr}}\n'''
req('</style>',css+'\n</style>')

s=s.replace('PNG / JPG / WEBP，最多 5 MB','PNG / JPG / WEBP，最多 15 MB')
s=s.replace('PNG / JPG / WEBP，最大 5 MB。','PNG / JPG / WEBP，最大 15 MB。')
s=s.replace('file.size>5*1024*1024','file.size>15*1024*1024')
s=s.replace('圖片不能超過 5 MB','圖片不能超過 15 MB')

old_role='''async function loadAdminRole(){\n  currentAdminRole=null;\n  currentAdminName="管理員";\n  $("#accountsTab").classList.add("hidden");\n  try{\n    const me=await callAdminManager("me");\n    currentAdminRole=me.role||null;\n    currentAdminName=(me.display_name||"管理員").trim()||"管理員";\n    $("#accountsTab").classList.toggle("hidden",currentAdminRole!=="owner");\n    return currentAdminRole;\n  }catch(error){\n    console.warn("load_admin_role_failed",error);\n    return null;\n  }\n}'''
new_role='''async function loadAdminRole(){\n  currentAdminRole=null;\n  currentAdminName="管理員";\n  $("#accountsTab").classList.add("hidden");\n  try{\n    const me=await callAdminManager("me");\n    currentAdminRole=me.role||null;\n    currentAdminName=(me.display_name||"管理員").trim()||"管理員";\n    $("#accountsTab").classList.toggle("hidden",currentAdminRole!=="owner");\n    fillSelfAccountForm(me);\n    return currentAdminRole;\n  }catch(error){\n    console.warn("load_admin_role_failed",error);\n    return null;\n  }\n}\n\nfunction fillSelfAccountForm(me){\n  if(!me)return;\n  $("#selfAdminName").value=(me.display_name||currentAdminName||"管理員").trim();\n  $("#selfAdminEmail").value=me.email||"";\n  $("#selfAdminPassword").value="";\n  $("#selfAdminPasswordConfirm").value="";\n}\n\nasync function loadSelfAccount(){\n  try{\n    const me=await callAdminManager("me");\n    currentAdminRole=me.role||currentAdminRole;\n    currentAdminName=(me.display_name||currentAdminName||"管理員").trim()||"管理員";\n    fillSelfAccountForm(me);\n    return me;\n  }catch(error){\n    console.error("load_self_account_failed",error);\n    $("#selfAccountStatus").textContent=adminManagerErrorText(error.code);\n    return null;\n  }\n}\n\n$("#saveSelfAccountBtn").addEventListener("click",async()=>{\n  const displayName=$("#selfAdminName").value.trim();\n  const email=$("#selfAdminEmail").value.trim();\n  const password=$("#selfAdminPassword").value;\n  const confirmPassword=$("#selfAdminPasswordConfirm").value;\n  const status=$("#selfAccountStatus");\n  if(!displayName)return toast("請輸入管理員名稱");\n  if(displayName.length>30)return toast("管理員名稱最多 30 個字");\n  if(!/^\\S+@\\S+\\.\\S+$/.test(email))return toast("Email 格式不正確");\n  if(password&&password.length<8)return toast("新密碼至少需要 8 碼");\n  if(password!==confirmPassword)return toast("兩次輸入的新密碼不一致");\n  const btn=$("#saveSelfAccountBtn");\n  btn.disabled=true;\n  btn.textContent="儲存中…";\n  status.textContent="儲存中…";\n  try{\n    const result=await callAdminManager("update_self",{display_name:displayName,email,password});\n    currentAdminName=(result.display_name||displayName||"管理員").trim()||"管理員";\n    currentAdminRole=result.role||currentAdminRole;\n    $("#adminIdentity").textContent=`${currentAdminName}管理員 · ${result.email||email}${currentAdminRole==="owner"?" · Owner":""}`;\n    $("#selfAdminPassword").value="";\n    $("#selfAdminPasswordConfirm").value="";\n    status.textContent="帳號資料已更新。";\n    toast("我的帳號已更新");\n  }catch(error){\n    status.textContent=adminManagerErrorText(error.code);\n    toast(adminManagerErrorText(error.code));\n  }finally{\n    btn.disabled=false;\n    btn.textContent="儲存我的帳號";\n  }\n});'''
req(old_role,new_role)

req('''  $("#shareSettingsPanel").classList.toggle("hidden",tab!=="share");\n  $("#accountsPanel").classList.toggle("hidden",tab!=="accounts");\n  $("#appPanel").classList.toggle("hidden",tab!=="app");''','''  $("#shareSettingsPanel").classList.toggle("hidden",tab!=="share");\n  $("#accountSelfPanel").classList.toggle("hidden",tab!=="accountSelf");\n  $("#accountsPanel").classList.toggle("hidden",tab!=="accounts");\n  $("#appPanel").classList.toggle("hidden",tab!=="app");''')

req('''    share:$("#shareSettingsPanel .panel"),\n    accounts:$("#accountsPanel .panel"),\n    app:$("#appPanel .panel")''','''    share:$("#shareSettingsPanel .panel"),\n    accountSelf:$("#accountSelfPanel .panel"),\n    accounts:$("#accountsPanel .panel"),\n    app:$("#appPanel .panel")''')

req('''  if(tab==="accounts"){\n    if(currentAdminRole!=="owner"){\n      toast("只有主帳號可以管理帳號");\n      return;\n    }\n    await loadAdminUsers();\n  }\n  if(tab==="app"){\n    await refreshPwaPanel();\n  }''','''  if(tab==="accountSelf"){\n    $("#selfAccountStatus").textContent="";\n    await loadSelfAccount();\n  }\n  if(tab==="accounts"){\n    if(currentAdminRole!=="owner"){\n      toast("只有主帳號可以管理所有帳號");\n      return;\n    }\n    await loadAdminUsers();\n  }\n  if(tab==="app"){\n    await refreshPwaPanel();\n  }''')

p.write_text(s,encoding='utf-8')

sw=Path('service-worker.js')
sw_text=sw.read_text(encoding='utf-8')
if 'anonymous-mailbox-v1.18.2' not in sw_text:
    raise SystemExit('service worker version marker missing')
sw.write_text(sw_text.replace('anonymous-mailbox-v1.18.2','anonymous-mailbox-v1.18.3'),encoding='utf-8')

m=re.search(r'<script type="module">(.*?)</script>',s,re.S)
if not m:
    raise SystemExit('module script missing')
js=m.group(1)
js=re.sub(r'import\s+\{\s*createClient\s*\}\s+from\s+"[^"]+";','const createClient=(...args)=>({});',js,count=1)
Path('/tmp/check.js').write_text(js,encoding='utf-8')
