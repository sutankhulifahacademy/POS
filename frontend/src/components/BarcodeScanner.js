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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full p-4 sm:p-6 mx-2 sm:mx-4 max-h-[92dvh] max-h-[92vh] overflow-y-auto" data-testid="barcode-scanner">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-serif-luxury text-lg sm:text-xl text-[#F4C842] flex items-center gap-2"><Camera size={18} /> Scan Barcode</h3>
          <button onClick={onClose} className="text-[#C4A484] hover:text-[#F5F5F5] p-1"><X size={20} /></button>
        </div>
        {error ? (
          <p className="text-xs sm:text-sm text-[#8B0000]">{error}</p>
        ) : (
          <>
            <div id={containerId} className="rounded-md overflow-hidden bg-black" />
            <p className="text-[10px] sm:text-xs text-[#C4A484] mt-3 text-center italic">Arahkan kamera ke barcode produk</p>
          </>
        )}
      </div>
    </div>
  );
}
