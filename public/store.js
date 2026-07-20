// ============================================================
// Shared demo data layer — persists in localStorage so the
// submit page ("the app") and the admin page stay in sync.
// v2: submissions carry a barcode image + certificate image,
// and are normally decided automatically by checker.js.
// ============================================================

const DB_KEY = "psaux_validator_db_v3";
const AUTO_POINTS = 50; // points awarded on auto-approval

function placeholderCert(name, hue) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
      <rect width="480" height="320" fill="hsl(${hue},40%,96%)" stroke="hsl(${hue},45%,45%)" stroke-width="6"/>
      <text x="240" y="70" text-anchor="middle" font-family="Georgia" font-size="26" fill="hsl(${hue},45%,30%)">TASK Certificate</text>
      <text x="240" y="150" text-anchor="middle" font-family="Georgia" font-size="30" font-weight="bold" fill="#222">${name}</text>
      <text x="240" y="200" text-anchor="middle" font-family="Georgia" font-size="16" fill="#555">The Assessment of Sustainability Knowledge</text>
      <circle cx="240" cy="255" r="28" fill="none" stroke="hsl(${hue},45%,45%)" stroke-width="3"/>
      <text x="240" y="262" text-anchor="middle" font-size="20"></text>
    </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function placeholderQR(seed) {
  let rects = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      if (seed & 1) rects += `<rect x="${8 + x * 8}" y="${8 + y * 8}" width="8" height="8"/>`;
    }
  }
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
      <rect width="80" height="80" fill="#fff" stroke="#ccc"/>
      <g fill="#2d3948">${rects}</g>
    </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function seedDB() {
  const now = Date.now();
  return {
    submissions: [
      {
        id: "sub-1001",
        user: "omar",
        barcodeImg: placeholderQR(7),
        certImg: null,
        note: "TASK certificate — March session",
        status: "pending",
        auto: false,
        similarity: null,
        qrHost: "task.sulitest.org",
        qrText: "https://task.sulitest.org/certificate.html?t=demo",
        points: 0,
        reason: "Flagged for manual double-check.",
        createdAt: now - 1000 * 60 * 60 * 5,
        reviewedAt: null,
      },
      {
        id: "sub-1002",
        user: "sarah",
        barcodeImg: placeholderQR(21),
        certImg: null,
        note: "Retook the assessment, new score",
        status: "approved",
        auto: true,
        similarity: null,
        qrHost: "task.sulitest.org",
        qrText: "https://task.sulitest.org/certificate.html?t=demo2",
        points: AUTO_POINTS,
        reason: "",
        createdAt: now - 1000 * 60 * 60 * 30,
        reviewedAt: now - 1000 * 60 * 60 * 30,
      },
      {
        id: "sub-1003",
        user: "lina",
        barcodeImg: placeholderQR(99),
        certImg: null,
        note: "",
        status: "rejected",
        auto: true,
        similarity: null,
        qrHost: "free-certificates.example.com",
        qrText: "https://free-certificates.example.com/fake",
        points: 0,
        reason: "The QR code does not link to the official Sulitest website (it points to free-certificates.example.com).",
        createdAt: now - 1000 * 60 * 60 * 50,
        reviewedAt: now - 1000 * 60 * 60 * 50,
      },
    ],
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted — reseed */ }
  const db = seedDB();
  saveDB(db);
  return db;
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ---- API used by both pages ----

function addSubmission({ user, barcodeImg, certImg, note, status = "pending", auto = false, similarity = null, qrHost = null, qrText = null, points = 0, reason = "" }) {
  const db = loadDB();
  const sub = {
    id: "sub-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    user: user.trim().toLowerCase(),
    barcodeImg,
    certImg,
    note: note || "",
    status,
    auto,
    similarity,
    qrHost,
    qrText,
    points: status === "approved" ? points : 0,
    reason,
    createdAt: Date.now(),
    reviewedAt: status === "pending" ? null : Date.now(),
  };
  db.submissions.unshift(sub);
  saveDB(db);
  return sub;
}

function reviewSubmission(id, { status, points = 0, reason = "" }) {
  const db = loadDB();
  const sub = db.submissions.find((s) => s.id === id);
  if (!sub) return null;
  sub.status = status;
  sub.auto = false; // manual override
  sub.points = status === "approved" ? points : 0;
  sub.reason = reason;
  sub.reviewedAt = Date.now();
  saveDB(db);
  return sub;
}

function getSubmissions(filter) {
  const db = loadDB();
  let list = db.submissions;
  if (filter?.user) list = list.filter((s) => s.user === filter.user.trim().toLowerCase());
  if (filter?.status) list = list.filter((s) => s.status === filter.status);
  return list;
}

function getUserPoints(user) {
  return getSubmissions({ user, status: "approved" }).reduce((sum, s) => sum + s.points, 0);
}

function resetDemoData() {
  saveDB(seedDB());
}

// Delete a single submission (a user's record) permanently.
function deleteSubmission(id) {
  const db = loadDB();
  db.submissions = db.submissions.filter((s) => s.id !== id);
  saveDB(db);
}

// Permanently delete every stored submission, points and saved username.
// Leaves an empty database so nothing is re-seeded.
function clearAllData() {
  saveDB({ submissions: [] });
  localStorage.removeItem("psaux_demo_user");
}

// ---- Shared helpers ----

function timeAgo(ts) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function pct(x) {
  return x == null ? "—" : Math.round(x * 100) + "%";
}

// Resize an uploaded image to a small JPEG data-URL so it fits in localStorage.
function fileToDataURL(file, maxW = 640) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Re-render live when the other tab changes the data.
function onDBChange(handler) {
  window.addEventListener("storage", (e) => {
    if (e.key === DB_KEY) handler();
  });
}
