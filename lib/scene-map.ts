import { fitImageDimensions, type Asset, type Scene } from "./model";
type ImportSettings = {width:number;height:number;grid:{size:number;offsetX:number;offsetY:number}};
// Replacing map artwork preserves scene identity and all placed gameplay content.
export function attachSceneMap(scene: Scene, asset: Asset, settings?: ImportSettings) {
  scene.mapId=asset.id;
  scene.drawing=null;
  Object.assign(scene,fitImageDimensions(asset.width,asset.height,8000));
  if(settings){scene.width=settings.width;scene.height=settings.height;Object.assign(scene.grid,settings.grid,{type:"square"});}
}
