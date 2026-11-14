const canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
const ui={health:document.querySelector("#health"),ammo:document.querySelector("#ammo"),message:document.querySelector("#message"),start:document.querySelector("#start-screen"),end:document.querySelector("#end-screen"),endTitle:document.querySelector("#end-title"),endCopy:document.querySelector("#end-copy")};
const W=960,H=540,world={width:2600,ground:438},keys={left:false,right:false};
let running=false,last=0,camera=0,player,enemies,pickups,bullets,particles,levelDone=false,ammo=9,reserve=27,health=100,waterRoute=false;
const rnd=(a,b)=>a+Math.random()*(b-a);
function resize(){const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(canvas.clientWidth*d);canvas.height=Math.floor(canvas.clientHeight*d);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0)}
new ResizeObserver(resize).observe(canvas);resize();
function reset(){player={x:110,y:world.ground-82,vx:0,vy:0,face:1,w:30,h:78,onGround:true,attack:0,invuln:0};enemies=[{x:610,y:world.ground-68,hp:2,dir:-1,alert:false,homeMin:540,homeMax:690},{x:1120,y:world.ground-68,hp:2,dir:1,alert:false,homeMin:1030,homeMax:1210},{x:1740,y:world.ground-68,hp:2,dir:-1,alert:false,homeMin:1660,homeMax:1810}];pickups=[{x:390,y:world.ground-22,type:"ammo",taken:false},{x:850,y:world.ground-22,type:"med",taken:false},{x:1450,y:world.ground-22,type:"ammo",taken:false}];bullets=[];particles=[];ammo=9;reserve=27;health=100;camera=0;levelDone=false;waterRoute=false;updateHud()}
function updateHud(){ui.health.textContent="ЗДОРОВЬЕ "+health;ui.ammo.textContent=ammo+" / "+reserve}
function say(t){ui.message.textContent=t}
function start(){reset();running=true;ui.start.classList.add("hidden");ui.end.classList.add("hidden");say("Держись в тени. Враги слышат выстрелы.");requestAnimationFrame(loop)}
document.querySelector("#start-button").onclick=start;document.querySelector("#restart-button").onclick=start;
const actionButtons=[...document.querySelectorAll("[data-action]")];
actionButtons.forEach(b=>{const a=b.dataset.action;const down=e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);b.classList.add("pressed");if(a==="left"||a==="right")keys[a]=true;else act(a)};const up=e=>{e.preventDefault();b.classList.remove("pressed");if(a==="left"||a==="right")keys[a]=false};b.addEventListener("pointerdown",down);b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("lostpointercapture",up)});
window.addEventListener("keydown",e=>{if(["ArrowLeft","ArrowRight"," ","ArrowUp"].includes(e.key))e.preventDefault();if(e.key==="ArrowLeft"||e.key==="a")keys.left=true;if(e.key==="ArrowRight"||e.key==="d")keys.right=true;if((e.key===" "||e.key==="ArrowUp"||e.key==="w")&&!e.repeat)act("jump");if(e.key==="j"&&!e.repeat)act("knife");if((e.key==="k"||e.key==="Control")&&!e.repeat)act("fire");if(e.key==="e"&&!e.repeat)act("interact")});
window.addEventListener("keyup",e=>{if(e.key==="ArrowLeft"||e.key==="a")keys.left=false;if(e.key==="ArrowRight"||e.key==="d")keys.right=false});
function act(a){if(!running)return;if(a==="jump"&&player.onGround){player.vy=-430;player.onGround=false}if(a==="fire"&&ammo>0&&player.attack<=0){ammo--;player.attack=.3;bullets.push({x:player.x+player.face*23,y:player.y+29,vx:player.face*760,life:1});enemies.forEach(e=>{if(Math.abs(e.x-player.x)<520)e.alert=true});say("Глушитель приглушает звук, но не делает тебя невидимым.");updateHud()}if(a==="knife"&&player.attack<=0){player.attack=.42;enemies.forEach(e=>{if(Math.abs(e.x-player.x)<65&&Math.sign(e.x-player.x)===player.face){e.hp-=2;e.alert=false;burst(e.x,e.y,12)}});say("Короткий выпад. Не подпускай врага со спины.")}if(a==="interact"){const p=pickups.find(p=>!p.taken&&Math.abs(p.x-player.x)<65);if(p){p.taken=true;if(p.type==="ammo"){reserve+=12;say("Подобраны патроны: +12")}else{health=Math.min(100,health+35);say("Аптечка использована: +35 здоровья")}updateHud()}else if(player.x>1280&&player.x<1600){waterRoute=true;say("Ты нашёл низкий проход под разрушенной эстакадой. Обход открыт.")}else say("Осмотрись. Иногда путь лежит не по дороге.")}}
function burst(x,y,n){for(let i=0;i<n;i++)particles.push({x,y,vx:rnd(-100,100),vy:rnd(-150,20),life:rnd(.2,.65)})}
function update(dt){const p=player,speed=220;p.vx=(keys.right?1:0)-(keys.left?1:0);if(p.vx)p.face=Math.sign(p.vx);p.x=Math.max(25,Math.min(world.width-60,p.x+p.vx*speed*dt));p.y+=p.vy*dt;p.vy+=1100*dt;if(p.y+p.h>=world.ground){p.y=world.ground-p.h;p.vy=0;p.onGround=true}
p.attack=Math.max(0,p.attack-dt);p.invuln=Math.max(0,p.invuln-dt);
enemies.forEach(e=>{if(e.hp<=0)return;if(e.alert&&Math.abs(e.x-p.x)<330){e.x+=Math.sign(p.x-e.x)*75*dt;if(Math.abs(e.x-p.x)<40&&p.invuln<=0){health=Math.max(0,health-12);p.invuln=.8;updateHud();say("Тебя задели. Найди укрытие.")}}else{e.x+=e.dir*18*dt;if(e.x<e.homeMin||e.x>e.homeMax)e.dir*=-1}});
bullets=bullets.filter(b=>{b.x+=b.vx*dt;b.life-=dt;for(const e of enemies){if(e.hp>0&&Math.abs(e.x-b.x)<22){e.hp--;burst(e.x,e.y,8);return false}}return b.life>0&&b.x>camera-30&&b.x<camera+W+30});
particles=particles.filter(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=280*dt;q.life-=dt;return q.life>0});
camera=Math.max(0,Math.min(world.width-W,p.x-W*.36));
if(p.x>world.width-100){finish(true)}if(health<=0)finish(false)}
function finish(ok){if(levelDone)return;levelDone=true;running=false;ui.endTitle.textContent=ok?"ПЕРЕПРАВА НАЙДЕНА":"ГОРОД НЕ ОТПУСТИЛ";ui.endCopy.textContent=ok?"Ты прошёл первую окраину. Это только первая глава пути из десяти.":"Попробуй другой маршрут, используй укрытия и аптечки.";ui.end.classList.remove("hidden")}
function loop(t){if(!running)return;const dt=Math.min((t-last)/1000||0,.033);last=t;update(dt);draw();requestAnimationFrame(loop)}
function draw(){ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-camera,0);background();ground();worldObjects();pickups.forEach(drawPickup);enemies.forEach(drawEnemy);bullets.forEach(b=>{ctx.fillStyle="#f5c68c";ctx.fillRect(b.x,b.y,13,3)});drawPlayer();particles.forEach(q=>{ctx.globalAlpha=Math.max(0,q.life*2);ctx.fillStyle="#b88c6b";ctx.fillRect(q.x,q.y,3,3)});ctx.globalAlpha=1;ctx.restore();drawVignette()}
function background(){
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,"#17232e");sky.addColorStop(.42,"#76574e");sky.addColorStop(.7,"#39383a");sky.addColorStop(1,"#171e23");ctx.fillStyle=sky;ctx.fillRect(camera,0,W,H);
 const sunX=camera+720;const glow=ctx.createRadialGradient(sunX,185,8,sunX,185,190);glow.addColorStop(0,"#d69a70aa");glow.addColorStop(1,"#d69a7000");ctx.fillStyle=glow;ctx.fillRect(sunX-200,0,400,390);
 ctx.fillStyle="#d59a72";ctx.globalAlpha=.52;ctx.beginPath();ctx.arc(sunX,185,43,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 for(let i=0;i<10;i++){const x=camera+i*330-((camera*.13)%330),base=world.ground-40,h=155+(i%4)*43,w=230+(i%3)*32;
  ctx.fillStyle=i%2?"#202b32":"#293139";ctx.beginPath();ctx.moveTo(x,base-h);ctx.lineTo(x+28,base-h-18);ctx.lineTo(x+70,base-h+3);ctx.lineTo(x+w,base-h+10);ctx.lineTo(x+w,base);ctx.lineTo(x,base);ctx.closePath();ctx.fill();
  ctx.fillStyle="#101a20";for(let j=0;j<4;j++){const wx=x+25+j*48,wy=base-h+42+(j%2)*36;ctx.fillRect(wx,wy,25,39);ctx.fillStyle="#4a403a";ctx.fillRect(wx+3,wy+3,19,2);ctx.fillStyle="#101a20";}
  ctx.strokeStyle="#485057";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+12,base-h+5);ctx.lineTo(x+47,base-h+48);ctx.lineTo(x+41,base-h+95);ctx.stroke();
 }
 ctx.fillStyle="#1a242a";ctx.fillRect(camera,363,W,77);
 for(let i=0;i<26;i++){const x=camera+i*48-((camera*.48)%48);ctx.fillStyle=i%2?"#31383a":"#252d30";ctx.fillRect(x,363,25,77);}
 for(let i=0;i<7;i++){const sx=camera+((i*181+performance.now()*.012)%(W+240))-100;ctx.fillStyle="#b8a18c";ctx.globalAlpha=.035;ctx.beginPath();ctx.ellipse(sx,300+(i%3)*26,90,12,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
}
function ground(){
 const g=ctx.createLinearGradient(0,world.ground,0,H);g.addColorStop(0,"#343432");g.addColorStop(1,"#151b1d");ctx.fillStyle=g;ctx.fillRect(camera,world.ground,world.width,H-world.ground);
 ctx.strokeStyle="#5a5148";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(camera,world.ground+1);ctx.lineTo(camera+W,world.ground+1);ctx.stroke();
 for(let i=0;i<100;i++){const x=camera+i*31-((camera*.8)%31),y=world.ground+12+(i%5)*18;ctx.strokeStyle=i%4?"#444440":"#6d5e50";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8+(i%7)*2,y-1);ctx.stroke();}
 ctx.fillStyle="#111719";for(let i=0;i<8;i++){const x=camera+i*137-((camera*.7)%137);ctx.beginPath();ctx.ellipse(x,world.ground+60+(i%3)*12,22,5,0,0,Math.PI*2);ctx.fill();}
}
function worldObjects(){// collapsed road, bridge and low underpass route
ctx.fillStyle="#42403c";ctx.fillRect(700,world.ground-95,180,95);ctx.fillStyle="#1b2529";ctx.fillRect(700,world.ground-95,180,8);ctx.fillStyle="#756452";ctx.fillRect(1260,world.ground-125,310,18);ctx.fillStyle="#242a2b";ctx.fillRect(1280,world.ground-107,28,107);ctx.fillRect(1530,world.ground-107,28,107);
ctx.fillStyle="#111c22";ctx.fillRect(1280,world.ground-27,250,27);ctx.fillStyle="#53616a";ctx.fillRect(1280,world.ground-9,250,2);
ctx.fillStyle="#5b4a3c";ctx.fillRect(1880,world.ground-48,90,48);ctx.fillStyle="#262e31";ctx.fillRect(1890,world.ground-58,75,12);ctx.fillStyle="#9c7558";ctx.fillRect(2460,world.ground-110,12,110);ctx.fillRect(2510,world.ground-110,12,110)}
function drawPlayer(){
 const p=player,t=performance.now()/1000,moving=Math.abs(p.vx)>.1,stride=moving?Math.sin(t*12)*8:Math.sin(t*2)*1.2,coat=Math.sin(t*8)*2;
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.face,1);
 ctx.fillStyle="#0b0e10";ctx.globalAlpha=.42;ctx.beginPath();ctx.ellipse(0,78,24,5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 // boots and articulated legs
 ctx.strokeStyle="#171a1b";ctx.lineWidth=8;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-6,53);ctx.lineTo(-8+stride,70);ctx.moveTo(6,53);ctx.lineTo(8-stride,70);ctx.stroke();
 ctx.fillStyle="#242321";ctx.beginPath();ctx.moveTo(-15+stride,68);ctx.lineTo(-1+stride,68);ctx.lineTo(2+stride,76);ctx.lineTo(-17+stride,76);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.moveTo(2-stride,68);ctx.lineTo(15-stride,68);ctx.lineTo(20-stride,76);ctx.lineTo(1-stride,76);ctx.closePath();ctx.fill();
 // long wool coat with flared hem
 const coatGrad=ctx.createLinearGradient(-18,20,19,76);coatGrad.addColorStop(0,"#3c3c38");coatGrad.addColorStop(.5,"#242a2a");coatGrad.addColorStop(1,"#171d20");ctx.fillStyle=coatGrad;
 ctx.beginPath();ctx.moveTo(-10,20);ctx.quadraticCurveTo(-17,34,-15,49);ctx.lineTo(-20+coat,77);ctx.quadraticCurveTo(-7,74,0,69);ctx.quadraticCurveTo(9,76,20+coat,77);ctx.lineTo(14,47);ctx.quadraticCurveTo(17,31,9,20);ctx.closePath();ctx.fill();
 ctx.strokeStyle="#62605a";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,23);ctx.lineTo(-2,68);ctx.moveTo(-11,42);ctx.lineTo(-14,64);ctx.stroke();
 ctx.fillStyle="#171d20";ctx.beginPath();ctx.moveTo(-8,20);ctx.lineTo(0,29);ctx.lineTo(8,20);ctx.lineTo(5,37);ctx.lineTo(0,42);ctx.lineTo(-5,37);ctx.closePath();ctx.fill();
 // collar, neck, head and hair
 ctx.fillStyle="#b18f77";ctx.fillRect(-4,15,8,8);ctx.fillStyle="#b99b83";ctx.beginPath();ctx.ellipse(0,9,7,9,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#272522";ctx.beginPath();ctx.moveTo(-8,7);ctx.quadraticCurveTo(-9,-3,1,-3);ctx.quadraticCurveTo(9,-2,8,5);ctx.lineTo(5,2);ctx.lineTo(-5,3);ctx.closePath();ctx.fill();
 ctx.fillStyle="#332c28";ctx.fillRect(3,9,3,2);
 // arm and suppressed pistol
 ctx.strokeStyle="#292b29";ctx.lineWidth=6;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(8,29);ctx.lineTo(15,38);ctx.lineTo(23,34);ctx.stroke();
 ctx.fillStyle="#b3957d";ctx.beginPath();ctx.arc(23,34,3,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#17191a";ctx.fillRect(21,30,17,4);ctx.fillRect(34,31,9,2);ctx.fillRect(23,34,4,7);
 ctx.restore();
}
function drawEnemy(e){
 if(e.hp<=0)return;const t=performance.now()/1000,step=Math.sin(t*7+e.x*.01)*3;
 ctx.save();ctx.translate(e.x,e.y);ctx.scale(e.dir,1);
 ctx.fillStyle="#0b0e10";ctx.globalAlpha=.4;ctx.beginPath();ctx.ellipse(0,68,20,4,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 ctx.strokeStyle="#15191a";ctx.lineWidth=7;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-6,43);ctx.lineTo(-7+step,65);ctx.moveTo(6,43);ctx.lineTo(7-step,65);ctx.stroke();
 ctx.fillStyle="#292c2b";ctx.beginPath();ctx.moveTo(-13,17);ctx.lineTo(12,17);ctx.lineTo(15,47);ctx.lineTo(-14,47);ctx.closePath();ctx.fill();
 ctx.strokeStyle="#3a3b37";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-10,23);ctx.lineTo(-17,39);ctx.moveTo(10,23);ctx.lineTo(17,36);ctx.stroke();
 ctx.fillStyle="#ad8e76";ctx.beginPath();ctx.ellipse(0,8,7,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#211f1d";ctx.beginPath();ctx.moveTo(-8,6);ctx.lineTo(-7,-2);ctx.lineTo(7,-2);ctx.lineTo(9,5);ctx.closePath();ctx.fill();
 ctx.fillStyle="#171a1b";ctx.fillRect(14,34,15,3);ctx.fillRect(27,35,5,2);
 ctx.restore();
}
function drawPickup(p){if(p.taken)return;ctx.fillStyle=p.type==="med"?"#a7a38b":"#a98b62";ctx.fillRect(p.x-10,p.y-13,20,13);ctx.fillStyle="#202629";ctx.fillRect(p.x-5,p.y-8,10,3);if(p.type==="med"){ctx.fillStyle="#ddd7c8";ctx.fillRect(p.x-2,p.y-11,4,9)}}
function drawVignette(){const g=ctx.createRadialGradient(W/2,H/2,100,W/2,H/2,560);g.addColorStop(.55,"#0000");g.addColorStop(1,"#05080dcc");ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
reset();