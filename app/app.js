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
  [/^#\/nacrt\/(\d+)$/, drawingView],
  [/^#\/pravila$/, rulesView],
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
    <div class="row"><h1 class="grow">Poslovi</h1><a class="btn" href="#/pravila">⚙ Pravila radionice</a><a class="btn primary" href="#/novi">+ Novi posao</a></div>
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
          <p class="muted small">Krojevi (lice, dno, traka, spužva sa šavom i zarezima) kao DXF i PDF 1:1 slijepljen iz stranica, popis materijala, obrisi s dodacima.</p>
          <div class="row"><select id="page" style="width:auto"><option value="A4">PDF 1:1 na A4</option><option value="A3">PDF 1:1 na A3</option></select><button id="exp" class="primary">Generiraj krojeve</button></div>
          <div class="files" id="files"></div></div>
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
        <td style="white-space:nowrap"><a class="btn" href="#/element/${e.id}">Uredi</a> <a class="btn accent" href="#/mjeri/${e.id}">Mjeri</a>${e.outline_mm ? ` <a class="btn" href="#/nacrt/${e.id}">Nacrt${e.features && e.features.length ? ` (${e.features.length})` : ""}</a>` : ""}</td></tr>`;
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
      const r = await api(`/jobs/${id}/export?page=${$("#page").value}`, { method: "POST" });
      $("#files").innerHTML = r.files.map(f => `<a href="${f.url}" target="_blank">${f.name}</a>`).join("")
        + `<table style="margin-top:8px"><tr><th>element</th><th>materijal</th><th>tkanina m²</th><th>traka</th><th>spužva m²</th></tr>${r.materijal.map(m => `<tr><td>${esc(m.element)}</td><td>${m.material}</td><td>${m.fabric_m2}</td><td>${m.strip_height_mm} × ${m.strip_length_mm}</td><td>${m.foam_m2} × ${m.foam_thickness_mm} mm</td></tr>`).join("")}</table><p class="muted small">${r.n_elements} elemenata</p>`;
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
  /* Douglas-Peucker za ZATVORENU krivulju: podijeli je u dva luka između dvije najudaljenije točke,
     pojednostavi svaki luk zasebno i spoji. */
  if (pts.length < 5) return pts.slice();
  const dseg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const rec = (arr, a, b) => {           // unutarnji indeksi (rastući) koje treba zadržati između a i b
    if (b - a < 2) return [];
    let im = -1, dm = 0;
    for (let i = a + 1; i < b; i++) { const d = dseg(arr[i], arr[a], arr[b]); if (d > dm) { dm = d; im = i; } }
    return dm > eps ? [...rec(arr, a, im), im, ...rec(arr, im, b)] : [];
  };
  let i0 = 0, i1 = 0, best = -1;
  const st = Math.max(1, Math.floor(pts.length / 80));
  for (let i = 0; i < pts.length; i += st) for (let j = i + 1; j < pts.length; j += st) {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d > best) { best = d; i0 = i; i1 = j; }
  }
  const arc1 = pts.slice(i0, i1 + 1), arc2 = [...pts.slice(i1), ...pts.slice(0, i0 + 1)];
  const k1 = rec(arc1, 0, arc1.length - 1), k2 = rec(arc2, 0, arc2.length - 1);
  return [arc1[0], ...k1.map(i => arc1[i]), arc1[arc1.length - 1], ...k2.map(i => arc2[i])];
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
  manual: { label: "Ručne mjere (metar)", steps: [], hints: [] },
};
// ---- ručne mjere: oblik iz brojeva -> obris u mm (y prema gore, CCW)
const SHAPES = {
  pravokutnik: { name: "Pravokutnik", fields: [["w", "širina (mm)", 600], ["h", "dubina (mm)", 450], ["r", "radijus uglova (mm)", 0]] },
  trapez: { name: "Trapez", fields: [["w", "širina dolje (mm)", 600], ["w2", "širina gore (mm)", 400], ["h", "dubina (mm)", 450], ["r", "radijus uglova (mm)", 0], ["off", "pomak gornje stranice (mm, + desno)", 0]] },
  L: { name: "L oblik (izrez u gornjem desnom kutu)", fields: [["w", "širina (mm)", 900], ["h", "dubina (mm)", 600], ["cw", "širina izreza (mm)", 300], ["ch", "dubina izreza (mm)", 250], ["r", "radijus uglova (mm)", 0]] },
  elipsa: { name: "Elipsa / krug", fields: [["w", "širina (mm)", 500], ["h", "visina (mm)", 500]] },
};
function shapeOutline(kind, v) {
  const corner = (p, r) => p;   // vrhovi bez zaobljenja; zaobljenje dolje
  let pts;
  if (kind === "pravokutnik") pts = [[0, 0], [v.w, 0], [v.w, v.h], [0, v.h]];
  else if (kind === "trapez") { const x0 = (v.w - v.w2) / 2 + (v.off || 0); pts = [[0, 0], [v.w, 0], [x0 + v.w2, v.h], [x0, v.h]]; }
  else if (kind === "L") pts = [[0, 0], [v.w, 0], [v.w, v.h - v.ch], [v.w - v.cw, v.h - v.ch], [v.w - v.cw, v.h], [0, v.h]];
  else if (kind === "elipsa") { pts = []; for (let i = 0; i < 72; i++) { const a = i / 72 * 2 * Math.PI; pts.push([v.w / 2 + v.w / 2 * Math.cos(a), v.h / 2 + v.h / 2 * Math.sin(a)]); } return pts; }
  const r = +v.r || 0;
  if (r <= 0) return pts;
  const out = [];                      // zaobljenje konveksnih uglova radijusom r
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const da = [a[0] - p[0], a[1] - p[1]], db = [b[0] - p[0], b[1] - p[1]];
    const la = Math.hypot(...da), lb = Math.hypot(...db);
    const ua = [da[0] / la, da[1] / la], ub = [db[0] / lb, db[1] / lb];
    const cross = ua[0] * ub[1] - ua[1] * ub[0];
    const ang = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
    const rr = Math.min(r, 0.45 * Math.min(la, lb) * Math.tan(ang / 2));
    if (cross >= 0 || rr < 1) { out.push(p); continue; }     // konkavan ugao (CCW, y gore: cross > 0) ostaje oštar
    const t = rr / Math.tan(ang / 2);
    const pa = [p[0] + ua[0] * t, p[1] + ua[1] * t], pb = [p[0] + ub[0] * t, p[1] + ub[1] * t];
    const bis = [ua[0] + ub[0], ua[1] + ub[1]], lbis = Math.hypot(...bis);
    const c = [p[0] + bis[0] / lbis * rr / Math.sin(ang / 2), p[1] + bis[1] / lbis * rr / Math.sin(ang / 2)];
    const a0 = Math.atan2(pa[1] - c[1], pa[0] - c[0]); let a1 = Math.atan2(pb[1] - c[1], pb[0] - c[0]);
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const n = Math.max(4, Math.round(Math.abs(d) * rr / 8));
    for (let k = 0; k <= n; k++) { const q = a0 + d * k / n; out.push([c[0] + rr * Math.cos(q), c[1] + rr * Math.sin(q)]); }
  }
  return out;
}
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
    <div class="card" id="manual" hidden>
      <div class="row"><div class="grow"><label>Oblik</label><select id="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></div></div>
      <div class="row" id="shapeFields" style="margin-top:8px"></div>
      <div class="canvas-wrap" style="margin-top:10px"><canvas id="mc" class="sketch" style="background:#fff;height:260px"></canvas></div>
      <p class="muted small">Mjere su mjere gotovog jastuka (obris lica). Dodatak za šav i razlika prema spužvi računaju se u kroju.</p>
      <div class="tools"><button class="primary" id="manualSave">✓ Spremi obris</button></div>
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
    ? "Položi 4–8 markera na plohu oko elementa ili na sam jastuk (kruto, ravno, dalje od ruba), slikaj odozgo što okomitije, cijeli element i svi markeri u kadru."
    : method === "grid" ? "Folija s nacrtanim obrisom na papiru s crvenom mrežom, cijeli uzorak i oznake brojeva na osima u kadru, bez sjene preko crvenih linija."
    : "Upiši mjere gotovog jastuka izmjerene metrom. Za složenije oblike koristi markere ili foliju.";
  hintFor();
  $("#methods").querySelectorAll("label").forEach(l => l.onclick = () => { method = l.dataset.m; $("#methods").querySelectorAll("label").forEach(x => x.classList.toggle("primary", x === l)); $("#opts").hidden = method !== "markers"; hintFor(); $("#manual").hidden = method !== "manual"; $("#pick").querySelector(".row:last-child").hidden = method === "manual"; if (method === "manual") manualUI(); else if (photo) startTaps(); });
  function manualUI() {
    const kind = $("#shape").value, def = SHAPES[kind];
    if (!$("#shapeFields").dataset.kind || $("#shapeFields").dataset.kind !== kind) {
      $("#shapeFields").dataset.kind = kind;
      $("#shapeFields").innerHTML = def.fields.map(([k, lab, dv]) => `<div class="grow"><label>${lab}</label><input data-f="${k}" type="number" value="${dv}"></div>`).join("");
      $("#shapeFields").querySelectorAll("input").forEach(i => i.oninput = manualDraw);
    }
    manualDraw();
  }
  function manualValues() { const v = {}; $("#shapeFields").querySelectorAll("input").forEach(i => v[i.dataset.f] = +i.value || 0); return v; }
  function manualDraw() {
    const mc = $("#mc"), c2 = mc.getContext("2d"), W = mc.parentElement.clientWidth, H = 260;
    mc.style.width = W + "px"; mc.width = W * dpr; mc.height = H * dpr; c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = shapeOutline($("#shape").value, manualValues()); if (pts.length < 3) return;
    const b = bbox(pts), sc = Math.min((W - 40) / (b[2] - b[0] || 1), (H - 40) / (b[3] - b[1] || 1));
    const T = ([x, y]) => [20 + (x - b[0]) * sc, H - 20 - (y - b[1]) * sc];
    c2.clearRect(0, 0, W, H); c2.beginPath(); pts.forEach((p, i) => { const q = T(p); i ? c2.lineTo(q[0], q[1]) : c2.moveTo(q[0], q[1]); }); c2.closePath();
    c2.fillStyle = "rgba(11,61,92,.08)"; c2.fill(); c2.strokeStyle = "#16232e"; c2.lineWidth = 2; c2.stroke();
    c2.fillStyle = "#5e6c78"; c2.font = "12px system-ui"; c2.fillText(`${Math.round(b[2] - b[0])} × ${Math.round(b[3] - b[1])} mm`, 20, 16);
  }
  $("#shape").onchange = manualUI;
  $("#manualSave").onclick = async () => {
    const pts = shapeOutline($("#shape").value, manualValues());
    if (pts.length < 3 || bbox(pts)[2] - bbox(pts)[0] < 10) { toast("Provjeri mjere"); return; }
    await api(`/elements/${e.id}`, { method: "PATCH", body: { outline_mm: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]), method: "manual", status: "potvrđen" } });
    toast("Obris spremljen. Sad dodaci."); location.hash = "#/nacrt/" + e.id;
  };

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
      ${method === "markers" ? `<tr><th>markera</th><td>${q.n_markers} (${q.marker_ids.join(", ")})${q.dropped_ids && q.dropped_ids.length ? `<br><b style="color:var(--bad)">⚠️ izbačen M${q.dropped_ids.join(", M")}: nije u ravnini s ostalima</b>` : ""}</td><th>ostatak prilagodbe</th><td>${q.fit_rms_mm} mm ${q.fit_rms_mm > 1.5 ? "⚠️" : "✓"}</td><th>rezolucija</th><td>${q.mm_per_px} mm/px</td></tr>`
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
    toast("Kontura prihvaćena. Sad dodaci: cif, kopče, rupe…"); location.hash = "#/nacrt/" + e.id;
  };
  window.onresize = () => { if (!photo) return; if (result) { fitView(); drawEdit(); } else { fitPhoto(); drawTaps(); } };
}


// ------------------------------------------------------------------ nacrt: dodaci na elementu (cif, keder, kopče, rupe, gumbi…)
const FCOL = { zip: "#e0312a", keder: "#1f5fbf", cicak: "#2e8b57", kopca: "#c02aa0", rupa: "#d9822b", rupica: "#0f8a8a", gumb: "#7a4a1f", vezica: "#6a3fb5", napomena: "#16232e" };
function cumlen(poly) { const c = [0]; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; c.push(c[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); } return c; }
function pointAtS(poly, s) {
  const c = cumlen(poly), L = c[c.length - 1]; s = ((s % L) + L) % L;
  let i = 0; while (i < poly.length - 1 && c[i + 1] <= s) i++;
  const a = poly[i], b = poly[(i + 1) % poly.length], ln = c[i + 1] - c[i], t = ln > 0 ? (s - c[i]) / ln : 0;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}
function projectS(poly, p) {
  const c = cumlen(poly); let best = 1e18, bs = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]; const [d, t] = segDist(p, a, b);
    if (d < best) { best = d; bs = c[i] + t * (c[i + 1] - c[i]); }
  }
  return [bs, best];
}
function arcPts(poly, s0, s1, step = 5) {
  const L = cumlen(poly).at(-1); let len = (((s1 - s0) % L) + L) % L; if (len < 1e-6) len = L;
  const n = Math.max(2, Math.floor(len / step) + 1); const out = [];
  for (let k = 0; k < n; k++) out.push(pointAtS(poly, s0 + k * len / (n - 1)));
  return out;
}
function flabel(f) {
  const p = f.params || {};
  return { zip: `CIF ${p.sirina} mm (${p.strana})`, keder: `KEDER Ø${p.promjer}`, cicak: `ČIČAK ${p.sirina}`, kopca: `KOPČA ${p.vrsta || ""}`,
    rupa: `RUPA Ø${p.promjer}`, rupica: `RUPICA Ø${p.promjer}`, gumb: `GUMB Ø${p.promjer}`, vezica: `VEZICA ${p.duljina}`, napomena: p.tekst || "napomena" }[f.type] || f.type;
}
const PARAM_UI = {   // polje -> (oznaka, tip, opcije)
  sirina: ["širina (mm)", "select", [5, 8, 10, 20, 25, 50]], strana: ["strana", "select", ["traka", "dno", "lice"]],
  promjer: ["promjer (mm)", "number"], vrsta: ["vrsta", "select", ["druker", "tenax", "lift-the-dot", "karabiner", "čičak"]],
  duljina: ["duljina (mm)", "number"], tekst: ["tekst", "text"],
};

async function drawingView(id) {
  const d = await api(`/elements/${id}`);
  const e = d.element;
  if (!e.outline_mm) { location.hash = "#/mjeri/" + id; return; }
  const TYPES = await api("/feature_types");
  crumb.textContent = `${d.job.boat_name || boatLabel(d.boat)} › ${e.code} › nacrt`;
  const poly = e.outline_mm.map(p => p.slice());
  let feats = (e.features || []).map(f => JSON.parse(JSON.stringify(f)));
  let tool = "select", sel = null, pending = null, nextId = feats.length + 1;
  const tiles = TYPES.map(t => `<button data-t="${t.type}" style="border-left:5px solid ${FCOL[t.type]}">${t.name}</button>`).join("");
  view.innerHTML = `
    <div class="row"><h1 class="grow">Nacrt: ${esc(e.code)} <span class="muted small">${esc(e.zone)} · ${esc(e.kind)} · ${e.thickness_mm} mm</span></h1><a class="btn" href="#/posao/${e.job_id}">Natrag</a></div>
    <div class="two">
      <div class="card">
        <div class="canvas-wrap"><canvas class="sketch" id="c" style="background:#fff"></canvas></div>
        <div class="tools" style="margin-top:8px"><button id="zin">🔍+</button><button id="zout">🔍−</button><button id="zfit">⤢</button><button id="undo">↶ Poništi</button></div>
        <p class="muted small" id="hint"></p>
      </div>
      <div>
        <div class="card"><h2 style="margin-top:0">Dodaj dodatak</h2>
          <div class="tools"><button data-t="select" class="on">☝ Odaberi / pomakni</button>${tiles}</div>
          <p class="muted small">Rubni dodaci (cif, keder, čičak): dodirni obris na početku i na kraju, u smjeru obrisa. Točkasti: dodirni mjesto na elementu.</p>
        </div>
        <div class="card" id="props"><span class="muted small">Ništa nije odabrano. Dodirni dodatak na nacrtu da mu promijeniš parametre.</span></div>
        <div class="card"><h2 style="margin-top:0">Popis dodataka</h2><table><tbody id="list"></tbody></table></div>
        <div class="tools"><button class="primary" id="save">Spremi nacrt</button><a class="btn" href="#/mjeri/${e.id}">Ponovi mjerenje</a></div>
      </div>
    </div>`;
  const canvas = $("#c"), ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0, vs = 1, vx = 0, vy = 0;
  const b = bbox(poly);
  function fit() {
    W = canvas.parentElement.clientWidth; H = Math.min(Math.round(window.innerHeight * 0.7), Math.round(W * (b[3] - b[1] + 200) / (b[2] - b[0] + 200)) + 40);
    canvas.style.width = W + "px"; canvas.style.height = H + "px"; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    vs = Math.min(W / (b[2] - b[0] + 200), H / (b[3] - b[1] + 200));
    vx = (W - (b[0] + b[2]) * vs) / 2; vy = (H + (b[1] + b[3]) * vs) / 2;        // y prema gore
  }
  const toS = ([x, y]) => [x * vs + vx, -y * vs + vy];
  const toW = ev => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left - vx) / vs, -(ev.clientY - r.top - vy) / vs]; };
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    // mreža 100 mm
    ctx.strokeStyle = "#f0d0d0"; ctx.lineWidth = 0.6;
    const gx0 = Math.floor((b[0] - 200) / 100) * 100, gx1 = b[2] + 200, gy0 = Math.floor((b[1] - 200) / 100) * 100, gy1 = b[3] + 200;
    for (let x = gx0; x <= gx1; x += 100) { const a = toS([x, gy0]), c = toS([x, gy1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    for (let y = gy0; y <= gy1; y += 100) { const a = toS([gx0, y]), c = toS([gx1, y]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    // obris
    ctx.beginPath(); poly.forEach((p, i) => { const s = toS(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath();
    ctx.fillStyle = "rgba(11,61,92,.06)"; ctx.fill(); ctx.strokeStyle = "#16232e"; ctx.lineWidth = 2; ctx.stroke();
    const s0 = toS(poly[0]); ctx.fillStyle = "#16232e"; ctx.beginPath(); ctx.arc(s0[0], s0[1], 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = "11px system-ui"; ctx.fillText("početak (s=0) →", s0[0] + 6, s0[1] - 6);
    ctx.fillText(`${Math.round(b[2] - b[0])} × ${Math.round(b[3] - b[1])} mm`, toS([b[0], b[1]])[0], toS([b[0], b[1]])[1] + 16);
    // dodaci
    feats.forEach((f, i) => {
      const col = FCOL[f.type] || "#000", on = i === sel;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = on ? 5 : 3;
      if (f.s0 !== undefined) {
        const a = arcPts(poly, f.s0, f.s1); ctx.beginPath(); a.forEach((p, k) => { const s = toS(p); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke();
        for (const q of [a[0], a.at(-1)]) { const s = toS(q); ctx.beginPath(); ctx.arc(s[0], s[1], on ? 7 : 5, 0, Math.PI * 2); ctx.fill(); }
        const m = toS(a[Math.floor(a.length / 2)]); ctx.font = "bold 11px system-ui"; ctx.fillText(`${flabel(f)} L=${Math.round(edgeLen(f))}`, m[0] + 8, m[1] - 8);
      } else {
        const s = toS(f.p), r = Math.max(6, ((f.params || {}).promjer || 15) / 2 * vs);
        ctx.lineWidth = on ? 3 : 1.5; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s[0] - r * 1.6, s[1]); ctx.lineTo(s[0] + r * 1.6, s[1]); ctx.moveTo(s[0], s[1] - r * 1.6); ctx.lineTo(s[0], s[1] + r * 1.6); ctx.stroke();
        ctx.font = "bold 11px system-ui"; ctx.fillText(flabel(f), s[0] + r + 4, s[1] - r - 2);
      }
    });
    if (pending) { const s = toS(pointAtS(poly, pending.s0)); ctx.fillStyle = FCOL[pending.type]; ctx.beginPath(); ctx.arc(s[0], s[1], 8, 0, Math.PI * 2); ctx.fill(); ctx.fillText("početak", s[0] + 10, s[1]); }
    $("#list").innerHTML = feats.map((f, i) => `<tr class="${i === sel ? "on" : ""}"><td><span style="color:${FCOL[f.type]}">●</span> ${esc(flabel(f))}</td><td class="small">${f.s0 !== undefined ? `s ${Math.round(f.s0)}→${Math.round(f.s1)} (L ${Math.round(edgeLen(f))} mm)` : `${Math.round(f.p[0])}, ${Math.round(f.p[1])}`}</td><td><button data-i="${i}" class="sel">✎</button> <button data-i="${i}" class="del danger">✕</button></td></tr>`).join("") || `<tr><td class="muted">Još nema dodataka.</td></tr>`;
    $("#list").querySelectorAll(".sel").forEach(x => x.onclick = () => select(+x.dataset.i));
    $("#list").querySelectorAll(".del").forEach(x => x.onclick = () => { push(); feats.splice(+x.dataset.i, 1); sel = null; props(); draw(); });
  }
  const edgeLen = f => { const L = cumlen(poly).at(-1); const l = (((f.s1 - f.s0) % L) + L) % L; return l < 1e-6 ? L : l; };
  const undoStack = []; const push = () => { undoStack.push(JSON.stringify(feats)); if (undoStack.length > 50) undoStack.shift(); };
  function props() {
    const box = $("#props");
    if (sel === null) { box.innerHTML = `<span class="muted small">Ništa nije odabrano. Dodirni dodatak na nacrtu da mu promijeniš parametre.</span>`; return; }
    const f = feats[sel], t = TYPES.find(x => x.type === f.type);
    const fields = Object.keys(t.defaults).map(k => { const [lab, kind, opts] = PARAM_UI[k] || [k, "text"]; const v = f.params[k];
      return `<div class="grow"><label>${lab}</label>${kind === "select" ? `<select data-k="${k}">${opts.map(o => `<option ${String(o) === String(v) ? "selected" : ""}>${o}</option>`).join("")}</select>` : `<input data-k="${k}" type="${kind}" value="${esc(v)}">`}</div>`; }).join("");
    const pos = f.s0 !== undefined
      ? `<div class="grow"><label>početak s (mm)</label><input data-s="s0" type="number" value="${Math.round(f.s0)}"></div><div class="grow"><label>kraj s (mm)</label><input data-s="s1" type="number" value="${Math.round(f.s1)}"></div>`
      : `<div class="grow"><label>x (mm)</label><input data-p="0" type="number" value="${Math.round(f.p[0])}"></div><div class="grow"><label>y (mm)</label><input data-p="1" type="number" value="${Math.round(f.p[1])}"></div>`;
    box.innerHTML = `<h2 style="margin-top:0;color:${FCOL[f.type]}">${esc(t.name)}</h2><div class="row">${fields}</div><div class="row" style="margin-top:8px">${pos}</div>
      <div class="tools"><button id="dup">Kopiraj</button><button class="danger" id="fdel">Obriši</button></div>`;
    box.querySelectorAll("[data-k]").forEach(inp => inp.onchange = () => { push(); f.params[inp.dataset.k] = inp.type === "number" ? +inp.value : inp.value; draw(); });
    box.querySelectorAll("[data-s]").forEach(inp => inp.onchange = () => { push(); f[inp.dataset.s] = +inp.value; draw(); });
    box.querySelectorAll("[data-p]").forEach(inp => inp.onchange = () => { push(); f.p[+inp.dataset.p] = +inp.value; draw(); });
    $("#dup").onclick = () => { push(); const g = JSON.parse(JSON.stringify(f)); g.id = "f" + nextId++; if (g.p) { g.p[0] += 100; } else { const L = cumlen(poly).at(-1); g.s0 = (g.s0 + 200) % L; g.s1 = (g.s1 + 200) % L; } feats.push(g); select(feats.length - 1); };
    $("#fdel").onclick = () => { push(); feats.splice(sel, 1); sel = null; props(); draw(); };
  }
  function select(i) { sel = i; props(); draw(); }
  function setTool(t) { tool = t; pending = null; $("#view").querySelectorAll("[data-t]").forEach(x => x.classList.toggle("on", x.dataset.t === t));
    const T = TYPES.find(x => x.type === t);
    $("#hint").textContent = t === "select" ? "Dodirni dodatak da ga odabereš; povuci točkasti dodatak ili kraj rubnog da ga pomakneš. Povuci prazno za pomak slike, dva prsta za zum."
      : T.geom === "edge" ? `${T.name}: dodirni obris na POČETKU, pa na KRAJU (u smjeru strelice od početka obrisa).` : `${T.name}: dodirni mjesto na elementu.`; draw(); }
  // ---- događaji
  const pointers = new Map(); let pinch = null, drag = null, pan = null;
  const hit = w => {
    for (let i = feats.length - 1; i >= 0; i--) { const f = feats[i];
      if (f.s0 !== undefined) { for (const [key, s] of [["s0", f.s0], ["s1", f.s1]]) { const q = pointAtS(poly, s); if (Math.hypot(q[0] - w[0], q[1] - w[1]) * vs < 16) return { i, key }; }
        const a = arcPts(poly, f.s0, f.s1, 10); for (let k = 0; k < a.length - 1; k++) if (segDist(w, a[k], a[k + 1])[0] * vs < 10) return { i, key: null }; }
      else { const r = Math.max(8, ((f.params || {}).promjer || 15) / 2 * vs); if (Math.hypot(f.p[0] - w[0], f.p[1] - w[1]) * vs < r + 8) return { i, key: "p" }; } }
    return null;
  };
  canvas.onpointerdown = ev => {
    canvas.setPointerCapture(ev.pointerId); pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) { const [a, c] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - c[0], a[1] - c[1]), vs, vx, vy, cx: (a[0] + c[0]) / 2, cy: (a[1] + c[1]) / 2 }; drag = null; pan = null; return; }
    const w = toW(ev);
    if (tool === "select") { const h = hit(w); if (h) { select(h.i); if (h.key) { push(); drag = h; } } else pan = { x: ev.clientX, y: ev.clientY, vx, vy }; return; }
    const T = TYPES.find(x => x.type === tool);
    if (T.geom === "edge") {
      const [s, dist] = projectS(poly, w); if (dist * vs > 40) { toast("Dodirni bliže obrisu"); return; }
      if (!pending) { pending = { type: tool, s0: s }; draw(); }
      else { push(); feats.push({ id: "f" + nextId++, type: tool, s0: Math.round(pending.s0), s1: Math.round(s), params: { ...T.defaults } }); pending = null; select(feats.length - 1); }
    } else {
      push(); feats.push({ id: "f" + nextId++, type: tool, p: [Math.round(w[0]), Math.round(w[1])], params: { ...T.defaults } }); select(feats.length - 1);
    }
  };
  canvas.onpointermove = ev => {
    if (!pointers.has(ev.pointerId)) return; pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinch && pointers.size === 2) { const [a, c] = [...pointers.values()]; const dd = Math.hypot(a[0] - c[0], a[1] - c[1]); const r = canvas.getBoundingClientRect();
      const cx = (a[0] + c[0]) / 2 - r.left, cy = (a[1] + c[1]) / 2 - r.top, k = Math.max(0.2, Math.min(10, pinch.vs * dd / pinch.d)) / pinch.vs;
      vs = pinch.vs * k; vx = cx - (pinch.cx - r.left - pinch.vx) * k; vy = cy - (pinch.cy - r.top - pinch.vy) * k; draw(); return; }
    const w = toW(ev);
    if (drag) { const f = feats[drag.i]; if (drag.key === "p") f.p = [Math.round(w[0]), Math.round(w[1])]; else f[drag.key] = Math.round(projectS(poly, w)[0]); draw(); }
    else if (pan) { vx = pan.vx + ev.clientX - pan.x; vy = pan.vy + ev.clientY - pan.y; draw(); }
  };
  canvas.onpointerup = canvas.onpointercancel = ev => { pointers.delete(ev.pointerId); if (pointers.size < 2) pinch = null; if (drag) props(); drag = null; pan = null; };
  $("#view").querySelectorAll("[data-t]").forEach(x => x.onclick = () => setTool(x.dataset.t));
  const zoomAt = k => { vx = W / 2 - (W / 2 - vx) * k; vy = H / 2 - (H / 2 - vy) * k; vs *= k; draw(); };
  $("#zin").onclick = () => zoomAt(1.5); $("#zout").onclick = () => zoomAt(1 / 1.5); $("#zfit").onclick = () => { fit(); draw(); };
  $("#undo").onclick = () => { if (undoStack.length) { feats = JSON.parse(undoStack.pop()); sel = null; props(); draw(); } };
  $("#save").onclick = async () => { await api(`/elements/${e.id}`, { method: "PATCH", body: { features: feats } }); toast("Nacrt spremljen"); location.hash = "#/posao/" + e.job_id; };
  fit(); setTool("select"); props();
  window.__nacrt = { poly, toS: p => toS(p), pointAtS: s => pointAtS(poly, s), L: () => cumlen(poly).at(-1) };   // za automatski prolaz (tools/ui_walkthrough.py)
  window.onresize = () => { fit(); draw(); };
}


// ------------------------------------------------------------------ pravila radionice
async function rulesView() {
  crumb.textContent = "pravila radionice";
  const r = await api("/rules");
  const num = (id, lab, v, step = 1) => `<div class="grow"><label>${lab}</label><input id="${id}" type="number" step="${step}" value="${v}"></div>`;
  view.innerHTML = `
    <div class="row"><h1 class="grow">Pravila radionice</h1><a class="btn" href="#/">Natrag</a></div>
    <div class="card"><h2 style="margin-top:0">Šav i zarezi</h2>
      <div class="row">${num("seam", "dodatak za šav (mm)", r.seam_mm)}${num("nstep", "zarezi po ravnim dijelovima svakih (mm)", r.notch_step_mm)}${num("nlen", "duljina zareza (mm)", r.notch_len_mm)}</div></div>
    <div class="card"><h2 style="margin-top:0">Spužva prema izmjerenom prostoru (mm po strani, negativno = manja)</h2>
      <div class="row">${num("f_kokpit", "kokpit", r.foam_offset_mm.kokpit)}${num("f_paluba", "paluba", r.foam_offset_mm.paluba)}${num("f_default", "unutrašnjost (salon, kabine)", r.foam_offset_mm.default)}</div></div>
    <div class="card"><h2 style="margin-top:0">Navlaka manja od spužve (%)</h2>
      <div class="row">${num("s_vinil", "vinil", r.cover_shrink_pct.vinil, 0.1)}${num("s_tkanina", "tkanina", r.cover_shrink_pct.tkanina, 0.1)}</div>
      <p class="muted small">Materijal po zoni: kokpit i paluba = vinil, ostalo = tkanina.</p></div>
    <div class="card"><h2 style="margin-top:0">Role i ispis</h2>
      <div class="row">${num("r_vinil", "širina role vinil (mm)", r.roll_width_mm.vinil)}${num("r_tkanina", "širina role tkanina (mm)", r.roll_width_mm.tkanina)}${num("gap", "razmak komada (mm)", r.gap_mm)}
        <div class="grow"><label>PDF 1:1 na</label><select id="page"><option ${r.page === "A4" ? "selected" : ""}>A4</option><option ${r.page === "A3" ? "selected" : ""}>A3</option></select></div></div></div>
    <div class="tools"><button class="primary" id="save">Spremi</button></div>`;
  $("#save").onclick = async () => {
    const v = id => +$("#" + id).value;
    await api("/rules", { method: "PUT", body: { seam_mm: v("seam"), notch_step_mm: v("nstep"), notch_len_mm: v("nlen"),
      foam_offset_mm: { kokpit: v("f_kokpit"), paluba: v("f_paluba"), default: v("f_default") },
      cover_shrink_pct: { vinil: v("s_vinil"), tkanina: v("s_tkanina") }, roll_width_mm: { vinil: v("r_vinil"), tkanina: v("r_tkanina") },
      gap_mm: v("gap"), page: $("#page").value } });
    toast("Pravila spremljena"); location.hash = "#/";
  };
}
