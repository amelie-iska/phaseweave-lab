"use strict";
(() => {
  const $=id=>document.getElementById(id), el=(tag,x)=>{const node=document.createElement(tag);node.textContent=x;return node;};
  const fmt=(v,n=3)=>v===null?"—":Number(v).toFixed(n), time=ms=>new Date(ms).toISOString().slice(11,23);
  const color=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const labels=["A","B","C","D"], cvs=$("scatter");
  let d,i=0,dots=[];
  function feature(row,key){if(key==="weighted")return row.weighted_imbalance;if(key==="mid_minus_mark")return row.mid_mark_basis_bps;return row.depth[key.split("_")[1]].imbalance;}
  function plot(){
    const m=$("measure").value,t=$("target").value;
    const points=d.pairs.map(p=>[feature(d.observations[p.origin],m),p[t]]);
    const w=cvs.clientWidth,h=cvs.clientHeight,s=window.devicePixelRatio||1;cvs.width=Math.round(w*s);cvs.height=Math.round(h*s);
    const c=cvs.getContext("2d");c.scale(s,s);c.font="11px ui-monospace,monospace";
    const left=43,right=w-18,top=18,bottom=h-33;
    const xAbs=m==="mid_minus_mark"?Math.max(1,Math.ceil(Math.max(...points.map(p=>Math.abs(p[0]))))):1;
    const yAbs=Math.max(1,Math.ceil(Math.max(...points.filter(p=>p[1]!==null).map(p=>Math.abs(p[1])))));
    const x=v=>left+(v/xAbs+1)*(right-left)/2,y=v=>bottom-(v/yAbs+1)*(bottom-top)/2;
    c.lineWidth=1;
    for(const u of [-1,-.5,0,.5,1]){
      c.strokeStyle=color(u===0?"--line":"--faint");c.beginPath();c.moveTo(left,y(u*yAbs));c.lineTo(right,y(u*yAbs));c.moveTo(x(u*xAbs),top);c.lineTo(x(u*xAbs),bottom);c.stroke();
      c.fillStyle=color("--muted");c.textAlign="right";c.fillText(fmt(u*yAbs,1),left-6,y(u*yAbs)+3);
      c.textAlign="center";c.fillText(fmt(u*xAbs,1),x(u*xAbs),bottom+17);
    }
    dots=[];
    points.forEach(([a,b],j)=>{if(b===null)return;const px=x(a),py=y(b);dots.push({x:px,y:py,j});
      if(i===j)return;c.fillStyle=color("--jade");c.beginPath();c.arc(px,py,4.3,0,Math.PI*2);c.fill();});
    const selected=dots.find(v=>v.j===i);
    if(selected){c.beginPath();c.arc(selected.x,selected.y,6,0,Math.PI*2);c.fillStyle=color("--copper");c.fill();c.lineWidth=1.5;c.strokeStyle=color("--text");c.stroke();}
  }
  function render(){
    const m=$("measure").value,t=$("target").value,p=d.pairs[i],a=d.observations[p.origin],b=d.observations[p.destination],n=d.census[t][m];
    const x=feature(a,m),out=p[t],isBasis=m==="mid_minus_mark",word=t==="next_mid_bps"?"mid":"mark";
    $("interval").value=i;$("pos").textContent=(i+1)+" / "+d.pairs.length;
    $("back").disabled=i===0;$("forward").disabled=i===d.pairs.length-1;
    $("time-witness").textContent=time(a.book_ms)+" → "+time(b.book_ms)+" UTC";
    $("move").textContent=fmt(out);$("scatter-desc").textContent="Horizontal: "+(isBasis?"mid minus mark (log bps)":"depth imbalance (−1 to +1)")+". Vertical: next "+word+" change (log bps). Copper marks this transition.";
    const pairs=[["Origin "+(isBasis?"basis":"imbalance"),fmt(x)+(isBasis?" log bps":"")],["Weighted bid / ask",fmt(a.weighted_bid_btc)+" / "+fmt(a.weighted_ask_btc)+" BTC"],["Sell VWAP − mark",fmt(a.sell_mark_basis_bps)+" log bps"],["Buy VWAP − mark",fmt(a.buy_mark_basis_bps)+" log bps"],["Mark age at origin",a.mark_age_ms+" ms"],["Time to next book",fmt(p.dt_ms/1000,3)+" s"]];
    const dl=$("witness");dl.replaceChildren();for(const [k,v] of pairs){const div=document.createElement("div");div.append(el("dt",k),el("dd",v));dl.append(div);}
    $("census").textContent=n.direction_matches+" / "+n.nonzero_signal_and_outcome+" directional matches. The next "+word+" moved up "+n.outcomes.up+" times, down "+n.outcomes.down+", and stayed flat "+n.outcomes.flat+".";
    $("groups").replaceChildren();for(const k of ["negative","zero","positive"]){const g=n.groups[k],tr=document.createElement("tr");for(const v of [k,g.n,fmt(g.mean_response_bps),fmt(g.median_response_bps)])tr.append(el("td",v));$("groups").append(tr);}
    const mat=$("matrix-view").value,table=document.createElement("table"),head=table.createTHead().insertRow();for(const k of ["From / to",...labels])head.append(el("th",k));const tbody=table.createTBody();d.transitions[mat].forEach((row,j)=>{const tr=tbody.insertRow();tr.append(el("th",labels[j]));row.forEach(v=>{const td=el("td",v);if(v)td.className="nonzero";tr.append(td);});});$("matrix").replaceChildren(table);
    $("states").textContent="Selected transition "+labels[a.state]+" → "+labels[b.state]+". Arrival and departure counts balance on this recorded path.";
    plot();
  }
  function theme(name){document.documentElement.dataset.theme=name;for(const k of ["dark","light"])$(k).setAttribute("aria-pressed",String(k===name));if(d)plot();}
  async function init(){
    const r=await fetch("liquidity-response-v1.json");if(!r.ok)throw Error();const bytes=await r.arrayBuffer(),hash=await crypto.subtle.digest("SHA-256",bytes);
    if(Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("")!=="9091c1d758597cf4812866c640ac9afe2367a031d93233984ee9f5e9bd0c6334")throw Error();
    d=JSON.parse(new TextDecoder().decode(bytes));$("interval").max=d.pairs.length-1;
    for(const k of ["dark","light"])$(k).onclick=()=>theme(k);
    $("dark").setAttribute("aria-pressed","true");for(const k of ["target","measure","matrix-view"])$(k).onchange=render;
    $("back").onclick=()=>{i--;render();};$("forward").onclick=()=>{i++;render();};$("interval").oninput=e=>{i=Number(e.target.value);render();};
    cvs.onclick=e=>{const bb=cvs.getBoundingClientRect(),x=e.clientX-bb.left,y=e.clientY-bb.top;let closest=dots.reduce((a,b)=>Math.hypot(a.x-x,a.y-y)<Math.hypot(b.x-x,b.y-y)?a:b);if(Math.hypot(closest.x-x,closest.y-y)<20){i=closest.j;render();}};
    $("coverage").textContent="Gate BTC_USDT · 20 November 2026 · 18 books / 17 subsequent responses · one 41.427-second session.";
    render();new ResizeObserver(plot).observe(cvs);
  }
  init().catch(()=>{$("coverage").textContent="Unable to verify the observed dataset. Use HTTPS or localhost.";});
})();
