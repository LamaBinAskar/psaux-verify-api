// ============================================================
// Tatawwu — certificate review console (demo)
// Images arrive from the mobile app (no manual upload). Each is
// analysed automatically (decode QR -> match register), and shown
// here for the admin to monitor and review.
//   ingest() below is exactly what a Cloud Function would run.
// ============================================================

// ---- Register of valid certificates (Cloud Firestore in phase 2) ----
const REGISTRY = {
  "TPV-2026-BD21K": { name: "Noura Al-Shehri", org: "National Blood Donation Drive", title: "Blood donation drive", hours: 2, city: "Riyadh", type: "Blood donation", color: "#c0392b" },
  "TPV-2026-HJ88M": { name: "Faisal Al-Otaibi", org: "Pilgrim Services Committee", title: "Guiding and serving pilgrims", hours: 8, city: "Makkah", type: "Hajj volunteering", color: "#0a7a42" },
  "TPV-2026-VN45T": { name: "Sara Al-Qahtani", org: "Community Volunteers Team", title: "Community service campaign", hours: 5, city: "Jeddah", type: "General volunteering", color: "#0a7a42" },
};
const REVOKED = { "TPV-2026-0000X": "Revoked by the issuing organization." };

const el = (id) => document.getElementById(id);
const INBOX_KEY = "tatawwu_inbox_v1";
let inbox = load();
let filter = "all";

// ---- live bridge to the PSAUX Verify API (images the app actually sent) ----
const API_BASE = (localStorage.getItem("verify_api_base") || "https://psaux-verify-api.onrender.com").replace(/\/+$/, "");
let apiRecords = [];
let apiOnline = false;

// One API record (server.js shape) -> a console record.
function mapApiTatawwu(r) {
  const reg = REGISTRY[r.code] || {};
  const title = r.title || reg.title || "";
  const org = r.org || reg.org || "";
  const city = r.city || reg.city || "";
  return {
    id: r.id,
    from: r.from || "App user",
    image: r.imageUrl ? API_BASE + r.imageUrl : "",
    receivedAt: r.receivedAt || Date.now(),
    auto: r.auto !== false,
    status: r.status === "approved" ? "approved" : "rejected",
    qrText: r.qrText || null,
    code: r.code || null,
    name: r.name || reg.name || "",
    type: r.type || reg.type || "",
    color: reg.color || "#0a7a42",
    detail: title ? [title, org, city].filter(Boolean).join(" · ") : "",
    reason: r.reason || "",
    _api: true,
  };
}

async function pollApi() {
  try {
    const res = await fetch(`${API_BASE}/api/tatawwu/submissions`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    apiRecords = (data.submissions || []).map(mapApiTatawwu);
    apiOnline = true;
  } catch {
    apiOnline = false;
  }
  render();
}

// Merge API + local demo records, API first, de-duped by id.
function allRecords() {
  const seen = new Set(), out = [];
  for (const r of [...apiRecords, ...inbox]) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); }
  return out;
}

function load() { try { return JSON.parse(localStorage.getItem(INBOX_KEY)) || []; } catch { return []; } }
function save() { localStorage.setItem(INBOX_KEY, JSON.stringify(inbox)); }

// ---- image analysis (identical to what the Cloud Function will run) ----
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function decodeQR(dataURL) {
  const img = await loadImage(dataURL);
  const widths = [...new Set([img.width, 1000, 700])].filter((w) => w > 80);
  for (const w of widths) {
    const s = w / img.width, c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const q = jsQR(d.data, d.width, d.height, { inversionAttempts: "attemptBoth" });
    if (q && q.data) return q.data;
  }
  return null;
}
function codeFromQR(text) {
  if (!text) return null;
  try { const c = new URL(text.trim()).searchParams.get("code"); if (c) return c.toUpperCase(); } catch {}
  const m = text.trim().toUpperCase().match(/TPV-\d{4}-[A-Z0-9]{5}/);
  return m ? m[0] : null;
}

// ---- the ingest point: a certificate image arrives and is judged ----
async function ingest({ from, image }) {
  const rec = { id: "rcv-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    from: from || "App user", image, receivedAt: Date.now(), auto: true, status: "pending" };
  const text = await decodeQR(image).catch(() => null);
  const code = codeFromQR(text);
  const match = code ? REGISTRY[code] : null;
  rec.qrText = text; rec.code = code || null;
  if (match) {
    rec.status = "approved"; rec.name = match.name; rec.type = match.type;
    rec.color = match.color; rec.detail = `${match.title} · ${match.org} · ${match.city}`;
  } else if (code && REVOKED[code]) {
    rec.status = "rejected"; rec.reason = REVOKED[code];
  } else if (code) {
    rec.status = "rejected"; rec.reason = `Code ${code} is not in the register.`;
  } else {
    rec.status = "rejected"; rec.reason = "No readable certificate QR code in the image.";
  }
  inbox.unshift(rec); inbox = inbox.slice(0, 60); save(); render();
}

function overrideStatus(id, status) {
  const apiRec = apiRecords.find((x) => x.id === id);
  if (apiRec) {
    fetch(`${API_BASE}/api/tatawwu/review/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).finally(pollApi);
    return;
  }
  const r = inbox.find((x) => x.id === id);
  if (!r) return;
  r.status = status; r.auto = false; r.reviewedAt = Date.now();
  r.reason = status === "rejected" ? "Rejected by reviewer." : "";
  save(); render();
}

function deleteRecord(id) {
  const apiRec = apiRecords.find((x) => x.id === id);
  const who = (apiRec || inbox.find((x) => x.id === id) || {}).from;
  if (!confirm(`Delete this record${who ? " from " + who : ""}? This cannot be undone.`)) return;
  if (apiRec) {
    apiRecords = apiRecords.filter((x) => x.id !== id);
    fetch(`${API_BASE}/api/tatawwu/submissions/${id}`, { method: "DELETE" }).finally(pollApi);
    render();
    return;
  }
  inbox = inbox.filter((x) => x.id !== id);
  save(); render();
}

// ---- render the review console ----
const STATUS = {
  approved: { label: "Verified", cls: "st-ok", ic: "<path d='M20 6L9 17l-5-5'/>" },
  rejected: { label: "Rejected", cls: "st-bad", ic: "<path d='M18 6L6 18M6 6l12 12'/>" },
  pending: { label: "Needs review", cls: "st-pending", ic: "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>" },
};
const svg = (inner) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const timeAgo = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

function render() {
  const list = allRecords();
  const n = { total: list.length, approved: 0, rejected: 0, pending: 0 };
  list.forEach((r) => { n[r.status] = (n[r.status] || 0) + 1; });
  el("stTotal").textContent = n.total;
  el("stOk").textContent = n.approved;
  el("stBad").textContent = n.rejected;
  el("stPending").textContent = n.pending;

  const filters = [["all", "All", n.total], ["approved", "Verified", n.approved], ["rejected", "Rejected", n.rejected], ["pending", "Needs review", n.pending]];
  el("chips").innerHTML = filters.map(([k, lbl, c]) =>
    `<button class="chip ${k === filter ? "active" : ""}" data-f="${k}">${lbl} <span class="chip-c">${c}</span></button>`).join("");
  el("chips").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; render(); }));

  const rows = list.filter((r) => filter === "all" || r.status === filter);
  if (!rows.length) {
    el("inbox").innerHTML = `<div class="empty">No certificates ${filter === "all" ? "received yet" : "in this view"}. They appear here automatically as the app sends them.</div>`;
    return;
  }
  el("inbox").innerHTML = rows.map((r) => {
    const st = STATUS[r.status];
    return `<div class="rcv">
      <img class="rcv-img" src="${r.image}" alt="received image" title="Open full image" onclick="window.open(this.src)" />
      <div class="rcv-main">
        <div class="rcv-top">
          <span class="rcv-from">${r.from}</span>
          <span class="rcv-time">${timeAgo(r.receivedAt)}</span>
        </div>
        <div class="rcv-detail">
          ${r.code ? `<span class="mono">${r.code}</span>` : `<span class="muted">no code read</span>`}
          ${r.type ? ` · <span class="type"><span class="dot" style="background:${r.color}"></span>${r.type}</span>` : ""}
          ${r.name ? ` · ${r.name}` : ""}
        </div>
        ${r.detail ? `<div class="rcv-sub">${r.detail}</div>` : ""}
        ${r.status === "rejected" && r.reason ? `<div class="rcv-reason">${r.reason}</div>` : ""}
      </div>
      <div class="rcv-side">
        <span class="badge ${st.cls}">${svg(st.ic)} ${st.label}${r.auto ? "" : " · manual"}</span>
        <div class="rcv-actions">
          ${r.status !== "approved" ? `<button class="mini ok" data-ok="${r.id}">Approve</button>` : ""}
          ${r.status !== "rejected" ? `<button class="mini bad" data-bad="${r.id}">Reject</button>` : ""}
          <button class="mini del" data-del="${r.id}" title="Delete this record">Delete</button>
        </div>
      </div>
    </div>`;
  }).join("");
  el("inbox").querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", () => overrideStatus(b.dataset.ok, "approved")));
  el("inbox").querySelectorAll("[data-bad]").forEach((b) => b.addEventListener("click", () => overrideStatus(b.dataset.bad, "rejected")));
  el("inbox").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteRecord(b.dataset.del)));
}

// ---- demo control: stands in for the app pushing a certificate ----
let simIdx = 0;
el("simBtn").addEventListener("click", async () => {
  const s = APP_SAMPLES[simIdx % APP_SAMPLES.length];
  simIdx++;
  // Send the sample certificate to the verify API — the exact path the app uses.
  try {
    const res = await fetch(`${API_BASE}/api/tatawwu/ingest`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: s.image, from: s.from }),
    });
    if (!res.ok) throw new Error(res.status);
    await pollApi();
  } catch (_) {
    ingest({ from: s.from, image: s.image }); // offline fallback (local)
  }
});
el("clearBtn").addEventListener("click", () => {
  if (!confirm("Clear all received certificates (local demo + from the app)?")) return;
  inbox = []; save();
  apiRecords = [];
  fetch(`${API_BASE}/api/tatawwu/submissions`, { method: "DELETE" }).finally(pollApi);
  render();
});

// Seed a few received items on first load so there is something to review.
(async () => {
  if (inbox.length === 0) {
    for (const s of APP_SAMPLES.slice(0, 3)) await ingest({ from: s.from, image: s.image });
  } else {
    render();
  }
  // Start reading real app uploads from the verify API.
  pollApi();
  setInterval(pollApi, 4000);
})();
