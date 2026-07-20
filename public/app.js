// ============================================================
// PSAUX London — TASK Certificate Validator (DEMO)
// All verification logic below is simulated for prototyping.
// ============================================================

// ---- Mock certificate registry ----
const REGISTRY = {
  "TASK-2026-0417": { name: "Sarah Al-Amri",  score: 78, level: "Advanced",     issued: "2026-03-12", institution: "PSAUX London" },
  "TASK-2025-1188": { name: "Omar Hassan",    score: 64, level: "Intermediate", issued: "2025-11-02", institution: "Green Futures Institute" },
  "TASK-2024-9031": { name: "Lina Petrova",   score: 91, level: "Expert",       issued: "2024-06-27", institution: "PSAUX London" },
};

// IDs that exist but were revoked — flagged as suspicious
const REVOKED = {
  "TASK-2025-0666": { name: "N. Unknown", reason: "Certificate revoked by issuer (integrity violation)" },
};

const ANALYSIS_STEPS = [
  "Reading image metadata (EXIF)…",
  "Detecting document layout and official seal…",
  "Checking typography against TASK template…",
  "Scanning for pixel-level tampering…",
  "Cross-checking ID with issuing registry…",
];

// ---- Elements ----
const dropzone   = document.getElementById("dropzone");
const fileInput  = document.getElementById("fileInput");
const browseBtn  = document.getElementById("browseBtn");
const dzIdle     = document.getElementById("dzIdle");
const dzPreview  = document.getElementById("dzPreview");
const previewImg = document.getElementById("previewImg");
const removeBtn  = document.getElementById("removeBtn");
const certIdInput = document.getElementById("certId");
const verifyBtn  = document.getElementById("verifyBtn");
const analysisEl = document.getElementById("analysis");
const checksList = document.getElementById("checksList");
const progressBar = document.getElementById("progressBar");
const resultEl   = document.getElementById("result");

let uploadedFile = null;
let fileFingerprint = 0;

// ---- Upload handling ----
browseBtn.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => {
  if (e.target === dropzone || dzIdle.contains(e.target)) {
    if (e.target !== browseBtn) fileInput.click();
  }
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Please upload an image file (PNG, JPG or WEBP).");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert("File is larger than 10 MB.");
    return;
  }
  uploadedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    dzIdle.classList.add("hidden");
    dzPreview.classList.remove("hidden");
    updateVerifyState();
  };
  reader.readAsDataURL(file);

  // Deterministic "fingerprint" from the file bytes, so the same
  // image always gets the same simulated verdict.
  file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let h = 0;
    const step = Math.max(1, Math.floor(bytes.length / 5000));
    for (let i = 0; i < bytes.length; i += step) h = (h * 31 + bytes[i]) >>> 0;
    fileFingerprint = h;
  });
}

removeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  uploadedFile = null;
  fileInput.value = "";
  previewImg.src = "";
  dzPreview.classList.add("hidden");
  dzIdle.classList.remove("hidden");
  updateVerifyState();
});

certIdInput.addEventListener("input", updateVerifyState);

function updateVerifyState() {
  verifyBtn.disabled = !(uploadedFile || certIdInput.value.trim());
}

// Demo ID chips fill the input when clicked
document.querySelectorAll(".form-hint code").forEach((code) => {
  code.addEventListener("click", () => {
    certIdInput.value = code.textContent;
    updateVerifyState();
  });
});

// ---- Verification flow ----
verifyBtn.addEventListener("click", runVerification);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runVerification() {
  verifyBtn.disabled = true;
  resultEl.classList.add("hidden");
  checksList.innerHTML = "";
  progressBar.style.width = "0%";
  analysisEl.classList.remove("hidden");
  analysisEl.scrollIntoView({ behavior: "smooth", block: "center" });

  for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="spin"></span> ${ANALYSIS_STEPS[i]}`;
    checksList.appendChild(li);
    await sleep(550 + (fileFingerprint % 300));
    li.innerHTML = `<span class="tick"><svg class='ic' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6L9 17l-5-5'/></svg></span> ${ANALYSIS_STEPS[i]}`;
    progressBar.style.width = `${((i + 1) / ANALYSIS_STEPS.length) * 100}%`;
  }

  await sleep(400);
  analysisEl.classList.add("hidden");
  showResult(computeVerdict());
  verifyBtn.disabled = false;
}

function computeVerdict() {
  const id = certIdInput.value.trim().toUpperCase();

  if (id && REGISTRY[id]) {
    return { kind: "ok", id, record: REGISTRY[id], confidence: 93 + (fileFingerprint % 6) };
  }
  if (id && REVOKED[id]) {
    return { kind: "warn", id, reason: REVOKED[id].reason, confidence: 55 + (fileFingerprint % 10) };
  }
  if (id) {
    return { kind: "bad", id, reason: "This ID does not exist in the TASK issuing registry.", confidence: 8 + (fileFingerprint % 10) };
  }

  // Image only — simulated verdict from the file fingerprint
  const bucket = fileFingerprint % 3;
  if (bucket === 0) {
    const ids = Object.keys(REGISTRY);
    const matchedId = ids[fileFingerprint % ids.length];
    return { kind: "ok", id: matchedId, record: REGISTRY[matchedId], confidence: 88 + (fileFingerprint % 9), matchedByImage: true };
  }
  if (bucket === 1) {
    return { kind: "warn", id: null, reason: "The seal and layout match, but pixel analysis suggests possible editing around the name and score.", confidence: 47 + (fileFingerprint % 15) };
  }
  return { kind: "bad", id: null, reason: "The document layout does not match any official TASK certificate template.", confidence: 5 + (fileFingerprint % 12) };
}

function showResult(v) {
  const configs = {
    ok:   { icon: "<svg class='ic' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='M8.4 12.4l2.4 2.4 4.8-5.2'/></svg>", title: "Authentic certificate",  sub: "This certificate matches an official record in the TASK registry." },
    warn: { icon: "<svg class='ic' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.3 4.4 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4.4a1.6 1.6 0 0 0-2.6 0z'/><path d='M12 9.5v4M12 17h.01'/></svg>", title: "Suspicious certificate", sub: "The certificate could not be fully validated. Manual review recommended." },
    bad:  { icon: "<svg class='ic' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='M9 9l6 6M15 9l-6 6'/></svg>", title: "Not authentic",           sub: "This does not appear to be a genuine TASK certificate." },
  };
  const c = configs[v.kind];
  const barColor = v.kind === "ok" ? "var(--green-500)" : v.kind === "warn" ? "var(--amber)" : "var(--red)";

  let details = "";
  if (v.record) {
    details = `
      <div class="result-details">
        <div class="detail"><span class="k">Certificate ID</span><span class="v">${v.id}</span></div>
        <div class="detail"><span class="k">Holder</span><span class="v">${v.record.name}</span></div>
        <div class="detail"><span class="k">Score</span><span class="v">${v.record.score} / 100</span></div>
        <div class="detail"><span class="k">Level</span><span class="v">${v.record.level}</span></div>
        <div class="detail"><span class="k">Issued</span><span class="v">${v.record.issued}</span></div>
        <div class="detail"><span class="k">Institution</span><span class="v">${v.record.institution}</span></div>
      </div>
      ${v.matchedByImage ? '<p class="result-sub" style="margin-top:12px;">Matched by image fingerprint — no ID was provided.</p>' : ""}
    `;
  } else if (v.reason) {
    details = `
      <div class="result-details">
        ${v.id ? `<div class="detail"><span class="k">Certificate ID</span><span class="v">${v.id}</span></div>` : ""}
        <div class="detail"><span class="k">Finding</span><span class="v">${v.reason}</span></div>
      </div>
    `;
  }

  resultEl.className = `result ${v.kind}`;
  resultEl.innerHTML = `
    <div class="result-head">
      <span class="result-icon">${c.icon}</span>
      <div>
        <div class="result-title">${c.title}</div>
        <div class="result-sub">${c.sub}</div>
      </div>
    </div>
    ${details}
    <div class="result-score">
      <div class="score-track"><div class="score-fill" style="width:${v.confidence}%; background:${barColor};"></div></div>
      <p class="score-label">Authenticity confidence: ${v.confidence}%</p>
    </div>
    <div class="result-actions">
      <button class="btn btn-outline" onclick="resetTool()">Verify another certificate</button>
    </div>
  `;
  resultEl.classList.remove("hidden");
  resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetTool() {
  resultEl.classList.add("hidden");
  uploadedFile = null;
  fileInput.value = "";
  previewImg.src = "";
  certIdInput.value = "";
  dzPreview.classList.add("hidden");
  dzIdle.classList.remove("hidden");
  updateVerifyState();
  document.getElementById("verify").scrollIntoView({ behavior: "smooth" });
}

// ---- Animated stats counters ----
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    statsObserver.unobserve(entry.target);
    const el = entry.target;
    const target = parseInt(el.dataset.count, 10);
    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}, { threshold: 0.4 });

document.querySelectorAll(".stat-num").forEach((el) => statsObserver.observe(el));
