// Third Eye Computer Solutions - POS System
// Shared camera-based barcode/QR scanning modal. Originally built only
// for the main POS screen; extracted here so Quick Cart (and anything
// else that needs to scan a product) can reuse the exact same, already
// battle-tested camera + ZXing logic instead of a second copy of it.
//
// Usage:
//   BarcodeScanner.open({
//     onDetect: (code) => { ... do something with the scanned text ... }
//   });
//
// - Chrome/Edge/Android: uses the browser's native BarcodeDetector API -
//   no external library needed, fastest path.
// - Safari/iPhone/iPad (and any other browser without BarcodeDetector):
//   falls back to the vendored ZXing library, which decodes barcodes
//   from the live camera feed entirely in JS. This is what makes
//   scanning work on iPhones.
// Either way requires HTTPS (or localhost) for camera access - iOS Safari
// will refuse getUserMedia on a plain http:// site.

const BarcodeScanner = {
  async open({ onDetect }) {
    const hasNativeDetector = 'BarcodeDetector' in window;
    const hasZXing = typeof ZXing !== 'undefined';

    if (!hasNativeDetector && !hasZXing) {
      Modal.open('Camera Scan Not Supported', `
        <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5">
          This browser doesn't support camera-based barcode scanning. You can
          still use a USB/Bluetooth barcode scanner, or type the barcode
          directly into the search box.
        </p>
      `);
      return;
    }

    if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      Modal.open('Camera Needs a Secure Connection', `
        <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5">
          Camera scanning (especially on iPhone) only works over HTTPS. Please
          access this site using an <strong>https://</strong> address, or use
          a USB/Bluetooth barcode scanner instead.
        </p>
      `);
      return;
    }

    Modal.open('Scan Barcode', `
      <div class="camera-scan-wrap">
        <video id="camera-scan-video" autoplay playsinline muted></video>
        <div class="camera-scan-frame"></div>
      </div>
      <p style="color:var(--text-secondary);font-size:0.82rem;text-align:center;margin-top:10px">
        Point the camera at a barcode or QR code. It will be picked up automatically.
      </p>
      <div id="camera-scan-error" style="color:var(--danger-600,#c0392b);font-size:0.82rem;text-align:center;margin-top:6px"></div>
      ${!hasNativeDetector && hasZXing ? `<p style="color:var(--text-muted);font-size:0.72rem;text-align:center;margin-top:4px">Using compatibility scan mode for this browser.</p>` : ''}
    `);

    const video = document.getElementById('camera-scan-video');
    const errorBox = document.getElementById('camera-scan-error');
    let stream = null;
    let stopped = false;
    let zxingReader = null;

    const onResult = (value) => {
      if (stopped) return;
      stop();
      Modal.close();
      onDetect(value);
    };

    const stop = () => {
      stopped = true;
      if (zxingReader) { try { zxingReader.reset(); } catch (e) {} }
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // Stop the camera whenever the modal is closed (X button, backdrop click,
    // or a successful scan closing it programmatically above).
    const overlay = document.getElementById('active-modal-overlay');
    if (overlay) {
      const observer = new MutationObserver(() => {
        if (!document.body.contains(overlay)) { stop(); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true });
    }

    // Prefer the native API when present (faster, no library overhead).
    if (hasNativeDetector) {
      let detector;
      try {
        detector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
        });
      } catch (e) {
        detector = new BarcodeDetector();
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
      } catch (e) {
        errorBox.textContent = this.cameraErrorMessage(e);
        return;
      }

      const scanLoop = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) { onResult(codes[0].rawValue); return; }
        } catch (e) { /* keep trying */ }
        if (!stopped) requestAnimationFrame(scanLoop);
      };
      video.addEventListener('loadedmetadata', () => scanLoop());
      return;
    }

    // Fallback for iPhone/Safari and any other browser without
    // BarcodeDetector: ZXing decodes frames from the video element itself.
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.QR_CODE
    ]);
    zxingReader = new ZXing.BrowserMultiFormatReader(hints);

    const onDecodeResult = (result, err) => {
      if (stopped) return;
      if (result) onResult(result.getText());
      // NotFoundException fires continuously while no code is in view -
      // that's expected and not an error to surface to the user.
    };

    try {
      await zxingReader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        onDecodeResult
      );
      return;
    } catch (firstErr) {
      // Some devices/browsers reject facingMode outright (rare, but seen on
      // a handful of older iPads/iPhones) - retry once by explicitly listing
      // devices and picking one, before giving up and showing an error.
      try {
        const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
        const backCam = devices.find(d => /back|rear|environment/i.test(d.label));
        const deviceId = backCam ? backCam.deviceId : (devices[0] && devices[0].deviceId);
        if (!deviceId) throw firstErr;
        await zxingReader.decodeFromConstraints(
          { video: { deviceId: { exact: deviceId } } },
          video,
          onDecodeResult
        );
      } catch (secondErr) {
        console.warn('Camera scan failed:', firstErr, secondErr);
        errorBox.textContent = this.cameraErrorMessage(secondErr.name ? secondErr : firstErr);
      }
    }
  },

  // Turns a getUserMedia/camera error into an actionable message instead of
  // one generic string - the fix is different depending on what actually
  // went wrong (permission blocked vs. no camera vs. camera busy vs. the
  // page isn't loaded over HTTPS).
  cameraErrorMessage(e) {
    const name = (e && e.name) || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera permission was blocked for this site. On iPhone: Settings > Safari > Camera (or tap the "aA" icon in the address bar > Website Settings) and allow it, then reload. On a laptop: click the camera/lock icon in the address bar and allow camera access, then reload.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'No camera was found on this device. Use a USB/Bluetooth barcode scanner, or type the barcode into the search box instead.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The camera is already in use by another app or browser tab. Close it there, then try scanning again.';
    }
    if (name === 'SecurityError' || (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname))) {
      return 'Camera access needs a secure (https://) connection. If you\'re opening this on a local network address (like an IP starting with 192.168.), switch to the https:// web address instead.';
    }
    const detail = (e && e.message) ? ` (${e.message})` : '';
    return `Could not access the camera${detail}. On iPhone: fully close Safari (swipe it away in the app switcher, not just the tab), reopen this page, and allow the camera prompt when it appears. If you already allowed it once and it's still failing, try Settings > Safari > Advanced > Website Data > remove this site's data, then reload and allow the prompt again. A USB/Bluetooth barcode scanner or typing the barcode always works as a backup.`;
  }
};
