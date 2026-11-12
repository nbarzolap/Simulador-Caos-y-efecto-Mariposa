(function () {
  'use strict';

  const MAX_POINTS = 5000;
  const STORAGE_KEY = 'lorenz_didactico_v1';

  const state = {
    running: false,
    slow: false,
    t: 0,
    x0: 1, y0: 1, z0: 1,
    delta: 0.001,
    sigma: 10, rho: 28, beta: 2.67, dt: 0.01,
    a: { x: 1, y: 1, z: 1 },
    b: { x: 1.001, y: 1, z: 1 },
    ptsA: [],
    ptsB: [],
    series: [],
    lastSample: -1,
    useThree: false
  };

  const hasThree = typeof THREE !== 'undefined' && typeof THREE.OrbitControls !== 'undefined';
  const hasChart = typeof Chart !== 'undefined';
  const hasXLSX = typeof XLSX !== 'undefined';

  // Modelo de Lorenz + Runge-Kutta 4to orden (RK4)
  const deriv = (s, sig, rho, bet) => ({
    dx: sig * (s.y - s.x),
    dy: s.x * (rho - s.z) - s.y,
    dz: s.x * s.y - bet * s.z
  });

  function rk4(s, dt, sig, rho, bet) {
    const k1 = deriv(s, sig, rho, bet);
    const k2 = deriv({ x: s.x + 0.5 * dt * k1.dx, y: s.y + 0.5 * dt * k1.dy, z: s.z + 0.5 * dt * k1.dz }, sig, rho, bet);
    const k3 = deriv({ x: s.x + 0.5 * dt * k2.dx, y: s.y + 0.5 * dt * k2.dy, z: s.z + 0.5 * dt * k2.dz }, sig, rho, bet);
    const k4 = deriv({ x: s.x + dt * k3.dx, y: s.y + dt * k3.dy, z: s.z + dt * k3.dz }, sig, rho, bet);
    return {
      x: s.x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
      y: s.y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy),
      z: s.z + (dt / 6) * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz)
    };
  }

  const dist3D = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

  function fmtTime(sec) {
    const msTotal = Math.max(0, Math.round(sec * 1000));
    const h = String(Math.floor(msTotal / 3600000)).padStart(2, '0');
    const m = String(Math.floor((msTotal % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((msTotal % 60000) / 1000)).padStart(2, '0');
    const ms = String(msTotal % 1000).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  // Escena 3D (Three.js + respaldo Canvas 3D interactivo)
  let scene, camera, renderer, controls, lineA, lineB, headA, headB, arrA, arrB;
  let fbCanvas, fbCtx, rotY = 0.45, rotX = 0.25, zoom = 7.2, drag = false, prevM = { x: 0, y: 0 };

  function init3D() {
    const box = document.getElementById('three-container');
    const w = Math.max(box.clientWidth, 300);
    const h = Math.max(box.clientHeight, 340);

    if (hasThree) {
      try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050811);
        camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 1000);
        camera.position.set(0, 14, 72);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        box.innerHTML = '';
        box.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const grid = new THREE.GridHelper(68, 14, 0x3b82f6, 0x1e293b);
        grid.position.y = -25;
        scene.add(grid);

        const axes = new THREE.AxesHelper(30);
        axes.position.y = -25;
        scene.add(axes);

        arrA = new Float32Array(MAX_POINTS * 3);
        arrB = new Float32Array(MAX_POINTS * 3);

        const gA = new THREE.BufferGeometry();
        gA.setAttribute('position', new THREE.BufferAttribute(arrA, 3));
        lineA = new THREE.Line(gA, new THREE.LineBasicMaterial({ color: 0x3b82f6 }));
        lineA.frustumCulled = false;
        scene.add(lineA);

        const gB = new THREE.BufferGeometry();
        gB.setAttribute('position', new THREE.BufferAttribute(arrB, 3));
        lineB = new THREE.Line(gB, new THREE.LineBasicMaterial({ color: 0xef4444 }));
        lineB.frustumCulled = false;
        scene.add(lineB);

        const sp = new THREE.SphereGeometry(0.8, 14, 14);
        headA = new THREE.Mesh(sp, new THREE.MeshBasicMaterial({ color: 0x60a5fa }));
        headB = new THREE.Mesh(sp, new THREE.MeshBasicMaterial({ color: 0xf87171 }));
        scene.add(headA, headB);

        state.useThree = true;
      } catch (e) {
        state.useThree = false;
      }
    }

    if (!state.useThree) {
      box.innerHTML = '';
      fbCanvas = document.createElement('canvas');
      fbCanvas.width = w;
      fbCanvas.height = h;
      box.appendChild(fbCanvas);
      fbCtx = fbCanvas.getContext('2d');

      fbCanvas.addEventListener('mousedown', (e) => { drag = true; prevM = { x: e.clientX, y: e.clientY }; });
      window.addEventListener('mouseup', () => { drag = false; });
      window.addEventListener('mousemove', (e) => {
        if (!drag) return;
        rotY += (e.clientX - prevM.x) * 0.008;
        rotX = Math.max(-1.4, Math.min(1.4, rotX + (e.clientY - prevM.y) * 0.008));
        prevM = { x: e.clientX, y: e.clientY };
      });
      fbCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom = Math.max(2.5, Math.min(20, zoom - e.deltaY * 0.005));
      }, { passive: false });
    }

    window.addEventListener('resize', () => {
      const nw = box.clientWidth, nh = box.clientHeight;
      if (nw <= 0 || nh <= 0) return;
      if (state.useThree) {
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      } else if (fbCanvas) {
        fbCanvas.width = nw;
        fbCanvas.height = nh;
      }
    });
  }

  function proj(pt, w, h) {
    const x = pt.x, y = pt.z - 25, z = pt.y;
    const x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
    const z1 = x * Math.sin(rotY) + z * Math.cos(rotY);
    const y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
    const z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
    const f = 95 / (95 + z2);
    return { sx: w / 2 + x1 * zoom * f, sy: h / 2 - y2 * zoom * f };
  }

  function renderFallback() {
    if (!fbCtx) return;
    const w = fbCanvas.width, h = fbCanvas.height;
    fbCtx.fillStyle = '#050811';
    fbCtx.fillRect(0, 0, w, h);

    fbCtx.strokeStyle = '#1e293b';
    for (let g = -30; g <= 30; g += 6) {
      const a = proj({ x: g, y: -30, z: 0 }, w, h), b = proj({ x: g, y: 30, z: 0 }, w, h);
      fbCtx.beginPath(); fbCtx.moveTo(a.sx, a.sy); fbCtx.lineTo(b.sx, b.sy); fbCtx.stroke();
      const c = proj({ x: -30, y: g, z: 0 }, w, h), d = proj({ x: 30, y: g, z: 0 }, w, h);
      fbCtx.beginPath(); fbCtx.moveTo(c.sx, c.sy); fbCtx.lineTo(d.sx, d.sy); fbCtx.stroke();
    }

    const drawLine = (pts, col) => {
      if (!pts.length) return;
      fbCtx.strokeStyle = col;
      fbCtx.lineWidth = 2;
      fbCtx.beginPath();
      pts.forEach((p, i) => {
        const pr = proj(p, w, h);
        i === 0 ? fbCtx.moveTo(pr.sx, pr.sy) : fbCtx.lineTo(pr.sx, pr.sy);
      });
      fbCtx.stroke();
    };
    drawLine(state.ptsA, '#3b82f6');
    drawLine(state.ptsB, '#ef4444');
  }

  function update3D() {
    if (state.useThree) {
      state.ptsA.forEach((p, i) => { arrA[i * 3] = p.x; arrA[i * 3 + 1] = p.z - 25; arrA[i * 3 + 2] = p.y; });
      lineA.geometry.attributes.position.needsUpdate = true;
      lineA.geometry.setDrawRange(0, state.ptsA.length);

      state.ptsB.forEach((p, i) => { arrB[i * 3] = p.x; arrB[i * 3 + 1] = p.z - 25; arrB[i * 3 + 2] = p.y; });
      lineB.geometry.attributes.position.needsUpdate = true;
      lineB.geometry.setDrawRange(0, state.ptsB.length);

      const la = state.ptsA[state.ptsA.length - 1];
      const lb = state.ptsB[state.ptsB.length - 1];
      if (la) headA.position.set(la.x, la.z - 25, la.y);
      if (lb) headB.position.set(lb.x, lb.z - 25, lb.y);
    } else {
      renderFallback();
    }
  }

  // Gráfica Logarítmica
  let chart = null;
  function initChart() {
    const c = document.getElementById('divergence-chart');
    if (!c || !hasChart) return;
    chart = new Chart(c.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Separación Δd(t) entre trayectorias (Escala Logarítmica)',
          data: [],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.16)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#f1f5f9' } } },
        scales: {
          x: { title: { display: true, text: 'Tiempo simulado (s)', color: '#94a3b8' }, ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { color: '#1e293b' } },
          y: {
            type: 'logarithmic',
            title: { display: true, text: 'Distancia Δd (log₁₀)', color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid: { color: '#334155' }
          }
        }
      }
    });
  }

  function updateUI() {
    const d = dist3D(state.a, state.b);
    document.getElementById('ind-time').textContent = fmtTime(state.t);
    document.getElementById('ind-distance').textContent = d.toFixed(6);

    const st = document.getElementById('ind-state');
    if (d < 0.5) { st.textContent = 'Viajan Juntas'; st.className = 'badge green'; }
    else if (d < 5) { st.textContent = 'Separación Activa'; st.className = 'badge yellow'; }
    else { st.textContent = '¡Efecto Mariposa!'; st.className = 'badge red-bg'; }

    document.getElementById('ind-summary').textContent =
      `A(${state.x0},${state.y0},${state.z0}) Δ=${state.delta} | σ=${state.sigma}, ρ=${state.rho}, β=${state.beta}`;
  }

  function resetSim() {
    state.running = false;
    state.t = 0;
    state.lastSample = 0;
    state.a = { x: state.x0, y: state.y0, z: state.z0 };
    state.b = { x: state.x0 + state.delta, y: state.y0, z: state.z0 };
    state.ptsA = [{ ...state.a }];
    state.ptsB = [{ ...state.b }];
    const d0 = dist3D(state.a, state.b);
    state.series = [{ tiempo: 0, distancia: d0 }];

    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = true;

    update3D();
    updateUI();
    if (chart) {
      chart.data.labels = ['0.00'];
      chart.data.datasets[0].data = [Math.max(d0, 1e-12)];
      chart.update();
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    if (state.running) {
      const steps = state.slow ? 1 : 3;
      for (let i = 0; i < steps; i++) {
        state.a = rk4(state.a, state.dt, state.sigma, state.rho, state.beta);
        state.b = rk4(state.b, state.dt, state.sigma, state.rho, state.beta);
        state.t += state.dt;
        state.ptsA.push({ ...state.a });
        state.ptsB.push({ ...state.b });
        if (state.ptsA.length > MAX_POINTS) { state.ptsA.shift(); state.ptsB.shift(); }

        if (state.t - state.lastSample >= 0.05) {
          const d = dist3D(state.a, state.b);
          state.lastSample = state.t;
          state.series.push({ tiempo: Number(state.t.toFixed(3)), distancia: Number(d.toFixed(8)) });
          if (chart) {
            chart.data.labels.push(state.t.toFixed(2));
            chart.data.datasets[0].data.push(Math.max(d, 1e-12));
            if (chart.data.labels.length > 1200) {
              chart.data.labels.shift();
              chart.data.datasets[0].data.shift();
            }
            chart.update('none');
          }
        }
      }
      update3D();
      updateUI();
    }
    if (state.useThree && renderer) {
      controls.update();
      renderer.render(scene, camera);
    }
  }

  function setupEvents() {
    const map = [
      ['x0', 2], ['y0', 2], ['z0', 2], ['delta', 4],
      ['sigma', 2], ['rho', 2], ['beta', 2], ['dt', 3]
    ];
    map.forEach(([k, dec]) => {
      const sl = document.getElementById(`slider-${k}`);
      const inp = document.getElementById(`input-${k}`);
      const lbl = document.getElementById(`val-${k}`);
      const sync = (v) => {
        const n = parseFloat(v);
        if (Number.isNaN(n)) return;
        state[k] = n;
        sl.value = n;
        inp.value = n;
        lbl.textContent = n.toFixed(dec);
        if (!state.running && state.t === 0) resetSim();
        else updateUI();
      };
      sl.addEventListener('input', (e) => sync(e.target.value));
      inp.addEventListener('change', (e) => sync(e.target.value));
    });

    document.getElementById('btn-start').addEventListener('click', () => {
      state.running = true;
      document.getElementById('btn-start').disabled = true;
      document.getElementById('btn-pause').disabled = false;
    });
    document.getElementById('btn-pause').addEventListener('click', () => {
      state.running = false;
      document.getElementById('btn-start').disabled = false;
      document.getElementById('btn-pause').disabled = true;
    });
    document.getElementById('btn-reset').addEventListener('click', resetSim);
    document.getElementById('btn-reset-view').addEventListener('click', () => {
      if (state.useThree) { camera.position.set(0, 14, 72); controls.target.set(0, 0, 0); }
      else { rotY = 0.45; rotX = 0.25; zoom = 7.2; renderFallback(); }
    });
    document.getElementById('btn-slow-motion').addEventListener('click', (e) => {
      state.slow = !state.slow;
      e.target.classList.toggle('active', state.slow);
    });

    // Registro localStorage
    let records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const tbody = document.getElementById('experiments-tbody');
    const fb = document.getElementById('form-feedback');

    const renderRecords = () => {
      tbody.innerHTML = records.length ? '' : '<tr><td colspan="11">Aún no hay ensayos guardados.</td></tr>';
      records.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${i + 1}</td><td>${r.fecha}</td><td>${r.idEst}</td><td>${r.grupo}</td>
          <td>(${r.x0},${r.y0},${r.z0})</td><td>${r.delta}</td><td>${r.sigma},${r.rho},${r.beta}</td>
          <td>${r.tiempo}</td><td>${r.dist}</td><td>${r.estado}</td>
          <td><button class="btn btn-danger" data-del="${i}">X</button></td>`;
        tbody.appendChild(tr);
      });
    };
    renderRecords();

    tbody.addEventListener('click', (e) => {
      const idx = e.target.getAttribute('data-del');
      if (idx !== null) {
        records.splice(Number(idx), 1);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        renderRecords();
      }
    });

    document.getElementById('experiment-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const idEst = document.getElementById('student-id').value.trim();
      const grupo = document.getElementById('student-group').value.trim();
      if (!idEst || !grupo) {
        fb.textContent = 'Completa los campos obligatorios: Código estudiante y Grupo.';
        fb.className = 'feedback err';
        return;
      }
      const d = dist3D(state.a, state.b);
      records.push({
        fecha: new Date().toLocaleString('es-ES'),
        idEst,
        nombre: document.getElementById('student-name').value.trim(),
        curso: document.getElementById('student-course').value.trim(),
        grupo,
        x0: state.x0, y0: state.y0, z0: state.z0, delta: state.delta,
        sigma: state.sigma, rho: state.rho, beta: state.beta, dt: state.dt,
        tiempo: fmtTime(state.t),
        dist: Number(d.toFixed(6)),
        estado: document.getElementById('ind-state').textContent,
        hipotesis: document.getElementById('exp-hypothesis').value.trim(),
        observaciones: document.getElementById('exp-observations').value.trim(),
        serie: state.series.slice()
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      renderRecords();
      fb.textContent = 'Ensayo #' + records.length + ' guardado correctamente.';
      fb.className = 'feedback ok';
    });

    // Exportar Excel (2 hojas)
    document.getElementById('btn-export-xlsx').addEventListener('click', () => {
      if (!hasXLSX) return alert('Sin conexión para cargar SheetJS. Usa CSV.');
      const data = records.length ? records : [{
        fecha: new Date().toLocaleString('es-ES'), idEst: 'ACTUAL', nombre: '', curso: '', grupo: '-',
        x0: state.x0, y0: state.y0, z0: state.z0, delta: state.delta,
        sigma: state.sigma, rho: state.rho, beta: state.beta, dt: state.dt,
        tiempo: fmtTime(state.t), dist: dist3D(state.a, state.b),
        estado: document.getElementById('ind-state').textContent, hipotesis: '', observaciones: '',
        serie: state.series
      }];
      const h1 = data.map(({ serie, ...rest }) => rest);
      const h2 = [];
      data.forEach((r, i) => (r.serie || state.series).forEach((p) => h2.push({ Ensayo: i + 1, ...p })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h1), 'Ensayos');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h2), 'Divergencia');
      XLSX.writeFile(wb, 'Lorenz_Resultados.xlsx');
    });

    // Exportar CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      const rows = [['Fecha', 'ID', 'Grupo', 'X0', 'Y0', 'Z0', 'Delta', 'Sigma', 'Rho', 'Beta', 'Tiempo', 'Distancia', 'Estado']];
      records.forEach((r) => rows.push([r.fecha, r.idEst, r.grupo, r.x0, r.y0, r.z0, r.delta, r.sigma, r.rho, r.beta, r.tiempo, r.dist, r.estado]));
      const blob = new Blob(['\uFEFF' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Lorenz_Ensayos.csv';
      a.click();
    });

    // Evaluación
    document.getElementById('btn-grade-quiz').addEventListener('click', () => {
      const ans = { q1: 'b', q2: 'b', q3: 'b', q4: 'b', q5: 'b' };
      let ok = 0;
      Object.keys(ans).forEach((q) => {
        const sel = document.querySelector(`input[name="${q}"]:checked`);
        if (sel && sel.value === ans[q]) ok++;
      });
      document.getElementById('quiz-score').textContent = `Puntaje: ${ok} / 5 (${ok * 20}%)`;
    });
  }

  window.addEventListener('load', () => {
    init3D();
    initChart();
    setupEvents();
    resetSim();
    loop();
  });
})();