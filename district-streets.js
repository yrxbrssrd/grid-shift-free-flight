// Select ground-floor faces with room for a sidewalk. The first choice faces the nearest main street.
const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const lampColors = [0xffb478, 0xf0a4e2, 0xa5e6bb, 0xb8deff];

const outerStreets = [[89,-40,89,121],[-42,87,124,87],[-10,52,-10,129],[52,12,90,12],
  [89,-9.7,122,-9.7],[89,37.15,106,37.15],[-28.55,87,-28.55,106.35],[4.95,87,4.95,110.4]];
const oldStreets = [[0,-52,0,49],[-50,-16,52,-16],[-48,45,49,45]];
function roadDistance(x, z) {
  const streets = x > 64 || z > 65 ? outerStreets : oldStreets;
  return Math.min(...streets.map(([x0,z0,x1,z1]) => {
    const dx = x1-x0, dz = z1-z0;
    const t = Math.max(0, Math.min(1, ((x-x0)*dx + (z-z0)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-x0-t*dx, z-z0-t*dz);
  }));
}

// Small courtyards open up between the buildings. The playable approaches and waterfront stay clear.
function furnishCourtyards(blocks, tools) {
  const { station, marketStall, bench, planter, loading, counter, shopLights } = tools;
  const stationPlazas = [[111,-1],[121,81],[17,111]];
  const anchors = [
    [108,-35,'market'],[123,-18,'dock'],[108,17,'market'],[119,36,'dock'],
    [104,60,'metro'],[122,66,'garden'],[105,89,'metro'],[121,111,'garden'],[89,126,'metro'],
    [-26,115,'dock'],[-4,111,'market'],[25,108,'dock'],[45,110,'dock'],[57,119,'garden'],
    [-21,125,'garden'],[24,130,'market'],[67,104,'dock'],
  ];
  const offsets = [[0,0]];
  for (const distance of [2,4,6]) {
    for (const [x,z] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) offsets.push([x*distance,z*distance]);
  }
  const used=[];
  for (const [ax,az,type] of anchors) {
    const location = offsets.map(([dx,dz])=>[ax+dx,az+dz]).find(([x,z]) =>
      roadDistance(x,z)>8.6 &&
      stationPlazas.every(([px,pz])=>Math.abs(x-px)>10 || Math.abs(z-pz)>8) &&
      used.every(([px,pz])=>Math.hypot(x-px,z-pz)>7) &&
      blocks.every(b=>Math.max(Math.abs(x-b.x)-b.w/2,Math.abs(z-b.z)-b.d/2)>2.95));
    if(!location) continue;
    const [x,z]=location;
    used.push(location);
    const yaw = used.length%2===0 ? Math.PI/2 : 0;
    const color={market:0xffb977,dock:0xaacddd,metro:0xcfa0ff,garden:0xb1e6aa}[type];
    const site=station(x,z,yaw,color);
    site.box(0,.022,0,4.50,.05,2.98,0x5c6770);
    for (const end of [-1,1]) site.box(end*2.19,.072,0,.09,.075,2.86,0x788085);
    if(type==='market') {
      marketStall(x,z,used.length%2 ? 0x597a77 : 0x996848,used.length%4,yaw);
      produceCrates(site,1.85,used.length);
    } else if(type==='dock') {
      loading(site,3);
      freightPallet(site,1.52,used.length);
    } else if(type==='metro') {
      counter(site,1,true);
      bench(site,-1.47,.26);
      parcelLocker(site,1.59,color);
      for(const side of [-1,1]) site.round(side*2.01,.35,.99,.11,.70,.11,0x718090);
    } else {
      bench(site,0,-.31);
      for(const side of [-1,1]) {
        planter(site,side*1.45,.28,used.length);
        planter(site,side*1.45,-.43,used.length+1);
        site.box(side*.76,.18,.95,.26,.34,.28,0x384953);
        site.light(side*.76,.36,.95,.20,.038,.23,color);
      }
    }
    shopLights.push({x,y:1.17,z,color});
  }
}

function streetFaces(building, blocks) {
  const base = building.levels?.[0] ?? building;
  const faces = [];
  for (const [nx,nz] of directions) {
    const x = base.x + nx * base.w / 2, z = base.z + nz * base.d / 2;
    const span = nx ? base.d : base.w;
    const width = Math.min(span - .52, 5.4);
    if (width < 2.1) continue;
    // Allow a wall behind the shop, including its own wing, and reserve the whole shop front outside it.
    const clearance = [0, -.47, .47].every(offset =>
      [0.18, 1.30].every(depth => {
        const px = x + nx * depth + nz * offset * width;
        const pz = z + nz * depth - nx * offset * width;
        return blocks.every(b => Math.abs(px-b.x) > b.w/2+.04 || Math.abs(pz-b.z) > b.d/2+.04);
      }));
    if (!clearance) continue;
    faces.push({ x, z, nx, nz, width, span, yaw: Math.atan2(nx,nz), distance: roadDistance(x+nx*2,z+nz*2) });
  }
  return faces.sort((a,b) => a.distance-b.distance);
}

function produceCrates(shop, edge, seed) {
  for (let row=0; row<2; row++) {
    const x=edge + (row-.5)*.38;
    shop.box(x,.20,.46,.35,.34,.45,0x424f56);
    for (const side of [-1,1]) shop.box(x+side*.159,.36,.46,.034,.055,.48,0xba9270);
    shop.box(x,.361,.67,.34,.058,.038,0xb28d6b);
    for(let item=0;item<6;item++) {
      const tint = [0xa9aa8d,0xad7056,0x708b77][(seed+row)%3];
      shop.round(x+(item%2-.5)*.12,.368,.36+Math.floor(item/2)*.097,.113,.10,.123,tint);
    }
  }
}

function parcelLocker(shop, edge, tint) {
  shop.box(edge,.60,.21,.87,1.16,.36,0x2c3b48);
  for (let col=0;col<2;col++) for(let row=0;row<4;row++) {
    const dx=edge+(col-.5)*.403, y=.19+row*.268;
    shop.box(dx,y,.407,.377,.239,.034,row===2&&col===0?0x718b8a:0x657580);
    shop.box(dx+.093,y+.016,.433,.088,.022,.021,0x27313b);
  }
  shop.light(edge,.994,.436,.137,.045,.024,tint);
}

function freightPallet(shop, edge, seed) {
  for (const rail of [-1,0,1]) shop.box(edge+rail*.30,.072,.53,.095,.12,.68,0x765746);
  for (let slat=0;slat<4;slat++) shop.box(edge,.144,.29+slat*.15,.88,.045,.115,0x9e8265);
  const tints=[0x956551,0x727c75,0x687784];
  for (let stack=0;stack<2;stack++) {
    const y=.327+.306*stack;
    shop.box(edge,y,.50,.75,.295,.51,tints[(stack+seed)%3]);
    for (const side of [-1,1]) {
      shop.box(edge+side*.23,y,.762,.037,.292,.015,0x394352);
      shop.box(edge+side*.23,y+.149,.50,.04,.013,.50,0x465268);
    }
    shop.box(edge-.135,y+.036,.767,.12,.072,.012,0xcbba97);
  }
}

// Landmarks use small physical fittings and share the street renderer's instanced meshes and materials.
export function furnishDistrictStreets(buildings, existing, tools) {
  const { station, storefront, dockDoor, bench, planter, shopLights } = tools;
  const blocks = buildings.flatMap(b => (b.levels ?? [b]).filter(level => !level.bottom));
  buildings.forEach((building, i) => {
    if (existing.has(building.x+','+building.z)) return;
    const faces = streetFaces(building, blocks);
    const waterfront = building.x > 64 && building.z < 49;
    const heights = building.x > 68 && building.z >= 49;
    const yard = building.z > 64 && building.x <= 68;
    const exterior = waterfront || heights || yard;
    // A corner unit can carry a second activity on its return wall.
    const count = exterior && i % 3 === 0 ? 2 : 1;
    faces.slice(0, count).forEach((face, side) => {
      const {x,z,nx,nz,yaw,width,span} = face;
      const seed=i+side*11;
      const workshop = yard ? seed%4!==0 : waterfront ? seed%5===1 : seed%7===3;
      const style=yard ? 3 : waterfront ? [2,3,0][seed%3] : heights ? [1,2,3,0][seed%4] : seed%4;
      const tint=workshop?0xffba7d:lampColors[style];
      const shop=station(x,z,yaw,tint);
      const frontWidth=Math.min(width, Math.max(2.1,span*.67));
      if (workshop) dockDoor(shop,frontWidth);
      else storefront(shop,frontWidth,style);
      const edge = ((seed % 2 ? 1 : -1) * (frontWidth/2+.55));
      // A second fixture stays within the length of the facade, out of the main pedestrian route.
      if (Math.abs(edge)+.52 < span/2 && span>5.9) {
        if (yard || workshop) freightPallet(shop,edge,seed);
        else if (waterfront) produceCrates(shop,edge,seed);
        else if(seed%3===0) { bench(shop,edge,.39); planter(shop,-edge,.34,seed); }
        else parcelLocker(shop,edge,tint);
      }
      if (exterior || seed%3===0) shopLights.push({x:x+nx*.78,y:2.25,z:z+nz*.78,color:tint});
    });
  });
  furnishCourtyards(blocks,tools);
}
