import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";

// --- CAMERA STREAM INTERCEPTOR ---
// To guarantee the camera turns off when the component is unmounted or closed,
// we intercept getUserMedia and track all active video streams globally.
let activeMediaStreams = [];

if (typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await originalGetUserMedia(constraints);
    activeMediaStreams.push(stream);
    return stream;
  };
}

function forceStopAllCameraTracks() {
  activeMediaStreams.forEach(stream => {
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) { }
      });
    }
  });
  activeMediaStreams = [];
}
// ---------------------------------

const SCANNER_ELEMENT_ID = "qr-reader-container";

/**
 * QrScanner — opens the device camera, scans continuously, and
 * calls onScan(decodedText) when a QR code is read.
 *
 * Props:
 *   onScan(text)  — called once per successful scan
 *   onClose()     — called when the user closes the scanner
 */
export default function QrScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const hasScanned = useRef(false);
  const fileInputRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let html5QrCode = null;

    const start = async () => {
      try {
        html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" }, // rear camera
          {
            fps: 12,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            if (hasScanned.current) return; // fire only once
            hasScanned.current = true;
            onScan(decodedText);
          },
          () => { } // ignore scan-failure noise
        );

        setReady(true);
      } catch (err) {
        console.error("QR Scanner error:", err);
        if (err?.message?.toLowerCase().includes("permission")) {
          setError("Camera permission denied. Please allow camera access and try again.");
        } else {
          setError("Could not start camera. Make sure no other app is using it.");
        }
      }
    };

    start();

    return () => {
      if (html5QrCode) {
        try {
          if (html5QrCode.isScanning) {
            html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => { });
          } else {
            html5QrCode.clear();
          }
        } catch (e) { }
      }
      forceStopAllCameraTracks();
    };
  }, [onScan]);

  const toggleTorch = async () => {
    const track = scannerRef.current?.getRunningTrackCameraCapabilities?.()
      ?.torchFeature?.();
    if (track?.isSupported()) {
      await track.apply(!torchOn);
      setTorchOn(t => !t);
    }
  };

  const handleClose = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) { }
    }
    forceStopAllCameraTracks();
    onClose();
  };

  const handleUploadQr = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Pause live camera scanning before scanning the file
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }

      const html5QrCode = new Html5Qrcode("qr-upload-temp", { verbose: false });
      const decodedText = await html5QrCode.scanFile(file, /* showImage= */ false);
      html5QrCode.clear();

      if (!hasScanned.current) {
        hasScanned.current = true;
        onScan(decodedText);
      }
    } catch (err) {
      console.error("QR upload scan error:", err);
      setError("No QR code found in the uploaded image. Please try another image.");
      // Restart camera scanning after failed upload
      try {
        if (scannerRef.current) {
          await scannerRef.current.start(
            { facingMode: "environment" },
            { fps: 12, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0, disableFlip: false },
            (decodedText) => {
              if (hasScanned.current) return;
              hasScanned.current = true;
              onScan(decodedText);
            },
            () => { }
          );
        }
      } catch (restartErr) {
        console.error("Failed to restart camera after upload:", restartErr);
      }
    }

    // Reset file input so the same file can be selected again
    e.target.value = "";
  };

  return createPortal(
    <div className="lens-container" role="dialog" aria-modal="true" aria-label="QR Scanner">
      {/* Hidden file input for QR upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {/* Hidden container for file-based scanning */}
      <div id="qr-upload-temp" style={{ display: "none" }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="lens-viewfinder-wrap">
          {/* Camera viewfinder */}
          <div id={SCANNER_ELEMENT_ID} className="lens-camera-feed" />

          {/* Laser Overlay */}
          {ready && !error && (
            <div className="lens-laser" />
          )}

          {/* Error state */}
          {error && (
            <div className="lens-error-state">
              <span style={{ fontSize: "3rem" }}>📵</span>
              <p style={{ marginTop: "16px", color: "var(--rose)", fontWeight: 600, fontSize: "1.1rem", textAlign: "center", padding: "0 16px" }}>{error}</p>
            </div>
          )}

          {/* Loading overlay */}
          {!ready && !error && (
            <div className="lens-loading-state">
              <div className="spinner" style={{ borderColor: "rgba(255,255,255,0.2)", borderTopColor: "#fff", width: "40px", height: "40px" }} />
              <p style={{ marginTop: "16px", fontSize: "1rem" }}>Starting camera…</p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="lens-controls">
        {/* Commented out to prevent spoofing check-ins from home:
        <button
          className="lens-btn"
          onClick={handleUploadQr}
        >
          Upload QR
        </button>
        */}
        <button
          className="lens-btn"
          style={error ? { borderColor: "var(--rose)", color: "var(--rose)" } : {}}
          onClick={handleClose}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}
