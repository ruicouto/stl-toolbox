import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const fileInput = document.getElementById('file');
const filenameEl = document.getElementById('filename');
const previewEl = document.getElementById('preview');
const placeholderEl = document.getElementById('preview-placeholder');
const positionSlider = document.getElementById('position-slider');
const positionMmEl = document.getElementById('position-mm');
const positionRangeHint = document.getElementById('position-range-hint');
const sliceBtn = document.getElementById('slice-btn');
const sliceStatus = document.getElementById('slice-status');
const viewTopBtn = document.getElementById('view-top');
const viewSideBtn = document.getElementById('view-side');
const viewOtherBtn = document.getElementById('view-other');
const resultsListEl = document.getElementById('results-list');
const resultsEmptyEl = document.getElementById('results-empty');
const tabCut = document.getElementById('tab-cut');
const tabPreview = document.getElementById('tab-preview');
const panelCut = document.getElementById('panel-cut');
const panelPreview = document.getElementById('panel-preview');
const filePreviewInput = document.getElementById('file-preview');
const filenamePreviewEl = document.getElementById('filename-preview');
const previewOnlyEl = document.getElementById('preview-only');
const viewTopPreviewBtn = document.getElementById('view-top-preview');
const viewSidePreviewBtn = document.getElementById('view-side-preview');
const viewOtherPreviewBtn = document.getElementById('view-other-preview');

let currentFile = null;
let sliceResults = [];
let scene, camera, renderer, controls, mesh;
let modelBox = null;
let cutPlaneMesh = null;
let cutPlaneEdge = null;
let gridY0 = null;
let animating = false;

let scene2, camera2, renderer2, controls2, mesh2, modelBox2;
let animatingPreview = false;

function getPreviewSize() {
  const rect = previewEl.getBoundingClientRect();
  const w = Math.round(rect.width) || 640;
  const h = Math.round(rect.height) || 280;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function makeOrthographicCamera(w, h) {
  const viewSize = 2;
  const aspect = w / h;
  const halfH = viewSize / 2;
  const halfW = halfH * aspect;
  return new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
}

function initPreview() {
  if (renderer) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16161e);
  const { w, h } = getPreviewSize();
  camera = makeOrthographicCamera(w, h);
  camera.position.set(1, 1, 1).normalize().multiplyScalar(1.5);
  camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  previewEl.insertBefore(renderer.domElement, previewEl.firstChild);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2, 3, 2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xe0e8ff, 0.5);
  fillLight.position.set(-2, 1, -1);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
  rimLight.position.set(-1, -1, 2);
  scene.add(rimLight);
  scene.add(new THREE.AmbientLight(0x606888));
  addY0Plane();
  window.addEventListener('resize', onResize);
  if (!animating) {
    animating = true;
    animate();
  }
}

function createOriginLine() {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 100, 0)];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x9ece6a, linewidth: 2 });
  return new THREE.Line(geo, mat);
}

function addY0Plane() {
  if (gridY0) return;
  gridY0 = new THREE.GridHelper(100, 10, 0x414868, 0x363a52);
  gridY0.position.y = 0;
  scene.add(gridY0);
  scene.add(createOriginLine());
}

function getCutRatio() {
  if (!modelBox) return 0.5;
  const axis = document.querySelector('input[name="axis"]:checked').value;
  const min = modelBox.min;
  const max = modelBox.max;
  const range = axis === 'x' ? max.x - min.x : axis === 'y' ? max.y - min.y : max.z - min.z;
  if (range <= 0) return 0.5;
  const posMm = parseFloat(positionSlider.value, 10);
  const axisMin = axis === 'x' ? min.x : axis === 'y' ? min.y : min.z;
  return Math.max(0, Math.min(1, (posMm - axisMin) / range));
}

function getCutPositionWorld() {
  if (!modelBox) return 0;
  return parseFloat(positionSlider.value, 10);
}

function updatePositionSliderUI() {
  if (!modelBox) {
    positionRangeHint.textContent = '';
    positionMmEl.textContent = '—';
    return;
  }
  const axis = document.querySelector('input[name="axis"]:checked').value;
  const min = modelBox.min;
  const max = modelBox.max;
  const axisMin = axis === 'x' ? min.x : axis === 'y' ? min.y : min.z;
  const axisMax = axis === 'x' ? max.x : axis === 'y' ? max.y : max.z;
  const range = axisMax - axisMin;
  positionSlider.min = axisMin.toFixed(2);
  positionSlider.max = axisMax.toFixed(2);
  positionSlider.step = Math.max(0.1, range / 500);
  let val = parseFloat(positionSlider.value);
  if (!Number.isFinite(val) || val < axisMin || val > axisMax) {
    val = axisMin + range * 0.5;
    positionSlider.value = val;
  }
  positionMmEl.textContent = Number(val).toFixed(2);
  positionRangeHint.textContent = `Range: ${axisMin.toFixed(2)} to ${axisMax.toFixed(2)} mm`;
}

function updateCutPlane() {
  if (!modelBox || !cutPlaneMesh) return;
  const axis = document.querySelector('input[name="axis"]:checked').value;
  const cutPos = getCutPositionWorld();
  const size = modelBox.getSize(new THREE.Vector3());
  const center = modelBox.getCenter(new THREE.Vector3());
  const min = modelBox.min;
  const max = modelBox.max;
  let planeW, planeH;
  cutPlaneMesh.position.copy(center);
  cutPlaneMesh.rotation.set(0, 0, 0);
  if (axis === 'x') {
    cutPlaneMesh.position.x = cutPos;
    planeW = Math.max(size.z, size.y) * 1.2;
    planeH = Math.max(size.z, size.y) * 1.2;
    cutPlaneMesh.rotation.y = Math.PI / 2;
  } else if (axis === 'y') {
    cutPlaneMesh.position.y = cutPos;
    planeW = Math.max(size.x, size.z) * 1.2;
    planeH = Math.max(size.x, size.z) * 1.2;
    cutPlaneMesh.rotation.x = Math.PI / 2;
  } else {
    cutPlaneMesh.position.z = cutPos;
    planeW = Math.max(size.x, size.y) * 1.2;
    planeH = Math.max(size.x, size.y) * 1.2;
  }
  cutPlaneMesh.scale.set(planeW, planeH, 1);
  if (cutPlaneEdge) {
    cutPlaneEdge.position.copy(cutPlaneMesh.position);
    cutPlaneEdge.rotation.copy(cutPlaneMesh.rotation);
    cutPlaneEdge.scale.copy(cutPlaneMesh.scale);
  }
}

function ensureCutPlane() {
  if (cutPlaneMesh) return;
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf7768e,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  cutPlaneMesh = new THREE.Mesh(geo, mat);
  scene.add(cutPlaneMesh);
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xf7768e, linewidth: 2 });
  cutPlaneEdge = new THREE.LineSegments(edgeGeo, edgeMat);
  scene.add(cutPlaneEdge);
}

function onResize() {
  if (camera && renderer) {
    const { w, h } = getPreviewSize();
    const aspect = w / h;
    const halfH = (camera.top - camera.bottom) / 2;
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  if (camera2 && renderer2 && previewOnlyEl.offsetParent) {
    const rect = previewOnlyEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const aspect = w / h;
    const halfH = (camera2.top - camera2.bottom) / 2;
    camera2.left = -halfH * aspect;
    camera2.right = halfH * aspect;
    camera2.updateProjectionMatrix();
    renderer2.setSize(w, h);
  }
}

const MIN_GRID_MM = 100;

function fitCameraOrtho(box) {
  modelBox = box.clone();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const viewSize = Math.max(maxDim * 1.8, MIN_GRID_MM);
  const { w, h } = getPreviewSize();
  const aspect = w / h;
  const halfH = viewSize / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.near = 0.1;
  camera.far = Math.max(maxDim * 4, MIN_GRID_MM * 2) + 1;
  camera.updateProjectionMatrix();
  const dist = Math.max(maxDim * 1.2, MIN_GRID_MM * 0.6);
  camera.position.copy(center).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist));
  camera.lookAt(center);
  controls.target.copy(center);
  
  ensureCutPlane();
  updatePositionSliderUI();
  updateCutPlane();
}

function setCameraView(direction) {
  if (!modelBox) return;
  const center = modelBox.getCenter(new THREE.Vector3());
  const size = modelBox.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z) * 1.3;
  if (direction === 'top') {
    camera.position.set(center.x, center.y + dist, center.z);
  } else if (direction === 'side') {
    camera.position.set(center.x + dist, center.y, center.z);
  } else {
    camera.position.set(center.x - dist, center.y, center.z);
  }
  camera.lookAt(center);
  controls.target.copy(center);
}

function getPreviewOnlySize() {
  const rect = previewOnlyEl.getBoundingClientRect();
  const w = Math.round(rect.width) || 640;
  const h = Math.round(rect.height) || 420;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function initPreviewOnly() {
  if (renderer2) return;
  scene2 = new THREE.Scene();
  scene2.background = new THREE.Color(0x16161e);
  const { w, h } = getPreviewOnlySize();
  camera2 = new THREE.OrthographicCamera(-w / 200, w / 200, h / 200, -h / 200, 0.1, 1000);
  camera2.position.set(1, 1, 1).normalize().multiplyScalar(1.5);
  camera2.lookAt(0, 0, 0);
  renderer2 = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer2.setSize(w, h);
  renderer2.domElement.style.display = 'block';
  renderer2.domElement.style.width = '100%';
  renderer2.domElement.style.height = '100%';
  previewOnlyEl.insertBefore(renderer2.domElement, previewOnlyEl.firstChild);
  controls2 = new OrbitControls(camera2, renderer2.domElement);
  controls2.enableDamping = true;
  controls2.dampingFactor = 0.05;
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2, 3, 2);
  scene2.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xe0e8ff, 0.5);
  fillLight.position.set(-2, 1, -1);
  scene2.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
  rimLight.position.set(-1, -1, 2);
  scene2.add(rimLight);
  scene2.add(new THREE.AmbientLight(0x606888));
  const grid = new THREE.GridHelper(100, 10, 0x414868, 0x363a52);
  grid.position.y = 0;
  scene2.add(grid);
  scene2.add(createOriginLine());
  window.addEventListener('resize', onResize);
  if (!animatingPreview) {
    animatingPreview = true;
    animatePreviewOnly();
  }
}

function fitCameraPreviewOnly(box) {
  modelBox2 = box.clone();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const viewSize = Math.max(maxDim * 1.8, 100);
  const { w, h } = getPreviewOnlySize();
  const aspect = w / h;
  const halfH = viewSize / 2;
  const halfW = halfH * aspect;
  camera2.left = -halfW;
  camera2.right = halfW;
  camera2.top = halfH;
  camera2.bottom = -halfH;
  camera2.near = 0.1;
  camera2.far = Math.max(maxDim * 4, 200) + 1;
  camera2.updateProjectionMatrix();
  const dist = Math.max(maxDim * 1.2, 60);
  camera2.position.copy(center).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist));
  camera2.lookAt(center);
  controls2.target.copy(center);
}

function loadPreviewOnly(buffer) {
  initPreviewOnly();
  try {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    if (mesh2) scene2.remove(mesh2);
    mesh2 = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
      color: 0x7aa2f7,
      shininess: 60,
      specular: 0x444466,
    }));
    scene2.add(mesh2);
    const box = new THREE.Box3().setFromObject(mesh2);
    fitCameraPreviewOnly(box);
    previewOnlyEl.classList.add('ready');
    onResize();
  } catch (err) {
    console.error(err);
    filenamePreviewEl.textContent = 'Preview failed: ' + (err.message || 'Invalid STL');
  }
}

function setCameraViewPreview(direction) {
  if (!modelBox2) return;
  const center = modelBox2.getCenter(new THREE.Vector3());
  const size = modelBox2.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z) * 1.3;
  if (direction === 'top') {
    camera2.position.set(center.x, center.y + dist, center.z);
  } else if (direction === 'side') {
    camera2.position.set(center.x + dist, center.y, center.z);
  } else {
    camera2.position.set(center.x - dist, center.y, center.z);
  }
  camera2.lookAt(center);
  controls2.target.copy(center);
}

function animatePreviewOnly() {
  if (!renderer2) return;
  requestAnimationFrame(animatePreviewOnly);
  controls2.update();
  renderer2.render(scene2, camera2);
}

function loadPreview(buffer) {
  initPreview();
  try {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    if (mesh) scene.remove(mesh);
    mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
      color: 0x7aa2f7,
      shininess: 60,
      specular: 0x444466,
    }));
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    fitCameraOrtho(box);
    previewEl.classList.add('ready');
    positionSlider.disabled = false;
    viewTopBtn.disabled = false;
    viewSideBtn.disabled = false;
    viewOtherBtn.disabled = false;
    onResize();
    if (!animating) {
      animating = true;
      animate();
    }
  } catch (err) {
    console.error(err);
    sliceStatus.textContent = 'Preview failed: ' + (err.message || 'Invalid STL');
    sliceStatus.classList.add('error');
  }
}

function animate() {
  if (!renderer) return;
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

positionSlider.disabled = true;
viewTopBtn.disabled = true;
viewSideBtn.disabled = true;
viewOtherBtn.disabled = true;

function downloadFromBase64(base64, filename) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderResultsList() {
  resultsListEl.innerHTML = '';
  if (sliceResults.length === 0) {
    resultsEmptyEl.style.display = 'block';
    return;
  }
  resultsEmptyEl.style.display = 'none';
  sliceResults.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    const axisUpper = item.axis.toUpperCase();
    const label = `Slice ${index + 1} — ${axisUpper} @ ${Number(item.positionMm).toFixed(1)} mm`;
    const belowBtn = item.below ? `<button type="button" class="result-dl" data-index="${index}" data-part="below">Below</button>` : '';
    const aboveBtn = item.above ? `<button type="button" class="result-dl" data-index="${index}" data-part="above">Above</button>` : '';
    li.innerHTML = `
      <span class="result-label">${label}</span>
      <span class="result-actions">${belowBtn}${aboveBtn}</span>
    `;
    resultsListEl.appendChild(li);
  });
  resultsListEl.querySelectorAll('.result-dl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index, 10);
      const part = btn.dataset.part;
      const item = sliceResults[index];
      const b64 = part === 'above' ? item.above : item.below;
      if (!b64) return;
      const filename = `slice_${index + 1}_part_${part}.stl`;
      downloadFromBase64(b64, filename);
    });
  });
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  currentFile = file;
  sliceResults = [];
  renderResultsList();
  filenameEl.textContent = file.name;
  sliceBtn.disabled = false;
  sliceStatus.textContent = '';
  const reader = new FileReader();
  reader.onload = (e) => {
    requestAnimationFrame(() => {
      loadPreview(e.target.result);
    });
  };
  reader.readAsArrayBuffer(file);
});

positionSlider.addEventListener('input', () => {
  positionMmEl.textContent = Number(positionSlider.value).toFixed(2);
  updateCutPlane();
});

document.querySelectorAll('input[name="axis"]').forEach((el) => {
  el.addEventListener('change', () => {
    updatePositionSliderUI();
    updateCutPlane();
  });
});

viewTopBtn.addEventListener('click', () => setCameraView('top'));
viewSideBtn.addEventListener('click', () => setCameraView('side'));
viewOtherBtn.addEventListener('click', () => setCameraView('other'));

sliceBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  const axis = document.querySelector('input[name="axis"]:checked').value;
  const position = getCutRatio();
  const positionMm = getCutPositionWorld();
  sliceStatus.textContent = 'Slicing…';
  sliceStatus.classList.remove('error');
  const form = new FormData();
  form.append('file', currentFile);
  form.append('axis', axis);
  form.append('position', String(position));
  try {
    const res = await fetch('/slice', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    const data = await res.json();
    sliceResults.push({
      axis,
      positionMm,
      above: data.above || null,
      below: data.below || null,
    });
    renderResultsList();
    sliceStatus.textContent = `Slice ${sliceResults.length} added. Download from Results below.`;
  } catch (e) {
    sliceStatus.textContent = e.message || 'Slice failed';
    sliceStatus.classList.add('error');
  }
});

tabCut.addEventListener('click', () => {
  tabCut.classList.add('active');
  tabCut.setAttribute('aria-selected', 'true');
  tabPreview.classList.remove('active');
  tabPreview.setAttribute('aria-selected', 'false');
  panelCut.classList.add('active');
  panelCut.removeAttribute('hidden');
  panelPreview.classList.remove('active');
  panelPreview.setAttribute('hidden', '');
});

tabPreview.addEventListener('click', () => {
  tabPreview.classList.add('active');
  tabPreview.setAttribute('aria-selected', 'true');
  tabCut.classList.remove('active');
  tabCut.setAttribute('aria-selected', 'false');
  panelPreview.classList.add('active');
  panelPreview.removeAttribute('hidden');
  panelCut.classList.remove('active');
  panelCut.setAttribute('hidden', '');
  requestAnimationFrame(() => onResize());
});

filePreviewInput.addEventListener('change', () => {
  const file = filePreviewInput.files[0];
  if (!file) return;
  filenamePreviewEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    requestAnimationFrame(() => loadPreviewOnly(e.target.result));
  };
  reader.readAsArrayBuffer(file);
});

viewTopPreviewBtn.addEventListener('click', () => setCameraViewPreview('top'));
viewSidePreviewBtn.addEventListener('click', () => setCameraViewPreview('side'));
viewOtherPreviewBtn.addEventListener('click', () => setCameraViewPreview('other'));
