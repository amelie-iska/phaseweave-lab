"use strict";

(() => {
  const get = id => document.getElementById(id);
  const fmt = digits => new Intl.NumberFormat("en",{maximumFractionDigits:digits,minimumFractionDigits:digits});
  const bps = fmt(6);
  const count = fmt(0);
  let grid;
  function table(id, headers, rows) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-overflow";
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    for (const name of headers) {
      const cell = document.createElement("th");
      cell.scope="col";
      cell.textContent=name;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      for (const value of row) tr.insertCell().textContent=value;
    }
    wrapper.append(table);
    get(id).replaceChildren(wrapper);
  }

  function draw(arms, marks) {
    const canvas = get("scale-chart");
    const {width,height} = canvas.getBoundingClientRect();
    if (width<50 || height<30) return;
    const ratio = Math.min(2,devicePixelRatio||1);
    canvas.width=width*ratio;
    canvas.height=height*ratio;
    const ctx=canvas.getContext("2d");
    ctx.scale(ratio,ratio);
    const css=getComputedStyle(document.documentElement);
    const ink=name=>css.getPropertyValue("--"+name).trim();
    const values=arms.flatMap(arm=>arm.marks.map(row=>row.mae_bps));
    const low=Math.min(...values)-.002, high=Math.max(...values)+.002;
    const x=i=>48+(i+.5)*(width-61)/marks.length;
    const y=value=>15+(high-value)*(height-59)/(high-low);
    ctx.font="11px ui-monospace, monospace";
    for(let i=0;i<4;i++){
      const val=low+(high-low)*i/3;
      ctx.fillStyle=ink("muted");
      ctx.fillText(val.toFixed(3),3,y(val)+4);
      ctx.strokeStyle=ink("faint");
      ctx.beginPath();
      ctx.moveTo(43,y(val));
      ctx.lineTo(width-5,y(val));
      ctx.stroke();
    }
    ctx.textAlign="center";
    marks.forEach((mark,i)=>ctx.fillText(count.format(mark/1024)+"k",x(i),height-29));
    ctx.fillText("Window presentations",width/2,height-10);
    arms.forEach((arm,index)=>{
      ctx.strokeStyle=ink(index===0?"jade":"copper");
      ctx.fillStyle=ctx.strokeStyle;
      ctx.lineWidth=2.5;
      ctx.beginPath();
      arm.marks.forEach((row,i)=>i?ctx.lineTo(x(i),y(row.mae_bps)):ctx.moveTo(x(i),y(row.mae_bps)));
      ctx.stroke();
      arm.marks.forEach((row,i)=>{ctx.beginPath();ctx.arc(x(i),y(row.mae_bps),4.4,0,Math.PI*2);ctx.fill();});
    });
  }

  function renderGrid(){
    if (!grid) return;
    const {arms,marks}=grid.widths[get("scale-width").value];
    draw(arms,marks);
    table("scale-grid",["Corpus","Unique windows",...marks.map(n=>count.format(n)+" presentations"),"Selected October MAE"],
      arms.map(arm=>[arm.label,count.format(arm.unique),...arm.marks.map(row=>bps.format(row.mae_bps)),bps.format(arm.october_mae_bps)]));
    get("scale-status").textContent = `${count.format(arms[0].parameters)} parameters per arm. Jade shows the original corpus and copper shows the expansion. Validation MAEs use log bps.`;
  }
  function theme(value){
    document.documentElement.dataset.theme=value;
    document.querySelectorAll("[data-theme-choice]").forEach(button=>
      button.setAttribute("aria-pressed",String(button.dataset.themeChoice===value)));
    try { localStorage.setItem("phaseweave-theme",value); } catch {}
    renderGrid();
  }
  try {theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");} catch {}
  document.querySelectorAll("[data-theme-choice]").forEach(button=>button.addEventListener("click",()=>theme(button.dataset.themeChoice)));
  const display = file => fetch(file).then(response=>{
    if(!response.ok) throw new Error("data unavailable");
    return response.json();
  });
  get("scale-width").addEventListener("change",renderGrid);
  window.addEventListener("resize",renderGrid);
  display("scaling-calibration-v1.json").then(data=>{
    const sizes=[256,1024,4096];
    const seeds=[...new Set(data.results.map(row=>row.fit_seed))];
    table("scaling-calibration",["Fit seed",...sizes.map(n=>count.format(n)+" unique")],
      seeds.map(seed=>[seed,...sizes.map(n=>bps.format(data.results.find(row=>row.fit_seed===seed&&row.unique===n).mae_bps))]));
  }).catch(()=>{get("scaling-calibration").textContent="The calibration results could not load.";});
  display("scaling-grid-v1.json").then(data=>{
    if (data.status === "running") {
      get("scale-status").textContent="The six-arm GPU grid is in progress. The completed CPU calibration is above.";
      get("scale-chart").hidden=true;
      get("scale-width").disabled=true;
      return;
    }
    grid=data;
    renderGrid();
  })
    .catch(()=>{get("scale-status").textContent="The six-arm GPU grid is in progress. The completed CPU calibration is above.";get("scale-chart").hidden=true;});
})();
