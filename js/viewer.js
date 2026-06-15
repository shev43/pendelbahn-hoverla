// Pendelbahn Hoverla — коректна 3D модель на реальному рельєфі (DEM)
// Three.js r0.162 (ES modules / importmap)
// Рельєф: SRTM/NASADEM 1-arcsec N48E024 → js/data/elevation.json
// (c) 2026 shev43 — All Rights Reserved

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ──────────────────────────────────────────────────────────────────────────
//  Геопроєкція (локальні метри; початок = Заросляк). X — схід, Z — південь, Y — вгору.
// ──────────────────────────────────────────────────────────────────────────
const ORIGIN = { lat: 48.163685, lng: 24.537012 };           // Заросляк
const MLAT = 111132;
const MLON = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);  // ≈ 74225 м/° довготи
const ll2x = lng => (lng - ORIGIN.lng) * MLON;               // схід +
const ll2z = lat => -(lat - ORIGIN.lat) * MLAT;              // північ → −Z
const x2lng = x => ORIGIN.lng + x / MLON;
const z2lat = z => ORIGIN.lat - z / MLAT;

// Реальні координати об'єктів
const STN = {
    valley: { lat: 48.163635, lng: 24.537367, label: 'Заросляк',     elevN: 1259, tone: 0xe8e4e0 },  // у кадастровій ділянці
    summit: { lat: 48.168005, lng: 24.506125, label: 'Мала Говерла', elevN: 1760, tone: 0xc8cdd4 },
};
const TOWER_LL = { lat: 48.166397, lng: 24.518092 };          // долинна опора (точка користувача)
const START_LL = { lat: 48.163736, lng: 24.536650 };          // стартова опора (у кадастровій ділянці)
const PEAK_LL  = { lat: 48.160629, lng: 24.500385, elevN: 2061 };  // вершина Говерли

// Контур ділянки з KML (lng, lat) — увесь «квадрат» (чотирикутник)
const POLY_LL = [
    [24.51019981712708, 48.13116526453285],  // A · південний кут
    [24.58913130391342, 48.17093210549164],  // B · східний кут
    [24.53137797850865, 48.20810530908685],  // C · північний кут
    [24.45521201686113, 48.16280924082993],  // D · західний кут
];

function smooth01(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

// ──────────────────────────────────────────────────────────────────────────
//  DEM (вантажиться асинхронно з elevation.json)
// ──────────────────────────────────────────────────────────────────────────
let DEM = null;   // { rows, cols, step, lat0, lon0, data:[[...]] }
function demElev(lat, lng) {
    const r = (DEM.lat0 - lat) / DEM.step;
    const c = (lng - DEM.lon0) / DEM.step;
    let r0 = Math.floor(r), c0 = Math.floor(c);
    r0 = Math.min(Math.max(r0, 0), DEM.rows - 2);
    c0 = Math.min(Math.max(c0, 0), DEM.cols - 2);
    const fr = r - r0, fc = c - c0, d = DEM.data;
    return d[r0][c0] * (1 - fr) * (1 - fc) + d[r0][c0 + 1] * (1 - fr) * fc
         + d[r0 + 1][c0] * fr * (1 - fc) + d[r0 + 1][c0 + 1] * fr * fc;
}
const groundY = (x, z) => demElev(z2lat(z), x2lng(x));   // висота рельєфу в локальній точці

// Ортофото (Esri World Imagery) + дороги (OSM), вантажаться асинхронно
let ORTHO = null, ROADS = null, PARCEL = null, orthoTex = null;
const _mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
function orthoUV(x, z) {                              // UV у веб-меркаторі
    const lon = x2lng(x), lat = z2lat(z);
    const u = (lon - ORTHO.minLon) / (ORTHO.maxLon - ORTHO.minLon);
    const v = (_mercY(ORTHO.maxLat) - _mercY(lat)) / (_mercY(ORTHO.maxLat) - _mercY(ORTHO.minLat));
    return [u, v];
}

// ──────────────────────────────────────────────────────────────────────────
//  Сцена / камера / рендер
// ──────────────────────────────────────────────────────────────────────────
const container = document.getElementById('viewer-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
scene.fog = new THREE.Fog(0x9fc6e8, 7000, 26000);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 32000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 60;
controls.maxDistance = 16000;

// ──────────────────────────────────────────────────────────────────────────
//  Освітлення
// ──────────────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b6450, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e2, 1.05);
sun.position.set(-2400, 3600, 1700);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 100;
sun.shadow.camera.far = 9000;
const sc = sun.shadow.camera;
sc.left = -2600; sc.right = 2600; sc.top = 2600; sc.bottom = -2600;
sun.shadow.bias = -0.0004;
sun.target.position.set(-1300, 1600, -120);
scene.add(sun); scene.add(sun.target);

// ──────────────────────────────────────────────────────────────────────────
//  Геометрія траси (обчислюється після завантаження DEM)
// ──────────────────────────────────────────────────────────────────────────
const layers = {};
const STATION_H = 14;     // висота будівлі станції (зала)
const SHEAVE_UP = 8;      // підняття шківа над дахом (сумарно щогла 22 м — піднімає трос вище рельєфу)
const HANGER    = 3;      // коротка підвіска: кабіна близько до тросу (щоб не черкати схил)

let VALLEY, SUMMIT, PEAK, H_VALLEY, H_SUMMIT;
let valleySheave, summitSheave, cableCurve, CABLE_LEN;
let towerData, TOWER_H, SPANS, MIN_CLEAR, CABIN_CLEAR;
let polyLocal, parcelLocal, TILE_CX, TILE_CZ, TILE_SPAN, terrainMesh;
let views = {};

function computeGeometry() {
    VALLEY = new THREE.Vector2(ll2x(STN.valley.lng), ll2z(STN.valley.lat));   // ≈ (0,0)
    SUMMIT = new THREE.Vector2(ll2x(STN.summit.lng), ll2z(STN.summit.lat));
    PEAK   = new THREE.Vector2(ll2x(PEAK_LL.lng),   ll2z(PEAK_LL.lat));
    H_VALLEY = groundY(VALLEY.x, VALLEY.y);
    H_SUMMIT = groundY(SUMMIT.x, SUMMIT.y);

    // Контур ділянки (KML) у локальних метрах + центр/охоплення всього квадрата
    polyLocal = POLY_LL.map(([lng, lat]) => new THREE.Vector2(ll2x(lng), ll2z(lat)));
    TILE_CX = polyLocal.reduce((s, p) => s + p.x, 0) / polyLocal.length;
    TILE_CZ = polyLocal.reduce((s, p) => s + p.y, 0) / polyLocal.length;
    TILE_SPAN = Math.max(...polyLocal.map(p => Math.hypot(p.x - TILE_CX, p.y - TILE_CZ)));

    // Трос — пряма Заросляк → Мала Говерла (кріплення на шківах станцій)
    valleySheave = new THREE.Vector3(VALLEY.x, H_VALLEY + STATION_H + SHEAVE_UP, VALLEY.y);
    summitSheave = new THREE.Vector3(SUMMIT.x, H_SUMMIT + STATION_H + SHEAVE_UP, SUMMIT.y);
    cableCurve = new THREE.CatmullRomCurve3([valleySheave.clone(), summitSheave.clone()], false, 'catmullrom', 0.0);
    CABLE_LEN = cableCurve.getLength();

    // Опори: проєктуємо їхні точки на лінію тросу (висота = прямий трос − земля)
    const dir = SUMMIT.clone().sub(VALLEY);
    const len2 = dir.lengthSq(), HORIZ = dir.length();
    const makeTower = (ll, name) => {
        const pt = new THREE.Vector2(ll2x(ll.lng), ll2z(ll.lat));
        const t = THREE.MathUtils.clamp(pt.clone().sub(VALLEY).dot(dir) / len2, 0, 1);
        const onLine = VALLEY.clone().add(dir.clone().multiplyScalar(t));
        const ground = groundY(onLine.x, onLine.y);
        const tp = cableCurve.getPointAt(t);
        return { x: onLine.x, z: onLine.y, ground, top: tp.y, t, name, height: Math.max(1, Math.round(tp.y - ground)) };
    };
    towerData = [makeTower(START_LL, 'стартова'), makeTower(TOWER_LL, 'долинна')].sort((a, b) => a.t - b.t);
    TOWER_H = towerData.map(t => t.height);
    const ts = [0, ...towerData.map(t => t.t), 1];
    SPANS = [];
    for (let i = 0; i < ts.length - 1; i++) SPANS.push(Math.round((ts[i + 1] - ts[i]) * HORIZ));

    // Кадастрова ділянка → локальні координати
    if (PARCEL) parcelLocal = PARCEL.polygon_lnglat.map(([lng, lat]) => new THREE.Vector2(ll2x(lng), ll2z(lat)));

    // Мінімальний просвіт тросу та НИЗУ КАБІНИ над реальним рельєфом
    const cabinDrop = HANGER + 6;          // від тросу до низу кабіни
    MIN_CLEAR = Infinity; CABIN_CLEAR = Infinity;
    for (let i = 0; i <= 200; i++) {
        const p = cableCurve.getPointAt(i / 200), g = groundY(p.x, p.z);
        MIN_CLEAR = Math.min(MIN_CLEAR, p.y - g);
        CABIN_CLEAR = Math.min(CABIN_CLEAR, (p.y - cabinDrop) - g);
    }

    // Світло й тіні — на весь квадрат
    sun.position.set(TILE_CX - 2600, 4400, TILE_CZ + 2400);
    sun.target.position.set(TILE_CX, 1500, TILE_CZ);
    sc.left = -5600; sc.right = 5600; sc.top = 5600; sc.bottom = -5600;
    sun.shadow.camera.far = 16000; sun.shadow.camera.updateProjectionMatrix();

    controls.target.set(TILE_CX, 1500, TILE_CZ);
    views = {
        all:    { pos: [TILE_CX + TILE_SPAN * 0.5, 1500 + TILE_SPAN * 1.15, TILE_CZ + TILE_SPAN * 1.35],
                  tgt: [TILE_CX, 1500, TILE_CZ] },
        valley: { pos: [VALLEY.x + 95, H_VALLEY + 60, VALLEY.y + 150], tgt: [VALLEY.x, H_VALLEY + 10, VALLEY.y] },
        summit: { pos: [SUMMIT.x + 150, H_SUMMIT + 85, SUMMIT.y + 165], tgt: [SUMMIT.x, H_SUMMIT + 10, SUMMIT.y] },
        peak:   { pos: [PEAK.x + 240, groundY(PEAK.x, PEAK.y) + 260, PEAK.y + 470],
                  tgt: [PEAK.x, groundY(PEAK.x, PEAK.y), PEAK.y] },
        cabin:  null,
    };

    // Дані-керовані підписи у статах
    const setStat = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setStat('stat-tower', `${towerData.length} (${TOWER_H.join(' + ')} м)`);
    setStat('stat-spans', `${SPANS.join(' + ')} м`);
    setStat('stat-clear', `${MIN_CLEAR >= 0 ? '≥ ' : ''}${MIN_CLEAR.toFixed(0)} м`);
}

// ──────────────────────────────────────────────────────────────────────────
//  Рельєф із DEM (heightfield + вертексні кольори за висотою)
// ──────────────────────────────────────────────────────────────────────────
// Білінійне відображення одиничного квадрата (u,v) на чотирикутник KML
function quadXZ(u, v) {
    const [A, B, C, D] = polyLocal;
    const wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = u * v, wd = (1 - u) * v;
    return [wa * A.x + wb * B.x + wc * C.x + wd * D.x,
            wa * A.y + wb * B.y + wc * C.y + wd * D.y];
}

function buildTerrain() {
    const NU = 320, NV = 320;            // ~30 м крок по квадрату
    const verts = [], uvs = [], colors = [], idx = [];
    const cLow = new THREE.Color(0x46603a), cMid = new THREE.Color(0x6e6a5c);
    const cRock = new THREE.Color(0x8a8278), cSnow = new THREE.Color(0xf4f7fb);
    const tmp = new THREE.Color();
    for (let j = 0; j < NV; j++) {
        const v = j / (NV - 1);
        for (let i = 0; i < NU; i++) {
            const [x, z] = quadXZ(i / (NU - 1), v);
            const y = groundY(x, z);
            verts.push(x, y, z);
            uvs.push(...orthoUV(x, z));
            if (y < 1500)      tmp.copy(cLow).lerp(cMid, smooth01((y - 1000) / 500));
            else if (y < 1900) tmp.copy(cMid).lerp(cRock, smooth01((y - 1500) / 400));
            else               tmp.copy(cRock).lerp(cSnow, smooth01((y - 1900) / 170));
            colors.push(tmp.r, tmp.g, tmp.b);     // запасний рельєфний розфарбунок (коли ортофото вимкнено)
        }
    }
    for (let j = 0; j < NV - 1; j++)
        for (let i = 0; i < NU - 1; i++) {
            const a = j * NU + i, b = a + 1, c = a + NU, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: orthoTex, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide }));
    terrainMesh.receiveShadow = true;
    const grp = new THREE.Group();
    grp.add(terrainMesh);
    grp.add(buildBorder());                 // червоний контур ділянки (як у KML)
    scene.add(grp); layers.terrain = grp;
}

// Контур чотирикутника поверх рельєфу
function buildBorder() {
    const pts = [];
    const ring = [...polyLocal, polyLocal[0]];
    for (let k = 0; k < ring.length - 1; k++) {
        for (let s = 0; s <= 64; s++) {
            const t = s / 64;
            const x = ring[k].x + (ring[k + 1].x - ring[k].x) * t;
            const z = ring[k].y + (ring[k + 1].y - ring[k].y) * t;
            pts.push(new THREE.Vector3(x, groundY(x, z) + 8, z));
        }
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xfe3e34 }));
}

// Кадастрова ділянка (KMZ) — контур + підпис, де стоять нижня станція та стартова опора
function buildParcel() {
    const grp = new THREE.Group();
    if (parcelLocal && parcelLocal.length > 2) {
        const ring = [...parcelLocal, parcelLocal[0]], pts = [];
        for (let k = 0; k < ring.length - 1; k++)
            for (let s = 0; s <= 5; s++) {
                const t = s / 5;
                const x = ring[k].x + (ring[k + 1].x - ring[k].x) * t;
                const z = ring[k].y + (ring[k + 1].y - ring[k].y) * t;
                pts.push(new THREE.Vector3(x, groundY(x, z) + 2.5, z));
            }
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0xff9b2f })));   // лише контур, без 3D-напису
    }
    scene.add(grp); layers.parcel = grp;
}

// Реальна дорога Ворохта → Заросляк (OSM) — стрічка, що лягає на рельєф
function buildRoads() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6e655a, roughness: 0.95, side: THREE.DoubleSide });
    for (const r of ROADS.roads) {
        const pts = r.coords.map(([la, lo]) => new THREE.Vector2(ll2x(lo), ll2z(la)));
        if (pts.length < 2) continue;
        const half = r.highway === 'service' ? 2.4 : 3.2;     // піврядина (м)
        const verts = [], idx = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            let tx = b.x - a.x, tz = b.y - a.y; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
            const nx = -tz, nz = tx;                           // перпендикуляр до напрямку
            const cx = pts[i].x, cz = pts[i].y;
            const lx = cx + nx * half, lz = cz + nz * half, rx = cx - nx * half, rz = cz - nz * half;
            verts.push(lx, groundY(lx, lz) + 1.0, lz, rx, groundY(rx, rz) + 1.0, rz);
        }
        for (let i = 0; i < pts.length - 1; i++) {
            const a = i * 2;
            idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; grp.add(mesh);
    }
    scene.add(grp); layers.road = grp;
}

// ──────────────────────────────────────────────────────────────────────────
//  Трос / опора / станції / кабіни
// ──────────────────────────────────────────────────────────────────────────
function buildCable() {
    const grp = new THREE.Group();
    const pts = cableCurve.getPoints(200);
    const mat = new THREE.LineBasicMaterial({ color: 0x2b2f36 });
    for (const off of [-1.6, 1.6]) {
        const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, p.z + off)));
        grp.add(new THREE.Line(g, mat));
    }
    scene.add(grp); layers.cable = grp;
}

function buildTowers() {
    const grp = new THREE.Group();
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.5 });
    for (const t of towerData) {
        const height = t.top - t.ground;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.0, height, 12), matSteel);
        shaft.position.set(t.x, t.ground + height / 2, t.z);
        shaft.castShadow = true; grp.add(shaft);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 10), matSteel);
        arm.position.set(t.x, t.top - 0.5, t.z); arm.castShadow = true; grp.add(arm);
        for (const off of [-3.7, 3.7]) {
            const sheave = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 1, 16), matSteel);
            sheave.rotation.x = Math.PI / 2;
            sheave.position.set(t.x, t.top - 0.5, t.z + off);
            grp.add(sheave);
        }
    }
    scene.add(grp); layers.towers = grp;
}

function buildStation(x, z, ground, label, tone) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(34, STATION_H, 22),
        new THREE.MeshStandardMaterial({ color: tone, roughness: 0.7, metalness: 0.1 }));
    body.position.set(x, ground + STATION_H / 2, z);
    body.castShadow = true; body.receiveShadow = true; grp.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2, STATION_H * 0.7, 18),
        new THREE.MeshStandardMaterial({ color: 0x6cc4ff, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.6 }));
    glass.position.set(x - 17, ground + STATION_H * 0.5, z); grp.add(glass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(38, 1.4, 26),
        new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.8 }));
    roof.position.set(x, ground + STATION_H + 0.7, z); roof.castShadow = true; grp.add(roof);
    return grp;
}

function buildStations() {
    const grp = new THREE.Group();
    grp.add(buildStation(VALLEY.x, VALLEY.y, H_VALLEY, `${STN.valley.label} · ${STN.valley.elevN} м`, STN.valley.tone));
    grp.add(buildStation(SUMMIT.x, SUMMIT.y, H_SUMMIT, `${STN.summit.label} · ${STN.summit.elevN} м`, STN.summit.tone));
    scene.add(grp); layers.stations = grp;
}

const cabins = [];
function buildCabin(color) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 9),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }));
    body.castShadow = true; grp.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.6, 9.2),
        new THREE.MeshStandardMaterial({ color: 0x102733, roughness: 0.15, metalness: 0.4 }));
    win.position.y = 0.6; grp.add(win);
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, HANGER, 8),
        new THREE.MeshStandardMaterial({ color: 0x44484e, metalness: 0.7, roughness: 0.4 }));
    hang.position.y = 3 + HANGER / 2; grp.add(hang);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6 }));
    grip.position.y = 3 + HANGER; grp.add(grip);
    return grp;
}
function buildCabins() {
    const grp = new THREE.Group();
    const a = buildCabin(0xffcc44), b = buildCabin(0xff7755);
    cabins.push(a, b); grp.add(a, b); scene.add(grp); layers.cabins = grp;
}
const _p = new THREE.Vector3();
function placeCabin(cabin, u) {
    cableCurve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), _p);
    cabin.position.set(_p.x, _p.y - HANGER - 3, _p.z);
}

// ──────────────────────────────────────────────────────────────────────────
//  Спрайт-підписи
// ──────────────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function makeLabel(text, color = '#ffffff') {
    const pad = 24, fs = 44;
    const cv = document.createElement('canvas'); const ctx = cv.getContext('2d');
    ctx.font = `600 ${fs}px -apple-system, Segoe UI, Arial`;
    const w = ctx.measureText(text).width;
    cv.width = w + pad * 2; cv.height = fs + pad;
    ctx.font = `600 ${fs}px -apple-system, Segoe UI, Arial`;
    ctx.fillStyle = 'rgba(14,17,22,0.78)'; roundRect(ctx, 0, 0, cv.width, cv.height, 16); ctx.fill();
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(cv.width * 0.42, cv.height * 0.42, 1); spr.renderOrder = 999;
    return spr;
}
function buildLabels() {
    const grp = new THREE.Group();
    const items = [
        { t: `▼ ${STN.valley.label} · ${STN.valley.elevN} м`, c: '#e8e4e0', p: [VALLEY.x, H_VALLEY + STATION_H + 30, VALLEY.y] },
        { t: `▲ ${STN.summit.label} · ${STN.summit.elevN} м`, c: '#c8cdd4', p: [SUMMIT.x, H_SUMMIT + STATION_H + 30, SUMMIT.y] },
        { t: `▲ Говерла · ${PEAK_LL.elevN} м`, c: '#ffffff', p: [PEAK.x, groundY(PEAK.x, PEAK.y) + 55, PEAK.y] },
    ];
    for (const tw of towerData)
        items.push({ t: `╪ Опора (${tw.name}) · ${tw.height} м`, c: '#ffcc44', p: [tw.x, tw.top + 12, tw.z] });
    for (const it of items) {
        const s = makeLabel(it.t, it.c);
        s.position.set(it.p[0], it.p[1], it.p[2]); grp.add(s);
    }
    scene.add(grp); layers.labels = grp;
}

// ──────────────────────────────────────────────────────────────────────────
//  Анімація маятника
// ──────────────────────────────────────────────────────────────────────────
function progress(t) {
    const run = 9.0, dwell = 2.5;
    const T = 2 * (run + dwell);
    let x = ((t % T) + T) % T;
    if (x < dwell) return 0; x -= dwell;
    if (x < run) return smooth01(x / run); x -= run;
    if (x < dwell) return 1; x -= dwell;
    return smooth01(1 - x / run);
}

// ──────────────────────────────────────────────────────────────────────────
//  Ракурси камери
// ──────────────────────────────────────────────────────────────────────────
let followCabin = false;
let tween = null;
function setView(name) {
    followCabin = (name === 'cabin');
    if (followCabin || !views[name]) return;
    const v = views[name];
    tween = { fromPos: camera.position.clone(), toPos: new THREE.Vector3(...v.pos),
              fromTgt: controls.target.clone(), toTgt: new THREE.Vector3(...v.tgt), t: 0 };
}

// ──────────────────────────────────────────────────────────────────────────
//  Збірка сцени (після завантаження DEM)
// ──────────────────────────────────────────────────────────────────────────
const steps = [
    ['Рельєф', buildTerrain], ['Дорога', buildRoads], ['Ділянка', buildParcel],
    ['Станції', buildStations], ['Опори', buildTowers], ['Трос', buildCable],
    ['Кабіни', buildCabins], ['Підписи', buildLabels],
];
const progressFill = document.getElementById('progressFill');
let stepIdx = 0;
function runStep() {
    if (stepIdx >= steps.length) { finish(); return; }
    steps[stepIdx][1](); stepIdx++;
    progressFill.style.width = (stepIdx / steps.length * 100) + '%';
    setTimeout(runStep, 40);
}
function finish() {
    document.getElementById('loading').classList.add('hidden');
    setView('all');
    camera.position.set(...views.all.pos);
    animate();
}

async function boot() {
    const [j, ortho, roads, parcel] = await Promise.all([
        fetch('js/data/elevation.json').then(r => r.json()),
        fetch('js/data/ortho.json').then(r => r.json()),
        fetch('js/data/roads.json').then(r => r.json()),
        fetch('js/data/parcel.json').then(r => r.json()),
    ]);
    DEM = { rows: j.grid.rows, cols: j.grid.cols, step: j.grid.step_deg,
            lat0: j.grid.row0_lat, lon0: j.grid.col0_lon, data: j.elevations };
    ORTHO = ortho; ROADS = roads; PARCEL = parcel;
    orthoTex = await new Promise((res, rej) => new THREE.TextureLoader().load(
        ortho.image, t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
            t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t); }, undefined, rej));
    computeGeometry();
    // дебаг-доступ із консолі
    window.__scene = scene; window.__camera = camera; window.__controls = controls;
    window.__info = () => ({ towers: towerData.map(t => `${t.name}:${t.height}м`), SPANS, MIN_CLEAR, CABIN_CLEAR,
                             H_VALLEY, H_SUMMIT, H_PEAK: groundY(PEAK.x, PEAK.y), CABLE_LEN });
    runStep();
}
boot().catch(err => {
    console.error('boot failed', err);
    document.querySelector('#loading p').textContent = 'Помилка завантаження рельєфу: ' + err.message;
});

// ──────────────────────────────────────────────────────────────────────────
//  Рендер-цикл
// ──────────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let speed = 1;
const needle = document.getElementById('compassNeedle');
const camDir = new THREE.Vector3();
const followOffset = new THREE.Vector3(40, 55, 80);

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime * speed;

    if (cabins.length === 2) {
        const u = progress(t);
        placeCabin(cabins[0], u);
        placeCabin(cabins[1], 1 - u);
        if (followCabin) {
            const c = cabins[0].position;
            controls.target.lerp(c, 0.1);
            camera.position.lerp(c.clone().add(followOffset), 0.05);
        }
    }
    if (tween) {
        tween.t = Math.min(1, tween.t + dt * 1.3);
        const e = smooth01(tween.t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
        controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
        if (tween.t >= 1) tween = null;
    }
    controls.update();
    camera.getWorldDirection(camDir);
    if (needle) needle.style.transform = `translate(-50%, 0) rotate(${Math.atan2(camDir.x, camDir.z)}rad)`;
    renderer.render(scene, camera);
}

// ──────────────────────────────────────────────────────────────────────────
//  UI
// ──────────────────────────────────────────────────────────────────────────
document.querySelectorAll('.controls-top .btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.controls-top .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setView(btn.dataset.view);
    });
});
const toggleMap = {
    toggleTerrain: 'terrain', toggleCable: 'cable', toggleTowers: 'towers',
    toggleCabins: 'cabins', toggleStations: 'stations', toggleRoad: 'road',
    toggleParcel: 'parcel', toggleLabels: 'labels',
};
for (const [id, key] of Object.entries(toggleMap)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { if (layers[key]) layers[key].visible = el.checked; });
}
// Ортофото вкл/викл — супутникова текстура ↔ рельєфний розфарбунок
const orthoEl = document.getElementById('toggleOrtho');
if (orthoEl) orthoEl.addEventListener('change', () => {
    const m = terrainMesh.material;
    m.map = orthoEl.checked ? orthoTex : null;
    m.vertexColors = !orthoEl.checked;
    m.needsUpdate = true;
});
const speedEl = document.getElementById('speed');
if (speedEl) speedEl.addEventListener('input', () => { speed = parseFloat(speedEl.value); });
controls.addEventListener('start', () => { tween = null; });
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ──────────────────────────────────────────────────────────────────────────
//  Вікно: поздовжній профіль рельєфу + дані ліфта
// ──────────────────────────────────────────────────────────────────────────
function drawProfile() {
    const cv = document.getElementById('profileCanvas');
    if (!cv || !cableCurve) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pl = 46, pr = 16, pt = 16, pb = 26;
    ctx.clearRect(0, 0, W, H);
    const N = 240, horiz = SUMMIT.clone().sub(VALLEY).length(), drop = HANGER + 6;
    const ter = [], cab = [], cabBot = [];
    let ymin = 1e9, ymax = -1e9;
    for (let i = 0; i <= N; i++) {
        const p = cableCurve.getPointAt(i / N), g = groundY(p.x, p.z);
        ter.push(g); cab.push(p.y); cabBot.push(p.y - drop);
        ymin = Math.min(ymin, g); ymax = Math.max(ymax, p.y);
    }
    ymin = Math.floor((ymin - 20) / 50) * 50; ymax = Math.ceil((ymax + 20) / 50) * 50;
    const X = d => pl + (W - pl - pr) * d;
    const Y = e => H - pb - (H - pt - pb) * (e - ymin) / (ymax - ymin);
    ctx.font = '10px -apple-system, sans-serif';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.fillStyle = '#9aa6b2';
    for (let e = ymin; e <= ymax; e += 100) { const y = Y(e); ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke(); ctx.fillText(e, 4, y + 3); }
    for (let d = 0; d <= horiz; d += 500) ctx.fillText((d / 1000).toFixed(1) + ' км', X(d / horiz) - 10, H - 8);
    // рельєф
    ctx.beginPath(); ctx.moveTo(X(0), Y(ter[0]));
    for (let i = 1; i <= N; i++) ctx.lineTo(X(i / N), Y(ter[i]));
    ctx.lineTo(X(1), H - pb); ctx.lineTo(X(0), H - pb); ctx.closePath();
    ctx.fillStyle = 'rgba(86,112,66,0.6)'; ctx.fill();
    ctx.strokeStyle = '#7da05a'; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(X(0), Y(ter[0])); for (let i = 1; i <= N; i++) ctx.lineTo(X(i / N), Y(ter[i])); ctx.stroke();
    // шлях низу кабіни
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#ff9b2f'; ctx.lineWidth = 1.3; ctx.beginPath();
    for (let i = 0; i <= N; i++) { const x = X(i / N), y = Y(cabBot[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    // трос
    ctx.strokeStyle = '#dfe5ec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Y(cab[0])); ctx.lineTo(X(1), Y(cab[N])); ctx.stroke();
    // опори
    ctx.lineWidth = 2;
    for (const tw of towerData) {
        const x = X(tw.t); ctx.strokeStyle = '#ffcc44'; ctx.beginPath();
        ctx.moveTo(x, Y(tw.ground)); ctx.lineTo(x, Y(tw.top)); ctx.stroke();
        ctx.fillStyle = '#ffcc44'; ctx.fillText(tw.height + ' м', x - 9, Y(tw.top) - 4);
    }
    // станції
    ctx.fillStyle = '#e8e4e0'; ctx.fillRect(X(0) - 3, Y(H_VALLEY) - 3, 6, 6);
    ctx.fillStyle = '#c8cdd4'; ctx.fillRect(X(1) - 3, Y(H_SUMMIT) - 3, 6, 6);
    ctx.fillStyle = '#9aa6b2'; ctx.fillText('— трос    · · низ кабіни    ▮ опора', pl, pt - 2);
    // дані ліфта
    const grade = ((H_SUMMIT - H_VALLEY) / horiz * 100).toFixed(1);
    const row = (a, b) => `<div class="prow"><span>${a}</span><span>${b}</span></div>`;
    document.getElementById('profileData').innerHTML =
        row('Нижня станція · Заросляк', `${H_VALLEY.toFixed(0)} м`) +
        row('Верхня станція · Мала Говерла', `${H_SUMMIT.toFixed(0)} м`) +
        row('Перепад / горизонталь', `${(H_SUMMIT - H_VALLEY).toFixed(0)} / ${horiz.toFixed(0)} м`) +
        row('Довжина тросу / ухил', `${CABLE_LEN.toFixed(0)} м / ${grade} %`) +
        row(`Опори (${towerData.length})`, `${TOWER_H.join(' + ')} м`) +
        row('Прольоти', `${SPANS.join(' + ')} м`) +
        row('Просвіт тросу / кабіни', `+${MIN_CLEAR.toFixed(0)} / +${CABIN_CLEAR.toFixed(0)} м`);
}
const profModal = document.getElementById('profile-modal');
document.getElementById('btnProfile')?.addEventListener('click', () => { if (profModal) { profModal.classList.add('show'); drawProfile(); } });
document.getElementById('profile-close')?.addEventListener('click', () => profModal && profModal.classList.remove('show'));
profModal?.addEventListener('click', e => { if (e.target === profModal) profModal.classList.remove('show'); });
