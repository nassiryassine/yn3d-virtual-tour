(() => {
  const input = document.getElementById('pano-upload');
  const list = document.getElementById('scene-list');
  const counter = document.getElementById('scene-counter');
  const pano = document.getElementById('pano');
  const map = document.getElementById('route-map');
  const scenes = [];
  let viewer = null;
  let current = null;
  const objectUrls = [];

  // The route map is intentionally schematic: it represents the order of
  // the four viewpoints, not the hospital's surveyed floor plan.
  // Hotspot yaw values are starting positions. Adjust them after checking
  // which direction the corridor continues in each D5 panorama.
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
    el.type = 'button';
    el.textContent = symbol;
    el.setAttribute('aria-label', label);
    el.title = label;
    el.addEventListener('click', () => activate(destination));
    return el;
  }

  function connectAdjacentScenes() {
    scenes.forEach((item, index) => {
      const container = item.scene.hotspotContainer();
      if (index < scenes.length - 1) {
        const next = scenes[index + 1];
        container.createHotspot(
          makeHotspot(`Continue to ${next.name}`, '➜', next, 'forward'),
          { yaw: HOTSPOT_YAW.forward, pitch: -0.12 }
        );
      }
      if (index > 0) {
        const previous = scenes[index - 1];
        container.createHotspot(
          makeHotspot(`Return to ${previous.name}`, '←', previous, 'back'),
          { yaw: HOTSPOT_YAW.back, pitch: -0.12 }
        );
      }
    });
  }

  function activate(item) {
    if (!item) return;
    current = item;
    item.scene.switchTo({ transitionDuration: 650 });
    renderList();
    renderMap();
    const index = scenes.indexOf(item);
    counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} — ${item.name.toUpperCase()}`;
    const placeholder = pano.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.remove();
  }

  function renderList() {
    list.innerHTML = '';
    scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.className = 'scene-button' + (scene === current ? ' active' : '');
      button.innerHTML = `<span class="scene-number">${String(index + 1).padStart(2, '0')}</span><span class="scene-name"></span><span class="scene-chevron">›</span>`;
      button.querySelector('.scene-name').textContent = scene.name;
      button.addEventListener('click', () => activate(scene));
      list.appendChild(button);
    });
    if (!scenes.length) {
      list.innerHTML = '<div class="empty-scenes">No panorama scenes found. Check the file names and folder.</div>';
    }
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

  function addSceneFromUrl(url, name, temporary = false) {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (Math.abs(width / height - 2) > 0.04) {
          if (temporary) URL.revokeObjectURL(url);
          resolve(false);
          return;
        }
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
        const ok = await addSceneFromUrl(url, sceneLabel(number, `Panorama_${number}`));
        if (ok) { loaded = true; break; }
      }
      if (!loaded) console.info(`Panorama_${number} was not found. Checked JPG, JPEG, PNG and WEBP.`);
    }
    connectAdjacentScenes();
    renderList();
    renderMap();
    if (scenes.length) activate(scenes[0]);
    else counter.textContent = 'NO SCENES FOUND';
  }

  input.addEventListener('change', async event => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const name = file.name.replace(/\.[^.]+$/, '');
      const ok = await addSceneFromUrl(url, name, true);
      if (!ok) alert(`${file.name}: use a 2:1 equirectangular panorama (for example 6000 × 3000).`);
    }
    connectAdjacentScenes();
    renderList();
    renderMap();
    if (scenes.length && !current) activate(scenes[0]);
    input.value = '';
  });

  document.getElementById('zoom-in').addEventListener('click', () => {
    if (current) current.scene.view().setFov(Math.max(25 * Math.PI / 180, current.scene.view().fov() - 8 * Math.PI / 180));
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    if (current) current.scene.view().setFov(Math.min(110 * Math.PI / 180, current.scene.view().fov() + 8 * Math.PI / 180));
  });
  document.getElementById('reset-view').addEventListener('click', () => {
    if (current) current.scene.lookTo({ yaw: 0, pitch: 0, fov: Math.PI / 2 }, { transitionDuration: 500 });
  });
  document.getElementById('fullscreen').addEventListener('click', () => {
    if (pano.requestFullscreen) pano.requestFullscreen();
  });
  window.addEventListener('beforeunload', () => objectUrls.forEach(URL.revokeObjectURL));

  renderMap();
  loadSavedPanoramas();
})();
