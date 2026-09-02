from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

def need(cond,msg):
    if not cond:
        raise SystemExit(msg)

need('>v1.18.8</button>' in s,'v1.18.8 version marker missing')
s=s.replace('>v1.18.8</button>','>v1.18.9</button>',1)

old_actions='''<div class="actions">${m.image_path?'<button class="mini" data-action="image">查看／下載圖片</button>':""}<button class="mini" data-action="story">製作分享圖</button><button class="mini" data-action="favorite">${m.is_favorite?"取消收藏":"收藏"}</button><button class="mini danger" data-action="delete">${m.deletion_requested_at?"刪除投稿":"刪除"}</button></div>'''
new_actions='''<div class="actions">${m.image_path?'<button class="mini" data-action="image">查看／下載圖片</button>':""}<button class="mini" data-action="story">製作分享圖</button><button class="mini" data-action="copy">複製純文字</button><button class="mini" data-action="favorite">${m.is_favorite?"取消收藏":"收藏"}</button><button class="mini danger" data-action="delete">${m.deletion_requested_at?"刪除投稿":"刪除"}</button></div>'''
need(old_actions in s,'message actions marker missing')
s=s.replace(old_actions,new_actions,1)

marker='function renderMessages(){'
helper='''async function copySubmissionPlainText(text){
  const value=String(text??"");
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(value);
    }else{
      throw new Error("clipboard_unavailable");
    }
  }catch{
    const ta=document.createElement("textarea");
    ta.value=value;
    ta.setAttribute("readonly","");
    ta.style.position="fixed";
    ta.style.opacity="0";
    ta.style.pointerEvents="none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("已複製純文字");
}
'''
need(marker in s,'renderMessages marker missing')
s=s.replace(marker,helper+marker,1)

old_handler='    if(action==="favorite")await toggleFavorite(m);'
new_handler='    if(action==="copy")await copySubmissionPlainText(m.content);\n    if(action==="favorite")await toggleFavorite(m);'
need(old_handler in s,'action handler marker missing')
s=s.replace(old_handler,new_handler,1)

p.write_text(s,encoding='utf-8')
print('v1.18.9 copy plain text markers applied')
