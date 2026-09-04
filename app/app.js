/* Jastuk – web aplikacija za tablet (faza 1): poslovi, odabir broda, crtanje elemenata prstom,
   mjerenje s fotografije (folija + mreža) kroz tri dodira, izvoz DXF/PDF. Bez build koraka. */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const view = $("#view");
const crumb = $("#crumb");
const ZONES = ["kokpit", "salon", "prova", "krma", "paluba"];
const KINDS = ["sjedalo", "naslon", "madrac", "lezaj", "ostalo"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ------------------------------------------------------------------ pomoćno
async function api(path, opts = {}) {
  const o = { headers: {}, ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(o.body); }
  const r = await fetch("/api" + path, o);
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.detail || JSON.stringify(j); } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}
let toastT;
function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
function setNet() { $("#net").classList.toggle("off", !navigator.onLine); }
window.addEventListener("online", setNet); window.addEventListener("offline", setNet); setNet();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

function boatLabel(b) { return b ? `${b.builder} ${b.model}` : "nepoznati model"; }
function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Prelamanje natpisa u retke ne šire od maxW (px); riječ koja ne stane ide u svoj redak. */
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ shema broda (tlocrt, pramac gore)
const ASPECT = { jedrilica: 2.2, katamaran: 1.6, motorni: 2.0 };
function drawBoat(ctx, type, W, H) {
  ctx.save();
  ctx.lineWidth = 2; ctx.strokeStyle = "#5e6c78"; ctx.fillStyle = "#fbfcfd";
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x * W, y * H, w * W, h * H, r); ctx.fill(); ctx.stroke(); };
  if (type === "katamaran") {
    for (const x0 of [0.05, 0.75]) {          // trupovi
      ctx.beginPath();
      ctx.moveTo((x0 + 0.1) * W, 0.02 * H);
      ctx.bezierCurveTo((x0 + 0.2) * W, 0.25 * H, (x0 + 0.2) * W, 0.8 * H, (x0 + 0.17) * W, 0.98 * H);
      ctx.lineTo((x0 + 0.03) * W, 0.98 * H);
      ctx.bezierCurveTo(x0 * W, 0.8 * H, x0 * W, 0.25 * H, (x0 + 0.1) * W, 0.02 * H);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = "#9aa7b2";
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0.25 * W, (0.06 + i * 0.03) * H); ctx.lineTo(0.75 * W, (0.06 + i * 0.03) * H); ctx.stroke(); }
    ctx.strokeStyle = "#5e6c78";
    rr(0.22, 0.24, 0.56, 0.74, 14);           // paluba između trupova
    rr(0.27, 0.30, 0.46, 0.32, 18);           // salon
    rr(0.27, 0.66, 0.46, 0.28, 12);           // kokpit
  } else {
    ctx.beginPath();                          // trup
    ctx.moveTo(0.5 * W, 0.02 * H);
    ctx.bezierCurveTo(0.95 * W, 0.3 * H, 0.98 * W, 0.75 * H, 0.82 * W, 0.98 * H);
    ctx.lineTo(0.18 * W, 0.98 * H);
    ctx.bezierCurveTo(0.02 * W, 0.75 * H, 0.05 * W, 0.3 * H, 0.5 * W, 0.02 * H);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    rr(0.24, 0.28, 0.52, 0.34, 22);           // kabina / salon
    rr(0.27, 0.66, 0.46, 0.26, 12);           // kokpit
    ctx.beginPath(); ctx.arc(0.5 * W, 0.42 * H, 5, 0, Math.PI * 2); ctx.fillStyle = "#5e6c78"; ctx.fill();  // jarbol
  }
  ctx.fillStyle = "#8a98a5"; ctx.font = `${Math.max(11, W / 40)}px system-ui`;
  ctx.textAlign = "center"; ctx.fillText("PRAMAC", 0.5 * W, 0.02 * H + 16); ctx.fillText("KRMA", 0.5 * W, 0.98 * H - 6);
  ctx.textAlign = "left"; ctx.fillText("L", 0.02 * W + 4, 0.5 * H); ctx.textAlign = "right"; ctx.fillText("D", 0.98 * W - 4, 0.5 * H);
  ctx.restore();
}

/** Canvas sheme: veličina prema širini spremnika, crtanje elemenata, dodiri u normaliziranim koordinatama. */
function sketchCanvas(canvas, type) {
  const aspect = ASPECT[type] || 2.2;
  const dpr = window.devicePixelRatio || 1;
  function fit() {
    const cssW = Math.min(canvas.parentElement.clientWidth, Math.floor((window.innerHeight * 0.72) / aspect));
    const cssH = Math.round(cssW * aspect);
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    return [cssW, cssH];
  }
  let [W, H] = fit();
  const ctx = canvas.getContext("2d");
  const toN = ev => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
  function draw(elements, active, editPts) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBoat(ctx, type, W, H);
    for (const e of elements) {
      if (!e.sketch || e.sketch.length < 2) continue;
      const on = active && e.id === active.id;
      ctx.beginPath();
      e.sketch.forEach(([x, y], i) => i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H));
      ctx.closePath();
      ctx.fillStyle = on ? "rgba(31,119,180,.35)" : e.status === "izmjeren" || e.status === "potvrđen" ? "rgba(46,139,87,.28)" : "rgba(138,152,165,.28)";
      ctx.strokeStyle = on ? "#1f77b4" : "#3b4a57"; ctx.lineWidth = on ? 2.5 : 1.5;
      ctx.fill(); ctx.stroke();
      const b = bbox(e.sketch);
      const fs = Math.max(10, W / 42);
      ctx.fillStyle = "#16232e"; ctx.font = `bold ${fs}px system-ui`; ctx.textAlign = "center";
      const lines = wrapText(ctx, e.code || e.name || "?", Math.max(30, (b[2] - b[0]) * W - 6));
      const y0 = (b[1] + b[3]) / 2 * H - (lines.length - 1) * fs * 0.6;
      lines.forEach((t, i) => ctx.fillText(t, (b[0] + b[2]) / 2 * W, y0 + i * fs * 1.2 + 4));
    }
    if (editPts) {
      if (editPts.length) {
        ctx.beginPath();
        editPts.forEach(([x, y], i) => i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H));
        if (editPts.length > 2) ctx.closePath();
        ctx.fillStyle = "rgba(244,185,66,.35)"; ctx.strokeStyle = "#d9822b"; ctx.lineWidth = 2.5;
        if (editPts.length > 2) ctx.fill();
        ctx.stroke();
      }
      editPts.forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x * W, y * H, 9, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#c0392b" : "#fff"; ctx.strokeStyle = "#d9822b"; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
      });
    }
  }
  return { draw, toN, size: () => [W, H], refit: () => { [W, H] = fit(); } };
}

// ------------------------------------------------------------------ usmjeravanje
const routes = [
  [/^#?\/?$/, jobsView],
  [/^#\/novi$/, newJobView],
  [/^#\/posao\/(\d+)$/, jobView],
  [/^#\/element\/(\d+)$/, elementView],
  [/^#\/mjeri\/(\d+)$/, measureView],
];
async function route() {
  const h = location.hash || "#/";
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      view.innerHTML = `<p class="muted"><span class="spinner"></span> učitavam…</p>`;
      try { await fn(...m.slice(1).map(Number)); } catch (e) { view.innerHTML = `<div class="card">Greška: ${esc(e.message)}</div>`; }
      return;
    }
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", route);
route();

// ------------------------------------------------------------------ poslovi
async function jobsView() {
  crumb.textContent = "poslovi";
  const jobs = await api("/jobs");
  view.innerHTML = `
    <div class="row"><h1 class="grow">Poslovi</h1><a class="btn primary" href="#/novi">+ Novi posao</a></div>
    <div class="list">${jobs.map(j => `
      <a class="item" href="#/posao/${j.job.id}">
        <div class="grow"><div class="t">${esc(j.job.boat_name || boatLabel(j.boat))}</div>
        <div class="s">${esc(boatLabel(j.boat))} · ${esc(j.job.customer)} ${j.job.marina ? "· " + esc(j.job.marina) : ""}</div></div>
        <span class="chip">${j.n_elements} el.</span></a>`).join("") || `<p class="muted">Još nema poslova.</p>`}
    </div>`;
}

async function newJobView() {
  crumb.textContent = "novi posao";
  view.innerHTML = `
    <h1>Novi posao</h1>
    <div class="card">
      <label>Model broda</label>
      <input id="q" placeholder="npr. Bavaria 46, Lagoon 42" autocomplete="off">
      <div id="boats" class="list" style="margin-top:8px"></div>
      <div id="picked" class="hint" hidden></div>
      <details style="margin-top:8px"><summary class="muted small">Modela nema na popisu? Dodaj novi</summary>
        <div class="row" style="margin-top:8px">
          <div class="grow"><label>Proizvođač</label><input id="nb_builder"></div>
          <div class="grow"><label>Model</label><input id="nb_model"></div>
          <div><label>Tip</label><select id="nb_type"><option>jedrilica</option><option>katamaran</option><option>motorni</option></select></div>
          <button id="nb_add">Dodaj</button>
        </div></details>
    </div>
    <div class="card">
      <div class="row">
        <div class="grow"><label>Ime broda</label><input id="boat_name"></div>
        <div class="grow"><label>Kupac</label><input id="customer"></div>
        <div class="grow"><label>Marina</label><input id="marina"></div>
      </div>
      <label style="margin-top:8px">Napomena</label><textarea id="notes" rows="2"></textarea>
    </div>
    <div class="row"><button class="primary" id="save">Otvori posao</button><a class="btn" href="#/">Odustani</a></div>`;
  let picked = null;
  const list = $("#boats");
  async function search() {
    const boats = await api("/boats?q=" + encodeURIComponent($("#q").value));
    list.innerHTML = boats.slice(0, 12).map(b => `<a class="item" href="#" data-id="${b.id}">
      <div class="grow"><div class="t">${esc(b.builder)} ${esc(b.model)}${b.priority ? ' <span class="chip" style="background:var(--accent);color:#16232e">prioritet</span>' : ""}</div>
      <div class="s">${esc(b.type)} · ${b.loa_m} m × ${b.beam_m} m · ${b.year_from}–${b.year_to || ""} · kabine ${esc(b.cabins)}</div></div></a>`).join("");
    list.querySelectorAll("a").forEach(a => a.onclick = ev => {
      ev.preventDefault();
      picked = boats.find(b => b.id === +a.dataset.id);
      $("#picked").hidden = false; $("#picked").textContent = "Odabrano: " + boatLabel(picked);
      list.innerHTML = "";
    });
  }
  $("#q").oninput = search; search();
  $("#nb_add").onclick = async () => {
    picked = await api("/boats", { method: "POST", body: { builder: $("#nb_builder").value, model: $("#nb_model").value, type: $("#nb_type").value } });
    $("#picked").hidden = false; $("#picked").textContent = "Dodano i odabrano: " + boatLabel(picked);
  };
  $("#save").onclick = async () => {
    const r = await api("/jobs", { method: "POST", body: { boat_model_id: picked?.id, boat_name: $("#boat_name").value, customer: $("#customer").value, marina: $("#marina").value, notes: $("#notes").value } });
    location.hash = "#/posao/" + r.job.id;
  };
}

// ------------------------------------------------------------------ posao: shema + elementi
async function jobView(id) {
  const d = await api(`/jobs/${id}`);
  const type = d.boat?.type || "jedrilica";
  crumb.textContent = `${d.job.boat_name || boatLabel(d.boat)}`;
  let zone = "sve";
  view.innerHTML = `
    <div class="row"><h1 class="grow">${esc(d.job.boat_name || boatLabel(d.boat))} <span class="muted small">${esc(boatLabel(d.boat))}</span></h1>
      <button id="add" class="primary">+ Element</button></div>
    <div class="two">
      <div class="card">
        <div class="zones" id="zones"><button data-z="sve" class="on">sve</button>${ZONES.map(z => `<button data-z="${z}">${z}</button>`).join("")}</div>
        <div class="canvas-wrap"><canvas class="sketch" id="c"></canvas></div>
        <p class="muted small">Dodirni element na shemi za uređivanje.</p>
      </div>
      <div>
        <div class="card"><h2 style="margin-top:0">Elementi (${d.elements.length})</h2>
          <table><tbody id="els"></tbody></table></div>
        <div class="card"><h2 style="margin-top:0">Izvoz</h2>
          <p class="muted small">DXF/PDF 1:1 za sve elemente s izmjerenim obrisom.</p>
          <button id="exp">Generiraj DXF / PDF</button><div class="files" id="files"></div></div>
        <div class="card"><button class="danger" id="del">Obriši posao</button></div>
      </div>
    </div>`;
  const sc = sketchCanvas($("#c"), type);
  const visible = () => d.elements.filter(e => zone === "sve" || e.zone === zone);
  function render() {
    sc.draw(visible(), null, null);
    $("#els").innerHTML = visible().map(e => {
      const b = e.outline_mm ? bbox(e.outline_mm) : null;
      return `<tr><td><b>${esc(e.code || "?")}</b><br><span class="muted small">${esc(e.zone)} · ${esc(e.kind)} · ${e.thickness_mm} mm</span></td>
        <td><span class="chip ${e.status}">${e.status}</span>${b ? `<br><span class="small">${Math.round(b[2] - b[0])} × ${Math.round(b[3] - b[1])} mm</span>` : ""}</td>
        <td style="white-space:nowrap"><a class="btn" href="#/element/${e.id}">Uredi</a> <a class="btn accent" href="#/mjeri/${e.id}">Mjeri</a></td></tr>`;
    }).join("") || `<tr><td class="muted">Nema elemenata. Dodaj prvi s "+ Element" i nacrtaj ga prstom.</td></tr>`;
  }
  render();
  $("#zones").querySelectorAll("button").forEach(b => b.onclick = () => {
    zone = b.dataset.z; $("#zones").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); render();
  });
  $("#c").onpointerup = ev => {
    const p = sc.toN(ev);
    const hit = visible().slice().reverse().find(e => e.sketch && e.sketch.length > 2 && inPoly(p, e.sketch));
    if (hit) location.hash = "#/element/" + hit.id;
  };
  $("#add").onclick = async () => {
    const n = d.elements.length + 1;
    const el = await api(`/jobs/${id}/elements`, { method: "POST", body: { code: `E${n}`, zone: zone === "sve" ? "kokpit" : zone } });
    location.hash = "#/element/" + el.id;
  };
  $("#exp").onclick = async () => {
    $("#exp").disabled = true;
    try {
      const r = await api(`/jobs/${id}/export`, { method: "POST" });
      $("#files").innerHTML = r.files.map(f => `<a href="${f.url}" target="_blank">${f.name}</a>`).join("") + `<p class="muted small">${r.n_elements} elemenata</p>`;
    } catch (e) { toast(e.message); } finally { $("#exp").disabled = false; }
  };
  $("#del").onclick = async () => { if (confirm("Obrisati posao i sve elemente?")) { await api(`/jobs/${id}`, { method: "DELETE" }); location.hash = "#/"; } };
  window.onresize = () => { sc.refit(); render(); };
}

// ------------------------------------------------------------------ element: crtanje prstom
async function elementView(id) {
  const d = await api(`/elements/${id}`);
  const e = d.element, type = d.boat?.type || "jedrilica";
  const all = (await api(`/jobs/${e.job_id}`)).elements;
  crumb.textContent = `${d.job.boat_name || boatLabel(d.boat)} › ${e.code}`;
  let pts = (e.sketch || []).map(p => p.slice());
  view.innerHTML = `
    <div class="row"><h1 class="grow">Element ${esc(e.code)}</h1><a class="btn accent" href="#/mjeri/${e.id}">Mjeri →</a></div>
    <div class="two">
      <div class="card">
        <div class="canvas-wrap"><canvas class="sketch" id="c"></canvas></div>
        <div class="tools">
          <button id="undo">↶ Ukloni zadnju točku</button><button id="clear">Očisti</button><button id="mirror">Zrcali L↔D</button>
        </div>
        <p class="muted small">Dodirni shemu da dodaš točku obrisa; povuci točku da je pomakneš. Crvena točka je prva.</p>
      </div>
      <div class="card">
        <div class="row">
          <div class="grow"><label>Šifra</label><input id="code" value="${esc(e.code)}" placeholder="npr. 1A PROVA LIJEVA"></div>
          <div class="grow"><label>Naziv</label><input id="name" value="${esc(e.name)}"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div class="grow"><label>Zona</label><select id="zone">${ZONES.map(z => `<option ${z === e.zone ? "selected" : ""}>${z}</option>`).join("")}</select></div>
          <div class="grow"><label>Tip</label><select id="kind">${KINDS.map(k => `<option ${k === e.kind ? "selected" : ""}>${k}</option>`).join("")}</select></div>
          <div class="grow"><label>Debljina spužve (mm)</label><input id="th" type="number" value="${e.thickness_mm}"></div>
        </div>
        <label style="margin-top:8px">Napomena</label><textarea id="notes" rows="2">${esc(e.notes)}</textarea>
        <p class="small">Status: <span class="chip ${e.status}">${e.status}</span>
          ${e.outline_mm ? ` · obris ${Math.round(bbox(e.outline_mm)[2] - bbox(e.outline_mm)[0])} × ${Math.round(bbox(e.outline_mm)[3] - bbox(e.outline_mm)[1])} mm (${esc(e.method)})` : " · obris još nije izmjeren"}</p>
        <div class="tools">
          <button class="primary" id="save">Spremi</button>
          <button id="savemirror" title="sprema ovaj element i stvara zrcalnu kopiju (LIJEVA↔DESNA)">Spremi + zrcalna kopija</button>
          <a class="btn" href="#/posao/${e.job_id}">Natrag</a>
          <button class="danger" id="del">Obriši</button>
        </div>
      </div>
    </div>`;
  const canvas = $("#c"), sc = sketchCanvas(canvas, type);
  const others = all.filter(x => x.id !== e.id);
  const render = () => sc.draw(others, null, pts);
  render();
  let drag = null, down = null;
  const near = p => { const [W, H] = sc.size(); return pts.findIndex(q => Math.hypot((q[0] - p[0]) * W, (q[1] - p[1]) * H) < 16); };
  canvas.onpointerdown = ev => { canvas.setPointerCapture(ev.pointerId); const p = sc.toN(ev); down = p; const i = near(p); drag = i >= 0 ? i : null; };
  canvas.onpointermove = ev => { if (drag === null) return; const p = sc.toN(ev); pts[drag] = [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))]; render(); };
  canvas.onpointerup = ev => {
    const p = sc.toN(ev);
    if (drag === null && down && Math.hypot(p[0] - down[0], p[1] - down[1]) < 0.01) { pts.push(p); render(); }
    drag = null; down = null;
  };
  $("#undo").onclick = () => { pts.pop(); render(); };
  $("#clear").onclick = () => { pts = []; render(); };
  $("#mirror").onclick = () => { pts = pts.map(([x, y]) => [1 - x, y]); render(); };
  const form = () => ({ code: $("#code").value.trim(), name: $("#name").value.trim(), zone: $("#zone").value, kind: $("#kind").value,
    thickness_mm: +$("#th").value || 50, notes: $("#notes").value, sketch: pts });
  $("#save").onclick = async () => { await api(`/elements/${e.id}`, { method: "PATCH", body: form() }); toast("Spremljeno"); location.hash = "#/posao/" + e.job_id; };
  $("#savemirror").onclick = async () => {
    const f = form();
    await api(`/elements/${e.id}`, { method: "PATCH", body: f });
    const swap = s => /LIJEV/i.test(s) ? s.replace(/LIJEVA/gi, "DESNA").replace(/LIJEVI/gi, "DESNI") : /DESN/i.test(s) ? s.replace(/DESNA/gi, "LIJEVA").replace(/DESNI/gi, "LIJEVI") : s + " D";
    const m = { ...f, code: swap(f.code), name: swap(f.name), sketch: pts.map(([x, y]) => [1 - x, y]) };
    await api(`/jobs/${e.job_id}/elements`, { method: "POST", body: m });
    toast("Spremljeno + zrcalna kopija " + m.code); location.hash = "#/posao/" + e.job_id;
  };
  $("#del").onclick = async () => { if (confirm("Obrisati element?")) { await api(`/elements/${e.id}`, { method: "DELETE" }); location.hash = "#/posao/" + e.job_id; } };
  window.onresize = () => { sc.refit(); render(); };
}

// ------------------------------------------------------------------ geometrija za uređivanje konture
function dpSimplify(pts, eps) {
  if (pts.length < 5) return pts.slice();
  const d2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const rec = (a, b) => {
    if (b - a < 2) return [];
    let im = -1, dm = 0;
    for (let i = a + 1; i < b; i++) { const d = d2(pts[i], pts[a], pts[b]); if (d > dm) { dm = d; im = i; } }
    return dm > eps ? [...rec(a, im), im, ...rec(im, b)] : [];
  };
  // zatvorena krivulja: podijeli na dva luka između najudaljenijih točaka
  let i0 = 0, i1 = 0, best = 0;
  for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 60)))
    for (let j = i + 1; j < pts.length; j += Math.max(1, Math.floor(pts.length / 60))) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d > best) { best = d; i0 = i; i1 = j; }
    }
  const idx = [i0, ...rec(i0, i1), i1, ...rec(i1, pts.length - 1 + (i0 === 0 ? 0 : 0))];
  // drugi luk preko kraja niza: rotiraj
  const rot = [...pts.slice(i1), ...pts.slice(0, i0 + 1)];
  const back = rec.call(null, 0, rot.length - 1);
  const out = [];
  idx.slice(0, idx.indexOf(i1) + 1).forEach(i => out.push(pts[i]));
  back.forEach(i => out.push(rot[i]));
  return out;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t];
}

// ------------------------------------------------------------------ mjerenje: fotografija + dodiri + uređivanje konture
const METHODS = {
  markers: { label: "Markeri (prostor ili stari jastuk)", steps: ["dodir unutar elementa", "kontura"],
    hints: ["Dodirni bilo gdje unutar plohe koju mjeriš (jastuk ili prostor). Ne na marker.", ""] },
  grid: { label: "Folija na papiru s mrežom", steps: ["ishodište mreže (0,0)", "točka na osi x (npr. oznaka 50)", "točka unutar uzorka", "kontura"],
    hints: ["Dodirni ishodište mreže (0,0).", "Dodirni oznaku na osi x (npr. 50).", "Dodirni unutar uzorka.", ""] },
};
async function measureView(id) {
  const d = await api(`/elements/${id}`);
  const e = d.element;
  crumb.textContent = `${d.job.boat_name || boatLabel(d.boat)} › ${e.code} › mjerenje`;
  let method = "markers";
  view.innerHTML = `
    <div class="row"><h1 class="grow">Mjerenje: ${esc(e.code)}</h1><a class="btn" href="#/posao/${e.job_id}">Natrag</a></div>
    <div class="card" id="pick">
      <div class="row" id="methods">${Object.entries(METHODS).map(([k, m]) => `<label class="btn ${k === method ? "primary" : ""}" data-m="${k}"><input type="radio" name="m" value="${k}" ${k === method ? "checked" : ""} hidden>${m.label}</label>`).join("")}</div>
      <p id="mhint" class="small" style="margin:10px 0 8px"></p>
      <div class="row">
        <label class="btn primary">📷 Slikaj / odaberi fotografiju<input id="file" type="file" accept="image/*" capture="environment" hidden></label>
        <span id="up" class="muted small"></span>
        <span id="opts" class="row small"><label style="margin:0">marker <input id="mk" type="number" value="80" style="width:70px;padding:6px"> mm</label></span>
      </div>
    </div>
    <div class="card" id="work" hidden>
      <div class="steps" id="steps"></div>
      <div class="hint" id="hint"></div>
      <div class="photo-wrap" id="pw"><canvas id="pc"></canvas><canvas id="mag" class="mag" hidden></canvas></div>
      <div class="tools" id="tapTools">
        <button id="back">← Natrag</button>
        <label class="row" id="sqwrap" style="margin:0;gap:6px"><input type="checkbox" id="sq" style="width:auto"> kut u ishodištu izravnaj na 90°</label>
        <button class="primary" id="next">Dalje →</button>
      </div>
      <div id="editTools" hidden>
        <div class="tools">
          <button data-t="move" class="on">✋ Pomakni točku / sliku</button><button data-t="add">＋ Dodaj točku</button>
          <button data-t="del">✕ Obriši točku</button><button data-t="cut">✂ Izravnaj između 2 točke</button>
          <button id="undo">↶ Poništi</button><button id="zin">🔍+</button><button id="zout">🔍−</button><button id="zfit">⤢</button>
        </div>
        <p class="muted small" id="ehint"></p>
        <div id="result"></div>
        <div class="tools"><button id="redo">← Ponovi mjerenje</button><button class="primary" id="accept">✓ Prihvati konturu</button></div>
      </div>
    </div>`;
  const hintFor = () => $("#mhint").textContent = method === "markers"
    ? "Položi 4–8 markera na plohu oko elementa (ne na sam element), slikaj odozgo što okomitije, cijeli element i svi markeri u kadru."
    : "Folija s nacrtanim obrisom na papiru s crvenom mrežom, cijeli uzorak i oznake brojeva na osima u kadru, bez sjene preko crvenih linija.";
  hintFor();
  $("#methods").querySelectorAll("label").forEach(l => l.onclick = () => { method = l.dataset.m; $("#methods").querySelectorAll("label").forEach(x => x.classList.toggle("primary", x === l)); $("#opts").hidden = method !== "markers"; hintFor(); if (photo) startTaps(); });

  // ---- stanje
  let photo = null, img = null, step = 0, pts = [], result = null, rectImg = null;
  const pc = $("#pc"), mag = $("#mag"), ctx = pc.getContext("2d"), mctx = mag.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  let cssW = 0, cssH = 0, scale = 1;               // faza dodira: original px -> css px
  const COL = ["#ff3b30", "#ffcc00", "#34c759"];
  const M = () => METHODS[method];
  const nTaps = () => M().steps.length - 1;

  // ---- faza 1: dodiri na fotografiji
  function fitPhoto() {
    cssW = pc.parentElement.clientWidth; scale = cssW / photo.width; cssH = Math.round(photo.height * scale);
    pc.style.height = cssH + "px"; pc.width = Math.round(cssW * dpr); pc.height = Math.round(cssH * dpr);
    mag.width = 180 * dpr; mag.height = 180 * dpr;
  }
  const toOrig = ev => { const r = pc.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * photo.width, (ev.clientY - r.top) / r.height * photo.height]; };
  function drawTaps() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.drawImage(img, 0, 0, photo.width, photo.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (method === "grid" && pts[0] && pts[1]) { ctx.strokeStyle = COL[1]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale); ctx.lineTo(pts[1][0] * scale, pts[1][1] * scale); ctx.stroke(); }
    pts.forEach((p, i) => {
      if (!p) return;
      ctx.strokeStyle = COL[i % 3]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p[0] * scale, p[1] * scale, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0] * scale - 22, p[1] * scale); ctx.lineTo(p[0] * scale + 22, p[1] * scale); ctx.moveTo(p[0] * scale, p[1] * scale - 22); ctx.lineTo(p[0] * scale, p[1] * scale + 22); ctx.stroke();
    });
  }
  function drawMag(p) {
    const Z = 4, S = 180 / Z, ps = photo.width / photo.preview_width;
    mag.hidden = false;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = "#000"; mctx.fillRect(0, 0, 180, 180);
    mctx.drawImage(img, (p[0] - S / 2) / ps, (p[1] - S / 2) / ps, S / ps, S / ps, 0, 0, 180, 180);
    mctx.strokeStyle = COL[step % 3]; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.moveTo(90, 0); mctx.lineTo(90, 180); mctx.moveTo(0, 90); mctx.lineTo(180, 90); mctx.stroke();
  }
  function uiTaps() {
    const steps = M().steps;
    $("#steps").innerHTML = steps.map((s, i) => `<span class="${i < step ? "done" : i === step ? "on" : ""}">${s}</span>`).join("");
    $("#hint").textContent = M().hints[step] + " Za finu doradu povuci prstom; lupa gore desno pokazuje gdje je točka.";
    $("#next").textContent = step === nTaps() - 1 ? "Izmjeri" : "Dalje →";
    $("#next").disabled = !pts[step];
    $("#back").disabled = step === 0;
    $("#sqwrap").hidden = method !== "grid";
    $("#tapTools").hidden = false; $("#editTools").hidden = true; mag.hidden = true;
  }
  function startTaps() { step = 0; pts = []; result = null; fitPhoto(); drawTaps(); uiTaps(); bindTapEvents(); }
  let dragging = false;
  function bindTapEvents() {
    pc.onpointerdown = ev => { pc.setPointerCapture(ev.pointerId); dragging = true; pts[step] = toOrig(ev); drawTaps(); drawMag(pts[step]); uiTaps(); };
    pc.onpointermove = ev => { if (!dragging) return; pts[step] = toOrig(ev); drawTaps(); drawMag(pts[step]); };
    pc.onpointerup = () => { dragging = false; };
  }
  $("#file").onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    $("#up").innerHTML = `<span class="spinner"></span> šaljem fotografiju…`;
    const fd = new FormData(); fd.append("file", f);
    try { photo = await api("/photos", { method: "POST", body: fd }); } catch (er) { toast(er.message); $("#up").textContent = ""; return; }
    img = new Image(); img.src = photo.preview_url; await img.decode();
    $("#up").textContent = `${photo.width} × ${photo.height} px`;
    $("#work").hidden = false;
    startTaps();
  };
  $("#back").onclick = () => { step = Math.max(0, step - 1); uiTaps(); drawTaps(); };
  $("#next").onclick = async () => {
    if (step < nTaps() - 1) { step++; uiTaps(); drawTaps(); return; }
    $("#next").disabled = true; $("#hint").innerHTML = `<span class="spinner"></span> mjerim (markeri, ispravljanje, kontura)…`;
    try {
      result = method === "markers"
        ? await api(`/elements/${e.id}/measure_markers`, { method: "POST", body: { photo_id: photo.photo_id, seed_px: pts[0], marker_mm: +$("#mk").value || 80 } })
        : await api(`/elements/${e.id}/measure`, { method: "POST", body: { photo_id: photo.photo_id, origin_px: pts[0], x_axis_px: pts[1], seed_px: pts[2], square_corner_cm: $("#sq").checked ? [0, 0] : null } });
    } catch (er) { toast(er.message, 8000); uiTaps(); return; }
    rectImg = new Image(); rectImg.src = result.rect_url; await rectImg.decode();
    startEdit();
  };

  // ---- faza 2: uređivanje konture na ispravljenoj slici (1 px = 1 mm)
  const A = () => result.rect_to_mm;                       // mm = A * [u, v, 1]
  const toMm = ([u, v]) => [A()[0][0] * u + A()[0][1] * v + A()[0][2], A()[1][0] * u + A()[1][1] * v + A()[1][2]];
  const toRect = ([x, y]) => { const a = A(); const det = a[0][0] * a[1][1] - a[0][1] * a[1][0]; const X = x - a[0][2], Y = y - a[1][2];
    return [(a[1][1] * X - a[0][1] * Y) / det, (-a[1][0] * X + a[0][0] * Y) / det]; };
  let poly = [], undo = [], tool = "move", cutSel = [], vs = 1, vx = 0, vy = 0, active = null;
  const pointers = new Map();
  let pinch = null;
  const toScreen = ([u, v]) => [u * vs + vx, v * vs + vy];
  const toWorld = ev => { const r = pc.getBoundingClientRect(); return [(ev.clientX - r.left - vx) / vs, (ev.clientY - r.top - vy) / vs]; };
  function fitView() {
    cssW = pc.parentElement.clientWidth; cssH = Math.min(Math.round(window.innerHeight * 0.68), Math.round(cssW * result.rect_size[1] / result.rect_size[0]));
    pc.style.height = cssH + "px"; pc.width = Math.round(cssW * dpr); pc.height = Math.round(cssH * dpr);
    // prikaži konturu s marginom
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const bx0 = Math.min(...xs) - 120, bx1 = Math.max(...xs) + 120, by0 = Math.min(...ys) - 120, by1 = Math.max(...ys) + 120;
    vs = Math.min(cssW / (bx1 - bx0), cssH / (by1 - by0));
    vx = (cssW - (bx0 + bx1) * vs) / 2; vy = (cssH - (by0 + by1) * vs) / 2;
  }
  function drawEdit() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#222"; ctx.fillRect(0, 0, cssW, cssH);
    ctx.setTransform(dpr * vs, 0, 0, dpr * vs, dpr * vx, dpr * vy);
    ctx.drawImage(rectImg, 0, 0, result.rect_size[0], result.rect_size[1]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (result.markers_rect_px) {
      ctx.strokeStyle = "#ffcc00"; ctx.lineWidth = 1.5;
      result.markers_rect_px.forEach(m => { ctx.beginPath(); m.forEach((p, i) => { const s = toScreen(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.stroke(); });
    }
    ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 2.5; ctx.beginPath();
    poly.forEach((p, i) => { const s = toScreen(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.stroke();
    poly.forEach((p, i) => {
      const s = toScreen(p); const sel = cutSel.includes(i);
      ctx.beginPath(); ctx.arc(s[0], s[1], sel ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = sel ? "#ff3b30" : i === active ? "#ffcc00" : "#fff"; ctx.fill(); ctx.strokeStyle = "#0b3d5c"; ctx.lineWidth = 1.5; ctx.stroke();
    });
    const b = bbox(poly.map(toMm));
    let per = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], c = poly[(i + 1) % poly.length]; per += Math.hypot(a[0] - c[0], a[1] - c[1]); }
    const q = result.quality;
    $("#result").innerHTML = `<table><tr><th>gabarit</th><td>${Math.round(b[2] - b[0])} × ${Math.round(b[3] - b[1])} mm</td><th>opseg</th><td>${Math.round(per)} mm</td><th>točaka</th><td>${poly.length}</td></tr>
      ${method === "markers" ? `<tr><th>markera</th><td>${q.n_markers} (${q.marker_ids.join(", ")})</td><th>ostatak prilagodbe</th><td>${q.fit_rms_mm} mm ${q.fit_rms_mm > 1.5 ? "⚠️" : "✓"}</td><th>rezolucija</th><td>${q.mm_per_px} mm/px</td></tr>`
        : `<tr><th>čvorova mreže</th><td>${q.grid_nodes}</td><th>ostatak homografije</th><td>${q.homography_rms_px} px ${q.homography_rms_px > 3 ? "⚠️" : "✓"}</td><th>potez</th><td>${q.stroke_mm} mm</td></tr>`}</table>`;
  }
  const EH = { move: "Povuci točku da je pomakneš; povuci prazno mjesto da pomakneš sliku; dva prsta za zum.", add: "Dodirni konturu gdje želiš novu točku.",
    del: "Dodirni točku koju želiš obrisati.", cut: "Dodirni dvije točke: sve između njih zamijeni ravna linija (odsijeca dio koji ne pripada elementu)." };
  function setTool(t) { tool = t; cutSel = []; $("#editTools").querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t)); $("#ehint").textContent = EH[t]; drawEdit(); }
  function startEdit() {
    poly = dpSimplify(result.outline_mm.map(toRect), 0.7);
    undo = []; cutSel = []; active = null;
    $("#steps").innerHTML = M().steps.map((s, i) => `<span class="${i === M().steps.length - 1 ? "on" : "done"}">${s}</span>`).join("");
    $("#hint").textContent = "Provjeri konturu (svijetloplavo) na ispravljenoj slici i popravi je prstom gdje treba. Žuto su markeri.";
    $("#tapTools").hidden = true; $("#editTools").hidden = false; mag.hidden = true;
    fitView(); setTool("move");
    bindEditEvents();
  }
  const nearest = w => { let bi = -1, bd = 1e9; poly.forEach((p, i) => { const d = Math.hypot(p[0] - w[0], p[1] - w[1]); if (d < bd) { bd = d; bi = i; } }); return [bi, bd * vs]; };
  const push = () => { undo.push(poly.map(p => p.slice())); if (undo.length > 50) undo.shift(); };
  function bindEditEvents() {
    let panStart = null;
    pc.onpointerdown = ev => {
      pc.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vs, vx, vy, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 }; active = null; panStart = null; return; }
      const w = toWorld(ev); const [i, ds] = nearest(w);
      if (tool === "move") { if (ds < 18) { push(); active = i; } else panStart = { x: ev.clientX, y: ev.clientY, vx, vy }; }
      else if (tool === "del") { if (ds < 22 && poly.length > 3) { push(); poly.splice(i, 1); drawEdit(); } }
      else if (tool === "add") {
        let bi = -1, bd = 1e9, bt = 0;
        for (let k = 0; k < poly.length; k++) { const [dd, t] = segDist(w, poly[k], poly[(k + 1) % poly.length]); if (dd < bd) { bd = dd; bi = k; bt = t; } }
        if (bd * vs < 30) { push(); const a = poly[bi], b = poly[(bi + 1) % poly.length]; poly.splice(bi + 1, 0, [a[0] + bt * (b[0] - a[0]), a[1] + bt * (b[1] - a[1])]); active = bi + 1; drawEdit(); }
      } else if (tool === "cut") {
        if (ds < 22) { cutSel.push(i); if (cutSel.length === 2) { push(); cutBetween(cutSel[0], cutSel[1]); cutSel = []; } drawEdit(); }
      }
    };
    pc.onpointermove = ev => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]; const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = pc.getBoundingClientRect();
        const cx = (a[0] + b[0]) / 2 - r.left, cy = (a[1] + b[1]) / 2 - r.top, k = Math.max(0.2, Math.min(8, pinch.vs * dd / pinch.d)) / pinch.vs;
        vs = pinch.vs * k; vx = cx - (pinch.cx - r.left - pinch.vx) * k + (cx - (pinch.cx - r.left)) * 0; vy = cy - (pinch.cy - r.top - pinch.vy) * k;
        drawEdit(); return;
      }
      if (active !== null && tool === "move") { poly[active] = toWorld(ev); drawEdit(); }
      else if (panStart) { vx = panStart.vx + ev.clientX - panStart.x; vy = panStart.vy + ev.clientY - panStart.y; drawEdit(); }
    };
    pc.onpointerup = pc.onpointercancel = ev => { pointers.delete(ev.pointerId); if (pointers.size < 2) pinch = null; active = null; panStart = null; drawEdit(); };
  }
  function cutBetween(i, j) {
    if (i === j) return;
    const n = poly.length; if (i > j) [i, j] = [j, i];
    const inner = j - i - 1, outer = n - inner - 2;         // broj točaka na svakom luku
    if (inner <= outer) poly.splice(i + 1, inner); else poly = poly.slice(i, j + 1);
  }
  const zoomAt = k => { const cx = cssW / 2, cy = cssH / 2; vx = cx - (cx - vx) * k; vy = cy - (cy - vy) * k; vs *= k; drawEdit(); };
  $("#editTools").querySelectorAll("[data-t]").forEach(b => b.onclick = () => setTool(b.dataset.t));
  $("#undo").onclick = () => { if (undo.length) { poly = undo.pop(); drawEdit(); } };
  $("#zin").onclick = () => zoomAt(1.5); $("#zout").onclick = () => zoomAt(1 / 1.5); $("#zfit").onclick = () => { fitView(); drawEdit(); };
  $("#redo").onclick = () => startTaps();
  $("#accept").onclick = async () => {
    if (poly.length < 3) { toast("kontura treba bar 3 točke"); return; }
    await api(`/elements/${e.id}/accept`, { method: "POST", body: { measurement_id: result.measurement_id, outline_mm: poly.map(p => toMm(p).map(v => Math.round(v * 10) / 10)) } });
    toast("Kontura prihvaćena"); location.hash = "#/posao/" + e.job_id;
  };
  window.onresize = () => { if (!photo) return; if (result) { fitView(); drawEdit(); } else { fitPhoto(); drawTaps(); } };
}
