"use strict";

(() => {
  const element=name=>document.getElementById("returns-"+name);
  const status=element("status"), content=element("content"), selector=element("series");
  const view=element("mode"), chart=element("chart");
  let exported;
  const units={NMR:"live-settled",USDT:"paper"};
  const amount=/^-?\d+(\.\d+)?$/u;
  const digest=/^[a-f0-9]{64}$/u;
  const text=value=>typeof value==="string"&&value.length>0;
  const number=value=>text(value)&&amount.test(value)&&Number.isFinite(Number(value));
  const places=value=>value.includes(".")?value.length-value.indexOf(".")-1:0;
  const inUnits=(value,scale)=>BigInt(value.replace(".",""))*10n**BigInt(scale-places(value));
  const isPositive=value=>inUnits(value,places(value))>0n;
  const timestamp=value=>text(value)&&value.endsWith("Z")&&Number.isFinite(Date.parse(value));
  const identity=series=>[series.venue,series.mode,series.currency,series.portfolio,series.model];
  const description=series=>identity(series).join(" · ");

  function checkedPoint(point) {
    return timestamp(point?.utc)&&text(point.kind)&&number(point.delta_net)&&number(point.cumulative_net)
      &&(point.return_pct===null||number(point.return_pct))&&text(point.provenance_sha256)&&digest.test(point.provenance_sha256);
  }
  function checkedSeries(series) {
    return text(series?.venue)&&text(series.portfolio)&&text(series.model)
      &&Object.hasOwn(units,series.currency)&&units[series.currency]===series.mode
      &&(series.starting_capital===null||number(series.starting_capital))
      &&Array.isArray(series.points)&&series.points.every(checkedPoint)
      &&series.points.every((p,i)=>i===0||Date.parse(p.utc)>=Date.parse(series.points[i-1].utc));
  }
  function checkBalances(series) {
    const scale=series.points.reduce((n,p)=>Math.max(n,places(p.delta_net),places(p.cumulative_net)),0);
    let balance=0n;
    for (const point of series.points) {
      balance+=inUnits(point.delta_net,scale);
      if (balance!==inUnits(point.cumulative_net,scale))
        throw Error("Cumulative returns do not reconcile with the event changes.");
    }
  }
  function batchClosures(points) {
    return points.filter((point,index)=>point.utc!==points[index+1]?.utc);
  }

  function checkCrossings(raw) {
    const candidate=raw.profit_crossings;
    if (candidate===undefined) return;
    if (!Array.isArray(candidate)) throw Error("The export has an invalid profit archive.");
    const expected=new Map();
    for (const series of raw.series) {
      let before="0", start=0;
      for (const [i,point] of series.points.entries()) {
        if (point.utc===series.points[i+1]?.utc) continue;
        if (!isPositive(before)&&isPositive(point.cumulative_net)) {
          const key=JSON.stringify([...identity(series),point.utc]);
          const proofs=series.points.slice(start,i+1).map(record=>record.provenance_sha256);
          expected.set(key, [before,point.cumulative_net,point.return_pct,proofs]);
        }
        before=point.cumulative_net; start=i+1;
      }
    }
    for (const crossing of candidate) {
      if (!crossing||!timestamp(crossing.utc)||!number(crossing.delta_net)||!isPositive(crossing.delta_net))
        throw Error("The export has an invalid profit crossing.");
      const key=JSON.stringify([...identity(crossing),crossing.utc]);
      const actual=[crossing.prior_net,crossing.cumulative_net,crossing.return_pct,crossing.provenance_sha256];
      if (!expected.has(key)||JSON.stringify(actual)!==JSON.stringify(expected.get(key)))
        throw Error("Profit crossings and event series disagree.");
      const [prior,after]=expected.get(key);
      const scale=Math.max(places(prior),places(after),places(crossing.delta_net));
      if (inUnits(after,scale)-inUnits(prior,scale)!==inUnits(crossing.delta_net,scale))
        throw Error("Profit crossing changes do not reconcile with the balances.");
      expected.delete(key);
    }
    if (expected.size) throw Error("The export omits profit crossings.");
  }

  function parse(raw) {
    if (raw?.schema!=="phaseweave.realized-returns.v1"||!Array.isArray(raw.series)||!Array.isArray(raw.positive_archive)
      ||!raw.series.every(checkedSeries)) throw Error("The export has an unexpected schema.");
    const registered=new Set();
    for (const series of raw.series) {
      const key=JSON.stringify(identity(series));
      if (registered.has(key)) throw Error("The export repeats a return series.");
      registered.add(key);
      checkBalances(series);
    }
    const positive=raw.series.flatMap(s=>s.points.filter(p=>isPositive(p.delta_net))
      .map(p=>JSON.stringify([description(s),p.utc,p.kind,p.delta_net,p.cumulative_net,p.return_pct,p.provenance_sha256]))).sort();
    const included=raw.positive_archive.map(p=>{
      if(!checkedPoint(p)||!isPositive(p.delta_net)) throw Error("The export has an invalid positive event.");
      return JSON.stringify([description(p),p.utc,p.kind,p.delta_net,p.cumulative_net,p.return_pct,p.provenance_sha256]);
    }).sort();
    if (included.length!==positive.length||included.some((x,i)=>x!==positive[i]))
      throw Error("Positive archive and event series disagree.");
    checkCrossings(raw);
    return raw;
  }

  function table(parent,headers,rows,empty) {
    if (!rows.length) { const p=document.createElement("p"); p.textContent=empty; parent.replaceChildren(p); return; }
    const output=document.createElement("table"), header=output.createTHead().insertRow(), body=output.createTBody();
    for(const label of headers) {
      const cell=document.createElement("th"); cell.scope="col"; cell.textContent=label; header.append(cell);
    }
    for (const values of rows) {
      const row=body.insertRow();
      for (const value of values) row.insertCell().textContent=value??"—";
    }
    parent.replaceChildren(output);
  }
  const eventRow=p=>[p.utc,p.kind,p.delta_net,p.cumulative_net,p.return_pct,p.provenance_sha256.slice(0,12)];
  const eventColumns=["UTC","Event","Net change","Cumulative net","Return %","Source SHA-256 prefix"];

  function draw(series) {
    if (content.hidden || !series?.points.length) return;
    const bounds=chart.getBoundingClientRect(), scale=Math.min(2,devicePixelRatio||1);
    chart.width=Math.round(bounds.width*scale); chart.height=Math.round(bounds.height*scale);
    const ctx=chart.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale,scale);
    const style=getComputedStyle(document.documentElement);
    const color=name=>style.getPropertyValue("--"+name).trim();
    const data=batchClosures(series.points);
    const origin=Date.parse(data[0].utc), elapsed=Math.max(1,Date.parse(data.at(-1).utc)-origin);
    let lo=0,hi=0;
    for(const record of data) { const value=Number(record.cumulative_net); lo=Math.min(lo,value); hi=Math.max(hi,value); }
    const width=Math.max(1,bounds.width-64), height=bounds.height-58;
    const x=utc=>46+(Date.parse(utc)-origin)/elapsed*width;
    const y=value=>23+(hi===lo?.5:(hi-value)/(hi-lo))*height;
    ctx.strokeStyle=color("line"); ctx.beginPath(); ctx.moveTo(46,y(0)); ctx.lineTo(46+width,y(0)); ctx.stroke();
    ctx.lineWidth=2; ctx.strokeStyle=color("jade"); ctx.beginPath();
    for (let i=0;i<data.length;i++) {
      const record=data[i], xx=x(record.utc), yy=y(Number(record.cumulative_net));
      if(i===0) { ctx.moveTo(xx,y(0)); ctx.lineTo(xx,yy); }
      else { ctx.lineTo(xx,y(Number(data[i-1].cumulative_net))); ctx.lineTo(xx,yy); }
    }
    ctx.stroke();
    ctx.fillStyle=color("muted"); ctx.font="12px system-ui";
    ctx.fillText(series.currency+" realized net",12,17);
    const first=data[0], last=data.at(-1);
    const sameDay=first.utc.slice(0,10)===last.utc.slice(0,10);
    const tick=record=>sameDay?record.utc.slice(11,19)+"Z":record.utc.slice(0,10);
    ctx.fillText(tick(first),46,bounds.height-13);
    if(data.length>1) ctx.fillText(tick(last),Math.max(152,bounds.width-94),bounds.height-13);
    ctx.fillText("0",29,y(0)+4);
    chart.setAttribute("aria-label","Cumulative realized net in "+series.currency+" ending at "+last.cumulative_net+" on "+last.utc);
  }
  function render() {
    if (!exported) return;
    const series=exported.series[Number(selector.value)];
    if (!series) return;
    element("selected").textContent=description(series);
    chart.hidden=!series.points.length;
    draw(series);
    table(element("events"),eventColumns,series.points.map(eventRow),"No settled events for this series.");
    if (view.value==="crossings") {
      table(element("positive"),["Portfolio and unit","UTC","Prior net","Net change","Cumulative net","Return %","Source SHA-256 prefixes"],
        (exported.profit_crossings??[]).map(p=>[description(p),p.utc,p.prior_net,p.delta_net,p.cumulative_net,p.return_pct,
          p.provenance_sha256.map(proof=>proof.slice(0,12)).join(", ")]),
        exported.profit_crossings===undefined?"Open a fresh export to view net-profit crossings.":"No series crossed into net profit.");
      return;
    }
    const archive=view.value==="delta" ? exported.positive_archive
      : exported.series.flatMap(s=>{
        const last=s.points.at(-1); return last&&isPositive(last.cumulative_net)?[{...last,...s}]:[];
      });
    table(element("positive"),["Portfolio and unit",...eventColumns],
      archive.map(p=>[description(p),...eventRow(p)]),"No qualifying positive results in this view.");
  }
  element("file").addEventListener("change",async event=>{
    const file=event.target.files[0];
    if(!file) return;
    try {
      const raw=await file.text();
      if(element("file").files[0]!==file) return;
      exported=parse(JSON.parse(raw));
      selector.replaceChildren(...exported.series.map((row,i)=>new Option(description(row),i)));
      selector.disabled=!exported.series.length; view.disabled=selector.disabled;
      content.hidden=selector.disabled;
      status.textContent=exported.series.length+" separate return series · "+exported.positive_archive.length+" positive closures"
        +(exported.profit_crossings===undefined?".":" · "+exported.profit_crossings.length+" net-profit crossings.");
      render();
    } catch(error) {
      if(element("file").files[0]!==file) return;
      exported=null; selector.replaceChildren(); selector.disabled=true; view.disabled=true; content.hidden=true;
      status.textContent=error instanceof SyntaxError?"The selected file is not valid JSON.":error.message;
    }
  });
  selector.addEventListener("change",render); view.addEventListener("change",render);
  new ResizeObserver(()=>draw(exported?.series[Number(selector.value)])).observe(chart);
  new MutationObserver(()=>draw(exported?.series[Number(selector.value)]))
    .observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
})();
