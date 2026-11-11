import type {MapCrop, Scene} from "./model";

/** Snap rectangle edges to square-grid lines, including the map's outer edges. */
export function snapCropToGrid(crop:MapCrop, scene:Scene):MapCrop {
  if(scene.grid.type!=="square")return crop;
  const axis=(start:number,length:number,extent:number,offset:number)=>{
    const size=scene.grid.size;
    const lines=[0,extent];
    for(let n=Math.ceil(-offset/size);offset+n*size<extent;n++){
      const value=offset+n*size;if(value>0)lines.push(value);
    }
    lines.sort((a,b)=>a-b);
    const nearest=(value:number)=>lines.reduce((best,line)=>Math.abs(line-value)<Math.abs(best-value)?line:best,lines[0]);
    let left=nearest(start),right=nearest(start+length);
    if(right<=left){const next=lines.find(line=>line>left);if(next!==undefined)right=next;else left=lines[lines.length-2];}
    return {start:left,length:right-left};
  };
  const x=axis(crop.x,crop.width,scene.width,scene.grid.offsetX),y=axis(crop.y,crop.height,scene.height,scene.grid.offsetY);
  return {x:x.start,y:y.start,width:x.length,height:y.length};
}
