"use strict";

const ReasoningScenes = (() => {
  const math = LatentReasoning;
  const {staged, colors} = Reasoning3D;
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const pairs = [[0,1],[1,2],[2,0]];
  const codes = ["EUR","USD","JPY"];
  const shortlist = ["jade","copper","blue","violet"];

  function topology(frame, a, b) {
    const edge = (u,v) => frame.edges.find(e => e.from === codes[u] && e.to === codes[v]);
    const forward = edge(a,b), reverse = edge(b,a);
    return [Math.log1p(Math.max(0,-forward.bps-reverse.bps)),
      Math.log1p(Math.max(forward.age,reverse.age)/250)];
  }

  function earlierMaps(target, frame, examples, selected) {
    const before = Date.parse(frame.utc);
    return examples.flatMap((item, index) => {
      if (index === selected || Date.parse(item.frames.at(-1).utc) >= before) return [];
      const ranked = permutations.map((map, order) => {
        const distortion = pairs.reduce((sum,[a,b]) => {
          const reference = topology(item.frames[0],map[a],map[b]);
          return sum + math.norm(math.sub(topology(frame,a,b),reference)) ** 2;
        },0);
        const swap = [[0,1],[0,2],[1,2]].filter(([a,b]) => map[a]>map[b]).length % 2;
        const delta = math.sub(item.states.at(-1).point,item.states[0].point);
        if (swap) delta[0] = -delta[0];
        return {map, order, distortion, swap, delta, target};
      }).sort((a,b) => a.distortion-b.distortion || a.order-b.order);
      return [{item,index,ranked,score:ranked[0].distortion}];
    }).sort((a,b) => a.score-b.score || a.index-b.index);
  }

  function analogy(sources, selected, mapping, strength, target) {
    const result = {axes:["Graph layout X","Graph layout Y","Search stage"],points:[],lines:[],faces:[]};
    if (!sources.length) return {result};
    const source = sources.find(entry => entry.index === selected) || sources[0];
    const candidate = source.ranked.find(entry => entry.order === mapping) || source.ranked[0];
    const triangle = (shift,depth) => [[shift,1.05,depth],[shift-0.58,0.12,depth],[shift+0.58,0.12,depth]];
    const a = triangle(-0.86,-0.82), b = triangle(0.86,0.82);
    for (const [verts,color,caption] of [[a,"jade","source"],[b,"copper","query"]]) {
      result.faces.push({coords:verts,color,alpha:.13});
      for (const [u,v] of pairs) result.lines.push({coords:[verts[u],verts[v]],color,width:1.8,arrow:true});
      verts.forEach((point,i) => result.points.push({point,color,label:codes[i],radius:5}));
      result.points.push({point:[verts[0][0]-.3,1.43,verts[0][2]],color,label:caption,radius:0.01});
    }
    candidate.map.forEach((from,to) => result.lines.push({coords:[a[from],b[to]],color:"text",dash:[4,4],alpha:.75,width:1.1}));
    for (const [index,s] of sources.entries()) {
      const color = colors[index % colors.length];
      const root = [-1.3 + index * 2.6,-0.54,-1.15];
      result.points.push({point:root,color,radius:4.8,label:"Source " + (index+1)});
      s.ranked.forEach((path,i) => {
        const leaf = [root[0] + (i/5-.5)*1.15,-1.2 + .27/(1+path.distortion),.45];
        const chosen = s === source && path === candidate;
        result.points.push({point:leaf,color:chosen?"text":color,radius:chosen?5.5:3.2,alpha:chosen?1:.55,
          id:`source-${s.index}-map-${path.order}`});
        result.lines.push({coords:[root,leaf],color,alpha:chosen?.95:.4,arrow:chosen});
      });
    }
    return {result,source,candidate,prediction:math.add(target,math.scale(candidate.delta,strength))};
  }

  function steering(projection, runIndex, methodId, axisId, dose) {
    const run = projection.runs[runIndex];
    const method = run.methods.find(row => row.id === methodId) || run.methods[0];
    const origin = projection.origin;
    const result = {axes:projection.axis_labels,minExtent:.17,points:[{point:origin,color:"text",radius:5,square:true}],lines:[]};
    let active;
    for (const axis of method.axes) {
      const chosen = axis.axis_id === axisId;
      const color = shortlist[(axis.axis_id-1) % shortlist.length];
      const positions = axis.points.map(row => row.point);
      result.lines.push({coords:positions,color,alpha:chosen?1:.44,width:chosen?2.7:1.3,arrow:true});
      axis.points.forEach(row => result.points.push({point:row.point,color,radius:chosen?3.5:2.3,alpha:chosen?1:.46}));
      if (chosen) {
        const point = math.scale(axis.unit_vector_pca3,dose);
        const outcome = axis.points.find(row => Math.abs(row.dose - dose) < 1e-9)?.margin_delta_bps;
        active = {point,outcome,axis};
        result.points.push({point,color:"text",radius:7,label:`Dose ${dose.toFixed(2)}`});
      }
    }
    return {result,active,method};
  }

  function flow(data, split, count, seed, stage) {
    const report = data.views[split];
    const dz = [-1.5,0,1.5];
    const result = {axes:["State coordinate 1","State coordinate 2","Flow stage"],minExtent:2.8,points:[],lines:[],faces:[]};
    if (stage===2) {
      const {grid} = data;
      const d = report.terminal_reward_density_relative;
      for (let i=0; i<grid.length-1; i+=2) for (let j=0; j<grid.length-1; j+=2) {
        const alpha = (d[i][j]+d[i+2][j]+d[i][j+2]+d[i+2][j+2])/12;
        if (alpha > .015) result.faces.push({coords:[[grid[i],grid[j],dz[2]],[grid[i+2],grid[j],dz[2]],
          [grid[i+2],grid[j+2],dz[2]],[grid[i],grid[j+2],dz[2]]],color:"jade",alpha});
      }
    }
    for (let i=0; i<count; i++) {
      const coords = report.trajectories[(seed*13+i)%report.trajectories.length].slice(0,stage+1)
        .map((value,index) => staged(value,dz[index]));
      if (coords.length > 1) result.lines.push({coords,color:"jade",alpha:.39,arrow:true});
      result.points.push({point:coords[0],color:"blue",alpha:.68,radius:2.6});
      if (stage > 0) result.points.push({point:coords.at(-1),color:stage===2?"copper":"violet",alpha:.85,radius:2.7});
    }
    return {result,report};
  }

  return {earlierMaps, analogy, steering, flow};
})();
