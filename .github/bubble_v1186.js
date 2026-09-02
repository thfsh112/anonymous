const ADMIN_BUBBLE_TAUNTS=[
  "不是叫你不要點嗎",
  "恭喜，又多一顆",
  "你以為那是關閉？",
  "這顆是你自己生的",
  "手很癢是不是",
  "再按一次看看啊",
  "管理員的自制力：0",
  "其實放著就會變小",
  "你再點，我再生",
  "不要怪我，是你按的",
  "這不是叉掉，是繁殖",
  "你真的很想關掉我欸"
];
const ADMIN_BUBBLE_IDLE_MS=15000;
const ADMIN_BUBBLE_GROWTH=.05;
const ADMIN_BUBBLE_SHRINK_FACTOR=.9;
const ADMIN_BUBBLE_MIN_SCALE=.2;
const ADMIN_BUBBLE_MAX_SCALE=2.25;
const ADMIN_BUBBLE_MAX_COUNT=20;
const ADMIN_BUBBLE_BASE_SIZE=116;

let adminBubbleState={
  running:false,
  raf:0,
  lastTick:0,
  seq:0,
  bubbles:[]
};

function bubbleZone(){
  return $("#adminBubbleZone");
}
function randomBubbleTaunt(){
  return ADMIN_BUBBLE_TAUNTS[Math.floor(Math.random()*ADMIN_BUBBLE_TAUNTS.length)];
}
function adminBubbleBounds(){
  const tabs=$("#mainTabs");
  const topBase=tabs?.getBoundingClientRect?.().bottom||160;
  return {
    left:12,
    top:Math.max(topBase+12,148),
    right:window.innerWidth-12,
    bottom:window.innerHeight-14
  };
}
function applyBubbleZoneBounds(){
  const zone=bubbleZone();
  if(!zone)return;
  const b=adminBubbleBounds();
  zone.style.left=`${b.left}px`;
  zone.style.top=`${b.top}px`;
  zone.style.width=`${Math.max(0,b.right-b.left)}px`;
  zone.style.height=`${Math.max(0,b.bottom-b.top)}px`;
}
function clearAdminBubbleElements(){
  const zone=bubbleZone();
  if(zone)zone.innerHTML="";
}
function renderAdminBubble(bubble){
  const size=Math.round(ADMIN_BUBBLE_BASE_SIZE*bubble.scale);
  bubble.size=size;
  bubble.el.style.width=`${size}px`;
  bubble.el.style.height=`${size}px`;
  bubble.el.style.left=`${bubble.x}px`;
  bubble.el.style.top=`${bubble.y}px`;
  bubble.el.style.setProperty("--bubble-x",`${bubble.x}px`);
  bubble.el.style.setProperty("--bubble-y",`${bubble.y}px`);
  bubble.textEl.style.fontSize=`${Math.max(11,Math.min(18,Math.round(11+bubble.scale*3.2)))}px`;
  bubble.textEl.textContent=bubble.text;
}
function clampBubblePosition(bubble){
  const zone=bubbleZone();
  if(!zone)return;
  const maxX=Math.max(0,zone.clientWidth-bubble.size);
  const maxY=Math.max(0,zone.clientHeight-bubble.size);
  bubble.x=Math.min(maxX,Math.max(0,bubble.x));
  bubble.y=Math.min(maxY,Math.max(0,bubble.y));
}
function makeAdminBubble({x,y,scale=1,text="先別點"}={}){
  const zone=bubbleZone();
  if(!zone)return null;

  const el=document.createElement("div");
  el.className="admin-bubble";
  el.innerHTML='<button class="admin-bubble-close" type="button" aria-label="關閉">×</button><div class="admin-bubble-text"></div>';

  const bubble={
    id:++adminBubbleState.seq,
    el,
    textEl:el.querySelector(".admin-bubble-text"),
    closeBtn:el.querySelector(".admin-bubble-close"),
    x:x??0,
    y:y??0,
    scale:scale,
    vx:(Math.random()>.5?1:-1)*(0.42+Math.random()*0.48),
    vy:(Math.random()>.5?1:-1)*(0.38+Math.random()*0.42),
    lastInteraction:Date.now(),
    text
  };

  bubble.closeBtn.addEventListener("click",e=>{
    e.preventDefault();
    e.stopPropagation();
    explodeAdminBubble(bubble);
  });

  zone.appendChild(el);
  renderAdminBubble(bubble);
  clampBubblePosition(bubble);
  renderAdminBubble(bubble);
  adminBubbleState.bubbles.push(bubble);
  return bubble;
}
function spawnAdminBubbleNear(source){
  if(adminBubbleState.bubbles.length>=ADMIN_BUBBLE_MAX_COUNT)return;
  const zone=bubbleZone();
  if(!zone)return;

  const angle=Math.random()*Math.PI*2;
  const distance=50+Math.random()*90;
  const size=Math.round(ADMIN_BUBBLE_BASE_SIZE);
  const maxX=Math.max(0,zone.clientWidth-size);
  const maxY=Math.max(0,zone.clientHeight-size);

  const x=Math.min(maxX,Math.max(0,source.x+Math.cos(angle)*distance));
  const y=Math.min(maxY,Math.max(0,source.y+Math.sin(angle)*distance));

  makeAdminBubble({
    x,
    y,
    scale:1,
    text:randomBubbleTaunt()
  });
}
function explodeAdminBubble(bubble){
  bubble.scale=Math.min(ADMIN_BUBBLE_MAX_SCALE,Number((bubble.scale+ADMIN_BUBBLE_GROWTH).toFixed(3)));
  bubble.lastInteraction=Date.now();
  bubble.text=randomBubbleTaunt();
  bubble.vx*=1.04;
  bubble.vy*=1.04;
  bubble.el.classList.remove("bump");
  void bubble.el.offsetWidth;
  bubble.el.classList.add("bump");
  renderAdminBubble(bubble);
  clampBubblePosition(bubble);
  renderAdminBubble(bubble);
  spawnAdminBubbleNear(bubble);
}
function removeAdminBubble(bubble){
  bubble.el?.remove();
  adminBubbleState.bubbles=adminBubbleState.bubbles.filter(x=>x.id!==bubble.id);
}
function resetAdminBubbles(){
  adminBubbleState.running=false;
  if(adminBubbleState.raf)cancelAnimationFrame(adminBubbleState.raf);
  adminBubbleState.raf=0;
  adminBubbleState.lastTick=0;
  adminBubbleState.bubbles=[];
  clearAdminBubbleElements();
  bubbleZone()?.classList.add("hidden");
}
function tickAdminBubbles(ts){
  if(!adminBubbleState.running)return;

  const zone=bubbleZone();
  if(!zone){
    resetAdminBubbles();
    return;
  }

  applyBubbleZoneBounds();

  const dt=adminBubbleState.lastTick?Math.min(2.1,(ts-adminBubbleState.lastTick)/16.67):1;
  adminBubbleState.lastTick=ts;
  const now=Date.now();

  for(const bubble of [...adminBubbleState.bubbles]){
    if(now-bubble.lastInteraction>=ADMIN_BUBBLE_IDLE_MS){
      bubble.scale=Number((bubble.scale*ADMIN_BUBBLE_SHRINK_FACTOR).toFixed(3));
      bubble.lastInteraction=now;
      if(bubble.scale<ADMIN_BUBBLE_MIN_SCALE){
        removeAdminBubble(bubble);
        continue;
      }
      renderAdminBubble(bubble);
    }

    const maxX=Math.max(0,zone.clientWidth-bubble.size);
    const maxY=Math.max(0,zone.clientHeight-bubble.size);

    bubble.x+=bubble.vx*dt;
    bubble.y+=bubble.vy*dt;

    if(bubble.x<=0){
      bubble.x=0;
      bubble.vx=Math.abs(bubble.vx);
    }else if(bubble.x>=maxX){
      bubble.x=maxX;
      bubble.vx=-Math.abs(bubble.vx);
    }

    if(bubble.y<=0){
      bubble.y=0;
      bubble.vy=Math.abs(bubble.vy);
    }else if(bubble.y>=maxY){
      bubble.y=maxY;
      bubble.vy=-Math.abs(bubble.vy);
    }

    renderAdminBubble(bubble);
  }

  adminBubbleState.raf=requestAnimationFrame(tickAdminBubbles);
}
function startAdminBubbles(){
  resetAdminBubbles();

  const zone=bubbleZone();
  if(!zone)return;

  applyBubbleZoneBounds();
  zone.classList.remove("hidden");

  const startX=Math.max(0,Math.min(zone.clientWidth-ADMIN_BUBBLE_BASE_SIZE, zone.clientWidth*.54));
  const startY=Math.max(0,Math.min(zone.clientHeight-ADMIN_BUBBLE_BASE_SIZE, zone.clientHeight*.18));

  makeAdminBubble({
    x:startX,
    y:startY,
    scale:1,
    text:"先別點"
  });

  adminBubbleState.running=true;
  adminBubbleState.lastTick=0;
  adminBubbleState.raf=requestAnimationFrame(tickAdminBubbles);
}
window.addEventListener("resize",()=>{
  if(!adminBubbleState.running)return;
  applyBubbleZoneBounds();
  for(const bubble of adminBubbleState.bubbles){
    clampBubblePosition(bubble);
    renderAdminBubble(bubble);
  }
});