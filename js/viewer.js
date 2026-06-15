// Pendelbahn Hoverla — 3D концепт маятникової канатної дороги
// Three.js r0.162 (ES modules / importmap)
// (c) 2026 shev43 — All Rights Reserved

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ──────────────────────────────────────────────────────────────────────────
//  Геометрія траси (метри, Y — вгору)
// ──────────────────────────────────────────────────────────────────────────
const VALLEY = new THREE.Vector2(0, 0);        // (x, z) долинної станції
const SUMMIT = new THREE.Vector2(2150, -200);  // (x, z) вершинної станції
const PEAK   = new THREE.Vector2(2360, -260);  // вершина Говерли

// Детермінований «шум» на синусах — щоб опори стабільно сідали на рельєф
function gauss(x, z, cx, cz, amp, sigma) {
    const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    return amp * Math.exp(-d2 / (2 * sigma * sigma));
}
function smooth01(t) {
    t = Math.min(1, Math.max(0, t));
    return t * t * (3 - 2 * t);
}

// Висота рельєфу в точці (x, z)
function terrainHeight(x, z) {
    let h = 1180;
    h += 760 * smooth01(x / 2150);                  // загальний підйом до вершини
    h += gauss(x, z, PEAK.x, PEAK.y, 150, 250);     // масив Говерли
    h += gauss(x, z, 1350, 720, 120, 520);          // бічний хребет
    h += gauss(x, z, 800, -820, 95, 470);           // бічна вершина
    h -= gauss(x, z, -180, 240, 70, 420);           // улоговина біля долинної станції
    h += 16 * Math.sin(x * 0.0042) * Math.cos(z * 0.0051);
    h += 9  * Math.sin(z * 0.011 + 1.3);
    return h;
}

const H_VALLEY = terrainHeight(VALLEY.x, VALLEY.y);
const H_SUMMIT = terrainHeight(SUMMIT.x, SUMMIT.y);

// ──────────────────────────────────────────────────────────────────────────
//  Сцена / камера / рендер
// ──────────────────────────────────────────────────────────────────────────
const container = document.getElementById('viewer-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
scene.fog = new THREE.Fog(0x9fc6e8, 2600, 6500);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 20000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 80;
controls.maxDistance = 8000;
controls.target.set(1050, H_VALLEY + 250, -100);

// ──────────────────────────────────────────────────────────────────────────
//  Освітлення + небо
// ──────────────────────────────────────────────────────────────────────────
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x55503f, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d8, 1.7);
sun.position.set(-1400, 2600, 1800);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 100;
sun.shadow.camera.far = 8000;
const sc = sun.shadow.camera;
sc.left = -2600; sc.right = 2600; sc.top = 2600; sc.bottom = -2600;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ──────────────────────────────────────────────────────────────────────────
//  Рельєф (heightfield + вертексні кольори)
// ──────────────────────────────────────────────────────────────────────────
const layers = {};   // посилання на групи для перемикання шарів

function buildTerrain() {
    const W = 4200, D = 3600, segX = 220, segZ = 190;
    const geo = new THREE.PlaneGeometry(W, D, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    const cLow  = new THREE.Color(0x3f5a32);  // ліс / трава
    const cMid  = new THREE.Color(0x6e6a5c);  // полонина / каміння
    const cRock = new THREE.Color(0x807a72);  // скелі
    const cSnow = new THREE.Color(0xf4f7fb);  // сніг
    const tmp = new THREE.Color();
    const offX = 1050;   // центруємо рельєф уздовж траси

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + offX;
        const z = pos.getZ(i);
        const y = terrainHeight(x, z);
        pos.setY(i, y);

        if (y < 1450)      tmp.copy(cLow).lerp(cMid, smooth01((y - 1250) / 250));
        else if (y < 1820) tmp.copy(cMid).lerp(cRock, smooth01((y - 1450) / 370));
        else               tmp.copy(cRock).lerp(cSnow, smooth01((y - 1820) / 230));
        // легка варіація
        const v = 0.94 + 0.12 * Math.sin(x * 0.03) * Math.cos(z * 0.027);
        colors.push(tmp.r * v, tmp.g * v, tmp.b * v);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.96, metalness: 0.0, flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = offX;
    mesh.receiveShadow = true;

    const grp = new THREE.Group();
    grp.add(mesh);
    scene.add(grp);
    layers.terrain = grp;
}

// ──────────────────────────────────────────────────────────────────────────
//  Сніжник на вершині (окрема «шапка»)
// ──────────────────────────────────────────────────────────────────────────
function buildSnowcap() {
    const grp = new THREE.Group();
    const geo = new THREE.CircleGeometry(360, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + PEAK.x;
        const z = pos.getZ(i) + PEAK.y;
        pos.setY(i, terrainHeight(x, z) + 1.5);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0 });
    const cap = new THREE.Mesh(geo, mat);
    cap.position.set(PEAK.x, 0, PEAK.y);
    cap.receiveShadow = true;
    grp.add(cap);
    scene.add(grp);
    layers.snow = grp;
}

// ──────────────────────────────────────────────────────────────────────────
//  Ліс — інстансовані «ялинки» нижче снігової межі
// ──────────────────────────────────────────────────────────────────────────
function buildForest() {
    const N = 1400;
    const cone = new THREE.ConeGeometry(7, 26, 6);
    cone.translate(0, 13, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 1, flatShading: true });
    const inst = new THREE.InstancedMesh(cone, mat, N);
    inst.castShadow = true;
    const m = new THREE.Matrix4();
    let placed = 0;
    for (let i = 0; i < N * 3 && placed < N; i++) {
        const x = 1050 + (Math.random() - 0.5) * 3600;
        const z = (Math.random() - 0.5) * 3000;
        const y = terrainHeight(x, z);
        if (y < 1250 || y > 1720) continue;           // тільки лісовий пояс
        const s = 0.6 + Math.random() * 1.5;
        m.makeScale(s, s + Math.random() * 0.4, s);
        m.setPosition(x, y, z);
        inst.setMatrixAt(placed++, m);
    }
    inst.count = placed;
    const grp = new THREE.Group();
    grp.add(inst);
    scene.add(grp);
    layers.trees = grp;
}

// ──────────────────────────────────────────────────────────────────────────
//  Траса: крива троса (CatmullRom) + опори + станції + кабіни
// ──────────────────────────────────────────────────────────────────────────
const STATION_H = 11;     // висота будівлі станції
const SHEAVE_UP = 7;      // підняття шківа над дахом
const HANGER    = 9;      // довжина підвіски кабіни

function lineZ(x) {        // z уздовж траси як функція x
    const t = (x - VALLEY.x) / (SUMMIT.x - VALLEY.x);
    return THREE.MathUtils.lerp(VALLEY.y, SUMMIT.y, t);
}

// Контрольні точки троса: верх долинної станції → вершини опор → верх вершинної
const towerX = [430, 880, 1330, 1780];
const cablePts = [];
cablePts.push(new THREE.Vector3(VALLEY.x, H_VALLEY + STATION_H + SHEAVE_UP, VALLEY.y));
const towerData = [];
for (const tx of towerX) {
    const tz = lineZ(tx);
    const ground = terrainHeight(tx, tz);
    const clear = 26 + 10 * Math.sin(tx * 0.01);      // просвіт троса над землею
    const top = ground + clear;
    cablePts.push(new THREE.Vector3(tx, top, tz));
    towerData.push({ x: tx, z: tz, ground, top });
}
cablePts.push(new THREE.Vector3(SUMMIT.x, H_SUMMIT + STATION_H + SHEAVE_UP, SUMMIT.y));

const cableCurve = new THREE.CatmullRomCurve3(cablePts, false, 'catmullrom', 0.4);
const CABLE_LEN = cableCurve.getLength();

function buildCable() {
    const grp = new THREE.Group();
    const pts = cableCurve.getPoints(260);
    const mat = new THREE.LineBasicMaterial({ color: 0x2b2f36 });
    // два паралельні троси (несучий + тяговий) — невеликий зсув по Z
    for (const off of [-1.6, 1.6]) {
        const g = new THREE.BufferGeometry().setFromPoints(
            pts.map(p => new THREE.Vector3(p.x, p.y, p.z + off))
        );
        grp.add(new THREE.Line(g, mat));
    }
    scene.add(grp);
    layers.cable = grp;
}

function buildTowers() {
    const grp = new THREE.Group();
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.5 });
    for (const t of towerData) {
        const height = t.top - t.ground;
        // стовп опори (звужений циліндр)
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4, 2.6, height, 12),
            matSteel
        );
        shaft.position.set(t.x, t.ground + height / 2, t.z);
        shaft.castShadow = true;
        grp.add(shaft);
        // поперечина зі шківами
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 9), matSteel);
        arm.position.set(t.x, t.top - 0.5, t.z);
        arm.castShadow = true;
        grp.add(arm);
        for (const off of [-3.5, 3.5]) {
            const sheave = new THREE.Mesh(
                new THREE.CylinderGeometry(1.6, 1.6, 1, 16),
                matSteel
            );
            sheave.rotation.x = Math.PI / 2;
            sheave.position.set(t.x, t.top - 0.5, t.z + off);
            grp.add(sheave);
        }
    }
    scene.add(grp);
    layers.towers = grp;
}

function buildStation(x, z, ground, label, tone) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(34, STATION_H, 22),
        new THREE.MeshStandardMaterial({ color: tone, roughness: 0.7, metalness: 0.1 })
    );
    body.position.set(x, ground + STATION_H / 2, z);
    body.castShadow = true; body.receiveShadow = true;
    grp.add(body);
    // скляний фронт
    const glass = new THREE.Mesh(
        new THREE.BoxGeometry(2, STATION_H * 0.7, 18),
        new THREE.MeshStandardMaterial({ color: 0x6cc4ff, roughness: 0.2, metalness: 0.3,
            transparent: true, opacity: 0.6 })
    );
    glass.position.set(x - 17, ground + STATION_H * 0.5, z);
    grp.add(glass);
    // дах
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(38, 1.4, 26),
        new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.8 })
    );
    roof.position.set(x, ground + STATION_H + 0.7, z);
    roof.castShadow = true;
    grp.add(roof);
    grp.userData.label = label;
    grp.userData.anchor = new THREE.Vector3(x, ground + STATION_H + 14, z);
    return grp;
}

function buildStations() {
    const grp = new THREE.Group();
    grp.add(buildStation(VALLEY.x, VALLEY.y, H_VALLEY, 'Долинна станція · 1300 м', 0xe8e4e0));
    grp.add(buildStation(SUMMIT.x, SUMMIT.y, H_SUMMIT, 'Вершинна станція · 2000 м', 0xc8cdd4));
    scene.add(grp);
    layers.stations = grp;
}

// ── Кабіни (дві, рухаються зустрічно) ─────────────────────────────────────
const cabins = [];
function buildCabin(color) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(7, 6, 9),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 })
    );
    body.castShadow = true;
    grp.add(body);
    // вікна-стрічка
    const win = new THREE.Mesh(
        new THREE.BoxGeometry(7.2, 2.6, 9.2),
        new THREE.MeshStandardMaterial({ color: 0x102733, roughness: 0.15, metalness: 0.4 })
    );
    win.position.y = 0.6;
    grp.add(win);
    // підвіска + затискач
    const hang = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, HANGER, 8),
        new THREE.MeshStandardMaterial({ color: 0x44484e, metalness: 0.7, roughness: 0.4 })
    );
    hang.position.y = 3 + HANGER / 2;
    grp.add(hang);
    const grip = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6 })
    );
    grip.position.y = 3 + HANGER;
    grp.add(grip);
    grp.userData.label = 'Кабіна · 60 пас.';
    return grp;
}

function buildCabins() {
    const grp = new THREE.Group();
    const a = buildCabin(0xffcc44);
    const b = buildCabin(0xff7755);
    cabins.push(a, b);
    grp.add(a, b);
    scene.add(grp);
    layers.cabins = grp;
}

// Поставити кабіну в точку траси за параметром u∈[0,1]
const _p = new THREE.Vector3();
function placeCabin(cabin, u) {
    cableCurve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), _p);
    cabin.position.set(_p.x, _p.y - HANGER - 3, _p.z);
}

// ──────────────────────────────────────────────────────────────────────────
//  Спрайт-підписи
// ──────────────────────────────────────────────────────────────────────────
function makeLabel(text, color = '#ffffff') {
    const pad = 24, fs = 44;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = `600 ${fs}px -apple-system, Segoe UI, Arial`;
    const w = ctx.measureText(text).width;
    cv.width = w + pad * 2; cv.height = fs + pad;
    ctx.font = `600 ${fs}px -apple-system, Segoe UI, Arial`;
    ctx.fillStyle = 'rgba(14,17,22,0.78)';
    roundRect(ctx, 0, 0, cv.width, cv.height, 16); ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const scale = 0.42;
    spr.scale.set(cv.width * scale, cv.height * scale, 1);
    spr.renderOrder = 999;
    return spr;
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function buildLabels() {
    const grp = new THREE.Group();
    const peakY = terrainHeight(PEAK.x, PEAK.y);
    const items = [
        { t: 'Долинна станція · 1300 м', c: '#e8e4e0', p: [VALLEY.x, H_VALLEY + STATION_H + 30, VALLEY.y] },
        { t: 'Вершинна станція · 2000 м', c: '#c8cdd4', p: [SUMMIT.x, H_SUMMIT + STATION_H + 30, SUMMIT.y] },
        { t: '▲ Говерла · 2061 м', c: '#ffffff', p: [PEAK.x, peakY + 60, PEAK.y] },
    ];
    for (const it of items) {
        const s = makeLabel(it.t, it.c);
        s.position.set(it.p[0], it.p[1], it.p[2]);
        grp.add(s);
    }
    scene.add(grp);
    layers.labels = grp;
}

// ──────────────────────────────────────────────────────────────────────────
//  Анімація маятника
// ──────────────────────────────────────────────────────────────────────────
// Прогрес «низ → верх» з паузами на станціях
function progress(t) {
    const run = 9.0, dwell = 2.5;          // секунди в дорозі / стоянка
    const T = 2 * (run + dwell);
    let x = ((t % T) + T) % T;
    if (x < dwell) return 0;
    x -= dwell;
    if (x < run) return smooth01(x / run);
    x -= run;
    if (x < dwell) return 1;
    x -= dwell;
    return smooth01(1 - x / run);
}

// ──────────────────────────────────────────────────────────────────────────
//  Ракурси камери
// ──────────────────────────────────────────────────────────────────────────
const views = {
    all:    { pos: [-1200, H_VALLEY + 1500, 2200], tgt: [1050, H_VALLEY + 300, -100] },
    valley: { pos: [VALLEY.x - 120, H_VALLEY + 70, VALLEY.y + 150], tgt: [VALLEY.x, H_VALLEY + 12, VALLEY.y] },
    summit: { pos: [SUMMIT.x - 180, H_SUMMIT + 90, SUMMIT.y + 170], tgt: [SUMMIT.x, H_SUMMIT + 12, SUMMIT.y] },
    peak:   { pos: [PEAK.x + 520, terrainHeight(PEAK.x, PEAK.y) + 260, PEAK.y + 520],
              tgt: [PEAK.x, terrainHeight(PEAK.x, PEAK.y), PEAK.y] },
    cabin:  null,   // спецрежим — слідуємо за кабіною
};
let followCabin = false;
let tween = null;   // { fromPos, toPos, fromTgt, toTgt, t }

function setView(name) {
    followCabin = (name === 'cabin');
    if (followCabin || !views[name]) return;
    const v = views[name];
    tween = {
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(...v.pos),
        fromTgt: controls.target.clone(),
        toTgt: new THREE.Vector3(...v.tgt),
        t: 0,
    };
}

// ──────────────────────────────────────────────────────────────────────────
//  Збірка сцени
// ──────────────────────────────────────────────────────────────────────────
const steps = [
    ['Рельєф', buildTerrain],
    ['Сніжник', buildSnowcap],
    ['Ліс', buildForest],
    ['Станції', buildStations],
    ['Опори', buildTowers],
    ['Трос', buildCable],
    ['Кабіни', buildCabins],
    ['Підписи', buildLabels],
];

const progressFill = document.getElementById('progressFill');
let stepIdx = 0;
function runStep() {
    if (stepIdx >= steps.length) { finish(); return; }
    steps[stepIdx][1]();
    stepIdx++;
    progressFill.style.width = (stepIdx / steps.length * 100) + '%';
    setTimeout(runStep, 40);
}
function finish() {
    document.getElementById('loading').classList.add('hidden');
    setView('all');
    camera.position.set(...views.all.pos);     // стартовий кадр без твіна
    animate();
}
runStep();

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

    // маятник: A піднімається, B — дзеркально вниз
    if (cabins.length === 2) {
        const u = progress(t);
        placeCabin(cabins[0], u);
        placeCabin(cabins[1], 1 - u);

        if (followCabin) {
            const c = cabins[0].position;
            controls.target.lerp(c, 0.1);
            const want = c.clone().add(followOffset);
            camera.position.lerp(want, 0.05);
        }
    }

    // твін камери до пресету
    if (tween) {
        tween.t = Math.min(1, tween.t + dt * 1.3);
        const e = smooth01(tween.t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
        controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
        if (tween.t >= 1) tween = null;
    }

    controls.update();

    // компас
    camera.getWorldDirection(camDir);
    const ang = Math.atan2(camDir.x, camDir.z);
    if (needle) needle.style.transform = `translate(-50%, 0) rotate(${ang}rad)`;

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
    toggleCabins: 'cabins', toggleStations: 'stations', toggleTrees: 'trees',
    toggleLabels: 'labels', toggleSnow: 'snow',
};
for (const [id, key] of Object.entries(toggleMap)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
        if (layers[key]) layers[key].visible = el.checked;
    });
}

const speedEl = document.getElementById('speed');
if (speedEl) speedEl.addEventListener('input', () => { speed = parseFloat(speedEl.value); });

// зупиняємо твін/слідкування, якщо користувач сам крутить камеру
controls.addEventListener('start', () => { tween = null; });

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
