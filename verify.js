'use strict';
/* Headless verification harness for Night Survivor.
   Runs game.js with a fake DOM/canvas/localStorage/AudioContext. No browser. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const Counts={p:0,f:0,failed:[]};
function assert(c,msg){if(c){Counts.p++;console.log('  PASS '+msg)}else{Counts.f++;Counts.failed.push(msg);console.log('  FAIL '+msg)}}
let rafQ=[];
function FakeParam(){return {value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}}
function FakeNode(){const o={connect(){return arguments[0]},disconnect(){}};o.gain=FakeParam();o.frequency=FakeParam();o.Q=FakeParam();o.delayTime=FakeParam();o.playbackRate=FakeParam();o.detune=FakeParam();return o}
class FakeAudioCtx{
 constructor(){this.sampleRate=44100;this.currentTime=0;this.state='running';this.destination={};this._nodes=0}
 resume(){return Promise.resolve()}
 createGain(){return FakeNode()}
 createOscillator(){const n=FakeNode();n.start=()=>{};n.stop=()=>{};return n}
 createDelay(){return FakeNode()}
 createBiquadFilter(){return FakeNode()}
 createBufferSource(){const n=FakeNode();n.buffer=null;n.start=()=>{};n.stop=()=>{};return n}
 createBuffer(ch,len,sr){return {getChannelData(){return new Float32Array(len||64)}}}
}
function FakeCtx(canvas){
 const stored={};
 return new Proxy({},{get(t,p){
  if(p==='canvas')return canvas;
  if(p in stored)return stored[p];
  if(p==='createRadialGradient'||p==='createLinearGradient')return ()=>({addColorStop(){}});
  if(p==='createPattern')return ()=>({});
  if(p==='measureText')return ()=>({width:10});
  if(p==='getImageData')return ()=>({data:new Uint8ClampedArray(4)});
  if(p==='save'||p==='restore'||p==='translate'||p==='rotate'||p==='scale'||p==='setTransform')return ()=>{};
  if(p==='beginPath'||p==='moveTo'||p==='lineTo'||p==='quadraticCurveTo'||p==='arc'||p==='ellipse'||p==='fill'||p==='stroke'||p==='fillRect'||p==='strokeRect'||p==='clearRect'||p==='drawImage'||p==='fillText'||p==='clip'||p==='roundRect'||p==='arcTo')return ()=>{};
  return stored[p];},set(t,p,v){stored[p]=v;return true}});
}
class FakeEl{
 constructor(tag){this.tagName=(tag||'div').toUpperCase();this.children=[];this.style={};this.dataset={};
  this._cls=new Set();this.textContent='';this.disabled=false;this._h={};this.width=300;this.height=150;
  this.onclick=null;this.value='';this.parentNode=null;this.id='';}
 get className(){return [...this._cls].join(' ')}
 set className(v){this._cls=new Set(String(v).split(/\s+/).filter(Boolean))}
 get classList(){const s=this._cls;const self=this;return {
  add(...c){c.forEach(x=>s.add(x))},remove(...c){c.forEach(x=>s.delete(x))},
  toggle(c,f){const on=(f===undefined)?!s.has(c):!!f;if(on)s.add(c);else s.delete(c);return on},
  contains(c){return s.has(c)}}}
 get offsetWidth(){return W_W}get offsetHeight(){return W_H}
 get fullscreenElement(){return null}
 appendChild(c){this.children.push(c);c.parentNode=this;return c}
 removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentNode=null;return c}
 get lastChild(){return this.children[this.children.length-1]||null}
 get firstChild(){return this.children[0]||null}
 remove(){}
 setAttribute(k,v){this['a_'+k]=String(v)}getAttribute(k){return this['a_'+k]||null}
 hasAttribute(){return false}
 addEventListener(t,f){(this._h[t]=this._h[t]||[]).push(f)}
 removeEventListener(){}
 dispatch(t,ev){(this._h[t]||[]).forEach(f=>f(ev||{}));if(t==='click'&&this.onclick)this.onclick(ev||{})}
 click(){this.dispatch('click',{})}
 focus(){}blur(){}
 getContext(){return FakeCtx(this)}
 getBoundingClientRect(){return {left:0,top:0,width:W_W,height:W_H,right:W_W,bottom:W_H}}
 contains(){return false}
 requestFullscreen(){window.__fs=true}
 exitFullscreen(){window.__fs=false}
}
const W_W=414,W_H=800;
const reg={};
const store=new Map();
const ls={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()};
const listeners={};
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'headless'},configurable:true});
Object.assign(globalThis,{
 window:globalThis,
 document:{
  hidden:false,visibilityState:'visible',__fs:false,
  getElementById(id){if(!reg[id]){const e=new FakeEl('div');e.id=id;reg[id]=e}return reg[id]},
  createElement(t){const e=new FakeEl(t);if(t==='canvas'){e.width=300;e.height=150}return e},
  createTextNode(t){const e=new FakeEl('#text');e.textContent=String(t);return e},
  addEventListener(t,f){(listeners['doc_'+t]=listeners['doc_'+t]||[]).push(f)},
  removeEventListener(){},
  body:new FakeEl('body'),
  documentElement:new FakeEl('html'),
 },
 localStorage:ls,
 performance:{now:()=>fakeTime.now},
 requestAnimationFrame(cb){rafQ.push(cb);return rafQ.length},
 cancelAnimationFrame(){},
 setInterval(cb){return {__i:1}},clearInterval(){},
 setTimeout(cb){fakeTime._to=(fakeTime._to||[]);fakeTime._to.push(cb);return 1},clearTimeout(){},
 innerWidth:W_W,innerHeight:W_H,devicePixelRatio:1,
 AudioContext:FakeAudioCtx,webkitAudioContext:FakeAudioCtx,
 addEventListener(t,f){(listeners['win_'+t]=listeners['win_'+t]||[]).push(f)},
 removeEventListener(){},
 close(){window.__closed=true},
 location:{href:'file:///test'},history:{},
 alert(){},confirm(){return true},
});
function pump(frames,perFrameMs){
 for(let i=0;i<frames;i++){
  fakeTime.now+=perFrameMs||16.7;
  const q=rafQ;rafQ=[];
  q.forEach(cb=>cb(fakeTime.now));
 }
}
const fakeTime={now:0};
function fireDoc(t){(listeners['doc_'+t]||[]).forEach(f=>f({}))}
function step(dt){
 fakeTime.now+=dt*1000;
 const q=rafQ;rafQ=[];q.forEach(cb=>cb(fakeTime.now));
}
function clearLS(){store.clear()}
module.exports={assert,Counts,pump,step,fireDoc,fakeTime,reg,store,ls,rafQ,
 loadGame(){vm.runInThisContext(fs.readFileSync(path.join(__dirname,'game.js'),'utf8'),{filename:'game.js'})}};
