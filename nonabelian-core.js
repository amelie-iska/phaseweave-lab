"use strict";

// Unit quaternions in the basis (1, -iσx, -iσy, -iσz).
const NonAbelian = (() => {
  const pairs = [["EUR","JPY"],["EUR","USD"],["USD","JPY"]];
  const identity = [1,0,0,0];
  const inverse = ([w,x,y,z]) => [w,-x,-y,-z];
  const distance = (a,b) => Math.hypot(...a.map((x,i)=>x-b[i]));
  function mul([a,x,y,z],[b,u,v,w]) {
    return [a*b-x*u-y*v-z*w, a*u+b*x+y*w-z*v, a*v+b*y+z*u-x*w, a*w+b*z+x*v-y*u];
  }
  function exp(v) {
    const t=Math.hypot(...v), s=t ? Math.sin(t)/t : 1;
    return [Math.cos(t),...v.map(x=>s*x)];
  }
  function channels(frame) {
    if (frame.edges.length!==6) throw Error("Expected six directed quote records");
    return pairs.map(([base,quote])=>{
      function directed(a,b,side) {
        const match=frame.edges.filter(e=>e.from===a && e.to===b && e.side===side);
        if (match.length!==1 || !Number.isFinite(match[0].bps) || !Number.isFinite(match[0].age) || match[0].age<0)
          throw Error("Missing or invalid archived quote channel");
        return match[0];
      }
      const f=directed(base,quote,"bid"), r=directed(quote,base,"inverse_ask");
      return {mid:(f.bps-r.bps)/2,spread:-(f.bps+r.bps),age:Math.max(f.age,r.age)};
    });
  }
  function connection(mesh,frame,abelian=false) {
    const input=channels(frame), links=new Map();
    for (const [u,v] of mesh.edges) {
      const a=mesh.vertices[u], b=mesh.vertices[v];
      const d=a.findIndex((x,i)=>x!==b[i]), {mid,spread,age}=input[d];
      const xyz=[Math.tanh(mid/2),Math.tanh(spread/2),age/(age+1000)];
      const amplitude=0.65 + 0.25*(a[0]+b[0])/(2*mesh.width) + 0.10*(a[1]+b[1])/(2*mesh.height);
      const sign=Math.sign(b[d]-a[d]);
      const vector=Array.from({length:3},(_,i)=>amplitude*sign*xyz[(i-d+3)%3]);
      // A common generator preserves the length of each positive-direction generator.
      const q=exp(abelian ? [sign*Math.hypot(...vector),0,0] : vector);
      links.set(u+":"+v,q);
      links.set(v+":"+u,inverse(q));
    }
    return (u,v)=>{
      const link=links.get(u+":"+v);
      if (!link) throw Error("Path leaves surface edges");
      return link;
    };
  }
  function gauge(mesh,strength) {
    return mesh.vertices.map(([x,y,z])=>exp([.43*Math.sin(.7*x+.2),.51*Math.cos(.4*y+.1),.37*Math.sin(x-y+z+1)].map(v=>strength*v)));
  }
  const transform=(link,g)=>(u,v)=>mul(mul(g[u],link(u,v)),inverse(g[v]));
  function loop(link,cycle) {
    return cycle.reduce((q,u,i)=>mul(q,link(u,cycle[(i+1)%cycle.length])),identity);
  }
  function marked(link,handle) {
    const {meridian:a,longitude:b}=handle;
    if (a[0]!==b[0]) throw Error("Marked loops must share a base point");
    const A=loop(link,a), B=loop(link,b), AB=mul(A,B), BA=mul(B,A);
    const C=mul(mul(AB,inverse(A)),inverse(B));
    return {A,B,AB,BA,C,orderGap:Math.SQRT2*distance(AB,BA),wilson:C[0]};
  }
  return Object.freeze({pairs,channels,mul,inverse,identity,distance,exp,connection,gauge,transform,loop,marked});
})();
if (typeof module!=="undefined" && module.exports) module.exports=NonAbelian;
