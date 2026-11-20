"use strict";
(() => {
  const $=id=>document.getElementById(id);
  const make=(name,value)=>{const node=document.createElement(name);if(value!==undefined)node.textContent=String(value);return node;};
  const styles=["--jade","--copper","--violet"];
  const knownModels = [
    "tokengt-tropical-classical-20261226",
    "tokengt-tropical-maxplus-20261225",
    "gat_tokengt-tropical-maxplus-20261226"
  ];
  const modelIndex = id => {
    const known = knownModels.indexOf(id);
    if (known >= 0) return known;
    return Array.from(id).reduce((seed, c) => (seed * 31 + c.codePointAt(0)) >>> 0, 0) % styles.length;
  };
  function badge(text, tone) {
    const b = make("span", text);
    b.className = "state-badge";
    b.dataset.tone = tone;
    return b;
  }
  function eventTone(type, detail) {
    if (/fail|expir|strand/i.test(type) || (type === "closed" && safeNum(detail?.trade_pnl) < 0)) return "loss";
    if (/reject|ineligib|abstain|stale|missing/i.test(type)) return "caution";
    if (/^fill$|^closed$/i.test(type)) return "fill";
    return "info";
  }
  const color=key=>getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  const safeNum=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x))?Number(x):null;
  const fmt=(x,n=2)=>safeNum(x)===null?"—":Number(x).toLocaleString("en-US",{minimumFractionDigits:n,maximumFractionDigits:n});
  const money=x=>fmt(x,5);
  const utc=ms=>Number.isFinite(ms)&&ms>0?new Date(ms).toISOString().slice(11,23):"—";
  const duration=ms=>{if(!Number.isFinite(ms)||ms<0)return "—";const s=Math.floor(ms/1000);return Math.floor(s/60)+"m "+String(s%60).padStart(2,"0")+"s";};
  const elapsedUnit=ms=>ms<1000?fmt(ms,0)+" ms":fmt(ms/1000,1)+" s";
  const chart=$("chart");
  const memory={latest:null,received:null,session:null,history:[],offline:false,timer:null,sourceTime:null,progressAt:null};
  function list(rows) {
    const dl=make("dl");
    for(const [key,val,tone] of rows){
      const div=make("div"), value=make("dd",val);
      if(tone)value.dataset.tone=tone;
      div.append(make("dt",key),value);dl.append(div);
    }
    return dl;
  }
  function setTheme(t) {
    document.documentElement.dataset.theme=t;
    for(const b of document.querySelectorAll("[data-choice]"))b.setAttribute("aria-pressed",String(b.dataset.choice===t));
    try{localStorage.setItem("phaseweave-theme",t);}catch{}
    if(memory.latest){draw();renderLegend(memory.latest.models);}
  }
  function renderLegend(models) {
    const box=$("legend");box.replaceChildren();
    models.forEach((m,j)=>{const label=make("span",m.name),line=make("i");line.style.background=color(styles[modelIndex(m.id)]);label.prepend(line);box.append(label);});
  }
  function draw() {
    const rect=chart.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),dpr=Math.min(window.devicePixelRatio||1,2);
    chart.width=Math.round(w*dpr);chart.height=Math.round(h*dpr);const c=chart.getContext("2d");c.scale(dpr,dpr);
    c.font="11px ui-monospace, monospace";c.fillStyle=color("--muted");
    const source=memory.history;
    if(!source.length||!source.some(s=>Object.values(s.values).some(v=>v!==null))){
      c.fillText("Waiting for observed paper PnL.",12,Math.round(h/2));return;
    }
    const lowX=source[0].t,highX=source.at(-1).t;
    const vals=source.flatMap(row=>Object.values(row.values)).filter(Number.isFinite);
    let lo=Math.min(0,...vals),hi=Math.max(0,...vals);
    const pad=Math.max(.00001,(hi-lo)*.15);
    lo-=pad;hi+=pad;
    const left=w<450?67:82,right=w-12,top=12,bottom=h-27;
    const x=t=>highX===lowX?left:left+(t-lowX)/(highX-lowX)*(right-left);
    const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
    for(let j=0;j<=4;j++){
      const v=lo+(hi-lo)*j/4,py=y(v);c.strokeStyle=color("--faint");c.lineWidth=1;
      c.beginPath();c.moveTo(left,py);c.lineTo(right,py);c.stroke();c.fillStyle=color("--muted");c.textAlign="right";c.fillText(fmt(v,5),left-5,py+4);
    }
    c.textAlign="left";c.fillText(utc(lowX).slice(0,8),left,h-6);
    if(highX!==lowX){c.textAlign="right";c.fillText(utc(highX).slice(0,8),right,h-6);}
    for(const [j,m] of (memory.latest?.models||[]).entries()){
      c.strokeStyle=color(styles[modelIndex(m.id)]);c.fillStyle=c.strokeStyle;c.lineWidth=2;
      c.setLineDash([[],[6,3],[2,4]][modelIndex(m.id)]);c.beginPath();let pen=false,last=null;
      for(const row of source){const val=row.values[m.id];if(!Object.hasOwn(row.values,m.id))continue;if(!Number.isFinite(val)){pen=false;continue;}const px=x(row.t),py=y(val);
        if(pen)c.lineTo(px,py);else c.moveTo(px,py);pen=true;last=[px,py];}
      c.stroke();c.setLineDash([]);if(last){c.beginPath();c.arc(...last,2.5,0,2*Math.PI);c.fill();}
    }
  }
  function renderEvents() {
    const data=memory.latest;if(!data)return;
    const filter=$("event-model").value;
    const subset=data.events.filter(e=>!filter||e.model===filter);
    const tbody=$("events");tbody.replaceChildren();
    for(const e of subset.slice(0,24)){
      const tr=make("tr");
      const model=data.models.find(m=>m.id===e.model);
      const who=make("td",model?.name||e.model||"Session");
      if(model)who.style.setProperty("--model-color","var("+styles[modelIndex(model.id)]+")");
      if(model)who.className="model-name";
      const what=make("td");what.append(badge(e.type,e.tone));
      tr.append(make("td",utc(e.t)),who,what,make("td",e.detail||"—"));
      tbody.append(tr);
    }
    if(!subset.length){const tr=make("tr"),td=make("td",filter?"No events for this model in the current event window.":"No decision or fill recorded yet.");td.colSpan=4;tr.append(td);tbody.append(tr);}
    $("event-count").textContent=subset.length?Math.min(24,subset.length)+" recent "+(subset.length===1?"event":"events")+" shown":"";
  }
  function render(data) {
    const changed=memory.session!==data.id;
    if(changed){memory.history=[];memory.session=data.id;memory.sourceTime=null;}
    if(data.t!==memory.sourceTime){memory.sourceTime=data.t;memory.progressAt=Date.now();}
    memory.latest=data;
    if(data.history.length){
      memory.history=data.history;
      $("plot-caption").textContent="Recorded paper ledger · UTC";
    } else if(Number.isFinite(data.t)){
      $("plot-caption").textContent=data.models.every(m=>Number(m.closed||0)===0)?"Window observations · no closed trades":"Since this window opened · UTC";
      const sample={t:data.t,values:Object.fromEntries(data.models.map(m=>[m.id,safeNum(m.pnl)]))};
      if(!memory.history.length||data.t>memory.history.at(-1).t){memory.history.push(sample);if(memory.history.length>300)memory.history.shift();}
      else if(memory.history.at(-1).t===data.t)memory.history[memory.history.length-1]=sample;
    }
    $("session").textContent=data.id||"—";$("elapsed").textContent=duration(data.elapsed);
    $("ingest").textContent=data.capture;$("latest").textContent=Number.isFinite(data.t)?utc(data.t)+" UTC":"—";
    $("run-policy").hidden=false;
    $("policy-badge").textContent=data.policy.title;
    $("policy-badge").dataset.tone=data.policy.tone;
    $("policy-explainer").textContent=data.policy.explainer;
    const expanded=new Set([...$("models").querySelectorAll("details[open]")].map(x=>x.dataset.model));
    $("models").replaceChildren();
    data.models.forEach((m,j)=>{const a=make("article");a.className="model-card";a.style.setProperty("--model-color","var("+styles[modelIndex(m.id)]+")");
      const h=make("h2",m.name.split(" · ")[0]),desc=make("p",m.name.split(" · ").slice(1).concat(m.desc).filter(Boolean).join(" · "));desc.className="model-description";
      const val=make("strong",money(m.pnl));val.className="pnl";val.dataset.sign=m.pnl===null?"unknown":m.pnl<0?"loss":m.pnl>0?"gain":"flat";
      const u=make("span","Paper PnL · USDT");u.className="unit";
      const more=make("details");more.dataset.model=m.id;more.open=!changed&&expanded.has(m.id);more.append(make("summary","Forecast details"),list(m.rows.slice(6)));
      a.append(h,desc,badge(m.state[0],m.state[1]),val,u,list(m.rows.slice(0,6)),more);$("models").append(a);});
    if(!data.models.length){const p=make("p","Waiting for model records.");p.className="empty";$("models").append(p);}
    const selected=$("event-model").value;
    const ids=[...$("event-model").options].map(o=>o.value).slice(1);
    if(changed||JSON.stringify(ids)!==JSON.stringify(data.models.map(m=>m.id))){
      $("event-model").replaceChildren(new Option("All models",""));
      for(const m of data.models)$("event-model").append(new Option(m.name,m.id));
      if(data.models.some(m=>m.id===selected))$("event-model").value=selected;
    }
    $("timing").replaceChildren(list(data.timing));
    $("method").replaceChildren(...data.notes.map(n=>make("p",n)));
    renderEvents();renderLegend(data.models);draw();
  }
  function freshness() {
    const now=Date.now(),age=memory.received===null?null:now-memory.received;
    const lag=memory.progressAt===null?null:now-memory.progressAt;
    const stalled=lag!==null&&lag>10000&&memory.latest?.active;
    const offline=memory.offline||age!==null&&age>6000;
    $("led").className="led "+(offline||stalled?"stale":memory.latest?.active?"live":"");
    $("phase").textContent=offline?"Feed unavailable":stalled?"Capture unchanged":memory.latest?.phase||"Connecting";
    $("freshness").textContent=age===null?"Waiting for first status":"Status received "+Math.max(0,Math.floor(age/1000))+" s ago";
    const message=offline?(memory.latest?"The endpoint is unavailable. Showing the last received status.":"Waiting for the local paper engine at /api/paper-tournament/status."):stalled?"The endpoint is responding, but the capture timestamp has not advanced for "+Math.floor(lag/1000)+" seconds.":memory.latest?.notice||"";
    $("notice").hidden=!message;$("notice").textContent=message;
  }
  function parseTime(x){const t=typeof x==="string"?Date.parse(x):NaN;return Number.isFinite(t)?t:null;}
  function ratio(a,b){return safeNum(a)===null||!Number(b)?"—":fmt(100*Number(a)/Number(b),1)+"%";}
  function pct(x){return safeNum(x)===null?"—":fmt(100*Number(x),1)+"%";}
  function vectors(v){return Array.isArray(v)&&v.length===2?v.map(x=>fmt(x,3)).join(" / "):"—";}
  function human(v){
    if(v===null||v===undefined)return "—";
    if(typeof v==="number")return Number.isInteger(v)?String(v):v.toLocaleString("en-US",{maximumFractionDigits:6});
    if(typeof v==="string")return v;
    if(typeof v==="boolean")return v?"Yes":"No";
    if(Array.isArray(v))return v.map(human).join(" / ");
    return Object.entries(v).map(([k,x])=>k.replaceAll("_"," ")+" "+human(x)).join(" · ");
  }
  function modelState(m) {
    if (m.stranded) return ["Stranded inventory", "loss"];
    if (m.pending_execution) return ["Paper cycle open", "info"];
    if (m.failed > 0 && !m.completed) return ["Execution failed", "loss"];
    if (m.completed > 0) {
      const closed=m.completed+" closed paper "+(m.completed===1?"cycle":"cycles");
      return safeNum(m.net_pnl)<0?[closed+" · net loss","loss"]:[closed,"fill"];
    }
    if (m.abstained > 0) return ["Abstained · no fills", "caution"];
    return [m.forecasts > 0 ? "Forecasting" : "Awaiting eligible input", m.forecasts > 0 ? "info" : "caution"];
  }
  function policyMeta(value, source, interval) {
    const raw = value == null ? "" : human(value);
    const probe = /probe|scheduled/i.test(raw);
    const gated = /gate|cost|profit/i.test(raw);
    return {
      title: probe ? "Scheduled execution probe" : gated ? "Cost-gated tournament" : raw || "Policy unreported",
      tone: probe ? "caution" : "info",
      explainer: [probe ? "Separate virtual bankroll"+(safeNum(interval)>0?" · "+fmt(interval,0)+" s schedule":"") : "", source].filter(Boolean).join(" · ")
    };
  }
  function adapt(s) {
    if(s.mode!=="paper"||!Array.isArray(s.models)||!Array.isArray(s.recent)||!Array.isArray(s.history))throw Error("invalid status");
    const start=parseTime(s.started_utc),latest=parseTime(s.latest_utc),session=start===null?null:new Date(start).toISOString();
    const hist=new Map();
    for(const entry of s.history){const t=parseTime(entry.utc);if(t===null||entry.model==null)continue;
      if(!hist.has(t))hist.set(t,{t,values:{}});hist.get(t).values[String(entry.model)]=safeNum(entry.net_pnl);}
    const models=s.models.map(m=>({
      id:String(m.id),name:String(m.name||m.id),pnl:safeNum(m.net_pnl),closed:m.completed,state:modelState(m),desc:m.seed==null?"Historical validation selection":"Training seed "+m.seed,
      rows:[["Max drawdown",money(m.max_drawdown)+" USDT"],["Live MAE / persistence",fmt(m.mae_bps,3)+" / "+fmt(m.persistence_mae_bps,3)+" bps"],
        ["Forecasts / scored",fmt(m.forecasts,0)+" / "+fmt(m.scored,0)],["Route-direction accuracy",pct(m.direction_accuracy)],
        ["Proposed / closed / failed",[m.proposed,m.completed,m.failed].map(x=>fmt(x,0)).join(" / ")],["Abstentions",fmt(m.abstained,0)],
        ["Starting capital / return",fmt(m.starting_capital,2)+" USDT / "+fmt(m.return_pct,3)+"%"],["Locked / stranded",human(m.locked)+" / "+(m.stranded?"Yes":"No")],["Execution pending",m.pending_execution?"Yes":"No"],["Latest forecast · fwd / rev",vectors(m.latest_prediction)+" bps"],
        ["Latest realized · fwd / rev",vectors(m.latest_realized)+" bps"],["Validation / historical test MAE",fmt(m.validation_mae,3)+" / "+fmt(m.historical_test_mae,3)+" bps"]]
    }));
    const events=s.recent.map(e=>({t:parseTime(e.utc),model:e.model||"",type:String(e.type||"Event").replaceAll("_"," "),tone:eventTone(e.type,e.detail),detail:human(e.detail)})).sort((a,b)=>(b.t||0)-(a.t||0));
    const notes=[
      "Live paper experiment on "+(s.asset||"the captured spot triangle")+". Model selection used historical validation. Live crypto results measure out-of-domain transfer from the historical FX training task.",
      "Simulated notional "+fmt(s.notional,2)+" USDT; configured fee "+fmt(s.fee_bps,1)+" bps. These are simulated executions against observed market data.",
      "Directional errors are scored only when a later eligible observation is matched. Feed receipt skew, quote age and unmatched outcomes limit timing precision.",
      "A strict complete market anchor has eligible books for the entire triangle. A rejection can carry multiple reasons. Model compute measures the inference call, excluding capture and time to fill."
    ];
    const timing=[["Asset triangle",s.asset||"—"],["Market source",human(s.source)],["Execution policy",human(s.policy)],
      ["Strict complete market anchors",fmt(s.complete_anchors ?? s.accepted,0),"fill"],["Evaluated grid seconds",fmt(s.grid_seconds,0)],
      ["Forecast origins with inference",fmt(s.prediction_anchors ?? (s.models.length && s.models.every(m=>m.forecasts===s.models[0].forecasts) ? s.models[0].forecasts : null),0)],
      ["Rejected grid seconds",fmt(s.stale,0),s.stale>0?"caution":null],
      ["Forecast stride",fmt(s.forecast_cadence_s,0)+" s"],["Model history / resolution / horizon",
       fmt(s.model_history,0)+" frames / "+fmt(s.model_step_s,0)+" s / "+fmt(s.model_horizon_s,0)+" s"],
      ["Model compute p50 / p95",fmt(s.compute_ms_p50,2)+" / "+fmt(s.compute_ms_p95,2)+" ms"],
      ["Capture or inference errors",fmt(s.errors,0),s.errors>0?"loss":null],["Input frames",human(s.input_frames)],["Pending forecasts",human(s.prediction_pending)],
      ["Eligible grid coverage",typeof s.coverage==="number"?pct(s.coverage):human(s.coverage)],["Unscored outcomes",fmt(s.unscored,0)],["Quote age limit",safeNum(s.clock?.age_cap_ms)===null?"—":elapsedUnit(s.clock.age_cap_ms)],
      ["Receipt skew limit",safeNum(s.clock?.receipt_skew_cap_ms)===null?"—":elapsedUnit(s.clock.receipt_skew_cap_ms)]];
    for(const [reason,count] of Object.entries(s.rejections||{})){
      timing.push(["Rejected · "+reason.replaceAll("_"," "),fmt(count,0),count>0?"caution":null]);
    }
    for(const [pair,book] of Object.entries(s.source_books||{})){
      timing.push([pair+" book",fmt(book.age_ms,0)+" ms · "+(book.reason||"received"),book.reason?"caution":"fill"]);
    }
    return {id:session,policy:policyMeta(s.policy,s.source,s.probe_interval_s),phase:s.status||"Waiting for status",active:["capturing","waiting for fresh books","forecasting"].includes(s.status),
      t:latest,elapsed:start===null?null:Math.max(0,(["capturing","waiting for fresh books","forecasting"].includes(s.status)?Date.now():(latest||Date.now()))-start),capture:fmt(s.captures,0)+" raw / "+fmt(s.accepted,0)+" eligible",
      models,events,timing,history:[...hist.values()].sort((a,b)=>a.t-b.t),notes,notice:""};
  }
  async function poll(){
    const started=performance.now(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
    try{
      const response=await fetch("/api/paper-tournament/status",{method:"GET",cache:"no-store",credentials:"same-origin",signal:controller.signal});
      if(!response.ok)throw Error("status unavailable");const current=adapt(await response.json());
      render(current);memory.received=Date.now();memory.offline=false;
    }catch{memory.offline=true;}
    finally{clearTimeout(timeout);freshness();memory.timer=setTimeout(poll,Math.max(0,1000-(performance.now()-started)));}
  }
  for(const b of document.querySelectorAll("[data-choice]"))b.onclick=()=>setTheme(b.dataset.choice);
  let preference="dark";try{preference=localStorage.getItem("phaseweave-theme")==="light"?"light":"dark";}catch{}setTheme(preference);
  $("event-model").onchange=renderEvents;new ResizeObserver(draw).observe(chart);
  if(location.hostname.endsWith(".github.io")){
    $("phase").textContent="Local engine required";$("freshness").textContent="Static preview";
    $("notice").hidden=false;
    const link=make("a","Open the running local paper tournament");link.href="http://127.0.0.1:8140/paper-tournament.html";
    $("notice").replaceChildren(link);draw();
  }else{poll();}
})();
