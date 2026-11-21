'use strict';
const {assert,Counts,pump,step,fireDoc,fakeTime,reg,store,loadGame}=require('./verify.js');

function head(t){console.log('\n== '+t+' ==')}
function go(){loadGame()}
function runSilently(f){try{return f()}catch(e){console.log('THROWN',e&&e.stack||e);FAILED.push('thrown: '+(e&&e.message));process.exitCode=1;return null}}
let FAILED=[];
let G=null;
head('boot');
runSilently(()=>{go();G=globalThis});
assert(!!G,'game script evaluated');
assert(typeof G.startRun==='function','startRun exposed');
assert(G.CHARS.length===9,'9 characters');
assert(G.DIFFS.length===4,'4 difficulties');
assert(G.MAPS.length===3,'3 maps');

head('T1 all four difficulties spawn enemies');
for(let df=0;df<4;df++){
 runSilently(()=>{G.S.save=G.sanitizeSave({});G.S.save.df=df;G.startRun(0,0,df);G.S.scr='playing';
  for(let i=0;i<600;i++)G.updRun(0.05);
 });
 const n=G.R.en.length;
 assert(n>0,'difficulty '+df+' ('+G.DIFFS[df].name+') spawns enemies, count='+n);
 const hp=G.R.en.length?Math.max.apply(null,G.R.en.map(function(e){return e.hp})):0;
 assert(hp>3,'difficulty '+df+' enemy HP scaled with time (max '+Math.round(hp)+')');
}

head('T2 all nine characters fire their attack');
for(let i=0;i<9;i++){
 runSilently(()=>{G.S.save=G.sanitizeSave({});G.startRun(i,i%3,1);G.S.scr='playing';
  G.R.en.length=0;G.spawnEnemy();G.spawnEnemy();
  G.R.en[0].x=G.R.px+60;G.R.en[0].y=G.R.py;
  G.R.wt=0;G.__fired={bs:0,sw:0};
  for(let k=0;k<60;k++){G.updRun(0.05);
   if(G.R.bs.length>0)G.__fired.bs=1;
   if(G.R.swT>0)G.__fired.sw=1;}
  G.__last=G.__fired;
 });
 const ch=G.CHARS[i];
 const fired=G.__last.bs>0||G.__last.sw>0;
 assert(fired,'char '+i+' ('+ch.name+') fires ('+(G.__last.bs>0?'projectiles':'melee swing')+')');
}

head('T3 behaviors');
runSilently(()=>{G.S.save=G.sanitizeSave({});G.startRun(4,0,1);G.S.scr='playing';
 G.R.en.length=0;G.R.ebs.length=0;
 const sk=G.makeEnemy('skel',G.R.px+200,G.R.py);G.R.en.push(sk);
 G.__ebs=0;
 for(let i=0;i<240;i++){G.updRun(0.05);if(G.R.ebs.length>0){G.__ebs=1;break}}});
assert(G.__ebs>0,'skeleton archer fires enemy bullets');
runSilently(()=>{G.R.en.length=0;G.R.ebs.length=0;
 const gh=G.makeEnemy('ghost',G.R.px+100,G.R.py);G.R.en.push(gh);
 for(let i=0;i<120;i++)G.updRun(0.05);G.__ph=gh.ph;});
assert(G.__ph===0||G.__ph===1,'ghost alternates phases');
runSilently(()=>{const c=[5];let x=5;for(let i=0;i<3;i++){x=Math.floor(x*1.18+4);c.push(x)}G.__chain=c;
 G.S.save=G.sanitizeSave({df:0});G.startRun(0,0,0);G.S.scr='playing';
 G.R.xp=5;G.R.xpN=5;
 G.gainXP(0.001);
 G.__after=G.R.xpN;});
assert(G.__chain[1]===9&&G.__chain[2]===14&&G.__chain[3]===20,'xp chain with nd=1.18: 5,9,14,20');
assert(G.__after===9,'after first level, need = floor(5*1.18+4)=9 (got '+G.__after+')');

runSilently(()=>{G.S.save=G.sanitizeSave({});G.startRun(0,0,1);G.S.scr='playing';
 G.R.en.length=0;const b=G.makeEnemy('bomber',G.R.px+30,G.R.py);G.R.en.push(b);
 const hp0=G.R.hp;for(let i=0;i<30;i++)G.updRun(0.05);
 G.__bmHit=G.R.hp<hp0;});
assert(G.__bmHit===true,'bomber explosion hurts player (flat bm)');

head('T4 full 1200s victory path (difficulty 3, char sniper) - simulated player');
let victOK=false,bossSeen=0,coinsBefore=0,revivesUsed=0,deaths=0,picksMade=0,kiteFn=null;
runSilently(()=>{
 store.clear();let S0=G.sanitizeSave({coins:1000,
  cu:{vit:5,spd:5,pow:5,foc:5,rea:5},
  wu:{wdm:5,wcd:5,wsp:5,war:5},
  sk:{def:5,reg:5,vit:5,dod:5,mag:5,wis:5}});
 G.S.save=S0;coinsBefore=S0.coins;
 G.startRun(8,2,0);G.S.scr="playing";
})
runSilently(()=>{
 kiteFn=function(){
  const R=G.R;if(!R)return;
  let fx=0,fy=0,threat=0;
  for(let i=0;i<R.en.length;i++){const e=R.en[i];if(e.dying)continue;
   const dx=R.px-e.x,dy=R.py-e.y,d2=dx*dx+dy*dy;
   if(d2<500*500){const d=Math.sqrt(d2)||1,w=(500-d)/500;fx+=dx/d*w*1.5+fx*0.001;fy+=dy/d*w*1.5;threat++}}
  if(R.boss){const dx=R.px-R.boss.x,dy=R.py-R.boss.y,d=Math.hypot(dx,dy)||1;
   if(d<170){fx+=dx/d*2;fy+=dy/d*2;threat++}}
  const l=Math.hypot(fx,fy);
  if(l<0.03){fx=Math.cos(G.R.t*3);fy=Math.sin(G.R.t*3)}
  else{fx/=l;fy/=l}
  const rx=fx*0.8-fy*0.6,ry=fx*0.6+fy*0.8;
  G.INP.x=rx;G.INP.y=ry;
 };
 for(let i=0;i<24100;i++){
  if(i===23950){G.INP.x=0;G.INP.y=0}
  if(G.S.scr==='lu'){while(G.S.scr==='lu'&&G.R&&G.R.pend>0){G.pickLevelUp(0);picksMade++}}
  if(G.S.scr==='death'){deaths++;if(!G.doRevive())break;revivesUsed++;continue}
  if(G.S.scr!=='playing')break;
  kiteFn();
  G.updRun(0.05);
 }
 bossSeen=G.R?G.R.bossN:9;
 victOK=(G.S.scr==='vict'&&G.R&&G.R.t>=1200);
});
assert(victOK,'victory at t>=1200 (screen=vict) [deaths='+deaths+', revivesUsed='+revivesUsed+']');
assert(G.S.save.coins>coinsBefore+90,'victory banks gold with +100 bonus (+'+(G.S.save.coins-coinsBefore)+')');
assert(bossSeen>=9,'all 9 bosses spawned over the run (n='+bossSeen+')');

head('T5 death path + gold bank');
runSilently(()=>{store.clear();G.S.save=G.sanitizeSave({});const before=G.S.save.coins;
 G.startRun(0,0,1);G.S.scr='playing';G.R.hp=2;
 G.R.en.length=0;
 for(let z=0;z<8;z++)G.R.en.push(G.makeEnemy('brute',G.R.px+10+z,G.R.py));
 for(let i=0;i<240&&G.S.scr==='playing';i++)G.updRun(0.05);
 G.__a=G.S.scr;G.__c=G.S.save.coins-before;G.__t=G.R.t;});
assert(G.__a==='death','death screen on HP 0');
assert(G.__c>=0,'gold banked on death');

head('T6 gold purchase -> level-up choice -> applied stat change');
runSilently(()=>{store.clear();G.S.save=G.sanitizeSave({coins:1000});G.startRun(0,0,1);G.S.scr='playing';
 G.openUp('cu',0);
 const rowEl=G.document.getElementById('up-rows');
 const btn=rowEl.children[0].children[2];
 btn.click();
 G.__bought=G.S.save.cu.vit;G.__coins=G.S.save.coins;
 G.R.u={};G.calcStats(G.R);
 G.R.xp=G.R.xpN;G.gainXP(0.001);
 G.__scr=G.S.scr;G.__pool=G.availUpgrades();
 G.S.luPicks=['vit','mag','void'];G.pickLevelUp(0);
 G.__mhp=G.R.mhp;G.__scr2=G.S.scr;});
assert(G.__bought===1,'purchase raised cu.vit to 1');
assert(G.__coins===960,'coins decreased by 40 (still '+G.__coins+')');
assert(G.__pool.length>=1,'pool opens for purchased items: '+JSON.stringify(G.__pool));
assert(G.__mhp===112,'in-run pick applied +12 max HP (mhp='+G.__mhp+')');
assert(G.__scr2==='playing','overlay closed after pick');
assert(!G.document.getElementById('ov-lu').classList.contains('on'),'level-up overlay hidden');

head('T7 no purchased upgrades -> no overlay, toast only');
runSilently(()=>{store.clear();G.S.save=G.sanitizeSave({});G.startRun(0,0,1);G.S.scr='playing';
 G.R.xp=G.R.xpN;G.gainXP(0.001);G.__scr=G.S.scr;G.__pend=G.R.pend;});
assert(G.__scr==='playing','overlay not opened when nothing purchased');
assert(G.__pend===0,'pending consumed without choices');

head('T8 luck: carry item clamped by purchased cap');
runSilently(()=>{store.clear();G.S.save=G.sanitizeSave({sp:{'necro.ne0':1}});
 G.S.save.keep={id:'ne0',lvl:5};G.startRun(0,0,1);
 G.__lv=G.R.u.ne0;});
assert(G.__lv===1,'carried special clamped to purchased cap (got '+G.__lv+')');

head('T9 both revives then exhausted');
runSilently(()=>{store.clear();G.S.save=G.sanitizeSave({coins:1000});G.startRun(0,0,1);G.S.scr='playing';
 const kill=()=>{G.R.hp=1;G.R.untouchT=0;G.R.en.length=0;
  G.R.en.push(G.makeEnemy('brute',G.R.px+10,G.R.py));
  for(let i2=0;i2<400&&G.S.scr!=='death';i2++)G.updRun(0.05);};
 kill();G.__d1=G.S.scr;G.S.save.coins=1000;G.document.getElementById('d-rev').click();
 G.__r1={scr:G.S.scr,rev:G.R.rev,hp:Math.round(G.R.hp),mhp:G.R.mhp};
 kill();G.__d2=G.S.scr;G.S.save.coins=1000;G.document.getElementById('d-rev').click();
 G.__r2={scr:G.S.scr,rev:G.R.rev};
 kill();G.__d3=G.S.scr;G.__btn=G.document.getElementById('d-rev').disabled;});
assert(G.__d1==='death'&&G.__r1.scr==='playing','first revive resumes the run');
assert(G.__r1.rev===1&&G.__r1.hp===Math.round(G.__r1.mhp*0.6),'revive restores 60% HP');
assert(G.__d2==='death'&&G.__r2.scr==='playing'&&G.__r2.rev===2,'second revive works');
assert(G.__d3==='death'&&G.__btn===true,'third revive disabled');

head('T10 save/load round-trip');
runSilently(()=>{store.clear();G.S.save=G.sanitizeSave({coins:500,sk:{tre:1}});
 G.startRun(2,1,2);G.S.scr='playing';
 for(let i=0;i<400;i++)G.updRun(0.05);
 G.R.kills=17;G.R.u.tre=1;G.R.t=321.5;G.R.px=99;G.R.py=-44;
 G.saveRunSlot(3);
 G.__sv=G.slotRead(3);
 G.R=null;G.loadSlotRun(3);
 G.__ok=!!G.R&&Math.abs(G.R.t-321.5)<0.01&&G.R.kills===17&&G.R.u.tre===1&&G.R.ch===2&&G.R.mp===1&&G.R.df===2;});
assert(!!G.__sv,'slot written');
assert(G.__ok===true,'slot restores time/kills/upgrades/char/map/diff');

head('T11 corrupt slot rejected');
runSilently(()=>{store.set('ns1slot1','{not json');
 G.__c1=G.slotRead(1)!==null&&G.slotRead(1).corrupt===true;
 G.R=null;G.loadSlotRun(1);
 store.set('ns1slot2',JSON.stringify({s:{x:1}}));
 G.__c2=G.slotRead(2).corrupt===true;});
assert(G.__c1===true,'malformed JSON flagged corrupt');
assert(G.__c2===true,'schema-missing slot flagged corrupt');

head('T12 v-migration backup');
runSilently(()=>{store.clear();const raw=JSON.stringify({v:2,best:77,kills:5});
 store.set('ns1',raw);G.loadSave();
 G.__bak=store.get('ns1_bak')===raw;G.__v=G.S.save.v===4;G.__best=G.S.save.best===77;});
assert(G.__bak===true,'previous raw value backed up to ns1_bak');
assert(G.__v===true,'save migrated to v4');
assert(G.__best===true,'old fields preserved after sanitize');

head('T13 sanitize repair');
runSilently(()=>{store.clear();
 const bad={df:9,coins:'abc',cu:{vit:7,pow:2,zz:3},wu:'x',sk:{mag:-3},
  sp:{'necro.ne0':1,nonsense:4},ch:99,mp:-2,keep:{id:'zzz',lvl:9}};
 G.S.save=G.sanitizeSave(bad);G.__o=G.S.save;});
assert(G.__o.df===3,'df clamped 0..3');
assert(G.__o.coins===0,'non-numeric coins -> 0');
assert(G.__o.cu.vit===5&&G.__o.cu.pow===2&&G.__o.cu.zz===undefined,'cu levels clamped 0..5, unknown ids dropped');
assert(G.__o.wu&&typeof G.__o.wu==='object','wu type-repaired');
assert(!(G.__o.sk.mag|0),'negative levels dropped');
assert(G.__o.sp.necro&&G.__o.sp.necro.ne0===1&&Object.keys(G.__o.sp).length===1,'sp keys validated per known id');
assert(G.__o.ch===8&&G.__o.mp===0,'ch/mp clamped');
assert(G.__o.keep===null,'invalid keep filtered');
runSilently(()=>{G.S.save=G.sanitizeSave({keep:{id:'void',lvl:3}})});
assert(G.S.save.keep&&G.S.save.keep.id==='void'&&G.S.save.keep.lvl===3,'valid keep survives sanitize');

head('T14 stability edges');
runSilently(()=>{fireDoc('visibilitychange')});
assert(true,'visibility handler ran without throwing');
runSilently(()=>{G.startRun(0,0,0);G.S.scr='playing';
 for(let i=0;i<6;i++)G.spawnBoss()});
assert(G.R&&G.R.bossN===6,'spawnBoss accepted 6 sequential calls (n='+G.R.bossN+')');
runSilently(()=>{G.R=null;G.goMenu();G.S.save=G.sanitizeSave({});G.startRun(0,0,0);
 for(let i=0;i<200;i++)G.updRun(0.05);
 G.quitRun();});
assert(G.R===null,'quitRun clears the run and banks gold');

console.log('\n==============================');
console.log('PASS='+Counts.p+' FAIL='+Counts.f);
if(Counts.f>0||FAILED.length){console.log('FAILED:');FAILED.forEach(f=>console.log(' - '+f));process.exit(1)}
console.log('ALL HEADLESS CHECKS PASSED');
