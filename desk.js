"use strict";

const byId=id=>document.getElementById(id);
const state={data:null, follow:true, stamp:null, timer:null, busy:false, initialized:false};
const local=location.protocol==="http:"&&location.hostname==="127.0.0.1";
const fmt=(value,digits=3)=>value==null||!Number.isFinite(Number(value))?"—":Number(value).toFixed(digits);
const palette=()=>{
  const style=getComputedStyle(document.documentElement);
  return Object.fromEntries(["line","muted","copper","jade","text","faint","violet"].map(name=>[name,style.getPropertyValue("--"+name).trim()]));
};
const tau=Math.PI*2;
const meshCache=new Map();
const colors={bids:"jade",asks:"copper"};
const form=byId("desk-config");

function surface(shape,u,v){
  if(shape==="sphere"){
    const angle=Math.PI*v/2;
    return [Math.cos(u)*Math.cos(angle),Math.sin(angle),Math.sin(u)*Math.cos(angle)];
  }
  if(shape==="cylinder") return [.83*Math.cos(u),.74*v,.83*Math.sin(u)];
  const radius=.72+.31*Math.cos(Math.PI*v);
  return [radius*Math.cos(u),.31*Math.sin(Math.PI*v),radius*Math.sin(u)];
}

function grid(shape){
  if(!meshCache.has(shape)){
    const arc=(f,n=45)=>Array.from({length:n+1},(_,i)=>f(i/n));
    const lines=Array.from({length:13},(_,i)=>({coords:arc(a=>surface(shape,a*tau,-1+2*i/12)),color:"line",alpha:.33}));
    for(let i=0;i<20;i++) lines.push({coords:arc(a=>surface(shape,i*tau/20,-1+2*a)),color:"line",alpha:.27});
    meshCache.set(shape,lines);
  }
  return meshCache.get(shape);
}

function scene(){
  const shape=byId("desk-surface").value;
  const frame=selectedFrame();
  const lines=grid(shape), data=Object.entries(frame?.depth||{});
  const points=[];
  for(const [i,[name,sides]] of data.entries()){
    const center=(i+.5)*tau/data.length;
    points.push({point:surface(shape,center-.30,.55),color:"text",label:name.replace("_","/"),radius:2.4});
    for(const [side,levels] of Object.entries(sides)){
      for(const [rank,[bps,notional]] of levels.entries()){
        const v=Math.sign(bps)*Math.tanh(Math.abs(bps)/12)*.9;
        const xy=surface(shape,center+(rank-4.5)*.072,v);
        const radius=2+Math.min(7,Math.log1p(notional)/2.6);
        points.push({point:xy,radius:radius*2.25,color:colors[side],alpha:.09});
        points.push({point:xy,radius:radius*1.45,color:colors[side],alpha:.18});
        points.push({point:xy,radius,color:colors[side],alpha:.75});
      }
    }
  }
  return {axes:[],grid:false,points,lines,minExtent:1.14,framingScale:.42};
}

function selectedFrame(){
  const frames=state.data?.frames||[];
  if(state.follow) return frames.at(-1);
  return frames.find(frame=>frame.utc===state.stamp) || frames[0];
}

const draw=Reasoning3D.bind(byId("desk-density"),byId("desk-camera"),()=>draw(scene(),palette()),()=>{});

function tabulate(id,rows){
  const table=byId(id);
  const fragment=document.createDocumentFragment();
  for(const cols of rows){
    const row=document.createElement("tr");
    for(const [i,value] of cols.entries()){
      const cell=document.createElement(i?"td":"th");
      if(!i) cell.scope="row";
      cell.textContent=value;
      row.append(cell);
    }
    fragment.append(row);
  }
  table.replaceChildren(fragment);
}

function plot(){
  const canvas=byId("desk-series");
  const {width,height}=canvas.getBoundingClientRect();
  if(width<20||height<20) return;
  const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=width*dpr; canvas.height=height*dpr;
  const ctx=canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  const frames=state.data?.frames||[], ink=palette();
  const keys=Object.keys(frames.at(-1)?.margins_bps||{});
  const values=frames.flatMap(frame=>Object.values(frame.margins_bps)).filter(Number.isFinite);
  if(!values.length){
    ctx.fillStyle=ink.muted; ctx.font="12px monospace";ctx.fillText("No eligible route margin yet.",12,height*.53);return;
  }
  const left=51,right=width-12,top=15,bottom=height-16;
  const min=Math.min(0,...values),max=Math.max(0,...values);
  const at=(n)=>bottom-(bottom-top)*(n-min)/(max-min||1);
  const x=(i)=>left+(right-left)*i/Math.max(1,frames.length-1);
  ctx.font="10px monospace";
  for(const v of new Set([min,(min+max)/2,max])){
    ctx.strokeStyle=ink.faint;ctx.fillStyle=ink.muted;ctx.fillText(v.toFixed(2),3,at(v)+3);
    ctx.beginPath();ctx.moveTo(left,at(v));ctx.lineTo(right,at(v));ctx.stroke();
  }
  for(const [i,key] of keys.entries()){
    ctx.strokeStyle=ctx.fillStyle=i?ink.jade:ink.copper;
    ctx.lineWidth=1.8;
    let open=false;
    ctx.beginPath();
    for(const [j,frame] of frames.entries()){
      const value=frame.margins_bps[key];
      if(!Number.isFinite(value)){open=false;continue;}
      if(open) ctx.lineTo(x(j),at(value)); else ctx.moveTo(x(j),at(value));
      open=true;
    }
    ctx.stroke();
  }
  const active=frames.indexOf(selectedFrame());
  ctx.strokeStyle=ink.violet;ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x(active),top);ctx.lineTo(x(active),bottom);ctx.stroke();
}

function paintScene(){
  const current=selectedFrame(), frames=state.data?.frames||[];
  byId("desk-time").max=Math.max(0,frames.length-1);
  byId("desk-time").value=Math.max(0,frames.indexOf(current));
  byId("desk-frame-utc").textContent=current?.utc||"—";
  byId("depth-note").textContent=current?Object.keys(current.depth).join(" · ")+" · capture skew "+current.skew_ms+" ms":"The live feed populates the timeline.";
  byId("desk-time").disabled=frames.length<2;
  byId("desk-follow").disabled=frames.length<1;
  byId("desk-play").disabled=frames.length<2;
  draw(scene(),palette());
  plot();
}

function metricNodes(data){
  const counters=data.counts;
  const metrics=[["Paper P&L",fmt(data.pnl_usdt)+" USDT"],["Max drawdown",fmt(data.max_drawdown_usdt)+" USDT"],
    ["Captured snapshots",counters.snapshots||0],["Paper-eligible snapshots",(counters.snapshots||0)-(counters.rejected_snapshots||0)],["Withheld snapshots",counters.rejected_snapshots||0],["Paper cycles closed",counters.cycle_closed||0],
    ["Abstentions",counters.abstained||0],["Stale leg arrivals",counters.stale_arrivals||0],["Feed errors",counters.feed_errors||0]];
  return metrics.map(([name,value])=>{
    const div=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=name;dd.textContent=value;div.append(dt,dd);return div;
  });
}

function display(data){
  state.data=data;
  if(!state.initialized){
    for(const [key,value] of Object.entries(data.config)) form.elements.namedItem(key).value=value;
    state.initialized=true;
  }
  byId("desk-state").textContent=(data.armed?"Paper cycles armed":"Paper cycles paused")+" · "+data.feed;
  const active=data.active;
  byId("desk-active").textContent=active?
    active.route+" · "+active.legs+"/3 legs · "+fmt(active.amount,8)+" "+active.asset:
    data.ended?"Stranded: "+fmt(data.ended.amount,8)+" "+data.ended.stranded_asset+" · "+data.ended.reason:"No paper cycle open.";
  for(const button of document.querySelectorAll("[data-action]")){
    const action=button.dataset.action;
    button.disabled=state.busy || ({connect:data.connected,disconnect:!data.connected||!!active,
      start:!data.connected||data.armed||!!data.ended,pause:!data.armed,"mark-stranded":!active})[action];
  }
  form.querySelector("button").disabled=state.busy||data.armed||!!active;
  byId("desk-metrics").replaceChildren(...metricNodes(data));
  tabulate("desk-candidates",Object.entries(data.candidate_bps).map(([route,value])=>[route,fmt(value)]));
  tabulate("desk-books",Object.entries(data.books).map(([pair,book])=>[pair,fmt(book.bid,8),fmt(book.ask,8),book.age_ms,book.rtt_ms,book.rejection?.replaceAll("_"," ")||"—"]));
  tabulate("desk-events",data.events.slice(0,80).map(({utc,type,...details})=>[utc,type.replaceAll("_"," "),JSON.stringify(details)]));
  paintScene();
}

async function request(route,options={}){
  const response=await fetch("/api/"+route,options);
  if(!response.headers.get("content-type")?.includes("application/json")) throw new Error("Start the local dashboard server to use the trading desk.");
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||"Local request failed.");
  return data;
}

async function poll(){
  if(state.busy) return;
  try {display(await request("desk"));} catch {byId("desk-state").textContent="Local server unavailable"; byId("desk-setup").hidden=false;}
}

async function command(action,settings={}){
  if(state.busy) return;
  state.busy=true;
  try {
    const data=await request("desk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,settings})});
    state.busy=false;display(data);
    byId("desk-operation").textContent=action==="configure"?"Settings applied.":"";
  } catch(error){byId("desk-operation").textContent=error.message;}
  finally{state.busy=false;}
}

async function connectors(){
  const panel=byId("desk-connectors");
  try {
    const results=await request("connectors");
    if(!results.length){panel.textContent="No external dashboards configured.";return;}
    panel.replaceChildren(...results.map(source=>{
      const row=document.createElement("section");
      const heading=document.createElement("h3");
      heading.textContent=source.source==="freqtrade"?"Freqtrade / FreqUI":"Hummingbot";
      const summary=document.createElement("p");
      summary.textContent=source.state;
      const details=document.createElement("p");
      details.textContent=Object.entries(source.metrics||{}).map(([k,v])=>k.replaceAll("_"," ")+" "+v).join(" · ");
      row.append(heading,summary,details);
      if(source.ui_url){
        const anchor=document.createElement("a");
        anchor.href=source.ui_url;anchor.target="_blank";anchor.rel="noopener noreferrer";anchor.textContent="Open local UI";
        row.append(anchor);
      }
      return row;
    }));
  }catch{panel.textContent="The connector status could not load.";}
}

function playback(){
  if(state.timer){
    clearInterval(state.timer);state.timer=null;byId("desk-play").textContent="Play frames";return;
  }
  const frame=selectedFrame();
  state.follow=false;
  const initial=state.data.frames.indexOf(frame);
  if(initial===state.data.frames.length-1) state.stamp=state.data.frames[0].utc;
  byId("desk-play").textContent="Pause frames";
  paintScene();
  state.timer=setInterval(()=>{
    const frames=state.data.frames;
    const i=frames.indexOf(selectedFrame())+1;
    if(i>=frames.length){playback();return;}
    state.stamp=frames[i].utc;paintScene();
  },420);
}

function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
  paintScene();
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{theme("dark");}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
window.addEventListener("resize",paintScene);
byId("desk-surface").addEventListener("change",paintScene);
byId("desk-time").addEventListener("input",event=>{
  if(state.timer) playback();
  state.follow=false;state.stamp=state.data.frames[Number(event.target.value)].utc;paintScene();
});
byId("desk-follow").addEventListener("click",()=>{if(state.timer)playback();state.follow=true;paintScene();});
byId("desk-play").addEventListener("click",playback);
document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>command(b.dataset.action)));
form.addEventListener("submit",event=>{
  event.preventDefault();
  command("configure",Object.fromEntries(new FormData(form)));
});
byId("desk-refresh-connectors").addEventListener("click",connectors);
byId("desk-export").addEventListener("click",()=>{
  if(!state.data) return;
  const link=document.createElement("a");
  const url=URL.createObjectURL(new Blob([JSON.stringify(state.data,null,2)+"\n"],{type:"application/json"}));
  link.href=url;link.download="phaseweave-paper-session.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function browserDepth(asset,signal){
  const pairs=["BTC_USDT",asset+"_BTC",asset+"_USDT"];
  const requests=pairs.map(async pair=>{
    const query=new URLSearchParams({currency_pair:pair,limit:"10",with_id:"true"});
    const response=await fetch("https://api.gateio.ws/api/v4/spot/order_book?"+query,{signal,credentials:"omit"});
    if(!response.ok) throw new Error("Public depth unavailable");
    const data=await response.json();
    return {pair,received:Date.now(),...data};
  });
  const books=await Promise.all(requests);
  const depth={};
  const midpoint=book=>(Number(book.bids[0][0])+Number(book.asks[0][0]))/2;
  const btc=midpoint(books[0]);
  for(const book of books){
    const mid=midpoint(book), unit=book.pair.endsWith("_BTC")?btc:1;
    if(!Number.isFinite(mid)||mid<=0) throw new Error("Missing midpoint");
    depth[book.pair]={};
    for(const side of ["bids","asks"]){
      const levels=book[side].map(([price,size])=>[10000*Math.log(Number(price)/mid),Number(price)*Number(size)*unit]);
      if(!levels.length||levels.some(([distance,notional])=>!Number.isFinite(distance)||!Number.isFinite(notional)||notional<=0))
        throw new Error("Invalid public depth");
      depth[book.pair][side]=levels;
    }
  }
  const receipts=books.map(book=>book.received);
  return {utc:new Date(Math.max(...receipts)).toISOString(),depth,skew_ms:Math.max(...receipts)-Math.min(...receipts),margins_bps:{}};
}

async function browserPoll(epoch){
  const button=byId("desk-public-live");
  if(Number(button.dataset.epoch)!==epoch||button.getAttribute("aria-pressed")!=="true") return;
  try{
    const frame=await browserDepth(byId("desk-public-asset").value,AbortSignal.timeout(4800));
    if(Number(button.dataset.epoch)!==epoch||button.getAttribute("aria-pressed")!=="true") return;
    state.data.frames.push(frame);
    state.data.frames.splice(0,Math.max(0,state.data.frames.length-180));
    byId("desk-state").textContent="Read-only · Public Gate spot depth";
    paintScene();
  }catch{
    if(Number(button.dataset.epoch)===epoch) byId("desk-state").textContent="Public depth unavailable in this browser";
  }
  if(Number(button.dataset.epoch)===epoch) setTimeout(()=>browserPoll(epoch),3000);
}

if(local){poll();connectors();setInterval(poll,1800);}
else{
  byId("desk-setup").hidden=false;
  byId("desk-state").textContent="Local server required for live execution monitoring";
  document.querySelectorAll("[data-local]").forEach(item=>item.disabled=true);
  byId("desk-public").hidden=false;
  for(const id of ["desk-paper-settings","desk-paper-monitor","desk-external-tools"]) byId(id).hidden=true;
  document.querySelector(".desk-grid").classList.add("read-only");
  state.data={frames:[]};
  const live=byId("desk-public-live");
  live.dataset.epoch="0";
  const switchFeed=(running)=>{
    const epoch=Number(live.dataset.epoch)+1;
    live.dataset.epoch=String(epoch);
    live.setAttribute("aria-pressed",String(running));
    live.textContent=running?"Disconnect public depth":"Connect public depth";
    if(running){
      byId("desk-state").textContent="Connecting to public depth";
      browserPoll(epoch);
    }else byId("desk-state").textContent="Public depth paused";
  };
  live.addEventListener("click",()=>switchFeed(live.getAttribute("aria-pressed")!=="true"));
  byId("desk-public-asset").addEventListener("change",()=>{
    if(state.timer)playback();
    state.follow=true;state.data.frames.length=0;paintScene();
    if(live.getAttribute("aria-pressed")==="true")switchFeed(true);
  });
}
