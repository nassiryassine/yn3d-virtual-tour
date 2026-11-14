(() => {
  const input = document.getElementById('pano-upload');
  const list = document.getElementById('scene-list');
  const counter = document.getElementById('scene-counter');
  const pano = document.getElementById('pano');
  const map = document.getElementById('route-map');
  const thumbnails = document.getElementById('thumbnail-strip');
  const globalAudioInput = document.getElementById('global-audio-upload');
  const sceneAudioInput = document.getElementById('scene-audio-upload');
  const audioToggle = document.getElementById('audio-toggle');
  const audioStatus = document.getElementById('audio-status');
  const gyroToggle = document.getElementById('gyro-toggle');
  const audio = new Audio();
  audio.preload = 'metadata';
  const scenes = [];
  const sceneAudio = new Map();
  let globalAudioUrl = '';
  let activeAudioUrl = '';
  let audioWanted = false;
  let viewer = null;
  let current = null;
  let gyroEnabled = false;
  let gyroBaseline = null;
  let lastOrientation = null;
  const objectUrls = [];

  const HOTSPOT_YAW = { forward: 0, back: Math.PI };
  function makeViewer() {
    if (!viewer) viewer = new Marzipano.Viewer(pano, { controls: { mouseViewMode: 'drag' } });
  }
  function sceneLabel(number, fallback) {
    const labels = ['Corridor — Entrance', 'Corridor — Viewpoint 02', 'Corridor — Viewpoint 03', 'Corridor — End'];
    return labels[number - 1] || fallback;
  }
  function makeHotspot(label, symbol, destination, direction) {
    const el = document.createElement('button');
    el.className = `tour-hotspot tour-hotspot-${direction}`;
    el.type = 'button'; el.textContent = symbol;
    el.setAttribute('aria-label', label); el.title = label;
    el.addEventListener('click', () => activate(destination));
    return el;
  }
  function connectAdjacentScenes() {
    scenes.forEach((item, index) => {
      const container = item.scene.hotspotContainer();
      if (index < scenes.length - 1) container.createHotspot(makeHotspot(`Continue to ${scenes[index + 1].name}`, '➜', scenes[index + 1], 'forward'), { yaw: HOTSPOT_YAW.forward, pitch: -0.12 });
      if (index > 0) container.createHotspot(makeHotspot(`Return to ${scenes[index - 1].name}`, '←', scenes[index - 1], 'back'), { yaw: HOTSPOT_YAW.back, pitch: -0.12 });
    });
  }
  function chooseAudioForCurrentScene() {
    const nextUrl = current && sceneAudio.get(current) ? sceneAudio.get(current) : globalAudioUrl;
    if (!nextUrl || nextUrl === activeAudioUrl) return;
    const wasPlaying = audioWanted && !audio.paused;
    activeAudioUrl = nextUrl;
    audio.src = nextUrl;
    audio.load();
    if (wasPlaying) audio.play().catch(() => { audioWanted = false; updateAudioUi(); });
    updateAudioUi();
  }
  function updateAudioUi() {
    const hasAudio = !!activeAudioUrl;
    audioToggle.disabled = !hasAudio;
    audioToggle.textContent = audio.paused ? '▶' : 'Ⅱ';
    audioToggle.setAttribute('aria-label', audio.paused ? 'Play audio' : 'Pause audio');
    const isSceneTrack = !!(current && sceneAudio.get(current) && activeAudioUrl === sceneAudio.get(current));
    audioStatus.textContent = !hasAudio ? 'No audio selected' : (isSceneTrack ? 'Audio for this viewpoint' : 'Audio for the whole tour');
  }
  function activate(item) {
    if (!item) return;
    const previous = current;
    current = item;
    item.scene.switchTo({ transitionDuration: 650 });
    renderList(); renderMap(); renderThumbnails();
    const index = scenes.indexOf(item);
    counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} — ${item.name.toUpperCase()}`;
    const placeholder = pano.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.remove();
    if (previous !== item) chooseAudioForCurrentScene();
  }
  function renderList() {
    list.innerHTML = '';
    scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.className = 'scene-button' + (scene === current ? ' active' : '');
      button.innerHTML = `<span class="scene-number">${String(index + 1).padStart(2, '0')}</span><span class="scene-name"></span><span class="scene-chevron">›</span>`;
      button.querySelector('.scene-name').textContent = scene.name;
      button.addEventListener('click', () => activate(scene)); list.appendChild(button);
    });
    if (!scenes.length) list.innerHTML = '<div class="empty-scenes">No panorama scenes found. Check the file names and folder.</div>';
  }
  function renderMap() {
    map.querySelectorAll('.map-node').forEach(node => {
      const index = Number(node.dataset.scene);
      node.disabled = index >= scenes.length;
      node.classList.toggle('active', !!current && index === scenes.indexOf(current));
      node.classList.toggle('available', index < scenes.length);
      node.onclick = () => { if (scenes[index]) activate(scenes[index]); };
    });
  }
  function renderThumbnails() {
    thumbnails.innerHTML = '';
    scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thumbnail-button' + (scene === current ? ' active' : '');
      button.setAttribute('aria-label', `Open ${scene.name}`);
      const image = document.createElement('img');
      image.src = scene.url; image.alt = ''; image.loading = 'lazy';
      const label = document.createElement('span');
      label.textContent = `${String(index + 1).padStart(2, '0')} · ${scene.name}`;
      button.append(image, label);
      button.addEventListener('click', () => activate(scene));
      thumbnails.appendChild(button);
    });
    thumbnails.hidden = scenes.length === 0;
  }
  function addSceneFromUrl(url, name) {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth, height = image.naturalHeight;
        if (Math.abs(width / height - 2) > 0.04) { resolve(false); return; }
        makeViewer();
        const geometry = new Marzipano.EquirectGeometry([{ width }]);
        const source = Marzipano.ImageUrlSource.fromString(url);
        const limiter = Marzipano.RectilinearView.limit.traditional(width, 120 * Math.PI / 180);
        const view = new Marzipano.RectilinearView({ yaw: 0, pitch: 0, fov: Math.PI / 2 }, limiter);
        const scene = viewer.createScene({ source, geometry, view });
        scenes.push({ name, scene, url });
        resolve(true);
      };
      image.onerror = () => resolve(false);
      image.src = url;
    });
  }
  async function loadSavedPanoramas() {
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    for (let number = 1; number <= 4; number++) {
      let loaded = false;
      for (const extension of extensions) {
        const url = `assets/panoramas/Panorama_${number}.${extension}`;
        if (await addSceneFromUrl(url, sceneLabel(number, `Panorama_${number}`))) { loaded = true; break; }
      }
      if (!loaded) console.info(`Panorama_${number} was not found.`);
    }
    connectAdjacentScenes(); renderList(); renderMap(); renderThumbnails();
    if (scenes.length) activate(scenes[0]); else counter.textContent = 'NO SCENES FOUND';
  }
  input.addEventListener('change', async event => {
    for (const file of Array.from(event.target.files || [])) {
      const url = URL.createObjectURL(file); objectUrls.push(url);
      const ok = await addSceneFromUrl(url, file.name.replace(/\.[^.]+$/, ''));
      if (!ok) alert(`${file.name}: use a 2:1 equirectangular panorama (for example 6000 × 3000).`);
    }
    connectAdjacentScenes(); renderList(); renderMap(); renderThumbnails();
    if (scenes.length && !current) activate(scenes[0]);
    input.value = '';
  });

  globalAudioInput.addEventListener('change', () => {
    const file = globalAudioInput.files && globalAudioInput.files[0];
    if (!file) return;
    if (globalAudioUrl) URL.revokeObjectURL(globalAudioUrl);
    globalAudioUrl = URL.createObjectURL(file); objectUrls.push(globalAudioUrl);
    chooseAudioForCurrentScene(); audioStatus.textContent = 'Tour audio ready';
    globalAudioInput.value = '';
  });
  sceneAudioInput.addEventListener('change', () => {
    const file = sceneAudioInput.files && sceneAudioInput.files[0];
    if (!file) return;
    if (!current) { alert('Open a panorama viewpoint first.'); sceneAudioInput.value = ''; return; }
    const url = URL.createObjectURL(file); objectUrls.push(url);
    const oldUrl = sceneAudio.get(current); if (oldUrl) URL.revokeObjectURL(oldUrl);
    sceneAudio.set(current, url); chooseAudioForCurrentScene();
    audioStatus.textContent = 'Audio for this viewpoint ready';
    sceneAudioInput.value = '';
  });
  audioToggle.addEventListener('click', () => {
    if (!activeAudioUrl) return;
    if (audio.paused) { audioWanted = true; audio.play().then(updateAudioUi).catch(() => { audioWanted = false; updateAudioUi(); }); }
    else { audio.pause(); audioWanted = false; updateAudioUi(); }
  });
  audio.addEventListener('play', updateAudioUi);
  audio.addEventListener('pause', updateAudioUi);
  audio.addEventListener('ended', () => { audioWanted = false; updateAudioUi(); });

  function applyDeviceOrientation(event) {
    if (!gyroEnabled || !current || event.alpha == null || event.beta == null || event.gamma == null) return;
    const screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const alpha = event.alpha * Math.PI / 180;
    const beta = event.beta * Math.PI / 180;
    const gamma = event.gamma * Math.PI / 180;
    if (!gyroBaseline) gyroBaseline = { alpha, beta, gamma, screenAngle };
    const yaw = alpha - gyroBaseline.alpha;
    const pitch = Math.max(-1.2, Math.min(1.2, beta - gyroBaseline.beta));
    const rollCorrection = (screenAngle - gyroBaseline.screenAngle) * Math.PI / 180;
    const view = current.scene.view();
    view.setYaw(view.yaw() - yaw);
    view.setPitch(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, view.pitch() + pitch * 0.04 - rollCorrection * 0.0)));
    gyroBaseline = { alpha, beta, gamma, screenAngle };
  }
  async function toggleGyro() {
    if (gyroEnabled) {
      gyroEnabled = false; gyroBaseline = null;
      window.removeEventListener('deviceorientation', applyDeviceOrientation, true);
      gyroToggle.classList.remove('active'); gyroToggle.title = 'Enable phone motion'; return;
    }
    if (!('DeviceOrientationEvent' in window)) { alert('Motion sensors are not supported by this browser/device.'); return; }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') { alert('Motion permission was not granted.'); return; }
      }
      gyroEnabled = true; gyroBaseline = null; lastOrientation = null;
      window.addEventListener('deviceorientation', applyDeviceOrientation, true);
      gyroToggle.classList.add('active'); gyroToggle.title = 'Disable phone motion';
    } catch (error) { alert('Could not enable motion control. Please check browser permissions and use HTTPS.'); }
  }
  gyroToggle.addEventListener('click', toggleGyro);

  document.getElementById('zoom-in').addEventListener('click', () => { if (current) current.scene.view().setFov(Math.max(25 * Math.PI / 180, current.scene.view().fov() - 8 * Math.PI / 180)); });
  document.getElementById('zoom-out').addEventListener('click', () => { if (current) current.scene.view().setFov(Math.min(110 * Math.PI / 180, current.scene.view().fov() + 8 * Math.PI / 180)); });
  document.getElementById('reset-view').addEventListener('click', () => { if (current) current.scene.lookTo({ yaw: 0, pitch: 0, fov: Math.PI / 2 }, { transitionDuration: 500 }); });
  document.getElementById('fullscreen').addEventListener('click', () => { if (pano.requestFullscreen) pano.requestFullscreen(); });
  window.addEventListener('beforeunload', () => { objectUrls.forEach(URL.revokeObjectURL); });
  renderMap(); renderThumbnails(); updateAudioUi(); loadSavedPanoramas();
})();