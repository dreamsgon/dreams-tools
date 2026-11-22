import { fitImageDimensions, type Asset, type Scene } from "./model";
type ImportSettings = {width:number;height:number;grid:{size:number;offsetX:number;offsetY:number}};
/** Names the app gives a scene before the GM names it: "Untitled scene", "New Encounter Map", "New Area Map", "New World Map". */
export const placeholderSceneName = (name: string) => /^(Untitled scene|New (Encounter|Area|World) Map)$/.test(name.trim());
// Replacing map artwork preserves scene identity and all placed gameplay content.
// A scene still under its placeholder name takes the uploaded map's name; a name the GM chose stays.
export function attachSceneMap(scene: Scene, asset: Asset, settings?: ImportSettings, mapName?: string) {
  if(mapName?.trim()&&placeholderSceneName(scene.name))scene.name=mapName.trim().slice(0,120);
  scene.mapId=asset.id;
  scene.drawing=null;
  Object.assign(scene,fitImageDimensions(asset.width,asset.height,8000));
  if(settings){scene.width=settings.width;scene.height=settings.height;Object.assign(scene.grid,settings.grid,{type:"square"});}
}
