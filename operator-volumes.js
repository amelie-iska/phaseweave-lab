"use strict";

const TensorVolumes=(()=>{
  function scene(){
    return {axes:[],grid:false,minExtent:1.2,framingScale:.5,faces:[],lines:[],points:[]};
  }
  function box(out,center,dimensions,color,opacity){
    const [dx,dy,dz]=dimensions.map(size=>size/2), [x,y,z]=center;
    const corner=(a,b,c)=>[x+a*dx,y+b*dy,z+c*dz];
    const xy=c=>[corner(-1,-1,c),corner(1,-1,c),corner(1,1,c),corner(-1,1,c)];
    const xz=b=>[corner(-1,b,-1),corner(1,b,-1),corner(1,b,1),corner(-1,b,1)];
    const yz=a=>[corner(a,-1,-1),corner(a,1,-1),corner(a,1,1),corner(a,-1,1)];
    const faces=[...[-1,1].map(xy),...[-1,1].map(xz),...[-1,1].map(yz)];
    faces.forEach((coords,i)=>{
      const alpha=opacity*[.54,.76,.34,.91,.50,.61][i];
      out.faces.push({coords,color,alpha});
      out.lines.push({coords:[...coords,coords[0]],color,alpha:Math.min(.87,alpha+.12),width:.7});
    });
  }
  function label(out,point,text,color="text",id){
    out.points.push({point,label:text,color,id,radius:id===undefined?1:3});
  }
  function architecture(operations,active){
    const out=scene();
    out.framingScale=.45;
    const stages=[];
    operations.forEach((op,index)=>{
      const previous=stages[stages.length-1];
      if(previous?.name===op.stage)previous.count++;
      else stages.push({name:op.stage,index,count:1});
    });
    const readable=name=>name.replace(/^local-(\d+)$/,"Local $1")
      .replace(/^hybrid-attention$/,"Token attention")
      .replace(/^spatial-(\d+)$/,"Spatial $1").replace(/^temporal-(\d+)$/,"Temporal $1")
      .replace(/^phase-patch$/,"Phase patch").replace(/^surface$/,"Torus branch")
      .replace(/^input$/,"Market input").replace(/^tokenizer$/,"Tokenization")
      .replace(/^readout$/,"Forecast head");
    const gap=2.85/Math.max(3,stages.length-1);
    stages.forEach((stage,index)=>{
      const y=1.42-index*gap;
      const selected=active>=stage.index&&active<stage.index+stage.count;
      const color=selected?"copper":index%2?"jade":"violet";
      const rows=Math.min(8,stage.count), columns=8;
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const center=[(col-3.5)*.115,y,(row-(rows-1)/2)*.10];
        box(out,center,[.108,Math.min(.085,gap*.45),.094],color,selected?.56:.28);
        if(col===3&&row===Math.floor(rows/2))out.points.push({point:center,id:stage.index,radius:selected?3:2,color});
      }
      if(index<stages.length-1)out.lines.push({
        coords:[[0,y-gap*.21,0],[0,y-gap*.79,0]],color:selected?"copper":"muted",alpha:.75,arrow:true,
      });
      label(out,[.61,y,.13],readable(stage.name),color,stage.index);
    });
    return out;
  }
  function contraction(sample,index){
    const out=scene();
    const products=sample.products||[];
    if(!products.length)return out;
    const count=Math.min(12,products.length),start=Math.max(0,Math.min(products.length-count,index-Math.floor(count/2)));
    const groups=[sample.left,sample.right,products];
    const names=["Left factors","Right factors",sample.reducer==="max"?"Additive path scores":"Pairwise products"];
    const colors=["jade","violet","copper"];
    const levels=[.82,.24,-.34];
    const p=(j,level)=>[(j-(count-1)/2)*.21,levels[level],level===1?-.18:.04];
    groups.forEach((group,level)=>{
      const magnitude=Math.max(1e-12,...group.slice(start,start+count).map(Math.abs));
      for(let i=0;i<count;i++){
        const value=group[start+i], focus=start+i===index, center=p(i,level);
        const height=.09+.28*Math.sqrt(Math.abs(value)/magnitude);
        center[1]+=Math.sign(value)*height*.31;
        box(out,center,[.18,height,.41],focus?"text":colors[level],focus?.75:.30+height);
        label(out,[center[0],center[1]+height*.58,center[2]],focus?String(start+i+1):"",colors[level],start+i);
      }
      label(out,[-1.45,levels[level],-.23],names[level],colors[level]);
    });
    const cell=index-start;
    out.lines.push({coords:[p(cell,0),p(cell,1),p(cell,2),[0,-1.02,0]],color:"text",alpha:.83,width:1.3,arrow:true});
    box(out,[0,-1.1,0],[.35,.2,.42],"copper",.75);
    label(out,[.26,-1.11,.16],sample.reducer==="max"?"Max over terms":"Sum + bias","copper");
    return out;
  }
  return {architecture,contraction};
})();
