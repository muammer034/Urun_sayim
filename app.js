// ⚠️ BURAYI KENDİ APPS SCRIPT WEB APP LİNKİNLE DEĞİŞTİR:
// (Apps Script > Dağıt > Yeni dağıtım > Web uygulaması sonrası verilen /exec URL'i)
const API_URL = 'https://script.google.com/macros/s/AKfycbw201ZDOmT_xRrTH853IrP93q7yFPxtK3tsdJyOkFaGjcG5VVGNyGarOvcMml2kccsZbw/exec';

let currentProduct = null;
let currentAdet = null;
let currentAdres = null;
let manualTarget = null;
let productScanner = null;
let addressScanner = null;

// Taranacak barkod tipleri: raf adresleri Code128 (ör. I17-A34-K03-S01),
// ürün barkodları genelde EAN/UPC, artı QR/Code39 desteği de eklendi.
const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE
];
const SCANNER_CONFIG = { formatsToSupport: SCAN_FORMATS, verbose: false };

// --- Servis Worker kaydı ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

// --- Online/offline durumu ---
function updateOnlineStatus() {
  document.getElementById('offline-banner').style.display = navigator.onLine ? 'none' : 'block';
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

function show(id) {
  ['step-scan-product', 'step-product-found', 'step-scan-address', 'step-confirm', 'step-manual', 'step-done']
    .forEach((s) => { document.getElementById(s).style.display = (s === id) ? 'block' : 'none'; });
}

function setStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = type || '';
}

// --- Ürün tarayıcı ---
function startProductScanner() {
  show('step-scan-product');
  setStatus('Kamera açılıyor...');
  if (productScanner) return;
  productScanner = new Html5Qrcode('reader-product', SCANNER_CONFIG);
  Html5Qrcode.getCameras().then(() => {
    productScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      (decodedText) => { productScanner.pause(); handleProductCode(decodedText); }
    ).then(() => setStatus('Barkodu kameraya gösterin'))
     .catch((e) => setStatus('Kamera başlatılamadı: ' + e, 'error'));
  }).catch(() => setStatus('Kamera bulunamadı / izin verilmedi.', 'error'));
}

function stopProductScanner() {
  if (productScanner) {
    productScanner.stop().then(() => { productScanner.clear(); productScanner = null; })
      .catch(() => { productScanner = null; });
  }
}

async function handleProductCode(code) {
  setStatus('Aranıyor: ' + code);
  try {
    const res = await fetch(`${API_URL}?action=lookup&code=${encodeURIComponent(code)}`);
    const result = await res.json();
    if (result.found) {
      currentProduct = result;
      document.getElementById('f-ad').textContent = result.ad;
      document.getElementById('f-malzeme').textContent = result.malzemeKodu;
      document.getElementById('f-uretici').textContent = result.ureticiKodu;
      document.getElementById('f-barkod').textContent = result.barkod;
      document.getElementById('f-stok').textContent = result.stok;
      stopProductScanner();
      show('step-product-found');
      document.getElementById('adetInput').value = '';
      document.getElementById('adetInput').focus();
    } else {
      setStatus('❌ Kod listede bulunamadı: ' + code + ' — tekrar okutun', 'error');
      setTimeout(() => { if (productScanner) productScanner.resume(); }, 1500);
    }
  } catch (err) {
    setStatus('Bağlantı hatası: ' + err.message, 'error');
    setTimeout(() => { if (productScanner) productScanner.resume(); }, 1500);
  }
}

function goToAddressStep() {
  const adet = document.getElementById('adetInput').value;
  if (!adet || isNaN(adet)) { alert('Lütfen geçerli bir adet girin.'); return; }
  currentAdet = adet;
  show('step-scan-address');
  startAddressScanner();
}

// --- Adres tarayıcı ---
function startAddressScanner() {
  const statusEl = document.getElementById('status-address');
  statusEl.textContent = 'Kamera açılıyor...';
  if (addressScanner) return;
  addressScanner = new Html5Qrcode('reader-address', SCANNER_CONFIG);
  Html5Qrcode.getCameras().then(() => {
    addressScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      (decodedText) => {
        addressScanner.stop().then(() => { addressScanner.clear(); addressScanner = null; });
        currentAdres = decodedText;
        goToConfirm();
      }
    ).then(() => statusEl.textContent = 'Adres barkodunu gösterin')
     .catch((e) => statusEl.textContent = 'Kamera başlatılamadı: ' + e);
  });
}

function stopAddressScanner() {
  if (addressScanner) {
    addressScanner.stop().then(() => { addressScanner.clear(); addressScanner = null; })
      .catch(() => { addressScanner = null; });
  }
}

function goToConfirm() {
  document.getElementById('c-ad').textContent = currentProduct.ad;
  document.getElementById('c-adet').textContent = currentAdet;
  document.getElementById('c-adres').textContent = currentAdres;

  const warningEl = document.getElementById('address-warning');
  if (addressMismatch()) {
    const ref = (currentProduct.referansAdres || '').toString().trim();
    warningEl.textContent =
      `⚠️ Bu ürünün referans adresi "${ref}" ama okutulan adres "${currentAdres}". Farklı bir adreste sayım yapıyorsunuz.`;
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }
  show('step-confirm');
}

function addressMismatch() {
  const ref = (currentProduct.referansAdres || '').toString().trim().toUpperCase();
  const scanned = (currentAdres || '').toString().trim().toUpperCase();
  return ref !== '' && ref !== scanned;
}

// --- Kaydet (Apps Script'e POST, text/plain -> preflight yok) ---
async function confirmSave() {
  if (addressMismatch()) {
    const ref = (currentProduct.referansAdres || '').toString().trim();
    const ok = window.confirm(
      `Referans adres "${ref}" ile okuttuğunuz adres "${currentAdres}" uyuşmuyor.\n\nYine de bu adresle kaydetmek istediğinize emin misiniz?`
    );
    if (!ok) return; // vazgeçti, kaydetme
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save',
        malzemeKodu: currentProduct.malzemeKodu,
        ureticiKodu: currentProduct.ureticiKodu,
        barkod: currentProduct.barkod,
        ad: currentProduct.ad,
        adet: currentAdet,
        adres: currentAdres
      })
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById('status-done').textContent =
        `✅ Kaydedildi: ${currentProduct.ad} — ${currentAdet} adet — ${currentAdres}`;
      show('step-done');
    } else {
      alert('Kaydedilemedi: ' + (result.error || 'bilinmeyen hata'));
    }
  } catch (err) {
    alert('Bağlantı hatası, kaydedilemedi: ' + err.message);
  }
}

// --- Manuel giriş ---
function showManualEntry(target) {
  manualTarget = target;
  document.getElementById('manual-label').textContent =
    target === 'product' ? 'Malzeme / Üretici Kodu ya da Barkod girin' : 'Adresi girin';
  document.getElementById('manualInput').value = '';
  show('step-manual');
}

function submitManual() {
  const val = document.getElementById('manualInput').value.trim();
  if (!val) return;
  if (manualTarget === 'product') {
    handleProductCode(val);
  } else {
    currentAdres = val;
    stopAddressScanner();
    goToConfirm();
  }
}

function cancelManual() {
  if (manualTarget === 'product') show('step-scan-product');
  else show('step-scan-address');
}

function resetAll() {
  currentProduct = null; currentAdet = null; currentAdres = null;
  stopAddressScanner();
  document.getElementById('reader-product').innerHTML = '';
  productScanner = null;
  startProductScanner();
}

window.addEventListener('DOMContentLoaded', startProductScanner);
