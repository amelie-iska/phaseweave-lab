"use strict";
(() => {
  const get=name=>document.getElementById("gauge-"+name);
  const table=get("table"), split=get("split"), seed=get("seed"), sort=get("sort");
  const labels={
    raw:"Raw ordered links",bag:"Unordered DeepSets",mpnn:"Directed MPNN",tokengt:"TokenGT",
    gram:"Rooted Gram",orientation:"Rooted Gram + signed orientation",
    ququart:"Coherent ququart + calibration",ququart_dephased:"Dephased ququart + calibration",
    reference:"Reference loops only",wilson:"Exact signed Wilson trace",dephased:"Exact dephased population",
  };
  const cohorts={
    validation:"4,096 Q8 gauges across two orbits selected the checkpoint.",
    test:"8,192 Q8 gauges across four held-out orbits. The number of orbit groups is four.",
    su2:"512 continuous SU(2) rows in 256 reflected pairs, in the first random local frames.",
    su2_alternate:"The same 512 continuous rows in a second independent set of local frames.",
  };
  const percent=value=>(100*value).toFixed(2)+"%";
  const mean=(xs)=>xs.reduce((sum,x)=>sum+x,0)/xs.length;

  function render(result) {
    const cohort=split.value, seeds=seed.value==="mean" ? result.learned_seeds : [Number(seed.value)];
    const isContinuous=cohort.startsWith("su2");
    const metrics=result.metrics[cohort];
    const rows=Object.entries(labels).map(([key,title])=>{
      const ids=Object.hasOwn(metrics,key) ? [key] : seeds.map(s=>key+"_s"+s);
      return {key,title,accuracy:mean(ids.map(id=>metrics[id].accuracy)),
        secondary:mean(ids.map(id=>isContinuous?metrics[id].reflection_pairs.pairwise_auc:
                                                 metrics[id].by_orbit.worst_group_accuracy)),
        agreement:mean(ids.map(id=>result.su2_gauge_consistency[id].decision_agreement))};
    });
    rows.sort((a,b)=>b[sort.value]-a[sort.value] || b.accuracy-a.accuracy);
    const rendered=document.createElement("table");
    const header=rendered.createTHead().insertRow();
    for(const label of ["Model or exact control","Accuracy",isContinuous?"Reflection pair AUC":"Worst orbit accuracy","SU(2) frame agreement"]) {
      const cell=document.createElement("th"); cell.scope="col"; cell.textContent=label; header.append(cell);
    }
    const body=rendered.createTBody();
    for(const row of rows) {
      const tr=body.insertRow(), th=document.createElement("th");
      th.textContent=row.title; th.scope="row"; tr.append(th);
      const cell=tr.insertCell(), meter=document.createElement("meter");
      cell.className="gauge-accuracy";
      meter.min=0; meter.max=1; meter.value=row.accuracy; meter.setAttribute("aria-label",row.title+" accuracy");
      cell.append(meter,document.createTextNode(percent(row.accuracy)));
      tr.insertCell().textContent=percent(row.secondary);
      tr.insertCell().textContent=percent(row.agreement);
    }
    table.replaceChildren(rendered);
    get("cohort").textContent=cohorts[cohort];
    get("metric-note").textContent=isContinuous
      ? "Reflection pair AUC counts a tied score as one-half. Frame agreement alone can be high for a constant classifier."
      : "Worst orbit accuracy treats each held-out gauge orbit as a group. The frame-agreement column always uses the paired continuous challenge.";
  }

  fetch("gauge-benchmark-v1.json").then(response=>{
    if(!response.ok) throw Error("Missing benchmark receipt");
    return response.json();
  }).then(result=>{
    if (result.format!=="phaseweave.gauge-benchmark-independent.v1"||result.verified!==true)
      throw Error("Unrecognized benchmark receipt");
    for(const value of result.learned_seeds) seed.add(new Option("Seed "+value,value));
    for (const control of [split,seed,sort]) control.addEventListener("change",()=>render(result));
    render(result);
  }).catch(()=>{
    get("cohort").textContent="The verified benchmark receipt could not load.";
  });
})();
