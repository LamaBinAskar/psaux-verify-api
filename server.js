// ============================================================
// PSAUX Verify API — receives images from the mobile app,
// decodes the QR code on the server, analyses it per site,
// stores the submission, and returns the verdict.
//
//   POST /api/:site/ingest        (image + optional metadata)
//   GET  /api/:site/submissions    (review console reads this)
//   POST /api/:site/review/:id     (manual approve/reject)
//   GET  /images/:file             (the stored image)
//
// site = psaux | tatawwu | gym
// ============================================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Jimp } = require("jimp");
const jsQR = require("jsqr");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4000;
const SITES = ["psaux", "tatawwu", "gym"];
const DATA_DIR = path.join(__dirname, "data");
const IMG_DIR = path.join(DATA_DIR, "images");
fs.mkdirSync(IMG_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use("/images", express.static(IMG_DIR));

// Serve the review consoles (admin + tatawwu) from the repo's public/ folder,
// so they are LIVE on the deployed server (Render), reachable from any device —
// not just as localhost/file:// pages. The consoles read this same API.
//   /admin        → the PSAUx verify console (TASK / gym / certificates)
//   /tatawwu/     → the volunteering review console
const PUBLIC_DIR = path.join(__dirname, "public");
const HAS_SITE = fs.existsSync(path.join(PUBLIC_DIR, "admin.html"));
if (fs.existsSync(PUBLIC_DIR)) app.use(express.static(PUBLIC_DIR));
const upload = multer({ limits: { fileSize: 12 * 1024 * 1024 } });

// ---------- storage (one JSON file per site) ----------
const storeFile = (site) => path.join(DATA_DIR, `${site}.json`);
function loadStore(site) {
  try { return JSON.parse(fs.readFileSync(storeFile(site), "utf8")); } catch { return []; }
}
function saveStore(site, arr) {
  fs.writeFileSync(storeFile(site), JSON.stringify(arr, null, 2));
}

// ---------- QR decode on the server ----------
async function decodeQR(buffer) {
  const img = await Jimp.read(buffer);
  const { data, width, height } = img.bitmap; // RGBA
  const code = jsQR(new Uint8ClampedArray(data), width, height, {
    inversionAttempts: "attemptBoth",
  });
  return code && code.data ? code.data : null;
}

// ---------- per-site analysis ----------

// tatawwu register of valid certificates
const TATAWWU_REGISTRY = {
  "TPV-2026-BD21K": { name: "Noura Al-Shehri", org: "National Blood Donation Drive", title: "Blood donation drive", hours: 2, city: "Riyadh", type: "Blood donation" },
  "TPV-2026-HJ88M": { name: "Faisal Al-Otaibi", org: "Pilgrim Services Committee", title: "Guiding and serving pilgrims", hours: 8, city: "Makkah", type: "Hajj volunteering" },
  "TPV-2026-VN45T": { name: "Sara Al-Qahtani", org: "Community Volunteers Team", title: "Community service campaign", hours: 5, city: "Jeddah", type: "General volunteering" },
};
const TATAWWU_REVOKED = { "TPV-2026-0000X": "Revoked by the issuing organization." };

function hostOf(text) {
  try { return new URL(text.trim()).hostname.toLowerCase(); } catch { return null; }
}
function codeFromQR(text) {
  if (!text) return null;
  try { const c = new URL(text.trim()).searchParams.get("code"); if (c) return c.toUpperCase(); } catch {}
  const m = String(text).trim().toUpperCase().match(/TPV-\d{4}-[A-Z0-9]{5}/);
  return m ? m[0] : null;
}

function analyse(site, qrText, meta) {
  if (site === "psaux") {
    // barcode from a TASK results page — must link to the official Sulitest domain
    const host = hostOf(qrText);
    if (!qrText) return { status: "rejected", reason: "No readable QR code in the image." };
    if (host === "sulitest.org" || (host && host.endsWith(".sulitest.org"))) {
      return { status: "approved", qrHost: host };
    }
    return { status: "rejected", qrHost: host, reason: `QR links to ${host || "an unknown site"} — not the official Sulitest website.` };
  }

  if (site === "tatawwu") {
    // volunteering certificate — decode the code and match the register
    const code = codeFromQR(qrText);
    if (code && TATAWWU_REGISTRY[code]) {
      return { status: "approved", code, ...TATAWWU_REGISTRY[code] };
    }
    if (code && TATAWWU_REVOKED[code]) return { status: "rejected", code, reason: TATAWWU_REVOKED[code] };
    if (code) return { status: "rejected", code, reason: `Code ${code} is not in the register.` };
    return { status: "rejected", reason: "No readable certificate QR code in the image." };
  }

  if (site === "gym") {
    // member check-in QR — must be a psaux.app/checkin link with gym + token
    let u = null;
    try { u = new URL((qrText || "").trim()); } catch {}
    const host = u ? u.hostname.toLowerCase() : null;
    const okPath = u ? u.pathname.replace(/\/+$/, "") === "/checkin" : false;
    const gym = u ? u.searchParams.get("g") : null;
    const token = u ? u.searchParams.get("t") : null;
    if (host === "psaux.app" && okPath && gym && token) {
      return { status: "approved", qrHost: host, gym, token };
    }
    if (!qrText) return { status: "rejected", reason: "No readable check-in QR code in the image." };
    return { status: "rejected", qrHost: host, reason: `QR points to ${host || "an unknown host"} — not a valid check-in code.` };
  }

  return { status: "rejected", reason: "Unknown site." };
}

// ---------- routes ----------
function requireSite(req, res, next) {
  if (!SITES.includes(req.params.site)) return res.status(404).json({ error: "unknown site", sites: SITES });
  next();
}

// The app posts an image here. Accepts either:
//   multipart/form-data with field "image" (a file) + optional "from"/"member"
//   application/json  { "image": "<base64 or data URL>", "from": "..." }
app.post("/api/:site/ingest", requireSite, upload.single("image"), async (req, res) => {
  const site = req.params.site;
  let buffer = null;
  if (req.file) buffer = req.file.buffer;
  else if (req.body && req.body.image) {
    const b64 = String(req.body.image).replace(/^data:image\/\w+;base64,/, "");
    buffer = Buffer.from(b64, "base64");
  }
  if (!buffer || !buffer.length) {
    return res.status(400).json({ error: "no image provided", how: "send multipart field 'image' (file) or JSON { image: base64 }" });
  }

  let qrText = null;
  try { qrText = await decodeQR(buffer); } catch (e) { qrText = null; }

  const verdict = analyse(site, qrText, req.body || {});
  const id = "rcv_" + crypto.randomBytes(6).toString("hex");

  // store the image so the review console can show it
  let imageUrl = null;
  try {
    const file = `${site}_${id}.png`;
    fs.writeFileSync(path.join(IMG_DIR, file), buffer);
    imageUrl = `/images/${file}`;
  } catch (e) { /* ignore */ }

  const record = {
    id, site,
    from: (req.body && (req.body.from || req.body.member)) || "app user",
    receivedAt: Date.now(),
    qrText, imageUrl,
    auto: true,
    ...verdict,
  };

  const store = loadStore(site);
  store.unshift(record);
  saveStore(site, store.slice(0, 500));

  res.status(201).json(record);
});

// The review console reads the queue here.
app.get("/api/:site/submissions", requireSite, (req, res) => {
  const { status } = req.query;
  let list = loadStore(req.params.site);
  if (status) list = list.filter((r) => r.status === status);
  res.json({ site: req.params.site, count: list.length, submissions: list });
});

// Manual override from the review console.
app.post("/api/:site/review/:id", requireSite, (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "status must be approved|rejected" });
  const store = loadStore(req.params.site);
  const rec = store.find((r) => r.id === req.params.id);
  if (!rec) return res.status(404).json({ error: "not found" });
  rec.status = status;
  rec.auto = false;
  rec.reviewedAt = Date.now();
  saveStore(req.params.site, store);
  res.json(rec);
});

// Delete ONE submission (and its stored image) — used by the review console.
app.delete("/api/:site/submissions/:id", requireSite, (req, res) => {
  const store = loadStore(req.params.site);
  const rec = store.find((r) => r.id === req.params.id);
  if (!rec) return res.status(404).json({ error: "not found" });
  if (rec.imageUrl) { try { fs.unlinkSync(path.join(IMG_DIR, path.basename(rec.imageUrl))); } catch (e) { /* ignore */ } }
  saveStore(req.params.site, store.filter((r) => r.id !== req.params.id));
  res.json({ ok: true, id: req.params.id });
});

// Delete ALL submissions for a site (and their images) — "clear data".
app.delete("/api/:site/submissions", requireSite, (req, res) => {
  const store = loadStore(req.params.site);
  for (const rec of store) {
    if (rec.imageUrl) { try { fs.unlinkSync(path.join(IMG_DIR, path.basename(rec.imageUrl))); } catch (e) { /* ignore */ } }
  }
  saveStore(req.params.site, []);
  res.json({ ok: true, cleared: store.length });
});

// Live verification dashboard — shows every app submission with the user's name.
app.get("/admin", (req, res) => res.sendFile(
  path.join(HAS_SITE ? PUBLIC_DIR : __dirname, "admin.html")));

// Big-screen live leaderboard for the recycling station (reads Firestore).
app.get("/leaderboard", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "leaderboard.html")));

// Simple docs at the root.
app.get("/", (req, res) => {
  res.json({
    name: "PSAUX Verify API",
    sites: SITES,
    endpoints: {
      "POST /api/:site/ingest": "app uploads an image (multipart 'image' file, or JSON { image: base64, from })",
      "GET /api/:site/submissions": "list received submissions (optional ?status=approved|rejected)",
      "POST /api/:site/review/:id": "manual override { status: approved|rejected }",
      "GET /images/:file": "the stored image",
    },
  });
});

app.listen(PORT, () => console.log(`PSAUX Verify API listening on http://localhost:${PORT}`));
