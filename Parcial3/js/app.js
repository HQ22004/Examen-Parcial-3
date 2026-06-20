/*
 * app.js
 * Lógica principal de "La Cámara de los Cinco Desafíos".
 * Controla el avance secuencial entre niveles, la geolocalización,
 * el canvas, la cámara, y la comunicación con el Web Worker.
 */

(() => {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* ESTADO GLOBAL                                                     */
  /* ---------------------------------------------------------------- */
  const state = {
    coords: null,
    mapDrawn: false,
    photoDataUrl: null,
    level4Stats: null,
    level5Stats: null
  };

  const completedLevels = new Set();
  let currentLevel = 1;
  let pendingStartTime = 0;
  const heartbeatIntervals = {};

  /* ---------------------------------------------------------------- */
  /* HELPERS GENERALES                                                  */
  /* ---------------------------------------------------------------- */
  function setStatus(el, message, kind) {
    el.classList.remove('d-none', 'status-info', 'status-error', 'status-success');
    el.classList.add('status-' + kind);
    el.textContent = message;
  }

  function showLevel(target) {
    document.querySelectorAll('.level-panel').forEach(el => el.classList.add('d-none'));
    if (target === 'success') {
      document.getElementById('success-screen').classList.remove('d-none');
      currentLevel = 6;
    } else {
      document.getElementById('level-' + target).classList.remove('d-none');
      currentLevel = target;
    }
    updateDial();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateDial() {
    document.querySelectorAll('.dial-node').forEach(node => {
      const lvl = parseInt(node.dataset.level, 10);
      node.classList.remove('active', 'completed');
      if (completedLevels.has(lvl)) {
        node.classList.add('completed');
      } else if (lvl === currentLevel) {
        node.classList.add('active');
      }
    });
    document.querySelectorAll('.dial-bar').forEach((bar, idx) => {
      const leftLevel = idx + 1;
      bar.classList.toggle('filled', completedLevels.has(leftLevel));
    });
  }

  function startHeartbeat(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('d-none');
    let count = 0;
    heartbeatIntervals[elId] = setInterval(() => {
      count++;
      el.textContent = 'PULSO DEL SISTEMA · ' + count;
    }, 80);
  }

  function stopHeartbeat(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    clearInterval(heartbeatIntervals[elId]);
    el.classList.add('d-none');
  }

  /* ---------------------------------------------------------------- */
  /* NIVEL 1 · GEOLOCALIZACIÓN                                          */
  /* ---------------------------------------------------------------- */
  const btnGetLocation = document.getElementById('btn-get-location');
  const level1Status = document.getElementById('level1-status');
  const level1Coords = document.getElementById('level1-coords');
  const btnLevel1Continue = document.getElementById('btn-level1-continue');

  btnGetLocation.addEventListener('click', () => {
    setStatus(level1Status, 'Buscando señal de posicionamiento…', 'info');

    if (!('geolocation' in navigator)) {
      setStatus(level1Status, 'Error: este navegador no soporta geolocalización.', 'error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        state.coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        document.getElementById('coord-lat').textContent = state.coords.lat.toFixed(6);
        document.getElementById('coord-lon').textContent = state.coords.lon.toFixed(6);
        level1Coords.classList.remove('d-none');
        setStatus(level1Status, 'Ubicación adquirida correctamente. El cerrojo 01 está listo para abrirse.', 'success');
        btnLevel1Continue.disabled = false;
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus(level1Status, 'Permiso denegado: el sistema necesita acceso a tu ubicación para continuar.', 'error');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus(level1Status, 'Ubicación no disponible: no fue posible determinar tu posición actual.', 'error');
        } else if (err.code === err.TIMEOUT) {
          setStatus(level1Status, 'Tiempo de espera agotado al buscar la señal. Intenta nuevamente.', 'error');
        } else {
          setStatus(level1Status, 'Error desconocido al obtener la ubicación.', 'error');
        }
        btnLevel1Continue.disabled = true;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  btnLevel1Continue.addEventListener('click', () => {
    completedLevels.add(1);
    showLevel(2);
  });

  /* ---------------------------------------------------------------- */
  /* NIVEL 2 · CANVAS / MAPA                                            */
  /* ---------------------------------------------------------------- */
  const btnDrawMap = document.getElementById('btn-draw-map');
  const mapCanvas = document.getElementById('map-canvas');
  const level2Status = document.getElementById('level2-status');
  const btnLevel2Continue = document.getElementById('btn-level2-continue');

  function drawMap() {
    if (!state.coords) {
      setStatus(level2Status, 'No hay coordenadas registradas. Vuelve al Nivel 1 primero.', 'error');
      return;
    }

    const ctx = mapCanvas.getContext('2d');
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Fondo del sector
    ctx.fillStyle = '#11141a';
    ctx.fillRect(0, 0, w, h);

    // Cuadrícula que simula calles
    ctx.strokeStyle = 'rgba(232,163,61,0.22)';
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 40; y < h; y += 70) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Rectángulo: manzana / edificio de referencia
    ctx.strokeStyle = '#2FD9A8';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 60, 160, 100);
    ctx.fillStyle = 'rgba(47,217,168,0.08)';
    ctx.fillRect(60, 60, 160, 100);

    // Línea: avenida principal del sector
    ctx.strokeStyle = '#E8A33D';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, h - 40);
    ctx.lineTo(w - 20, 40);
    ctx.stroke();

    // Posición obtenida en el Nivel 1, proyectada al lienzo
    const fracLat = Math.abs(state.coords.lat - Math.trunc(state.coords.lat));
    const fracLon = Math.abs(state.coords.lon - Math.trunc(state.coords.lon));
    const px = 40 + fracLon * (w - 80);
    const py = 40 + fracLat * (h - 80);

    // Círculo: marcador de posición
    ctx.fillStyle = '#E5484D';
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Etiqueta de coordenadas
    ctx.fillStyle = '#ECEDEE';
    ctx.font = '12px monospace';
    const label = `(${state.coords.lat.toFixed(4)}, ${state.coords.lon.toFixed(4)})`;
    const labelX = px + 14 > w - 120 ? px - 130 : px + 14;
    ctx.fillText(label, labelX, py + 4);

    state.mapDrawn = true;
    setStatus(level2Status, 'Mapa generado y posición marcada correctamente.', 'success');
    btnLevel2Continue.disabled = false;
  }

  btnDrawMap.addEventListener('click', drawMap);

  btnLevel2Continue.addEventListener('click', () => {
    completedLevels.add(2);
    showLevel(3);
  });

  /* ---------------------------------------------------------------- */
  /* NIVEL 3 · CÁMARA                                                    */
  /* ---------------------------------------------------------------- */
  let cameraStream = null;
  const video = document.getElementById('camera-stream');
  const btnStartCamera = document.getElementById('btn-start-camera');
  const btnCapturePhoto = document.getElementById('btn-capture-photo');
  const level3Status = document.getElementById('level3-status');
  const photoCanvas = document.getElementById('photo-canvas');
  const capturedPhotoImg = document.getElementById('captured-photo');
  const photoPlaceholder = document.getElementById('photo-placeholder');
  const btnLevel3Continue = document.getElementById('btn-level3-continue');

  btnStartCamera.addEventListener('click', async () => {
    setStatus(level3Status, 'Solicitando acceso a la cámara…', 'info');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(level3Status, 'Error: este navegador no soporta acceso a la cámara.', 'error');
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = cameraStream;
      btnCapturePhoto.disabled = false;
      setStatus(level3Status, 'Cámara activa. Captura la evidencia cuando estés listo.', 'success');
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setStatus(level3Status, 'Cámara no encontrada: no se detectó ningún dispositivo de video en este equipo.', 'error');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus(level3Status, 'Permiso denegado: el sistema necesita acceso a la cámara para continuar.', 'error');
      } else {
        setStatus(level3Status, 'Error al acceder a la cámara: ' + err.message, 'error');
      }
    }
  });

  btnCapturePhoto.addEventListener('click', () => {
    if (!cameraStream) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    photoCanvas.width = w;
    photoCanvas.height = h;
    const ctx = photoCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = photoCanvas.toDataURL('image/png');
    state.photoDataUrl = dataUrl;

    capturedPhotoImg.src = dataUrl;
    capturedPhotoImg.classList.remove('d-none');
    photoPlaceholder.classList.add('d-none');

    try {
      localStorage.setItem('escapeRoom_evidencePhoto', dataUrl);
      setStatus(level3Status, 'Fotografía capturada y guardada en LocalStorage.', 'success');
    } catch (e) {
      setStatus(level3Status, 'Fotografía capturada, pero no se pudo guardar en LocalStorage: ' + e.message, 'error');
    }

    btnLevel3Continue.disabled = false;
  });

  btnLevel3Continue.addEventListener('click', () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
    }
    completedLevels.add(3);
    showLevel(4);
  });

  /* ---------------------------------------------------------------- */
  /* WORKER COMPARTIDO (NIVELES 4 y 5)                                   */
  /* ---------------------------------------------------------------- */
  const worker = new Worker('js/worker.js');

  const btnLevel4Process = document.getElementById('btn-level4-process');
  const level4ProgressWrap = document.getElementById('level4-progress-wrap');
  const level4ProgressBar = document.getElementById('level4-progress-bar');
  const level4StatsCard = document.getElementById('level4-stats-card');
  const btnLevel4Continue = document.getElementById('btn-level4-continue');

  const btnLevel5Process = document.getElementById('btn-level5-process');
  const level5ProgressWrap = document.getElementById('level5-progress-wrap');
  const level5ProgressBar = document.getElementById('level5-progress-bar');
  const level5StatsCard = document.getElementById('level5-stats-card');
  const btnDownloadJson = document.getElementById('btn-download-json');
  const btnLevel5Finish = document.getElementById('btn-level5-finish');

  worker.onmessage = (e) => {
    const data = e.data;

    if (data.type === 'progress') {
      const bar = data.level === 4 ? level4ProgressBar : level5ProgressBar;
      bar.style.width = data.percent + '%';
      bar.textContent = data.percent + '%';
      bar.setAttribute('aria-valuenow', data.percent);
      return;
    }

    if (data.type === 'result') {
      const elapsed = ((performance.now() - pendingStartTime) / 1000).toFixed(2) + ' s';

      if (data.level === 4) {
        handleLevel4Result(data.stats, elapsed);
      } else if (data.level === 5) {
        handleLevel5Result(data.stats, elapsed);
      }
    }
  };

  worker.onerror = (err) => {
    console.error('Error en el Worker:', err);
  };

  /* ---------------------------------------------------------------- */
  /* NIVEL 4 · NÚCLEO DE PROCESAMIENTO                                   */
  /* ---------------------------------------------------------------- */
  function generateLevel4Data(n) {
    const temps = new Float32Array(n);
    const hums = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      temps[i] = Math.random() * 30 + 10; // 10°C - 40°C
      hums[i] = Math.random() * 70 + 20; // 20% - 90%
    }
    return { temps, hums };
  }

  btnLevel4Process.addEventListener('click', () => {
    btnLevel4Process.disabled = true;
    level4ProgressWrap.classList.remove('d-none');
    level4ProgressBar.style.width = '0%';
    level4ProgressBar.textContent = '0%';
    level4StatsCard.classList.add('d-none');
    btnLevel4Continue.disabled = true;
    startHeartbeat('level4-heartbeat');

    const N = 20000;
    const { temps, hums } = generateLevel4Data(N);
    pendingStartTime = performance.now();

    worker.postMessage({ type: 'level4', temps, hums }, [temps.buffer, hums.buffer]);
  });

  function handleLevel4Result(stats, elapsed) {
    stopHeartbeat('level4-heartbeat');
    btnLevel4Process.disabled = false;
    state.level4Stats = stats;

    document.getElementById('stat-temp-avg').textContent = stats.tempAvg.toFixed(2) + ' °C';
    document.getElementById('stat-temp-max').textContent = stats.tempMax.toFixed(2) + ' °C';
    document.getElementById('stat-temp-min').textContent = stats.tempMin.toFixed(2) + ' °C';
    document.getElementById('stat-hum-avg').textContent = stats.humAvg.toFixed(2) + ' %';
    document.getElementById('stat-hum-max').textContent = stats.humMax.toFixed(2) + ' %';
    document.getElementById('stat-hum-min').textContent = stats.humMin.toFixed(2) + ' %';
    document.getElementById('stat-count').textContent = stats.count.toLocaleString('es-SV');
    document.getElementById('stat-time').textContent = elapsed;

    level4StatsCard.classList.remove('d-none');
    btnLevel4Continue.disabled = false;
  }

  btnLevel4Continue.addEventListener('click', () => {
    completedLevels.add(4);
    showLevel(5);
  });

  /* ---------------------------------------------------------------- */
  /* NIVEL 5 · PORTAL CUÁNTICO                                           */
  /* ---------------------------------------------------------------- */
  function generateLevel5Data(n) {
    const temps = new Float32Array(n);
    const hums = new Float32Array(n);
    const pres = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      let t = Math.random() * 20 + 15;  // 15°C a 35°C (rango realista)
      let h = Math.random() * 75 + 20;  // 20% a 95%
      let p = Math.random() * 60 + 970; // 970 a 1030 hPa

      // Inyección intencional de valores corruptos (negativos), ~10% por campo
      if (Math.random() < 0.10) t = -t;
      if (Math.random() < 0.10) h = -h;
      if (Math.random() < 0.10) p = -p;

      temps[i] = t;
      hums[i] = h;
      pres[i] = p;
    }

    return { temps, hums, pres };
  }

  btnLevel5Process.addEventListener('click', () => {
    btnLevel5Process.disabled = true;
    level5ProgressWrap.classList.remove('d-none');
    level5ProgressBar.style.width = '0%';
    level5ProgressBar.textContent = '0%';
    level5StatsCard.classList.add('d-none');
    btnDownloadJson.disabled = true;
    btnLevel5Finish.disabled = true;
    startHeartbeat('level5-heartbeat');

    const N = 250000;
    const { temps, hums, pres } = generateLevel5Data(N);
    pendingStartTime = performance.now();

    worker.postMessage({ type: 'level5', temps, hums, pres }, [temps.buffer, hums.buffer, pres.buffer]);
  });

  function handleLevel5Result(stats, elapsed) {
    stopHeartbeat('level5-heartbeat');
    btnLevel5Process.disabled = false;
    state.level5Stats = stats;

    document.getElementById('p5-avg-temp').textContent = stats.avgTemp.toFixed(2) + ' °C';
    document.getElementById('p5-avg-hum').textContent = stats.avgHum.toFixed(2) + ' %';
    document.getElementById('p5-avg-pres').textContent = stats.avgPres.toFixed(2) + ' hPa';
    document.getElementById('p5-valid-count').textContent = stats.validCount.toLocaleString('es-SV');
    document.getElementById('p5-discarded').textContent = stats.discarded.toLocaleString('es-SV');
    document.getElementById('p5-time').textContent = elapsed;

    const topTempList = document.getElementById('p5-top-temp');
    topTempList.innerHTML = '';
    stats.topTemps.forEach(v => {
      const li = document.createElement('li');
      li.textContent = v.toFixed(3) + ' °C';
      topTempList.appendChild(li);
    });

    const topPresList = document.getElementById('p5-top-pres');
    topPresList.innerHTML = '';
    stats.topPres.forEach(v => {
      const li = document.createElement('li');
      li.textContent = v.toFixed(3) + ' hPa';
      topPresList.appendChild(li);
    });

    level5StatsCard.classList.remove('d-none');
    btnDownloadJson.disabled = false;
    btnLevel5Finish.disabled = false;
  }

  btnDownloadJson.addEventListener('click', () => {
    if (!state.level5Stats) return;

    const payload = {
      generadoEn: new Date().toISOString(),
      nivel: 5,
      titulo: 'Diagnóstico del Portal Cuántico',
      ...state.level5Stats
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portal-cuantico-resultados.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  btnLevel5Finish.addEventListener('click', () => {
    completedLevels.add(5);
    showLevel('success');
  });

  /* ---------------------------------------------------------------- */
  /* INICIO                                                              */
  /* ---------------------------------------------------------------- */
  updateDial();
})();
