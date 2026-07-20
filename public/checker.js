// ============================================================
// Automatic certificate checker (DEMO) — v3, barcode-only
// Rule: APPROVE if the uploaded barcode contains a QR code
// that links to the official Sulitest domain
// (sulitest.org / task.sulitest.org). Anything else -> REJECT.
// Requires: jsQR.js loaded first.
// ============================================================

// Official hosts: sulitest.org and any subdomain (task.sulitest.org, ...)
function isOfficialLink(text) {
  try {
    const host = new URL(text.trim()).hostname.toLowerCase();
    return host === "sulitest.org" || host.endsWith(".sulitest.org");
  } catch (e) {
    return false; // not a URL at all
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawToCanvas(img, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// ---- QR decoding (tries a few sizes for robustness) ----
async function decodeQR(dataURL) {
  const img = await loadImage(dataURL);
  const widths = [...new Set([img.width, 900, 1400, 600])].filter((w) => w > 100);
  for (const w of widths) {
    const scale = w / img.width;
    const data = drawToCanvas(img, Math.round(img.width * scale), Math.round(img.height * scale));
    const code = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
    if (code && code.data) return { ok: true, text: code.data };
  }
  return { ok: false, text: null };
}

/**
 * Auto-validate a submission from the barcode alone.
 * @returns {verdict, qrOk, qrText, qrHost, failReason}
 */
async function autoCheck(barcodeDataURL) {
  const qr = await decodeQR(barcodeDataURL);

  const qrOk = qr.ok && isOfficialLink(qr.text);
  let qrHost = null;
  if (qr.ok) {
    try { qrHost = new URL(qr.text.trim()).hostname.toLowerCase(); } catch (e) { /* not a URL */ }
  }

  let failReason = "";
  if (!qr.ok) failReason = "No readable QR code was found in the barcode image.";
  else if (!qrOk) failReason = `The QR code does not link to the official Sulitest website${qrHost ? ` (it points to ${qrHost})` : ""}.`;

  return {
    verdict: qrOk ? "approved" : "rejected",
    qrOk,
    qrText: qr.text,
    qrHost,
    failReason,
  };
}
