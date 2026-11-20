"use strict";

const item=id=>document.getElementById(id);
const trigger=item("widget-connect");
const options=new URLSearchParams(location.search);
const one=options.get("widget");
const gate="https://api.gateio.ws/api/v4";
const format=new Intl.NumberFormat("en",{maximumFractionDigits:8});
const fmt=value=>value==null||!Number.isFinite(Number(value))?"—":format.format(Number(value));
let generation=0, connected=false;
const timers=new Map();

async function obtain(url){
  const start=performance.now();
  const res=await fetch(url,{credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!res.ok)throw new Error("Source request returned "+res.status);
  const data=await res.json();
  return {data,at:new Date().toISOString(),rt:Math.round(performance.now()-start)};
}

const feeds=[
  ["spot",8000,async symbol=>{
    const packet=await obtain(gate+"/spot/trades?limit=20&currency_pair="+symbol);
    const rows=packet.data.filter(row=>row.currency_pair===symbol).sort((a,b)=>Number(b.create_time_ms)-Number(a.create_time_ms));
    if(!rows.length)throw new Error("No executions returned");
    const last=rows[0],time=Number(last.create_time_ms);
    if(!Number.isFinite(time)||time<=0)throw new Error("Missing the execution clock");
    return {...packet,clock:"Trade "+new Date(time).toISOString(),values:[
      ["Market",symbol],["Latest price",fmt(last.price)],["Quantity at latest print",fmt(last.amount)],
      ["Side",last.side],["Returned prints",rows.length],["Print age at response",Math.max(0,Date.parse(packet.at)-time)+" ms"],
    ]};
  }],
  ["perpetual",10000,async symbol=>{
    const packet=await obtain(gate+"/futures/usdt/tickers?contract="+symbol);
    const value=packet.data.find(row=>row.contract===symbol);
    if(!value)throw new Error("No matching perpetual contract returned");
    return {...packet,clock:"Local capture clock",values:[
      ["Contract",symbol],["Mark",fmt(value.mark_price)],["Index",fmt(value.index_price)],
      ["Funding (bps)",fmt(Number(value.funding_rate)*1e4)],["Open interest (contracts)",fmt(value.total_size)],
      ["24 h quote volume",fmt(value.volume_24h_quote)]
    ]};
  }],
  ["reference",60000,async ()=>{
    const packet=await obtain("https://api.frankfurter.dev/v2/rates?providers=ecb&base=EUR&quotes=USD,JPY,GBP,CHF");
    const values=packet.data.filter(row=>row.base==="EUR");
    if(!values.length)throw new Error("No ECB reference observations returned");
    return {...packet,clock:"Published observation dates",values:values.map(row=>["EUR / "+row.quote,fmt(row.rate)+" · "+row.date])};
  }],
];

function show(id,packet){
  const zone=item(id);
  zone.querySelector(".widget-meta").textContent=packet.clock+" · fetched "+packet.at+" · "+packet.rt+" ms";
  zone.querySelector("dl").replaceChildren(...packet.values.flatMap(([name,value])=>{
    const dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=name;dd.textContent=value;return [dt,dd];
  }));
}

async function read(feed,key){
  const [id,period,load]=feed;
  try{
    const packet=await load(item("widget-market").value);
    if(connected&&key===generation)show(id,packet);
  }catch{
    if(connected&&key===generation)item(id).querySelector(".widget-meta").textContent="Source unavailable. Displayed values, if any, are from the preceding observation.";
  }
  if(connected&&key===generation)timers.set(id,setTimeout(()=>read(feed,key),period));
}

function toggle(value,clear=false){
  connected=value;generation+=1;
  for(const timer of timers.values())clearTimeout(timer);
  timers.clear();
  trigger.setAttribute("aria-pressed",String(value));
  trigger.textContent=value?"Disconnect feeds":"Connect feeds";
  for(const feed of feeds.filter(row=>!item(row[0]).hidden)){
    const area=item(feed[0]);
    if(clear)area.querySelector("dl").replaceChildren();
    area.querySelector(".widget-meta").textContent=value?"Connecting.":"Paused.";
    if(value)read(feed,generation);
  }
}
trigger.addEventListener("click",()=>toggle(!connected));
item("widget-market").addEventListener("change",()=>toggle(connected,true));
if(feeds.some(([id])=>id===one)){
  for(const [id] of feeds)item(id).hidden=id!==one;
  if(one==="reference")item("widget-market").closest("label").hidden=true;
}

function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));

if("serviceWorker" in navigator)navigator.serviceWorker.register("widget-worker.js").catch(()=>{});
let installPrompt;
window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  installPrompt=event;
  item("widget-install").hidden=false;
});
item("widget-install").addEventListener("click",async()=>{
  if(!installPrompt)return;
  await installPrompt.prompt();
  installPrompt=null;
  item("widget-install").hidden=true;
});
