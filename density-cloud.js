"use strict";

const DensityCloud = (() => {
  const sites = [[-.94, 0, .36], [.83, .05, .55], [.08, .16, -.99]];
  const width = 320, height = 182;
  const clip = value => Math.max(0, Math.min(1, value));
  const sum = a => a.reduce((s, v) => s + v, 0);
  const darkColors = [[77, 235, 203], [255, 171, 100], [183, 154, 252]];
  const lightColors = [[0, 108, 93], [174, 67, 13], [94, 54, 160]];
  const componentColors = { dark: [[96,206,255],[255,179,112],[217,140,255]],
    light: [[4,91,143],[153,75,9],[129,54,145]] };

  function blend(a, b, fraction) {
    return a.map((row, i) => row.map((v, k) => v + (b[i][k] - v) * fraction));
  }

  function continuity(previous, current, links, flux, fraction) {
    const net = [0, 0, 0];
    links.forEach(({source, target}, k) => {
      net[source] -= fraction * flux[k];
      net[target] += fraction * flux[k];
    });
    return Math.max(...current.map((row, i) => Math.abs(sum(row) - sum(previous[i]) - net[i])));
  }

  function project(v, yaw) {
    const a = yaw * Math.PI / 180;
    const x = Math.cos(a)*v[0] - Math.sin(a)*v[2];
    const z = Math.sin(a)*v[0] + Math.cos(a)*v[2];
    return [width * .5 + 86*x, height * .49 + 72*(.72*z-.694*v[1])];
  }

  function geometry(yaw) {
    const xy = sites.map(p => project(p, yaw));
    // Each fixed site kernel has a round core and two elongated Gaussian lobes.
    // Their 2D covariances are the orthographic projections of axial 3D Gaussians.
    const kernels = sites.map((p, site) => {
      const lobes = [{cx:xy[site][0], cy:xy[site][1], xx:80, yy:56, xy:0, weight:.28}];
      for (let other = 0; other < sites.length; other++) {
        if (other === site) continue;
        const length = Math.hypot(...sites[other].map((v,k) => v-p[k]));
        const dx = (xy[other][0]-xy[site][0])/length;
        const dy = (xy[other][1]-xy[site][1])/length;
        const transverse = .19**2, axial = .40**2-transverse;
        lobes.push({cx:xy[site][0]+.24*dx, cy:xy[site][1]+.24*dy,
          xx:86**2*transverse+axial*dx*dx, yy:72**2*transverse+axial*dy*dy,
          xy:axial*dx*dy, weight:.36});
      }
      const out = new Float64Array(width*height);
      for (const l of lobes) {
        const det = l.xx*l.yy-l.xy*l.xy, scale = l.weight/(2*Math.PI*Math.sqrt(det));
        for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
          const dx=x+.5-l.cx, dy=y+.5-l.cy;
          out[y*width+x] += scale*Math.exp(-.5*(l.yy*dx*dx-2*l.xy*dx*dy+l.xx*dy*dy)/det);
        }
      }
      const norm = sum(out);
      return out.map(v => v/norm);
    });
    return {xy,kernels};
  }

  function build(canvas) {
    const offscreen = document.createElement("canvas");
    offscreen.width=width; offscreen.height=height;
    const raster=offscreen.getContext("2d");
    const ctx=canvas.getContext("2d");
    if (!ctx || !raster) return () => {};
    const pixels=raster.createImageData(width,height);
    let lastYaw=null, shape;
    return function draw(rows, names, mode, yaw, light) {
      if (yaw !== lastYaw) { shape=geometry(yaw); lastYaw=yaw; }
      const siteColors=light?lightColors:darkColors;
      const colors=mode==="site"?siteColors:componentColors[light?"light":"dark"];
      const component=mode.startsWith("component-") ? Number(mode.slice(-1)) : null;
      const totals=rows.map(row => component===null ? sum(row) : row[component]);
      const pigments=rows.map((row,i) => [0,1,2].map(c => {
        if (mode==="site") return totals[i]*colors[i][c];
        if (component!==null) return totals[i]*colors[component][c];
        return sum(row.map((v,k) => v*colors[k][c]));
      }));
      const [a,b,c]=shape.kernels;
      for (let i=0; i<a.length; i++) {
        const mass=a[i]*totals[0]+b[i]*totals[1]+c[i]*totals[2];
        const offset=i*4;
        if (mass<1e-9) {pixels.data[offset+3]=0;continue;}
        const exposure=1-Math.exp(-6500*mass);
        // Fixed contour levels are common to every time slice and either basis.
        const level=mass*10000;
        const contour=[.32,.9,2.2,4.8].reduce((v,t)=>Math.max(v,Math.max(0,1-Math.abs(level/t-1)/.075)),0);
        const lift=(light?.15:.27)*contour+(!light?.32:0)*exposure**3;
        for(let k=0;k<3;k++) {
          const v=(a[i]*pigments[0][k]+b[i]*pigments[1][k]+c[i]*pigments[2][k])/mass;
          pixels.data[offset+k]=v*(1-lift)+(light?10:250)*lift;
        }
        pixels.data[offset+3]=255*clip(exposure+.20*contour);
      }
      raster.putImageData(pixels,0,0);
      const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
      const dpr=Math.min(window.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)) {
        canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
      }
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle=light?"#eef1e9":"#081717";ctx.fillRect(0,0,w,h);
      const s=Math.min(w/width,h/height), ox=(w-width*s)/2, oy=(h-height*s)/2;
      ctx.save();ctx.translate(ox,oy);ctx.scale(s,s);
      ctx.strokeStyle=light?"#d6ded5":"#162d2b";ctx.lineWidth=.45;
      for(let i=-5;i<=5;i++) {
        for(const ends of [[[i/3,-.12,-1.7],[i/3,-.12,1.7]],[[-1.7,-.12,i/3],[1.7,-.12,i/3]]]) {
          const [start,end]=ends.map(v=>project(v,yaw));ctx.beginPath();ctx.moveTo(...start);ctx.lineTo(...end);ctx.stroke();
        }
      }
      ctx.drawImage(offscreen,0,0);
      ctx.strokeStyle=light?"#65847c":"#74948a";ctx.lineWidth=.55;ctx.setLineDash([2,2.7]);
      ctx.beginPath();shape.xy.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
      shape.xy.forEach(([x,y],i)=>{
        ctx.fillStyle=light?"#152825":"#fff5db";ctx.strokeStyle=light?"#fff":"#0b1c1a";ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(x,y,2.1,0,Math.PI*2);ctx.fill();ctx.stroke();
      });
      ctx.restore();
      const font=Math.max(11,Math.min(14,w/40));
      ctx.font='600 '+font+'px ui-monospace, monospace';ctx.textBaseline="middle";
      shape.xy.forEach(([x,y],i)=>{
        const px=ox+s*x+7, py=oy+s*y-13;
        const t=names[i];const tw=ctx.measureText(t).width;
        ctx.fillStyle=light?"rgba(247,249,240,.92)":"rgba(5,19,19,.87)";ctx.fillRect(px-3,py-font*.68,tw+6,font*1.36);
        ctx.fillStyle=light?"#213c35":"#f0f2dd";ctx.fillText(t,px,py);
      });
    };
  }

  return {blend,continuity,geometry,build};
})();
if (typeof module !== "undefined") module.exports = DensityCloud;
