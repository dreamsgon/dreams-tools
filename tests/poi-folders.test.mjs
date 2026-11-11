import test from "node:test";
import assert from "node:assert/strict";
import {canMovePoiFolder,movePoiFolder,deletePoiFolder,poiFolderPath} from "../lib/poi-folders.ts";
const folder=(id,parentId=null)=>({id,name:id,parentId});
test("POI folder moves reject descendants, self, missing parents and cycles",()=>{
 const folders=[folder("a"),folder("b","a"),folder("c","b")];
 assert.equal(canMovePoiFolder(folders,"a","c"),false);
 assert.equal(canMovePoiFolder(folders,"a","a"),false);
 assert.equal(canMovePoiFolder(folders,"a","missing"),false);
 assert.equal(canMovePoiFolder(folders,"missing",null),false);
 assert.equal(movePoiFolder(folders,"b",null),true);
 assert.equal(folders[1].parentId,null);
 assert.equal(canMovePoiFolder([folder("a","b"),folder("b","a"),folder("c")],"c","a"),false);
});
test("deleting a POI folder preserves markers and nested folders at root",()=>{
 const scene={poiFolders:[folder("a"),folder("b","a"),folder("c","b")],pointsOfInterest:[{folderId:"a"},{folderId:"b"},{folderId:null}]};
 assert.equal(poiFolderPath(scene.poiFolders,"c"),"a / b / c");
 deletePoiFolder(scene,"a");
 assert.deepEqual(scene.poiFolders,[folder("b"),folder("c","b")]);
 assert.deepEqual(scene.pointsOfInterest,[{folderId:null},{folderId:"b"},{folderId:null}]);
});
