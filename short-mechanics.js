"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const fingerprint = "00b7bf66a64386e21eb94943b131fdcc8f05809d17368403b6d8f307049c0fc4";
  const tape = $("tape");
  let data, index = 0, mode = "price", tab = "depth", timer = null;
  const fixed = (n, digits=2) => Number(n).toLocaleString("en-US", {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const clock = ms => new Date(ms).toISOString().slice(11,23);
  const date = ms => new Date(ms).toISOString().slice(0,10);
  const pct = rate => fixed(Number(rate)*100,3)+"%";
  const signed = (n,digits) => (Number(n)>0 ? "+" : "")+fixed(n,digits);
  const text = (tag,value) => {const node=document.createElement(tag);node.textContent=value;return node;};
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function list(rows) {
    const dl=document.createElement("dl");
    for (const [label,value] of rows) {
      const div=document.createElement("div");
      div.append(text("dt",label),text("dd",value));
      dl.append(div);
    }
    return dl;
  }
  function paintTheme(theme) {
    document.documentElement.dataset.theme=theme;
    for(const b of document.querySelectorAll(".themes button")) b.setAttribute("aria-pressed",String(b.dataset.theme===theme));
    if(data) plot();
  }
  function setPressed(node, value) {node.setAttribute("aria-pressed",String(value));}
  function stop() {clearInterval(timer);timer=null;$("toggle-play").textContent="Play";}
  function jump(i,manual=true) {
    if(manual) stop();
    index=Math.max(0,Math.min(data.frames.length-1,i));
    render();
  }
  function priceSeries() {
    return [
      {name:"Mark",color:"--copper",get:f=>Number(f.mark),dash:[]},
      {name:"Best bid",color:"--jade",get:f=>Number(f.bids[0][0]),dash:[5,3]},
      {name:"Best ask",color:"--violet",get:f=>Number(f.asks[0][0]),dash:[2,3]}
    ];
  }
  function series() {
    return mode==="price" ? priceSeries() : [{name:"Marked equity",color:"--copper",get:(_,i)=>Number(data.ledger.events[i].state.marked_equity),dash:[]}];
  }
  function plot() {
    const f=data.frames, sets=series(), bounds=tape.getBoundingClientRect();
    const w=Math.max(1,bounds.width), h=Math.max(1,bounds.height), dpr=window.devicePixelRatio||1;
    tape.width=Math.round(w*dpr);tape.height=Math.round(h*dpr);
    const c=tape.getContext("2d");c.scale(dpr,dpr);
    const left=w<430 ? 66 : 78, right=w-10, top=16, bottom=h-29;
    const first=f[0].book_update_ms, last=f.at(-1).book_update_ms;
    const extents=f.flatMap((row,j)=>sets.map(s=>s.get(row,j)));
    let lo=Math.min(...extents),hi=Math.max(...extents);
    const margin=Math.max((hi-lo)*.10,mode==="price"?.01:.0001);lo-=margin;hi+=margin;
    const x=t=>left+(t-first)/(last-first)*(right-left);
    const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
    c.font="11px ui-monospace, monospace";c.textAlign="right";c.fillStyle=css("--muted");
    for(let j=0;j<=4;j++) {
      const v=lo+(hi-lo)*j/4,py=y(v);c.strokeStyle=css("--faint");
      c.beginPath();c.moveTo(left,py);c.lineTo(right,py);c.stroke();c.fillText(fixed(v, mode==="price"?1:4),left-7,py+4);
    }
    c.textAlign="center";
    for(let j=0;j<3;j++) {
      const t=first+(last-first)*j/2;c.fillText(clock(t).slice(0,8), Math.max(left+23,Math.min(right-23,x(t))),h-7);
    }
    for(const s of sets) {
      c.beginPath();c.strokeStyle=css(s.color);c.lineWidth=s.name==="Mark"||mode==="equity"?2.5:1.55;c.setLineDash(s.dash);
      f.forEach((row,j)=>{const px=x(row.book_update_ms),py=y(s.get(row,j));if(j)c.lineTo(px,py);else c.moveTo(px,py);});
      c.stroke();c.setLineDash([]);
    }
    const row=f[index], px=x(row.book_update_ms);
    c.strokeStyle=css("--line");c.lineWidth=1;c.setLineDash([3,4]);
    c.beginPath();c.moveTo(px,top);c.lineTo(px,bottom);c.stroke();c.setLineDash([]);
    for (const s of sets) {c.fillStyle=css(s.color);c.beginPath();c.arc(px,y(s.get(row,index)),3.6,0,2*Math.PI);c.fill();}
  }
  function depthTable(side, rows, fills) {
    const section=document.createElement("section");
    section.append(text("h3",side));const table=document.createElement("table");table.className="depth";
    const head=table.createTHead().insertRow();
    for(const h of ["Price · USDT","Contracts","Filled"]) head.append(text("th",h));
    const body=table.createTBody();
    for(const [price,size] of rows.slice(0,5)) {
      const tr=body.insertRow(), fill=fills.find(x=>Number(x.price)===Number(price));
      for(const val of [fixed(price,1),fixed(size,0),fill?fixed(fill.contracts,0):"—"]) tr.append(text("td",val));
    }
    section.append(table);return section;
  }
  function detail() {
    const f=data.frames[index], event=data.ledger.events[index], s=event.state, box=$("detail");
    box.replaceChildren();const grid=document.createElement("div");grid.className="details-grid";box.append(grid);
    for(const key of ["depth","risk","clock"]) setPressed($("inspect-"+key),tab===key);
    if(tab==="depth") {
      grid.append(depthTable("Bids · sell to open",f.bids,event.kind==="open"?event.fills:[]),
                  depthTable("Asks · buy to cover",f.asks,event.kind==="cover"?event.fills:[]));
      box.append(text("p","Top five displayed levels. The recorded paper ledger consumes available contracts at the observed side. Intermediate marks carry the open inventory forward."));
    } else if(tab==="risk") {
      const q=Number(s.remaining_contracts)*Number(data.spec.multiplier);
      const rate=Number(data.spec.maintenance_rate)+Number(data.spec.taker_fee_rate);
      const breach=q>0 ? (Number(s.collateral_cash)+Number(s.remaining_entry_basis))/(q*(1+rate)):null;
      grid.append(list([["Mark notional",fixed(s.mark_notional,5)+" USDT"],["Collateral cash",fixed(s.collateral_cash,6)+" USDT"],["Maintenance + exit fee",fixed(s.maintenance_including_exit_fee,6)+" USDT"]]),
        list([["Maintenance headroom",fixed(s.maintenance_headroom,6)+" USDT"],["Indicative breach mark",breach===null?"Flat position":fixed(breach,2)+" USDT/BTC"],["Breach observed",s.breach_ms===null?"No":clock(s.breach_ms)+" UTC"]]));
      box.append(text("p","The indicative threshold holds current collateral, open quantity, rates and funding fixed. A breach requests a cover on a later observed ask book. Missing depth leaves exposure open."));
    } else {
      grid.append(list([["Mark event · UTC",clock(f.mark_event_ms)],["Mark message · UTC",clock(f.mark_message_ms)],["Mark received · UTC",clock(f.mark_received_ms)]]),
                  list([["Book updated · UTC",clock(f.book_update_ms)],["Book received · UTC",clock(f.book_received_ms)],["Mark precedes book",String(f.book_update_ms-f.mark_event_ms)+" ms"]]));
      box.append(text("p","Book "+f.book_id+". Eligibility uses the most recent past mark available when the book was received. Bars are observed snapshots; the interval between captures is unobserved."));
    }
  }
  function render() {
    const f=data.frames[index],event=data.ledger.events[index],s=event.state;
    $("session-date").textContent=date(f.book_update_ms)+" · UTC";
    $("clock").textContent=clock(f.book_update_ms)+" UTC";
    $("quote-value").textContent=mode==="price"?fixed(f.mark,2):fixed(s.marked_equity,6);
    $("quote-unit").textContent=mode==="price"?"USDT / BTC":"USDT";
    $("chart-desc").textContent=(mode==="price"?"Observed mark ":"Marked equity ")+$("quote-value").textContent+" at "+$("clock").textContent+". Move the frame control to inspect each observation.";
    tape.setAttribute("aria-label",mode==="price"?"Observed BTC perpetual mark, best bid and best ask":"Paper marked equity by recorded frame");
    $("frame").value=index;$("frame-count").textContent=(index+1)+" / "+data.frames.length;
    $("prev").disabled=index===0;$("next").disabled=index===data.frames.length-1;
    setPressed($("show-price"),mode==="price");setPressed($("show-equity"),mode==="equity");
    $("legend").replaceChildren();for(const s of series()){const el=text("span",s.name), sw=document.createElement("i");sw.style.background=css(s.color);el.prepend(sw);$("legend").append(el);}
    $("position-status").textContent=({"open":"Open short","closed":"Closed","cover_pending":"Cover pending","unfilled":"Unfilled"})[s.status]||s.status;
    $("equity").textContent=fixed(s.marked_equity,6);
    $("position").replaceChildren(...list([["Signed position",signed(s.signed_underlying,4)+" BTC"],["Unrealized PnL",signed(s.unrealized_pnl,6)+" USDT"],
      ["Realized price PnL",signed(s.gross_realized_pnl,6)+" USDT"],["Cumulative fees",fixed(s.fees,6)+" USDT"],["Net PnL incl. costs",signed(Number(s.marked_equity)-Number(data.spec.collateral),6)+" USDT"]]).children);
    const actions={sell_to_open:"Sell to open",buy_to_cover:"Buy to cover",mark:"Mark the position",maintenance_buy_to_cover:"Maintenance cover"};
    $("action").textContent=actions[event.action]||event.action;
    $("action-detail").textContent=event.fills?.length ? fixed(event.filled_contracts,0)+" contracts filled · "+event.fills.map(x=>fixed(x.price,1)+" USDT").join(" / ") : "Inventory carries forward. Equity updates at the observed mark.";
    detail();plot();
  }
  function links() {
    const box=$("source-info"),t=data.terms.risk_tier;
    for(const item of [
      "Gate BTC_USDT direct perpetual, settled in USDT. One contract represents "+data.spec.multiplier+" BTC. The fixed paper policy sells "+data.paper_policy.contracts+" contracts at entry, holds, then covers at the final observed ask.",
      "Isolated paper collateral "+fixed(data.spec.collateral,6)+" USDT. Actual tier "+t.tier+" initial margin "+pct(data.spec.initial_margin_rate)+", maintenance "+pct(data.spec.maintenance_rate)+", public taker fee "+pct(data.spec.taker_fee_rate)+". No funding settlement occurred during this recording.",
      "Actual observations supply the inputs. Fills are simulated against displayed depth. The replay omits queue position, venue liquidation execution and account-specific fees."
    ]) box.append(text("p",item));
    const p=text("p","Sources: ");
    for(const [n,url] of [["contract terms",data.source_urls.contract],["risk tiers",data.source_urls.tiers],["book API",data.source_urls.book],["ticker schema","https://www.gate.com/docs/developers/futures/ws/en/#tickers-notification"]]){
      const a=text("a",n);a.href=url;p.append(a,document.createTextNode(" · "));
    }
    p.lastChild.remove();box.append(p);
    $("coverage").textContent=data.frames.length+" observed books · "+data.capture.captured_ticker_messages+" ticker messages · maximum mark age "+data.capture.maximum_observed_mark_age_ms+" ms";
  }
  async function load() {
    const r=await fetch("short-mechanics-v1.json");if(!r.ok)throw Error("missing tape");
    const bytes=await r.arrayBuffer();const hash=await crypto.subtle.digest("SHA-256",bytes);
    if(Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("")!==fingerprint)throw Error("unexpected tape");
    data=JSON.parse(new TextDecoder().decode(bytes));
    if(data.frames.length!==data.ledger.events.length||data.contract!=="BTC_USDT")throw Error("invalid tape");
    $("frame").max=data.frames.length-1;
    $("prev").onclick=()=>jump(index-1);$("next").onclick=()=>jump(index+1);$("frame").oninput=e=>jump(Number(e.target.value));
    $("toggle-play").onclick=()=>{if(timer){stop();return;}if(index===data.frames.length-1)jump(0);$("toggle-play").textContent="Pause";timer=setInterval(()=>{jump(index+1,false);if(index===data.frames.length-1)stop();},850);};
    for(const key of ["price","equity"]) $("show-"+key).onclick=()=>{mode=key;render();};
    for(const key of ["depth","risk","clock"]) $("inspect-"+key).onclick=()=>{tab=key;detail();};
    try {paintTheme(localStorage.getItem("phaseweave-short-theme")||"dark");} catch {paintTheme("dark");}
    for(const b of document.querySelectorAll(".themes button")) b.onclick=()=>{try{localStorage.setItem("phaseweave-short-theme",b.dataset.theme);}catch{}paintTheme(b.dataset.theme);render();};
    links();render();new ResizeObserver(plot).observe(tape);
  }
  load().catch(()=>{$("coverage").textContent="The recorded source could not be verified. Reload the page over HTTPS or localhost.";$("position-status").textContent="Unavailable";});
})();
