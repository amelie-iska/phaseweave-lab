"use strict";

const Reasoning3D = (() => {
  const colors = ["jade", "copper", "blue", "violet"];
  const DEFAULT_CAMERA = {yaw: -32, pitch: 24, zoom: 1};

  function bind(canvas, controls, onChange, onSelect) {
    const camera = {...DEFAULT_CAMERA};
    const sliders = Object.fromEntries([...controls.querySelectorAll("input")].map(input => [input.name, input]));
    let drag = null;
    let hits = [];
    function update() {
      for (const [key, input] of Object.entries(sliders)) input.value = camera[key];
      onChange();
    }
    for (const [key, input] of Object.entries(sliders)) input.addEventListener("input", () => {
      camera[key] = Number(input.value);
      onChange();
    });
    controls.querySelector("button").addEventListener("click", () => {
      Object.assign(camera, DEFAULT_CAMERA);
      update();
    });
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      drag = {x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (!drag) return;
      const x = event.clientX - drag.x, y = event.clientY - drag.y;
      camera.yaw = ((drag.yaw + x / 2 + 540) % 360) - 180;
      camera.pitch = Math.max(-85, Math.min(85, drag.pitch + y / 2));
      update();
    });
    canvas.addEventListener("pointerup", event => {
      if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) {
        const rect = canvas.getBoundingClientRect();
        const pointer = [event.clientX - rect.left, event.clientY - rect.top];
        const selected = hits.map(hit => ({...hit, gap: Math.hypot(hit.xy[0] - pointer[0], hit.xy[1] - pointer[1])}))
          .filter(hit => hit.gap < 12).sort((a, b) => a.gap - b.gap || b.depth - a.depth)[0];
        if (selected) onSelect(selected.id);
      }
      drag = null;
    });
    canvas.addEventListener("pointercancel", () => { drag = null; });

    return function draw(scene, palette) {
      const rect = canvas.getBoundingClientRect();
      const {width, height} = rect;
      if (width < 10 || height < 10) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      const yaw = camera.yaw * Math.PI / 180, pitch = camera.pitch * Math.PI / 180;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const coordinates = [...scene.points.map(node => node.point), ...scene.lines.flatMap(line => line.coords)];
      const range = Math.max(scene.minExtent ?? 1.2, ...coordinates.filter(p => p.length === 3).flatMap(p => p.map(Math.abs)));
      const unit = Math.min(width, height) * 0.31 * camera.zoom / range;
      function project(point) {
        const [x, y, z = 0] = point;
        const horizontal = cy * x + sy * z, radial = -sy * x + cy * z;
        const vertical = cp * y - sp * radial, depth = sp * y + cp * radial;
        const size = 1 / (1 - depth / (6.5 * range));
        return [width / 2 + horizontal * unit * size, height / 2 - vertical * unit * size, depth];
      }

      function stroke(coords, style) {
        const p = coords.map(project);
        ctx.globalAlpha = style.alpha ?? 1;
        ctx.lineWidth = style.width ?? 1;
        ctx.strokeStyle = palette[style.color] || style.color;
        ctx.setLineDash(style.dash || []);
        ctx.beginPath();
        p.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
        ctx.stroke();
        ctx.setLineDash([]);
        if (style.arrow && p.length > 1) {
          const [[ax, ay], [bx, by]] = p.slice(-2);
          const angle = Math.atan2(by-ay, bx-ax);
          if (Math.hypot(bx-ax, by-ay) > 10) {
            ctx.beginPath();
            ctx.moveTo(bx-8*Math.cos(angle-0.55), by-8*Math.sin(angle-0.55));
            ctx.lineTo(bx,by);
            ctx.lineTo(bx-8*Math.cos(angle+0.55), by-8*Math.sin(angle+0.55));
            ctx.stroke();
          }
        }
      }
      function polygon(coords, color, alpha) {
        ctx.fillStyle = palette[color] || color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        coords.map(project).forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
        ctx.closePath();
        ctx.fill();
      }
      const bound = range * 0.9;
      if (scene.grid !== false) for (let i = -4; i <= 4; i++) {
        const k = i * bound / 4;
        stroke([[-bound,k,0],[bound,k,0]], {color:"line", alpha:i ? 0.2 : 0.48});
        stroke([[k,-bound,0],[k,bound,0]], {color:"line", alpha:i ? 0.2 : 0.48});
      }
      scene.axes.forEach((name, index) => {
        const end = [0, 0, 0];
        end[index] = range * 1.04;
        stroke([[0,0,0],end], {color:"muted", alpha:0.75, width:1.2, arrow:true});
        const [x,y] = project(end);
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = palette.muted;
        ctx.fillText(name, Math.max(5, Math.min(width - ctx.measureText(name).width - 5, x+6)),
          Math.max(13, Math.min(height-8,y-5)));
      });
      const faces = (scene.faces || []).map(face=>({face,
        depth:face.coords.reduce((sum,point)=>sum+project(point)[2],0)/face.coords.length
      })).sort((a,b)=>a.depth-b.depth);
      for (const {face} of faces) polygon(face.coords,face.color,face.alpha);
      const drawables = scene.lines.map(line => ({line, depth: Math.min(...line.coords.map(p => project(p)[2]))}))
        .concat(scene.points.map(node => ({node, depth:project(node.point)[2]}))).sort((a,b) => a.depth-b.depth);
      hits = [];
      for (const {line, node, depth} of drawables) {
        if (line) { stroke(line.coords, line); continue; }
        const [x,y] = project(node.point);
        ctx.globalAlpha = node.alpha ?? 1;
        ctx.fillStyle = palette[node.color] || node.color;
        const size = node.radius ?? 3.5;
        if (node.square) ctx.fillRect(x-size,y-size,size*2,size*2);
        else {
          ctx.beginPath();
          ctx.arc(x,y,size,0,Math.PI*2);
          ctx.fill();
        }
        if (node.label) {
          ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(node.label, x+6, y-6);
        }
        if (node.id !== undefined && node.id !== null) hits.push({id: node.id, xy:[x,y],depth});
      }
      ctx.globalAlpha = 1;
    };
  }

  function staged(point, stage) { return [...point.slice(0, 2), stage]; }
  const distance = (a, b) => Math.hypot(...a.map((value,i) => value-b[i]));

  function forestScene(nodes, edges, budget, radius, selected, coordinateNames) {
    const shown = new Map(nodes.filter(node => node.depth <= budget).map(node => [node.id, node]));
    const lines = edges.filter(edge => shown.has(edge.source) && shown.has(edge.target)).map(edge => {
      const consensus = edge.kind.includes("consensus"), correction = /repair|correct|refine/.test(edge.kind);
      const from = shown.get(edge.source), to = shown.get(edge.target);
      return {coords:[from.point,to.point], color:consensus ? "text" : colors[(from.tree || 0) % colors.length],
        alpha:to.status === "pruned" ? 0.21 : 0.8, width:consensus ? 2 : 1.3,
        dash:correction ? [4,3] : [], arrow:correction || consensus};
    });
    const points = [...shown.values()].map(node => ({id:node.id, point:node.point,
      color:node.tree < 0 || node.id === selected ? "text" : colors[node.tree % colors.length],
      radius:node.id === selected ? 7 : node.depth === 0 ? 5.2 : 3.2, square:node.depth === 0,
      alpha:node.status === "pruned" ? 0.37 : 1}));
    const faces = [];
    const pivot = shown.get(selected);
    if (pivot && radius > 0) {
      const neighbors = [...shown.values()].filter(node => node !== pivot && distance(pivot.point,node.point) <= radius)
        .sort((a,b) => distance(pivot.point,a.point)-distance(pivot.point,b.point)).slice(0,8);
      for (const node of neighbors) lines.push({coords:[pivot.point,node.point],color:"violet",dash:[2,4],alpha:0.7});
      for (const [i,a] of neighbors.entries()) for (const b of neighbors.slice(i+1)) {
        if (distance(a.point,b.point) <= radius) faces.push({coords:[pivot.point,a.point,b.point],color:"violet",alpha:0.12});
      }
    }
    return {lines,points,faces,axes:coordinateNames};
  }

  return {bind, staged, distance, forestScene, colors};
})();
