"use strict";

(() => {
  const get=name=>document.getElementById("k6-"+name);
  const values=number=>number.toLocaleString("en-US");
  const margin=number=>number==null ? "Unavailable" : Number(number).toFixed(4)+" bp";
  const fields=["capture","scope","age","size","fee"];
  const lengths=["3","4","5","6"];
  const chart=get("chart");

  function counters(parent,items) {
    parent.replaceChildren(...items.map(([name,value])=>{
      const cell=document.createElement("div"), label=document.createElement("dt"), result=document.createElement("dd");
      label.textContent=name; result.textContent=value;
      cell.append(label,result);
      return cell;
    }));
  }

  function table(result) {
    const output=document.createElement("table");
    const head=output.createTHead().insertRow();
    const headings=["Legs","Eligible","Depth complete","Depth exhausted","Positive at best quotes","Positive with depth"];
    for(const label of headings) {
      const cell=document.createElement("th");
      cell.scope="col"; cell.textContent=label; head.append(cell);
    }
    const body=output.createTBody();
    for(const length of lengths) {
      const row=body.insertRow(), key=document.createElement("th"), record=result.by_length[length];
      key.scope="row"; key.textContent=length; row.append(key);
      for(const field of ["eligible","feasible","insufficient_displayed_depth","bbo_positive","positive"]) {
        row.insertCell().textContent=values(record[field]);
      }
    }
    return output;
  }

  function paint(result) {
    const {width,height}=chart.getBoundingClientRect();
    if (width<100 || height<100) return;
    const ratio=Math.min(window.devicePixelRatio||1,2);
    chart.width=Math.round(width*ratio); chart.height=Math.round(height*ratio);
    const ctx=chart.getContext("2d"), palette=getComputedStyle(document.documentElement);
    const color=key=>palette.getPropertyValue("--"+key).trim();
    ctx.scale(ratio,ratio);
    ctx.font="12px system-ui";
    ctx.fillStyle=color("muted");
    const maximum=Math.max(1,...lengths.map(length=>result.by_length[length].eligible));
    const available=width-118;
    for(const [index,length] of lengths.entries()) {
      const record=result.by_length[length], y=26+41*index;
      ctx.fillStyle=color("muted"); ctx.fillText(length+" legs",8,y+11);
      const eligible=record.eligible/maximum*available;
      const feasible=record.feasible/maximum*available;
      ctx.strokeStyle=color("muted"); ctx.strokeRect(56,y,eligible,15);
      ctx.fillStyle=color("jade"); ctx.fillRect(56,y,feasible,15);
      ctx.fillStyle=color("muted"); ctx.fillText(values(record.feasible),width-55,y+11);
    }
  }

  async function run() {
    const response=await fetch("binance-k6-route-replay-v1.json");
    if(!response.ok) throw Error("Replay evidence unavailable");
    const data=await response.json();
    if(data.format!=="phaseweave.binance-k6-route-release.v1"||data.runs.length===0) throw Error("Unexpected replay receipt");
    const select=get("capture");
    select.replaceChildren(...data.runs.map(run=>new Option(run.label,run.id)));
    let last;
    const refresh=()=>{
      const source=data.runs.find(run=>run.id===select.value), report=source.replay;
      const scope=get("scope").value, age=Number(get("age").value), size=Number(get("size").value), fee=Number(get("fee").value);
      const result=report.cases.find(row=>row.scope===scope&&row.max_age_ms===age&&row.start_usdt===size&&row.fee_bps_per_leg===fee);
      if(!result) throw Error("Missing report row");
      last=result;
      const timestamps=report.capture_window_utc.map(time=>new Date(time).toISOString().replace("T"," ").replace("Z",""));
      get("window").textContent=timestamps.join(" to ")+" UTC.";
      get("status").textContent=values(report.cuts)+" one-second cuts · "+values(report.directed_simple_cycles)+
        " candidate cycles per cut · "+values(result.cuts_with_eligible_route)+" cuts with eligible routes.";
      counters(get("same"),[
        ["Eligible routes",values(result.eligible)],
        ["Depth-complete routes",values(result.feasible)],
        ["Positive after depth and fees",values(result.positive)],
        ["Best same-cut margin",margin(result.same_cut.best_bps)],
      ]);
      get("routes").replaceChildren(table(result));
      counters(get("arrival"),[
        ["Positive-entry cuts",values(result.positive_entry_cuts)],
        ["Gate entries completing all legs",values(result.positive_entry_arrival_success)],
        ["Gate entries positive at arrival",values(result.positive_entry_arrival_positive)],
        ["Selected routes replayed for diagnosis",values(result.selected_one_second_replay.scored_cuts)],
      ]);
      const rejected=result.arrival_rejections;
      get("rejections").textContent="Selected-route diagnostic rejections · "+
        values(rejected.leg_book_unavailable+rejected.whole_book_unavailable)+" book coverage or age · "+
        values(rejected.insufficient_arrival_depth)+" insufficient depth · "+
        values(rejected.end_of_record)+" end of record.";
      paint(result);
    };
    for(const name of fields) get(name).addEventListener("change",refresh);
    new ResizeObserver(()=>last&&paint(last)).observe(chart);
    new MutationObserver(()=>last&&paint(last)).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    refresh();
  }
  run().catch(()=>{get("status").textContent="The verified replay results could not load.";});
})();
