/*
 * worker.js
 * Procesa los datos de sensores fuera del hilo principal.
 * Recibe Typed Arrays transferidos (Transferable Objects) y responde
 * con mensajes de progreso ('progress') y un mensaje final ('result').
 */

self.onmessage = function (e) {
  const data = e.data;

  if (data.type === 'level4') {
    processLevel4(data.temps, data.hums);
  } else if (data.type === 'level5') {
    processLevel5(data.temps, data.hums, data.pres);
  }
};

/* ---------------- NIVEL 4: promedios, máximos y mínimos ---------------- */
function processLevel4(temps, hums) {
  const n = temps.length;
  const totalChunks = 20;
  const chunkSize = Math.ceil(n / totalChunks);
  let i = 0;

  let sumT = 0, maxT = -Infinity, minT = Infinity;
  let sumH = 0, maxH = -Infinity, minH = Infinity;

  function step() {
    const end = Math.min(i + chunkSize, n);
    for (; i < end; i++) {
      const t = temps[i];
      const h = hums[i];
      sumT += t;
      if (t > maxT) maxT = t;
      if (t < minT) minT = t;
      sumH += h;
      if (h > maxH) maxH = h;
      if (h < minH) minH = h;
    }

    const percent = Math.round((i / n) * 100);
    self.postMessage({ type: 'progress', level: 4, percent });

    if (i < n) {
      setTimeout(step, 0);
    } else {
      self.postMessage({
        type: 'result',
        level: 4,
        stats: {
          tempAvg: sumT / n,
          tempMax: maxT,
          tempMin: minT,
          humAvg: sumH / n,
          humMax: maxH,
          humMin: minH,
          count: n
        }
      });
    }
  }

  step();
}

/* ---------------- NIVEL 5: filtrado, promedios y top 10 ---------------- */
function processLevel5(temps, hums, pres) {
  const n = temps.length;
  const totalChunks = 40;
  const chunkSize = Math.ceil(n / totalChunks);
  let i = 0;

  let sumT = 0, sumH = 0, sumP = 0;
  let validCount = 0;
  const validTemps = [];
  const validPres = [];

  function step() {
    const end = Math.min(i + chunkSize, n);
    for (; i < end; i++) {
      const t = temps[i];
      const h = hums[i];
      const p = pres[i];

      // Se descarta el registro si CUALQUIERA de sus valores es negativo
      if (t < 0 || h < 0 || p < 0) continue;

      sumT += t;
      sumH += h;
      sumP += p;
      validTemps.push(t);
      validPres.push(p);
      validCount++;
    }

    const percent = Math.round((i / n) * 100);
    self.postMessage({ type: 'progress', level: 5, percent });

    if (i < n) {
      setTimeout(step, 0);
    } else {
      validTemps.sort((a, b) => b - a);
      validPres.sort((a, b) => b - a);

      self.postMessage({
        type: 'result',
        level: 5,
        stats: {
          avgTemp: validCount ? sumT / validCount : 0,
          avgHum: validCount ? sumH / validCount : 0,
          avgPres: validCount ? sumP / validCount : 0,
          validCount,
          discarded: n - validCount,
          topTemps: validTemps.slice(0, 10),
          topPres: validPres.slice(0, 10)
        }
      });
    }
  }

  step();
}
