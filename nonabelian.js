"use strict";
(() => {
 const el=id=>document.getElementById(id), n=id=>Number(el(id).value);
 const colors={text:"#f5efe2",muted:"#8ca5a9",line:"#53717e",jade:"#85dfbf",copper:"#f7b185",blue:"#55798f",violet:"#bf99dd"};
 const N=NonAbelian; let archive,mesh,scene,timer;
 const draw=Reasoning3D.bind(el("latent-chart"),el("camera"),()=>scene && draw(scene,colors),()=>{});
 const options=(e,rows)=>e.replaceChildren(...rows.map(([v,s])=>new Option(s,v)));
 const stop=()=>{clearInterval(timer);timer=null;el("advance").textContent="Play circuit";el("advance").setAttribute("aria-pressed","false");};
 function surface() {
   mesh=SurfaceGenus.build(n("genus"));
   options(el("handle"),mesh.handles.map((h,i)=>[i,"Handle "+h.id]));el("step").value=0;
 }
 function render() {
   if(!archive) return;
   const frame=archive[n("episode")].frames[n("frame")], h=mesh.handles[n("handle")];
   el("utc").textContent=frame.utc.replace("T"," ").replace("+00:00"," UTC");el("utc").dateTime=frame.utc;
   const raw=N.connection(mesh,frame,el("model").value==="common"),g=N.gauge(mesh,n("gauge"));
   const link=N.transform(raw,g), {A,B,AB,BA,C,wilson,orderGap}=N.marked(link,h);
   const M=h.meridian,L=h.longitude;
   const close=c=>[...c,c[0]];
   const sections=[close(M),close(L),close(M).reverse(),close(L).reverse()];
   const path=[M[0],...sections.flatMap(s=>s.slice(1))];
   el("step").max=path.length-1;const step=n("step");
   let prefix=N.identity;
   for(let i=0;i<step;i++) prefix=N.mul(prefix,link(path[i],path[i+1]));
   const seg=step<=M.length?"A":step<=M.length+L.length?"B":step<=2*M.length+L.length?"A⁻¹":"B⁻¹";
   el("position").textContent=step===0?"Start at the shared base point":step===path.length-1?"Circuit complete at its base point":"Step "+step+" of "+(path.length-1)+" · "+seg;
   const q=x=>"("+x.map(v=>(Math.abs(v)<.00005?0:v).toFixed(4)).join(", ")+")";
   const values=[["Order gap",orderGap.toFixed(7)],["W(C)",wilson.toFixed(7)],["W(A) / W(B)",A[0].toFixed(5)+" / "+B[0].toFixed(5)],["AB",q(AB)],["BA",q(BA)],["Current product",q(prefix)],["Maximum quote age",Math.max(...N.channels(frame).map(f=>f.age)).toLocaleString("en-US")+" ms"]];
   el("metrics").replaceChildren(...values.map(([key,val])=>{const row=document.createElement("tr"),th=document.createElement("th");th.scope="row";th.textContent=key;row.append(th);row.insertCell().textContent=val;return row;}));
   el("extent").textContent="g = "+mesh.genus+" · χ = "+mesh.chi;
   const scale=4.5/Math.max(mesh.width,mesh.height), pos=mesh.vertices.map(([x,y,z])=>[(x-mesh.width/2)*scale,(z-.5)*scale*1.7,(y-mesh.height/2)*scale]);
   const route=ids=>ids.map(i=>pos[i]);
   const lines=mesh.edges.map(edge=>({coords:route(edge),color:"muted",width:.65,alpha:.4}));
   lines.push({coords:route(close(M)),color:"jade",width:3.5,arrow:true},{coords:route(close(L)),color:"copper",width:3.5,arrow:true});
   if(step)lines.push({coords:route(path.slice(step-1,step+1)),color:"text",width:5,arrow:true});
   scene={grid:false,axes:[],framingScale:.42,points:[{point:pos[path[step]],color:"text",radius:5}],lines,
    faces:mesh.faces.map(face=>({coords:route(face),color:"blue",alpha:.30}))};
   draw(scene,colors);
 }
 options(el("genus"),[2,3,4,5,6,7,8].map(v=>[v,v]));surface();
 for(const id of ["episode","frame","genus","handle","model","gauge","step"]) el(id).addEventListener("input",()=>{
   stop();
   if(id==="genus")surface();
   if(id==="handle")el("step").value=0;
   if(id==="episode"){el("frame").value=0;el("frame").max=archive[n("episode")].frames.length-1;}
   render();
 });
 el("advance").addEventListener("click",()=>{
   if(!archive)return;
   if(timer){stop();return;}
   if(n("step")===Number(el("step").max))el("step").value=0;
   el("advance").textContent="Pause circuit";el("advance").setAttribute("aria-pressed","true");
   timer=setInterval(()=>{el("step").value=n("step")+1;render();if(n("step")===Number(el("step").max))stop();},350);
 });
 window.addEventListener("resize",()=>{if(scene)draw(scene,colors);});
 fetch("replay.json").then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
   archive=data;options(el("episode"),data.map((e,i)=>[i,e.label]));el("frame").max=data[0].frames.length-1;render();
 }).catch(()=>{el("utc").textContent="Historical replay unavailable";});
})();
