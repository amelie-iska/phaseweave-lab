"use strict";
(() => {
  const births = [[2,0], [1,1], [0,2]];
  const names = ["A", "B", "C"];
  const grades = Array.from({length:9}, (_,i) => [i%3, Math.floor(i/3)]);
  const paths = {I:[[0,1],[1,2],[0,2]], II:[[0,1],[1,2],[0,3]]};
  const bit = i => 1 << i;
  const word = pair => pair.reduce((acc,i) => acc ^ bit(i), 0);
  const below = ([x,y],[u,v]) => x<=u && y<=v;
  const key = grade => grade.join(",");
  const fmt = grade => "("+grade.join(", ")+")";

  function rank(vectors) {
    const pivots = new Map();
    for (let v of vectors) {
      while (v) {
        const i = 31 - Math.clz32(v);
        if (!pivots.has(i)) { pivots.set(i, v); break; }
        v ^= pivots.get(i);
      }
    }
    return pivots.size;
  }
  function inspect(which,grade) {
    const born = births.map((birth,i) => below(birth,grade) ? i : -1).filter(i => i>=0);
    const active = born.length>=2 ? 31 : born.length ? word(paths[which][born[0]]) : 0;
    const available = [0,1,2,3,4].filter(i => active & bit(i));
    // Each pair of two-edge paths is an F2 cycle. A spanning family pairs
    // every other active path with the first one, using common edge coordinates.
    const basis = available.slice(1).map(i => word([available[0],i]));
    return {born,active,basis,edges:2*available.length,dimension:rank(basis)};
  }
  function imageRank(which,source,target) {
    if (!below(source,target)) throw new Error("Grades must be comparable.");
    const a=inspect(which,source), b=inspect(which,target);
    if ((a.active & b.active)!==a.active) throw new Error("An edge disappeared.");
    // The only possible face boundary is zero over F2, so quotienting by
    // target boundaries leaves these source representatives unchanged.
    return rank(a.basis);
  }
  function comparison(which) {
    const rows=paths[which].map(word);
    const sum=rows.reduce((a,b)=>a^b,0);
    const support=[0,1,2,3,4].filter(i=>sum & bit(i));
    return {rank:rank(rows),sum:support.map(i=>"P"+i).join(" + ") || "0"};
  }

  if (typeof module!=="undefined" && module.exports) module.exports={grades,births,inspect,imageRank,comparison};
  if (typeof document==="undefined") return;
  const el=id=>document.getElementById(id);
  const state={which:"I",grade:[0,2],target:[2,2],focus:"2"};
  const buttons=[];
  const option=(value,label)=>new Option(label,value);
  function applyGrade(g) {
    state.grade=g;
    if (!below(g,state.target)) state.target=[2,2];
    const born=inspect(state.which,g).born;
    state.focus=born.length===1 ? String(born[0]) : "";
    refresh();
  }
  function buildGrid() {
    const grid=el("grades");
    function tick(label) {
      const t=document.createElement("span"); t.className="tick"; t.textContent=label; grid.append(t);
    }
    for (let y=2;y>=0;y--) {
      tick("y "+y);
      for (let x=0;x<=2;x++) {
        const grade=[x,y], b=document.createElement("button");
        b.type="button"; b.className="bf-grade"; b.dataset.grade=key(grade);
        b.addEventListener("click",()=>applyGrade(grade)); buttons.push([grade,b]); grid.append(b);
      }
    }
    tick(""); for (let x=0;x<=2;x++) tick("x "+x);
  }
  function renderCards() {
    for (const which of ["I","II"]) {
      const info=comparison(which), article=document.createElement("article"), header=document.createElement("header");
      article.className="bf-card";
      const title=document.createElement("h3"); title.textContent="Filtration "+which;
      const stat=document.createElement("span"); stat.className="bf-rank"; stat.textContent="Span rank "+info.rank;
      const eq=document.createElement("p"); eq.className="bf-equation"; eq.textContent="A + B + C = "+info.sum;
      const note=document.createElement("p");
      note.textContent=which==="I" ? "C uses P0 and P2. Adding A and B gives exactly C, so the three classes generate two independent directions." : "C uses P0 and P3. Its P3 edge is absent from both A and B, so it adds a third independent direction.";
      header.append(title,stat);article.append(header,eq,note);el("spans").append(article);
    }
  }
  const hubX=1.30;
  function position(i,t) {
    const a=2*Math.PI*i/5+0.38;
    return [(2*t-1)*hubX,Math.sin(Math.PI*t)*Math.cos(a)*1.13,Math.sin(Math.PI*t)*Math.sin(a)*.98];
  }
  function paint() {
    const model=inspect(state.which,state.grade);
    const focal=state.focus==="" ? 0 : word(paths[state.which][Number(state.focus)]);
    const palette=Object.fromEntries(["muted","line","jade","copper","violet","text"].map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue("--"+k).trim()]));
    const lines=[],points=[];
    for (let i=0;i<5;i++) {
      const live=Boolean(model.active & bit(i)), lit=Boolean(focal & bit(i));
      const color=lit?"copper":live?"jade":"line";
      for (const start of [0,.5]) {
        const coords=Array.from({length:15},(_,j)=>position(i,start+j/28));
        lines.push({coords,color,width:lit?4.1:live?2.8:1.3,alpha:live?1:.66,dash:live?[]:[4,5]});
      }
      points.push({point:position(i,.5),color:live?color:"muted",radius:live?5.4:3.2,label:"P"+i});
    }
    points.push({point:[-hubX,0,0],color:"text",radius:6.5,square:true,label:"L"},
                {point:[hubX,0,0],color:"text",radius:6.5,square:true,label:"R"});
    draw({lines,points,axes:[],grid:false,framingScale:.37,minExtent:1.3},palette);
  }
  const draw=Reasoning3D.bind(el("surface-view"),el("camera"),paint,()=>{});
  function refresh() {
    const {which,grade,target}=state;
    const m=inspect(which,grade);
    for (const [g,b] of buttons) {
      const v=inspect(which,g).dimension, marker=births.findIndex(p=>key(p)===key(g));
      const shown=marker<0 ? String(v) : names[marker]+" · "+v;
      b.textContent=shown; b.setAttribute("aria-pressed",String(key(g)===key(grade)));
      b.setAttribute("aria-label","Grade "+fmt(g)+", "+(marker<0?"":"loop "+names[marker]+", ")+"H1 dimension "+v);
    }
    for (const v of ["I","II"]) el("variant-"+v.toLowerCase()).setAttribute("aria-pressed",String(v===which));
    el("target").replaceChildren(...grades.filter(g=>below(grade,g)).map(g=>option(key(g),fmt(g))));
    el("target").value=key(target);
    el("focus").replaceChildren(option("","All active paths"),...m.born.map(i=>option(String(i),names[i]+" · "+paths[which][i].map(j=>"P"+j).join(" + "))));
    el("focus").value=state.focus;
    el("figure-grade").textContent="Filtration "+which+" · "+fmt(grade);
    el("edge-count").textContent=m.edges+" / 10";el("source-rank").textContent=m.dimension;
    el("map-rank").textContent=imageRank(which,grade,target);
    const caption=m.born.length===0?"Only vertices are present. No loop has been born.":
      m.born.length===1?"Loop "+names[m.born[0]]+" follows "+paths[which][m.born[0]].map(i=>"P"+i).join(" and ")+", returning along the second path.":
      key(grade)==="2,2"?"All five paths and the final face are present. Its boundary vanishes over 𝔽₂.":
      "Two birth thresholds have been reached, so all five paths enter. The face enters at (2, 2).";
    el("grade-note").textContent=caption;
    el("surface-view").setAttribute("aria-label","Filtration "+which+", grade "+fmt(grade)+". "+caption+" Active edges "+m.edges+" of ten.");
    paint();
  }
  buildGrid(); renderCards();
  for(const v of ["I","II"]) el("variant-"+v.toLowerCase()).addEventListener("click",()=>{state.which=v;refresh();});
  el("target").addEventListener("change",e=>{state.target=e.target.value.split(",").map(Number);refresh();});
  el("focus").addEventListener("change",e=>{state.focus=e.target.value;refresh();});
  new ResizeObserver(paint).observe(el("surface-view"));
  new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  refresh();
})();
