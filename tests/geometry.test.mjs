import test from "node:test";
import assert from "node:assert/strict";
import {
  columnName,
  newScene,
  snap,
  hexCenter,
  hexCell,
  address,
  distance,
  pathDistance,
  workspaceSchema,
  initialWorkspace,
  fitImageDimensions,
  hexGridBounds,
} from "../lib/model.ts";
test('map resizing preserves narrow aspect ratios and does not upscale',()=>{
  assert.deepEqual(fitImageDimensions(8000,200,4096),{width:4096,height:102});
  assert.deepEqual(fitImageDimensions(80,1000,4096),{width:80,height:1000});
  assert.deepEqual(fitImageDimensions(12000,300,8000),{width:8000,height:200});
  const w=initialWorkspace();Object.assign(w.scenes[0],fitImageDimensions(80,1000,4096));
  assert.equal(workspaceSchema.safeParse(w).success,true);
});
for(const type of ['hex-flat','hex-pointy'])test(`${type}: render bounds include edge cells at extreme offsets`,()=>{
  for(const offsetX of [-500,500])for(const offsetY of [-500,500]){
    const g={...newScene().grid,type,size:20.5,offsetX,offsetY};
    const b=hexGridBounds(1000,700,g);
    for(const x of [0,500,1000])for(const y of [0,350,700]){
      const {q,r}=hexCell({x,y},g);
      const col=type==='hex-flat'?q:q+Math.floor(r/2);
      const row=type==='hex-flat'?r+Math.floor(q/2):r;
      assert.ok(col>=b.minCol&&col<=b.maxCol&&row>=b.minRow&&row<=b.maxRow);
    }
  }
});
test("coordinate labels extend past Z", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(701), "ZZ");
});
test("token footprints align for odd, even, fractional and small sizes", () => {
  const g = { ...newScene().grid, size: 50, offsetX: 12, offsetY: -8 };
  for (const size of [1, 2, 3, 4, 1.5, 2.5, 20]) {
    const p = snap({ x: 173, y: 214 }, g, size);
    assert.equal((p.x - g.offsetX) / g.size - size / 2, Math.round((p.x - g.offsetX) / g.size - size / 2));
    assert.equal((p.y - g.offsetY) / g.size - size / 2, Math.round((p.y - g.offsetY) / g.size - size / 2));
    assert.deepEqual(snap(p, g, size), p);
  }
  assert.deepEqual(snap({x:173,y:214},g,0.5),snap({x:173,y:214},g));
  assert.deepEqual(snap({x:173,y:214},{...g,snap:false},2),{x:173,y:214});
});
test("square snapping respects grid alignment", () => {
  const grid = { ...newScene().grid, offsetX: 12, offsetY: 8, size: 50 };
  assert.deepEqual(snap({ x: 80, y: 130 }, grid), { x: 87, y: 133 });
  assert.equal(address({ x: 87, y: 133 }, grid), "B3");
  assert.deepEqual(snap({ x: 80, y: 130 }, { ...grid, snap: false }), {
    x: 80,
    y: 130,
  });
});
for (const type of ["hex-flat", "hex-pointy"])
  test(`${type}: centers round trip and adjacent steps measure one unit`, () => {
    const g = {
      ...newScene().grid,
      type,
      size: 60,
      offsetX: 15,
      offsetY: -20,
      units: 2,
    };
    for (let q = -5; q < 10; q++)
      for (let r = -5; r < 10; r++) {
        const p = hexCenter(q, r, g);
        assert.deepEqual(hexCell(p, g), { q, r });
        assert.deepEqual(snap(p, g), p);
        assert.equal(distance(p, hexCenter(q + 1, r, g), g), 2);
      }
    assert.equal(
      address(hexCenter(2, 2, g), g),
      type === "hex-flat" ? "C4" : "D3",
    );
  });
test("measurement supports equal, alternating, and Euclidean diagonals", () => {
  const g = { ...newScene().grid, size: 50, units: 5 };
  assert.equal(distance({ x: 0, y: 0 }, { x: 100, y: 100 }, g), 10);
  assert.equal(
    distance(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { ...g, diagonal: "alternating" },
    ),
    15,
  );
  assert.equal(
    distance(
      { x: 0, y: 0 },
      { x: 150, y: 200 },
      { ...g, diagonal: "euclidean" },
    ),
    25,
  );
});
test("alternating diagonal cost continues across path waypoints", () => {
  const g = { ...newScene().grid, size: 50, units: 5, diagonal: "alternating" };
  assert.equal(
    pathDistance(
      [
        { x: 25, y: 25 },
        { x: 75, y: 75 },
        { x: 125, y: 125 },
      ],
      g,
    ),
    15,
  );
});
test("saved state rejects unsafe URLs and invalid dimensions", () => {
  const w = initialWorkspace();
  assert.equal(workspaceSchema.safeParse(w).success, true);
  w.assets.push({
    id: "test",
    name: "test",
    src: "javascript:alert(1)",
    width: 500,
    height: 500,
  });
  assert.equal(workspaceSchema.safeParse(w).success, false);
  w.assets = [];
  w.scenes[0].grid.size = 0;
  assert.equal(workspaceSchema.safeParse(w).success, false);
});
