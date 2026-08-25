import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Camera } from "lucide-react";

export default function BarcodeScanner({ onDetected, onClose }) {
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const containerId = "html5qr-scanner";

  useEffect(() => {
    const start = async () => {
      try {
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            onDetected(decodedText);
            scanner.stop().then(() => scanner.clear());
          },
          () => {}
        );
      } catch (e) {
        setError(e.message || "Kamera tidak dapat diakses");
      }
    };
    start();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {});
      }
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A0A0A] gold-border rounded-lg max-w-md w-full p-6" data-testid="barcode-scanner">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif-luxury text-xl text-[#D4AF37] flex items-center gap-2"><Camera size={18} /> Scan Barcode</h3>
          <button onClick={onClose} className="text-[#A39B8B] hover:text-[#FDFBF7]"><X size={20} /></button>
        </div>
        {error ? (
          <p className="text-sm text-[#8B0000]">{error}</p>
        ) : (
          <>
            <div id={containerId} className="rounded-md overflow-hidden bg-black" />
            <p className="text-xs text-[#A39B8B] mt-3 text-center italic">Arahkan kamera ke barcode produk</p>
          </>
        )}
      </div>
    </div>
  );
}
