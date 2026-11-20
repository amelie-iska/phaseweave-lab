"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const names=["Quiet","Low","Middle","Elevated","Active"], periods=["train","validation","stress","test"];
 const periodNames={train:"August · fit",validation:"September 1–16",stress:"September 17–30",test:"October"};
 const models=[["committor","Fitted"],["reversible","Reversible"],["rank","Fixed rank"],["train_base_rate","August base"]];
 const f=x=>x.toLocaleString("en-US"),pct=x=>(100*x).toFixed(1)+"%";
 const make=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;};
 const ns="http://www.w3.org/2000/svg";
 function svg(tag,attrs){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
 let data,state=2,destination=2,period="test";
 function bar(label,value,max,text,selected=false) {
   const li=make("li",undefined,selected?"selected-row":""),h=make("div",undefined,"bar-header"),track=make("div",undefined,"track"),fill=make("span",undefined,"fill");
   h.append(make("span",label),make("strong",text));fill.style.width=(100*value/max)+"%";track.append(fill);li.append(h,track);return li;
 }
 function drawNetwork(){
   const canvas=$("network");canvas.replaceChildren();
   const defs=svg("defs",{}),arrow=svg("marker",{id:"end-arrow",viewBox:"0 0 10 10",refX:8,refY:5,markerWidth:8,markerHeight:8,orient:"auto",markerUnits:"userSpaceOnUse"});
   arrow.append(svg("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:"var(--jade)"}));defs.append(arrow);canvas.append(defs);
   const x=i=>51+124.5*i,y=134.75;
   data.transition_matrix[state].forEach((prob,i)=>{
     const a=x(state),b=x(i),diff=Math.abs(i-state);
     const d=diff===0 ? `M ${a-13} ${y-21} C ${a-59} ${y-95}, ${a+59} ${y-95}, ${a+13} ${y-24}` :
        `M ${a} ${y-9} Q ${(a+b)/2} ${y-70-32*diff} ${b-(b>a?6:-6)} ${y-26}`;
     const path=svg("path",{d,fill:"none",stroke:"var(--jade)","stroke-linecap":"round","stroke-width":1+11*prob,opacity:.5+prob,"marker-end":"url(#end-arrow)"});
     path.style.cursor="pointer";path.addEventListener("click",()=>chooseEdge(i));canvas.append(path);
   });
   const p=data.transition_matrix[state],C=data.counts[state];
   $("trans-origin").textContent="From "+names[state].toLowerCase()+" · "+f(C.reduce((a,b)=>a+b))+" August transitions";
   $("prob-bars").replaceChildren(...names.map((label,i)=>{
     const li=bar(label,p[i],1,pct(p[i])+" · "+f(C[i]),i===state),button=make("button");
     button.type="button";button.setAttribute("aria-label","Inspect "+names[state]+" to "+label);
     button.append(...li.childNodes);li.append(button);button.addEventListener("click",()=>chooseEdge(i));return li;
   }));
   chooseEdge(destination);
   const t=data.range_cutoffs_log_bps;
   $("range").textContent=(state===0?"< "+t[0].toFixed(3):state===4?"≥ "+t[3].toFixed(3):t[state-1].toFixed(3)+" – <"+t[state].toFixed(3))+" log bp";
   $("q").textContent=pct(data.forecast_values_by_state.committor[state]);
   [...$("nodes").children].forEach((b,i)=>b.setAttribute("aria-pressed",String(i===state)));
 }
 function chooseEdge(i){
   destination=i;
   [...$("prob-bars").querySelectorAll("button")].forEach((b,j)=>b.setAttribute("aria-pressed",String(i===j)));
   const current=data.diagnostics.probability_current[state][i],p=data.transition_matrix;
   const summary=i===state?"A self-transition has zero net stationary flow.":"Reverse probability "+pct(p[i][state])+". Net stationary flow "+(current>=0?"+":"")+current.toFixed(5)+" per step.";
   $("edge-detail").textContent=names[state]+" → "+names[i]+". "+summary;
 }
 function cohorts(){
   const r=data.results[period],v=r.performance;
   $("period-title").textContent=periodNames[period]+" outcomes";
   $("period-evidence").textContent=f(r.resolved_interior_origins)+" interior starts reached an endpoint. "+f(r.censored_interior_origins)+" ended at a data or calendar boundary.";
   if(state===0||state===4){
     $("selected-evidence").textContent=names[state]+" is an endpoint.";
     $("selected-explanation").textContent="Its high-before-low probability is fixed at "+pct(data.forecast_values_by_state.committor[state])+". Forecast errors use starts in the three interior states.";
   } else {
     const n=r.resolved_by_state[state], h=r.observed_high_before_low_by_state[state];
     $("selected-evidence").textContent=(n?pct(h/n):"Unavailable")+" reached active before quiet from "+names[state].toLowerCase()+".";
     $("selected-explanation").textContent=f(h)+" of "+f(n)+" resolved starts in this state, compared with "+pct(data.forecast_values_by_state.committor[state])+" under the August model.";
   }
   const max=Math.max(...periods.map(k=>data.results[k].two_step_total_variation_weighted_by_origins));
   $("shift-bars").replaceChildren(...periods.map(k=>{
     const v=data.results[k].two_step_total_variation_weighted_by_origins;
     return bar(periodNames[k],v,max,v.toFixed(4),k===period);
   }));
   const t=make("table");t.setAttribute("aria-label","Selected period Brier scores");const body=t.createTBody();
   for(const [id,name] of models) {const row=body.insertRow(),th=make("th",name);th.scope="row";row.append(th);row.insertCell().textContent=v.brier[id].toFixed(6);}
   $("brier-detail").replaceChildren(t);
   $("interval").textContent="Fitted minus August base "+v.committor_minus_base.toFixed(5)+" (95% interval "+v.paired_UTC_day_bootstrap_95.map(x=>x.toFixed(5)).join(" to ")+", "+v.UTC_day_clusters+" UTC dates).";
   $("full-table").replaceChildren(...periods.map(k=>{
     const a=data.results[k],b=a.performance.brier,row=make("tr",undefined,k===period?"current":""),head=make("th",periodNames[k]);
     head.scope="row";row.append(head);
     for(const [id] of models){const c=row.insertCell();c.textContent=b[id].toFixed(6);if(b[id]===Math.min(...Object.values(b)))c.className="best";}
     row.insertCell().textContent=f(a.resolved_interior_origins);row.insertCell().textContent=f(a.censored_interior_origins);return row;
   }));
 }
 function select(i){state=i;destination=i;drawNetwork();cohorts();}
 fetch("market-committor-v1.json").then(r=>{if(!r.ok)throw Error("Missing receipt");return r.json();}).then(d=>{
   if(d.format!=="phaseweave-eurusd-committor-v1" || d.transition_matrix.length!==5 || periods.some(k=>!d.results[k]?.performance))throw Error("Unknown receipt");
   data=d;
   $("fit-total").textContent=f(data.results.train.one_minute_pairs);
   $("nodes").replaceChildren(...names.map((name,i)=>{
     const b=make("button",String(i)),label=make("span",name);b.type="button";b.style.left=(8.5+20.75*i)+"%";b.setAttribute("aria-label","State "+i+" · "+name);
     b.append(label);b.addEventListener("click",()=>select(i));return b;
   }));
   $("period").replaceChildren(...periods.map(k=>new Option(periodNames[k],k)));$("period").value=period;
   $("period").addEventListener("change",()=>{period=$("period").value;cohorts();});
   $("notice").hidden=true;$("lab").hidden=false;select(state);
 }).catch(()=>{$("notice").hidden=false;$("lab").hidden=true;$("notice").textContent="The measured transition data could not be loaded. Reload to retry.";});
})();
