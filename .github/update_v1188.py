from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

def need(cond,msg):
    if not cond:
        raise SystemExit(msg)

need('>v1.18.7</button>' in s,'v1.18.7 marker missing')
need('ADMIN_BUBBLE_DISABLED_KEY' not in s,'disable feature already present')

s=s.replace('>v1.18.7</button>','>v1.18.8</button>',1)

marker='const ADMIN_BUBBLE_BASE_SIZE=116;'
need(marker in s,'bubble constants marker missing')
s=s.replace(marker,marker+'\nconst ADMIN_BUBBLE_DISABLED_KEY="anonymous-mailbox-admin-bubbles-disabled-v1";\n\nfunction adminBubblesDisabled(){\n  try{return localStorage.getItem(ADMIN_BUBBLE_DISABLED_KEY)==="1"}catch{return false}\n}\nfunction permanentlyDisableAdminBubbles(){\n  try{localStorage.setItem(ADMIN_BUBBLE_DISABLED_KEY,"1")}catch{}\n  resetAdminBubbles();\n  toast("這台裝置的泡泡已永久關閉");\n}',1)

start_old='function startAdminBubbles(){\n  resetAdminBubbles();\n\n  const zone=bubbleZone();'
start_new='function startAdminBubbles(){\n  resetAdminBubbles();\n  if(adminBubblesDisabled())return;\n\n  const zone=bubbleZone();'
need(start_old in s,'startAdminBubbles marker missing')
s=s.replace(start_old,start_new,1)

version_marker='let versionTapCount=0;\nlet versionTapTimer=null;'
need(version_marker in s,'version tap marker missing')
brand_logic='''let bubbleDisableTapCount=0;
let bubbleDisableTapTimer=null;
$("#brandTitle")?.addEventListener("click",()=>{
  bubbleDisableTapCount++;
  clearTimeout(bubbleDisableTapTimer);
  if(bubbleDisableTapCount>=5){
    bubbleDisableTapCount=0;
    permanentlyDisableAdminBubbles();
    return;
  }
  bubbleDisableTapTimer=setTimeout(()=>{bubbleDisableTapCount=0},2200);
});
'''
s=s.replace(version_marker,brand_logic+'\n'+version_marker,1)

p.write_text(s,encoding='utf-8')
print('v1.18.8 markers applied')
