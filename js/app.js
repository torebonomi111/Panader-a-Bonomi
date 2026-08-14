/* =========================================================
   BONOMI — Gestión de Panadería
   App de una sola página, sin frameworks. Persiste todo en
   localStorage del navegador (no hay backend/servidor).
   ========================================================= */

const STORAGE_KEY = 'bonomi_db_v1';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const TAB_NAMES = {
  reporte: 'Reporte General',
  ventas: 'Ventas',
  precios: 'Lista de Precios',
  productos: 'Productos',
  materiaprima: 'Materia Prima',
  compras: 'Compras'
};

/* ---------------------------------------------------------
   1. MODELO DE DATOS Y PERSISTENCIA
   --------------------------------------------------------- */

function emptyDB() {
  return {
    materiasPrimas: [], // {id, nombre, unidad, costoUnitario, stockActual, stockMinimo}
    productos: [],       // {id, nombre, unidadVenta, receta:[{mpId,cantidad}], gananciaIndividual}
    ventas: [],           // {id, fecha(ISO), hora(0-23), items:[{productoId,cantidad,precioUnitario,total}], total}
    compras: [],           // {id, fecha, mpId, cantidad, unidad, precioTotal, costoUnitarioCalculado}
    config: { gananciaGlobal: 40, iva: 21 }
  };
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // aseguramos que existan todas las claves aunque vengan de una versión vieja
      return Object.assign(emptyDB(), parsed);
    } catch (e) {
      console.error('No se pudo leer la base de datos guardada:', e);
    }
  }
  return null;
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
}

let DB = loadDB() || emptyDB();

/* ---------------------------------------------------------
   2. UTILIDADES
   --------------------------------------------------------- */

function uid(prefix) {
  return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10);
}

function fmtMoney(v) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(v || 0);
}

function getMP(id) { return DB.materiasPrimas.find(m => m.id === id); }
function getProducto(id) { return DB.productos.find(p => p.id === id); }

/** Costo de un producto según su receta y el costo unitario actual de cada materia prima */
function costoProducto(producto) {
  return (producto.receta || []).reduce((sum, r) => {
    const mp = getMP(r.mpId);
    if (!mp) return sum;
    return sum + (mp.costoUnitario * r.cantidad);
  }, 0);
}

/** Ganancia efectiva de un producto: la individual si la tiene, si no la general */
function gananciaProducto(producto) {
  return (producto.gananciaIndividual != null) ? producto.gananciaIndividual : DB.config.gananciaGlobal;
}

/** Valor de venta sin IVA = costo * (1 + ganancia%) */
function precioVenta(producto) {
  const costo = costoProducto(producto);
  const g = gananciaProducto(producto);
  return costo * (1 + g / 100);
}

/** Valor de venta con IVA */
function precioVentaConIVA(producto) {
  return precioVenta(producto) * (1 + DB.config.iva / 100);
}

/* ---------------------------------------------------------
   3. COMPONENTE: combobox buscable (como el autocompletar de Excel)
   --------------------------------------------------------- */

function createSearchSelect({ items, placeholder, onSelect, getLabel, getSublabel }) {
  getLabel = getLabel || (i => i.nombre);
  const wrapper = document.createElement('div');
  wrapper.className = 'search-select';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder || 'Buscar...';
  input.autocomplete = 'off';

  const list = document.createElement('div');
  list.className = 'search-select-list hidden';

  wrapper.appendChild(input);
  wrapper.appendChild(list);

  let selected = null;

  function renderList(filter) {
    filter = (filter || '').trim().toLowerCase();
    const all = items();
    const filtered = filter ? all.filter(i => getLabel(i).toLowerCase().includes(filter)) : all;
    list.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-select-empty';
      empty.textContent = all.length === 0 ? 'No hay elementos cargados todavía.' : 'Sin resultados.';
      list.appendChild(empty);
      list.classList.remove('hidden');
      return;
    }
    filtered.slice(0, 60).forEach(item => {
      const opt = document.createElement('div');
      opt.className = 'search-select-option';
      opt.textContent = getLabel(item) + (getSublabel ? (' — ' + getSublabel(item)) : '');
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selected = item;
        input.value = getLabel(item);
        list.classList.add('hidden');
        onSelect(item);
      });
      list.appendChild(opt);
    });
    list.classList.remove('hidden');
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => { selected = null; renderList(input.value); });
  input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 150));

  return {
    el: wrapper,
    input,
    getSelected: () => selected,
    setValue: (item) => { selected = item; input.value = item ? getLabel(item) : ''; }
  };
}

/* ---------------------------------------------------------
   4. NAVEGACIÓN
   --------------------------------------------------------- */

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('tabTitle').textContent = TAB_NAMES[tab];
  document.querySelectorAll('#sideNav li').forEach(li => li.classList.toggle('active', li.dataset.tab === tab));
  closeNav();
  renderTab(tab);
}

function renderTab(tab) {
  if (tab === 'reporte') renderReporte();
  else if (tab === 'ventas') renderVentas();
  else if (tab === 'precios') renderPrecios();
  else if (tab === 'productos') renderProductos();
  else if (tab === 'materiaprima') renderMateriaPrima();
  else if (tab === 'compras') renderCompras();
}

function openNav() {
  document.getElementById('sideNav').classList.remove('hidden');
  document.getElementById('navOverlay').classList.remove('hidden');
  document.getElementById('menuToggle').setAttribute('aria-expanded', 'true');
}
function closeNav() {
  document.getElementById('sideNav').classList.add('hidden');
  document.getElementById('navOverlay').classList.add('hidden');
  document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
}
function toggleNav() {
  const isHidden = document.getElementById('sideNav').classList.contains('hidden');
  if (isHidden) openNav(); else closeNav();
}

/* ---------------------------------------------------------
   5. SOLAPA: REPORTE GENERAL
   --------------------------------------------------------- */

let reportePeriodo = 'todo';
let chartVentasInstance = null;
let chartHorasInstance = null;

function filterVentasByPeriodo() {
  const now = new Date();
  return DB.ventas.filter(v => {
    const d = new Date(v.fecha);
    if (reportePeriodo === 'hoy') return d.toDateString() === now.toDateString();
    if (reportePeriodo === 'semana') return (now - d) / (1000 * 3600 * 24) <= 7;
    if (reportePeriodo === 'mes') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
}

function filterComprasByPeriodo() {
  const now = new Date();
  return DB.compras.filter(c => {
    const d = new Date(c.fecha);
    if (reportePeriodo === 'hoy') return d.toDateString() === now.toDateString();
    if (reportePeriodo === 'semana') return (now - d) / (1000 * 3600 * 24) <= 7;
    if (reportePeriodo === 'mes') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
}

function renderReporte() {
  const cont = document.getElementById('tab-reporte');
  const ventasF = filterVentasByPeriodo();
  const comprasF = filterComprasByPeriodo();

  const totalVentas = ventasF.reduce((s, v) => s + v.total, 0);
  const totalGastos = comprasF.reduce((s, c) => s + c.precioTotal, 0);
  let costoVendido = 0;
  ventasF.forEach(v => v.items.forEach(it => {
    const p = getProducto(it.productoId);
    if (p) costoVendido += costoProducto(p) * it.cantidad;
  }));
  const ganancia = totalVentas - costoVendido;

  cont.innerHTML = `
    <div class="periodo-selector">
      <div class="periodo-buttons">
        <button data-p="hoy" class="periodo-btn ${reportePeriodo === 'hoy' ? 'active' : ''}">Hoy</button>
        <button data-p="semana" class="periodo-btn ${reportePeriodo === 'semana' ? 'active' : ''}">Última semana</button>
        <button data-p="mes" class="periodo-btn ${reportePeriodo === 'mes' ? 'active' : ''}">Este mes</button>
        <button data-p="todo" class="periodo-btn ${reportePeriodo === 'todo' ? 'active' : ''}">Todo</button>
      </div>
      <div class="datos-buttons">
        <button id="btnSeed" class="btn-link">Cargar datos de ejemplo</button>
        <button id="btnReset" class="btn-link btn-danger-link">Borrar todos los datos</button>
      </div>
    </div>

    <div class="cards-row kpis-row">
      <div class="card kpi"><span class="kpi-label">Ventas totales</span><span class="kpi-value">${fmtMoney(totalVentas)}</span></div>
      <div class="card kpi"><span class="kpi-label">Ganancia</span><span class="kpi-value">${fmtMoney(ganancia)}</span></div>
      <div class="card kpi"><span class="kpi-label">Gastos totales</span><span class="kpi-value">${fmtMoney(totalGastos)}</span></div>
    </div>

    <div class="cards-row">
      <div class="card chart-card"><h3>Evolución de ventas ($)</h3><canvas id="chartVentas"></canvas></div>
      <div class="card"><h3>Top 10 productos más vendidos</h3><div id="topProductos"></div></div>
    </div>

    <div class="cards-row">
      <div class="card"><h3>Combos de venta</h3><div id="combosVenta"></div></div>
      <div class="card"><h3>Horas pico de venta</h3><canvas id="chartHoras"></canvas></div>
    </div>

    <div class="cards-row">
      <div class="card full"><h3>Stock que necesita reposición</h3><div id="stockBajo"></div></div>
    </div>
  `;

  cont.querySelectorAll('.periodo-btn').forEach(btn => {
    btn.addEventListener('click', () => { reportePeriodo = btn.dataset.p; renderReporte(); });
  });
  document.getElementById('btnSeed').addEventListener('click', seedExampleData);
  document.getElementById('btnReset').addEventListener('click', resetAllData);

  drawVentasChart(ventasF);
  drawTopProductos(ventasF);
  drawCombos(ventasF);
  drawHorasPico(ventasF);
  drawStockBajo();
}

function drawVentasChart(ventas) {
  const porDia = {};
  ventas.forEach(v => {
    const key = new Date(v.fecha).toISOString().slice(0, 10);
    porDia[key] = (porDia[key] || 0) + v.total;
  });
  const keys = Object.keys(porDia).sort();
  const labels = keys.map(k => { const [, m, d] = k.split('-'); return `${d}/${m}`; });
  const data = keys.map(k => porDia[k]);

  const ctx = document.getElementById('chartVentas');
  if (!ctx) return;
  if (chartVentasInstance) chartVentasInstance.destroy();
  if (keys.length === 0) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="hint" id="ventasChartEmpty">Todavía no hay ventas cargadas en este período.</p>');
    return;
  }
  const oldEmpty = document.getElementById('ventasChartEmpty');
  if (oldEmpty) oldEmpty.remove();

  chartVentasInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Ventas ($)', data, borderColor: '#C68A33', backgroundColor: 'rgba(198,138,51,0.15)', fill: true, tension: 0.3, pointRadius: 3 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function drawTopProductos(ventas) {
  const cant = {};
  ventas.forEach(v => v.items.forEach(it => { cant[it.productoId] = (cant[it.productoId] || 0) + it.cantidad; }));
  const top = Object.entries(cant).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const cont = document.getElementById('topProductos');
  if (!cont) return;
  if (top.length === 0) { cont.innerHTML = '<p class="hint">Todavía no hay ventas cargadas en este período.</p>'; return; }
  const max = top[0][1];
  cont.innerHTML = top.map(([pid, c]) => {
    const p = getProducto(pid);
    const pct = Math.max(6, (c / max) * 100).toFixed(0);
    return `<div class="bar-row">
      <span class="bar-label">${p ? p.nombre : 'Producto eliminado'}</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${c.toFixed(1)}${p ? ' ' + p.unidadVenta : ''}</span>
    </div>`;
  }).join('');
}

function drawCombos(ventas) {
  const pairCount = {};
  ventas.forEach(v => {
    const ids = [...new Set(v.items.map(it => it.productoId))];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join('|');
        pairCount[key] = (pairCount[key] || 0) + 1;
      }
    }
  });
  const top = Object.entries(pairCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const cont = document.getElementById('combosVenta');
  if (!cont) return;
  if (top.length === 0) { cont.innerHTML = '<p class="hint">Todavía no hay suficientes ventas con más de un producto para detectar combos.</p>'; return; }
  cont.innerHTML = top.map(([key, count]) => {
    const [id1, id2] = key.split('|');
    const p1 = getProducto(id1), p2 = getProducto(id2);
    return `<div class="combo-row">
      <span><strong>${p1 ? p1.nombre : '?'}</strong> + <strong>${p2 ? p2.nombre : '?'}</strong></span>
      <span class="combo-count">${count} venta${count === 1 ? '' : 's'} juntos</span>
    </div>`;
  }).join('');
}

function drawHorasPico(ventas) {
  const horas = new Array(24).fill(0);
  ventas.forEach(v => { horas[v.hora] = (horas[v.hora] || 0) + 1; });
  const ctx = document.getElementById('chartHoras');
  if (!ctx) return;
  if (chartHorasInstance) chartHorasInstance.destroy();
  chartHorasInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: horas.map((_, h) => h + 'hs'), datasets: [{ label: 'Ventas', data: horas, backgroundColor: '#7C3B4A', borderRadius: 4 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function drawStockBajo() {
  const cont = document.getElementById('stockBajo');
  if (!cont) return;
  const bajos = DB.materiasPrimas.filter(m => m.stockActual <= m.stockMinimo);
  if (bajos.length === 0) {
    cont.innerHTML = DB.materiasPrimas.length === 0
      ? '<p class="hint">Todavía no cargaste materias primas. Andá a la solapa "Materia Prima" para empezar.</p>'
      : '<p class="hint">Todo el stock está en niveles correctos. 🎉</p>';
    return;
  }
  cont.innerHTML = bajos.map(m => {
    const sinStock = m.stockActual <= 0;
    return `<div class="stock-row ${sinStock ? 'stock-critico' : ''}">
      <span>${m.nombre}</span>
      <span>${m.stockActual.toFixed(2)} ${m.unidad} — ${sinStock ? 'SIN STOCK' : 'por debajo del mínimo (' + m.stockMinimo + ' ' + m.unidad + ')'}</span>
    </div>`;
  }).join('');
}

/* Datos de ejemplo, para ver la app funcionando de entrada */
function seedExampleData() {
  if (!confirm('Esto va a reemplazar los datos actuales por datos de ejemplo (productos, materias primas, ventas y compras de muestra). ¿Continuar?')) return;

  DB = emptyDB();
  const mp = (nombre, unidad, costo, stock, stockMin) => ({ id: uid('mp'), nombre, unidad, costoUnitario: costo, stockActual: stock, stockMinimo: stockMin });
  const harina = mp('Harina 000', 'kg', 800, 50, 10);
  const azucar = mp('Azúcar', 'kg', 900, 30, 8);
  const manteca = mp('Manteca', 'kg', 3500, 10, 3);
  const huevos = mp('Huevos', 'unidad', 150, 60, 20);
  const ddl = mp('Dulce de leche', 'kg', 2800, 8, 2);
  const choco = mp('Chocolate cobertura', 'kg', 6500, 5, 1);
  const levadura = mp('Levadura', 'g', 15, 500, 100);
  DB.materiasPrimas = [harina, azucar, manteca, huevos, ddl, choco, levadura];

  const prod = (nombre, unidadVenta, receta) => ({ id: uid('prod'), nombre, unidadVenta, receta, gananciaIndividual: null });
  const panFrances = prod('Pan Francés', 'kg', [{ mpId: harina.id, cantidad: 0.6 }, { mpId: levadura.id, cantidad: 10 }]);
  const alfajor = prod('Alfajor de Maicena', 'unidad', [{ mpId: harina.id, cantidad: 0.03 }, { mpId: ddl.id, cantidad: 0.04 }, { mpId: manteca.id, cantidad: 0.01 }]);
  const torta = prod('Torta de Chocolate', 'unidad', [{ mpId: harina.id, cantidad: 0.4 }, { mpId: azucar.id, cantidad: 0.3 }, { mpId: choco.id, cantidad: 0.2 }, { mpId: huevos.id, cantidad: 4 }]);
  const medialunas = prod('Medialunas', 'docena', [{ mpId: harina.id, cantidad: 0.5 }, { mpId: manteca.id, cantidad: 0.2 }, { mpId: azucar.id, cantidad: 0.05 }]);
  const facturas = prod('Facturas Surtidas', 'docena', [{ mpId: harina.id, cantidad: 0.45 }, { mpId: manteca.id, cantidad: 0.15 }, { mpId: ddl.id, cantidad: 0.1 }]);
  DB.productos = [panFrances, alfajor, torta, medialunas, facturas];

  for (let d = 20; d >= 0; d--) {
    const cantVentasDelDia = 3 + Math.floor(Math.random() * 6);
    for (let v = 0; v < cantVentasDelDia; v++) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - d);
      const hora = 8 + Math.floor(Math.random() * 12);
      fecha.setHours(hora, Math.floor(Math.random() * 60), 0, 0);
      const cantItems = 1 + Math.floor(Math.random() * 3);
      const usados = new Set();
      const items = [];
      for (let i = 0; i < cantItems; i++) {
        const p = DB.productos[Math.floor(Math.random() * DB.productos.length)];
        if (usados.has(p.id)) continue;
        usados.add(p.id);
        const cantidad = (p.unidadVenta === 'unidad' || p.unidadVenta === 'docena')
          ? (1 + Math.floor(Math.random() * 3))
          : parseFloat((0.3 + Math.random() * 1.2).toFixed(2));
        const precio = precioVentaConIVA(p);
        items.push({ productoId: p.id, cantidad, precioUnitario: precio, total: precio * cantidad });
      }
      if (items.length === 0) continue;
      DB.ventas.push({ id: uid('venta'), fecha: fecha.toISOString(), hora, items, total: items.reduce((s, i) => s + i.total, 0) });
    }
  }

  DB.materiasPrimas.forEach(m => {
    DB.compras.push({ id: uid('compra'), fecha: new Date().toISOString(), mpId: m.id, cantidad: m.stockActual, unidad: m.unidad, precioTotal: m.stockActual * m.costoUnitario, costoUnitarioCalculado: m.costoUnitario });
  });

  saveDB();
  switchTab('reporte');
}

function resetAllData() {
  if (!confirm('¿Seguro que querés borrar TODOS los datos (productos, materias primas, ventas y compras)? Esta acción no se puede deshacer.')) return;
  DB = emptyDB();
  saveDB();
  switchTab('reporte');
}

/* ---------------------------------------------------------
   6. SOLAPA: VENTAS
   --------------------------------------------------------- */

let ventaRows = [];

function renderVentas() {
  const cont = document.getElementById('tab-ventas');
  cont.innerHTML = `
    <div class="card">
      <h3>Cargar venta</h3>
      <div id="ventaRows"></div>
      <button id="btnAddRow" class="btn-secondary">+ Agregar producto</button>
      <div class="venta-total-row"><span>Total</span><span id="ventaTotalGeneral">${fmtMoney(0)}</span></div>
      <button id="btnCargarVenta" class="btn-primary">Cargar venta</button>
    </div>
  `;
  ventaRows = [];
  if (DB.productos.length === 0) {
    document.getElementById('ventaRows').innerHTML = '<p class="hint">Todavía no hay productos cargados. Andá a la solapa "Productos" para crear el primero.</p>';
    document.getElementById('btnAddRow').style.display = 'none';
    document.getElementById('btnCargarVenta').style.display = 'none';
    return;
  }
  addVentaRow();
  document.getElementById('btnAddRow').addEventListener('click', addVentaRow);
  document.getElementById('btnCargarVenta').addEventListener('click', cargarVenta);
}

function addVentaRow() {
  const rowId = uid('row');
  const rowsCont = document.getElementById('ventaRows');
  const rowEl = document.createElement('div');
  rowEl.className = 'venta-row';

  const search = createSearchSelect({
    items: () => DB.productos,
    placeholder: 'Escribí el producto...',
    onSelect: (p) => updateVentaRow(rowId, p)
  });

  const cantidadInput = document.createElement('input');
  cantidadInput.type = 'number';
  cantidadInput.min = '0';
  cantidadInput.step = '0.01';
  cantidadInput.className = 'venta-cantidad';
  cantidadInput.placeholder = 'Cantidad';
  cantidadInput.addEventListener('input', () => updateVentaRow(rowId));

  const unidadLabel = document.createElement('span');
  unidadLabel.className = 'unidad-label';
  unidadLabel.textContent = '';

  const totalSpan = document.createElement('span');
  totalSpan.className = 'venta-row-total';
  totalSpan.textContent = fmtMoney(0);

  const btnDel = document.createElement('button');
  btnDel.textContent = '✕';
  btnDel.className = 'btn-del-row';
  btnDel.title = 'Quitar producto';
  btnDel.addEventListener('click', () => {
    rowEl.remove();
    ventaRows = ventaRows.filter(r => r.rowId !== rowId);
    recomputeVentaTotal();
  });

  rowEl.append(search.el, cantidadInput, unidadLabel, totalSpan, btnDel);
  rowsCont.appendChild(rowEl);

  ventaRows.push({ rowId, search, cantidadInput, unidadLabel, totalSpan, productoId: null });
}

function updateVentaRow(rowId, producto) {
  const row = ventaRows.find(r => r.rowId === rowId);
  if (!row) return;
  if (producto) row.productoId = producto.id;
  const prod = getProducto(row.productoId);
  if (!prod) { row.totalSpan.textContent = fmtMoney(0); row.unidadLabel.textContent = ''; recomputeVentaTotal(); return; }
  row.unidadLabel.textContent = prod.unidadVenta;
  const cantidad = parseFloat(row.cantidadInput.value) || 0;
  const total = cantidad * precioVentaConIVA(prod);
  row.totalSpan.textContent = fmtMoney(total);
  recomputeVentaTotal();
}

function recomputeVentaTotal() {
  let total = 0;
  ventaRows.forEach(r => {
    const prod = getProducto(r.productoId);
    if (prod) { const c = parseFloat(r.cantidadInput.value) || 0; total += c * precioVentaConIVA(prod); }
  });
  const el = document.getElementById('ventaTotalGeneral');
  if (el) el.textContent = fmtMoney(total);
}

function cargarVenta() {
  const items = [];
  ventaRows.forEach(r => {
    const prod = getProducto(r.productoId);
    const cantidad = parseFloat(r.cantidadInput.value) || 0;
    if (prod && cantidad > 0) {
      const precio = precioVentaConIVA(prod);
      items.push({ productoId: prod.id, cantidad, precioUnitario: precio, total: precio * cantidad });
    }
  });
  if (items.length === 0) { alert('Agregá al menos un producto con una cantidad mayor a 0.'); return; }

  const now = new Date();
  const venta = { id: uid('venta'), fecha: now.toISOString(), hora: now.getHours(), items, total: items.reduce((s, i) => s + i.total, 0) };
  DB.ventas.push(venta);

  // descuenta stock de materia prima según receta de cada producto vendido
  items.forEach(it => {
    const prod = getProducto(it.productoId);
    (prod.receta || []).forEach(r => {
      const mpItem = getMP(r.mpId);
      if (mpItem) mpItem.stockActual = Math.round((mpItem.stockActual - r.cantidad * it.cantidad) * 1000) / 1000;
    });
  });

  saveDB();
  renderVentas();
}

/* ---------------------------------------------------------
   7. SOLAPA: LISTA DE PRECIOS
   --------------------------------------------------------- */

function renderPrecios() {
  const cont = document.getElementById('tab-precios');
  cont.innerHTML = `
    <div class="card">
      <label for="gananciaGlobalSlider">Ganancia general: <span id="gananciaGlobalValue">${DB.config.gananciaGlobal}%</span></label>
      <input type="range" id="gananciaGlobalSlider" min="0" max="300" step="1" value="${DB.config.gananciaGlobal}">
      <p class="hint">Se aplica a todos los productos, excepto a los que tengan una ganancia individual configurada en la solapa "Productos".</p>
    </div>
    <div class="card">
      <h3>Lista de precios</h3>
      <table class="tabla-precios">
        <thead><tr><th>Producto</th><th>Costo</th><th>Valor de venta</th><th>Valor de venta con IVA</th><th>Unidad de venta</th></tr></thead>
        <tbody id="tablaPreciosBody"></tbody>
      </table>
    </div>
  `;
  fillTablaPrecios();
  document.getElementById('gananciaGlobalSlider').addEventListener('input', (e) => {
    DB.config.gananciaGlobal = parseFloat(e.target.value);
    document.getElementById('gananciaGlobalValue').textContent = DB.config.gananciaGlobal + '%';
    saveDB();
    fillTablaPrecios();
  });
}

function fillTablaPrecios() {
  const body = document.getElementById('tablaPreciosBody');
  if (DB.productos.length === 0) {
    body.innerHTML = '<tr><td colspan="5">No hay productos cargados todavía.</td></tr>';
    return;
  }
  body.innerHTML = DB.productos.map(p => {
    const costo = costoProducto(p);
    const venta = precioVenta(p);
    const ventaIVA = precioVentaConIVA(p);
    const badge = p.gananciaIndividual != null ? `<span class="badge">${p.gananciaIndividual}% propio</span>` : '';
    return `<tr><td>${p.nombre}${badge}</td><td>${fmtMoney(costo)}</td><td>${fmtMoney(venta)}</td><td>${fmtMoney(ventaIVA)}</td><td>${p.unidadVenta}</td></tr>`;
  }).join('');
}

/* ---------------------------------------------------------
   8. SOLAPA: PRODUCTOS
   --------------------------------------------------------- */

let productoSeleccionadoId = null;
let productoEditandoReceta = [];

function renderProductos() {
  const cont = document.getElementById('tab-productos');
  cont.innerHTML = `
    <div class="card">
      <h3>Buscar producto</h3>
      <div id="productoSearchWrap"></div>
      <div class="form-actions"><button id="btnNuevoProducto" class="btn-secondary">+ Agregar producto</button></div>
    </div>
    <div id="productoDetalle"></div>
  `;

  const search = createSearchSelect({
    items: () => DB.productos,
    placeholder: 'Escribí el nombre del producto...',
    onSelect: (p) => { productoSeleccionadoId = p.id; renderProductoDetalle(p.id); }
  });
  document.getElementById('productoSearchWrap').appendChild(search.el);
  document.getElementById('btnNuevoProducto').addEventListener('click', () => renderProductoForm(null));

  if (productoSeleccionadoId && getProducto(productoSeleccionadoId)) {
    search.setValue(getProducto(productoSeleccionadoId));
    renderProductoDetalle(productoSeleccionadoId);
  }
}

function renderProductoDetalle(id) {
  const p = getProducto(id);
  const det = document.getElementById('productoDetalle');
  if (!p) { det.innerHTML = ''; return; }

  const costo = costoProducto(p);
  const g = gananciaProducto(p);
  const venta = precioVenta(p);
  const ventaIVA = precioVentaConIVA(p);

  const ventasConProducto = DB.ventas.filter(v => v.items.some(it => it.productoId === id));

  const porMes = {};
  ventasConProducto.forEach(v => {
    const d = new Date(v.fecha);
    const key = d.getFullYear() + '-' + d.getMonth();
    const cant = v.items.filter(it => it.productoId === id).reduce((s, it) => s + it.cantidad, 0);
    porMes[key] = (porMes[key] || 0) + cant;
  });
  const mesesConVenta = Object.keys(porMes);
  const promedioMensual = mesesConVenta.length ? (Object.values(porMes).reduce((a, b) => a + b, 0) / mesesConVenta.length) : 0;
  let mesTop = 'Sin datos suficientes';
  if (mesesConVenta.length) {
    const bestKey = mesesConVenta.reduce((a, b) => porMes[a] > porMes[b] ? a : b);
    const [y, m] = bestKey.split('-');
    mesTop = MESES[parseInt(m, 10)] + ' ' + y;
  }

  const acompCount = {};
  ventasConProducto.forEach(v => {
    v.items.forEach(it => { if (it.productoId !== id) acompCount[it.productoId] = (acompCount[it.productoId] || 0) + 1; });
  });
  const acompañantes = Object.entries(acompCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([pid, count]) => `${getProducto(pid) ? getProducto(pid).nombre : '?'} (${count})`).join(', ') || 'Sin datos suficientes';

  const horasCount = new Array(24).fill(0);
  ventasConProducto.forEach(v => { horasCount[v.hora]++; });
  const maxCount = Math.max(...horasCount);
  const maxHora = horasCount.indexOf(maxCount);
  const horaPicoTxt = maxCount > 0 ? `${maxHora}:00 - ${maxHora + 1}:00 hs` : 'Sin datos suficientes';

  det.innerHTML = `
    <div class="cards-row">
      <div class="card">
        <h3>Receta</h3>
        <table class="tabla-receta">
          <thead><tr><th>Materia prima</th><th>Cantidad</th><th>Unidad</th></tr></thead>
          <tbody>
            ${(p.receta || []).map(r => { const mp = getMP(r.mpId); return `<tr><td>${mp ? mp.nombre : 'Materia prima eliminada'}</td><td>${r.cantidad}</td><td>${mp ? mp.unidad : ''}</td></tr>`; }).join('') || '<tr><td colspan="3">Sin ingredientes cargados.</td></tr>'}
          </tbody>
        </table>
        <div class="form-actions"><button id="btnEditarProducto" class="btn-secondary">Editar producto</button></div>
      </div>
      <div class="card">
        <h3>Precio</h3>
        <label for="gananciaIndSlider">Ganancia individual: <span id="gananciaIndValue">${g}%</span></label>
        ${p.gananciaIndividual != null ? '<span class="badge">personalizada</span>' : '<span class="badge badge-muted">usa ganancia general</span>'}
        <input type="range" id="gananciaIndSlider" min="0" max="300" step="1" value="${g}">
        <button id="btnQuitarIndividual" class="btn-link" style="${p.gananciaIndividual == null ? 'display:none' : ''}">Volver a usar la ganancia general</button>
        <p>Costo: <strong>${fmtMoney(costo)}</strong></p>
        <p>Valor de venta: <strong>${fmtMoney(venta)}</strong></p>
        <p>Valor de venta con IVA: <strong>${fmtMoney(ventaIVA)}</strong></p>
      </div>
    </div>
    <div class="cards-row">
      <div class="card full">
        <h3>Estadísticas de venta</h3>
        <p>Promedio de venta mensual: <strong>${promedioMensual.toFixed(1)} ${p.unidadVenta}</strong></p>
        <p>Mes de mayor venta: <strong>${mesTop}</strong></p>
        <p>Suele venderse junto con: <strong>${acompañantes}</strong></p>
        <p>Hora pico de venta: <strong>${horaPicoTxt}</strong></p>
      </div>
    </div>
  `;

  document.getElementById('gananciaIndSlider').addEventListener('input', (e) => {
    p.gananciaIndividual = parseFloat(e.target.value);
    saveDB();
    renderProductoDetalle(id);
  });
  document.getElementById('btnQuitarIndividual').addEventListener('click', () => {
    p.gananciaIndividual = null;
    saveDB();
    renderProductoDetalle(id);
  });
  document.getElementById('btnEditarProducto').addEventListener('click', () => renderProductoForm(p));
}

function renderProductoForm(producto) {
  const det = document.getElementById('productoDetalle');
  const isEdit = !!producto;
  productoEditandoReceta = isEdit ? JSON.parse(JSON.stringify(producto.receta || [])) : [];

  det.innerHTML = `
    <div class="card">
      <h3>${isEdit ? 'Editar producto' : 'Nuevo producto'}</h3>
      <label for="formNombre">Nombre</label>
      <input type="text" id="formNombre" value="${isEdit ? producto.nombre.replace(/"/g, '&quot;') : ''}" placeholder="Ej: Pan Francés">
      <label for="formUnidad">Unidad de venta</label>
      <select id="formUnidad">
        ${['kg', 'g', 'unidad', 'docena', 'l', 'ml'].map(u => `<option value="${u}" ${isEdit && producto.unidadVenta === u ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <h4>Receta</h4>
      <div id="recetaRows"></div>
      <button id="btnAddIngrediente" class="btn-secondary">+ Agregar materia prima</button>
      <div class="form-actions">
        <button id="btnGuardarProducto" class="btn-primary">Guardar</button>
        <button id="btnCancelarProducto" class="btn-link">Cancelar</button>
        ${isEdit ? '<button id="btnEliminarProducto" class="btn-danger">Eliminar producto</button>' : ''}
      </div>
    </div>
  `;

  renderRecetaRows();
  document.getElementById('btnAddIngrediente').addEventListener('click', () => { productoEditandoReceta.push({ mpId: null, cantidad: 0 }); renderRecetaRows(); });
  document.getElementById('btnGuardarProducto').addEventListener('click', () => guardarProducto(producto));
  document.getElementById('btnCancelarProducto').addEventListener('click', () => { isEdit ? renderProductoDetalle(producto.id) : (det.innerHTML = ''); });
  if (isEdit) {
    document.getElementById('btnEliminarProducto').addEventListener('click', () => {
      if (confirm(`¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`)) {
        DB.productos = DB.productos.filter(p => p.id !== producto.id);
        productoSeleccionadoId = null;
        saveDB();
        det.innerHTML = '';
      }
    });
  }
}

function renderRecetaRows() {
  const cont = document.getElementById('recetaRows');
  if (!cont) return;
  cont.innerHTML = '';
  if (DB.materiasPrimas.length === 0) {
    cont.innerHTML = '<p class="hint">Todavía no hay materias primas cargadas. Andá a la solapa "Materia Prima" primero.</p>';
    return;
  }
  productoEditandoReceta.forEach((r, idx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'receta-row';

    const search = createSearchSelect({
      items: () => DB.materiasPrimas,
      placeholder: 'Materia prima...',
      onSelect: (mp) => { productoEditandoReceta[idx].mpId = mp.id; unidadSpan.textContent = mp.unidad; }
    });
    if (r.mpId) { const mp = getMP(r.mpId); if (mp) search.setValue(mp); }

    const cantInput = document.createElement('input');
    cantInput.type = 'number';
    cantInput.min = '0';
    cantInput.step = '0.001';
    cantInput.value = r.cantidad || '';
    cantInput.placeholder = 'Cantidad';
    cantInput.addEventListener('input', () => { productoEditandoReceta[idx].cantidad = parseFloat(cantInput.value) || 0; });

    const unidadSpan = document.createElement('span');
    unidadSpan.className = 'unidad-label';
    unidadSpan.textContent = r.mpId ? ((getMP(r.mpId) || {}).unidad || '') : '';

    const btnDel = document.createElement('button');
    btnDel.textContent = '✕';
    btnDel.className = 'btn-del-row';
    btnDel.addEventListener('click', () => { productoEditandoReceta.splice(idx, 1); renderRecetaRows(); });

    rowEl.append(search.el, cantInput, unidadSpan, btnDel);
    cont.appendChild(rowEl);
  });
}

function guardarProducto(productoExistente) {
  const nombre = document.getElementById('formNombre').value.trim();
  const unidadVenta = document.getElementById('formUnidad').value;
  if (!nombre) { alert('Ponele un nombre al producto.'); return; }
  const receta = productoEditandoReceta.filter(r => r.mpId && r.cantidad > 0);

  if (productoExistente) {
    productoExistente.nombre = nombre;
    productoExistente.unidadVenta = unidadVenta;
    productoExistente.receta = receta;
    saveDB();
    productoSeleccionadoId = productoExistente.id;
    renderProductoDetalle(productoExistente.id);
  } else {
    const nuevo = { id: uid('prod'), nombre, unidadVenta, receta, gananciaIndividual: null };
    DB.productos.push(nuevo);
    saveDB();
    productoSeleccionadoId = nuevo.id;
    renderProductoDetalle(nuevo.id);
  }
}

/* ---------------------------------------------------------
   9. SOLAPA: MATERIA PRIMA
   --------------------------------------------------------- */

let mpEditandoId = null;

function renderMateriaPrima() {
  const cont = document.getElementById('tab-materiaprima');
  cont.innerHTML = `
    <div class="card">
      <h3>${mpEditandoId ? 'Editar materia prima' : 'Nueva materia prima'}</h3>
      <label for="mpNombre">Nombre</label>
      <input type="text" id="mpNombre" placeholder="Ej: Harina 000">
      <label for="mpUnidad">Unidad de medida</label>
      <select id="mpUnidad">
        <option value="kg">kg</option>
        <option value="g">g</option>
        <option value="l">l</option>
        <option value="ml">ml</option>
        <option value="cm3">cm3</option>
        <option value="unidad">unidad</option>
      </select>
      <label for="mpCosto">Costo unitario</label>
      <input type="number" id="mpCosto" min="0" step="0.01" placeholder="0.00">
      <label for="mpStock">Stock actual</label>
      <input type="number" id="mpStock" min="0" step="0.01" placeholder="0">
      <label for="mpStockMin">Stock mínimo (para la alerta de reposición)</label>
      <input type="number" id="mpStockMin" min="0" step="0.01" placeholder="0">
      <div class="form-actions">
        <button id="btnGuardarMP" class="btn-primary">Guardar</button>
        ${mpEditandoId ? '<button id="btnCancelarMP" class="btn-link">Cancelar edición</button><button id="btnEliminarMP" class="btn-danger">Eliminar</button>' : ''}
      </div>
    </div>
    <div class="card">
      <h3>Materias primas cargadas</h3>
      <table class="tabla-mp">
        <thead><tr><th>Nombre</th><th>Unidad</th><th>Costo unitario</th><th>Stock</th><th>Stock mínimo</th><th></th></tr></thead>
        <tbody id="tablaMPBody"></tbody>
      </table>
    </div>
  `;

  if (mpEditandoId) {
    const mp = getMP(mpEditandoId);
    if (mp) {
      document.getElementById('mpNombre').value = mp.nombre;
      document.getElementById('mpUnidad').value = mp.unidad;
      document.getElementById('mpCosto').value = mp.costoUnitario;
      document.getElementById('mpStock').value = mp.stockActual;
      document.getElementById('mpStockMin').value = mp.stockMinimo;
    }
  }

  fillTablaMP();
  document.getElementById('btnGuardarMP').addEventListener('click', guardarMP);
  if (mpEditandoId) {
    document.getElementById('btnCancelarMP').addEventListener('click', () => { mpEditandoId = null; renderMateriaPrima(); });
    document.getElementById('btnEliminarMP').addEventListener('click', () => {
      const mp = getMP(mpEditandoId);
      if (confirm(`¿Eliminar "${mp.nombre}"? Si algún producto usa esta materia prima en su receta, va a quedar sin ese ingrediente.`)) {
        DB.materiasPrimas = DB.materiasPrimas.filter(m => m.id !== mpEditandoId);
        DB.productos.forEach(p => { p.receta = (p.receta || []).filter(r => r.mpId !== mpEditandoId); });
        mpEditandoId = null;
        saveDB();
        renderMateriaPrima();
      }
    });
  }
}

function fillTablaMP() {
  const body = document.getElementById('tablaMPBody');
  if (DB.materiasPrimas.length === 0) {
    body.innerHTML = '<tr><td colspan="6">No hay materias primas cargadas todavía.</td></tr>';
    return;
  }
  body.innerHTML = DB.materiasPrimas.map(mp => `
    <tr>
      <td>${mp.nombre}</td>
      <td>${mp.unidad}</td>
      <td>${fmtMoney(mp.costoUnitario)}</td>
      <td>${mp.stockActual.toFixed(2)} ${mp.unidad}</td>
      <td>${mp.stockMinimo.toFixed(2)} ${mp.unidad}</td>
      <td><button class="btn-link" data-edit-mp="${mp.id}">Editar</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-edit-mp]').forEach(btn => {
    btn.addEventListener('click', () => { mpEditandoId = btn.dataset.editMp; renderMateriaPrima(); });
  });
}

function guardarMP() {
  const nombre = document.getElementById('mpNombre').value.trim();
  const unidad = document.getElementById('mpUnidad').value;
  const costoUnitario = parseFloat(document.getElementById('mpCosto').value) || 0;
  const stockActual = parseFloat(document.getElementById('mpStock').value) || 0;
  const stockMinimo = parseFloat(document.getElementById('mpStockMin').value) || 0;
  if (!nombre) { alert('Ponele un nombre a la materia prima.'); return; }

  if (mpEditandoId) {
    const mp = getMP(mpEditandoId);
    Object.assign(mp, { nombre, unidad, costoUnitario, stockActual, stockMinimo });
    mpEditandoId = null;
  } else {
    DB.materiasPrimas.push({ id: uid('mp'), nombre, unidad, costoUnitario, stockActual, stockMinimo });
  }
  saveDB();
  renderMateriaPrima();
}

/* ---------------------------------------------------------
   10. SOLAPA: COMPRAS
   --------------------------------------------------------- */

function renderCompras() {
  const cont = document.getElementById('tab-compras');
  cont.innerHTML = `
    <div class="card">
      <h3>Registrar compra</h3>
      <label>Materia prima</label>
      <div id="compraMPWrap"></div>
      <label for="compraCantidad">Cantidad <span id="compraUnidadLabel" class="unidad-label"></span></label>
      <input type="number" id="compraCantidad" min="0" step="0.01" placeholder="0">
      <label for="compraPrecio">Precio total pagado</label>
      <input type="number" id="compraPrecio" min="0" step="0.01" placeholder="0.00">
      <div class="form-actions"><button id="btnGuardarCompra" class="btn-primary">Registrar compra</button></div>
      <p class="hint">El costo unitario de la materia prima se recalcula automáticamente (precio total ÷ cantidad) y queda reflejado en la solapa "Materia Prima".</p>
    </div>
    <div class="card">
      <h3>Historial de compras</h3>
      <table class="tabla-compras">
        <thead><tr><th>Fecha</th><th>Materia prima</th><th>Cantidad</th><th>Precio pagado</th><th>Costo unitario resultante</th></tr></thead>
        <tbody id="tablaComprasBody"></tbody>
      </table>
    </div>
  `;

  if (DB.materiasPrimas.length === 0) {
    document.getElementById('compraMPWrap').innerHTML = '<p class="hint">Todavía no hay materias primas cargadas. Andá a la solapa "Materia Prima" primero.</p>';
    document.getElementById('btnGuardarCompra').style.display = 'none';
    fillTablaCompras();
    return;
  }

  let mpSeleccionada = null;
  const search = createSearchSelect({
    items: () => DB.materiasPrimas,
    placeholder: 'Buscar materia prima...',
    onSelect: (mp) => { mpSeleccionada = mp; document.getElementById('compraUnidadLabel').textContent = '(' + mp.unidad + ')'; }
  });
  document.getElementById('compraMPWrap').appendChild(search.el);

  document.getElementById('btnGuardarCompra').addEventListener('click', () => {
    if (!mpSeleccionada) { alert('Seleccioná una materia prima de la lista.'); return; }
    const cantidad = parseFloat(document.getElementById('compraCantidad').value) || 0;
    const precioTotal = parseFloat(document.getElementById('compraPrecio').value) || 0;
    if (cantidad <= 0 || precioTotal <= 0) { alert('Completá la cantidad y el precio pagado.'); return; }

    const costoUnitario = precioTotal / cantidad;
    DB.compras.push({ id: uid('compra'), fecha: new Date().toISOString(), mpId: mpSeleccionada.id, cantidad, unidad: mpSeleccionada.unidad, precioTotal, costoUnitarioCalculado: costoUnitario });
    mpSeleccionada.costoUnitario = costoUnitario;
    mpSeleccionada.stockActual = (mpSeleccionada.stockActual || 0) + cantidad;
    saveDB();
    renderCompras();
  });

  fillTablaCompras();
}

function fillTablaCompras() {
  const body = document.getElementById('tablaComprasBody');
  const rows = [...DB.compras].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (rows.length === 0) { body.innerHTML = '<tr><td colspan="5">No hay compras registradas todavía.</td></tr>'; return; }
  body.innerHTML = rows.map(c => {
    const mp = getMP(c.mpId);
    return `<tr>
      <td>${new Date(c.fecha).toLocaleDateString('es-AR')}</td>
      <td>${mp ? mp.nombre : 'Materia prima eliminada'}</td>
      <td>${c.cantidad} ${c.unidad}</td>
      <td>${fmtMoney(c.precioTotal)}</td>
      <td>${fmtMoney(c.costoUnitarioCalculado)} / ${c.unidad}</td>
    </tr>`;
  }).join('');
}

/* ---------------------------------------------------------
   11. INIT
   --------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('menuToggle').addEventListener('click', toggleNav);
  document.getElementById('navOverlay').addEventListener('click', closeNav);
  document.querySelectorAll('#sideNav li').forEach(li => {
    li.addEventListener('click', () => switchTab(li.dataset.tab));
  });
  switchTab('reporte');
});
