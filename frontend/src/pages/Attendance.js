import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Camera, LogIn, LogOut, Clock, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

function useWebcam(active) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 360 } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; }
      } catch (e) {
        toast.error("Kamera tidak dapat diakses: " + e.message);
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [active]);

  const capture = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 480;
    canvas.height = videoRef.current.videoHeight || 360;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  };
  return { videoRef, capture };
}

function CameraModal({ mode, onCapture, onClose }) {
  const { videoRef, capture } = useWebcam(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const doCapture = async () => {
    const photo = capture();
    if (!photo) return toast.error("Gagal mengambil foto");
    setBusy(true);
    await onCapture(photo, note);
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" data-testid="camera-modal">
      <div className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif-luxury text-2xl text-[#F4C842]">
            {mode === "in" ? "Absen Masuk" : "Absen Keluar"}
          </h3>
          <button onClick={onClose} className="text-[#C4A484]"><X size={20} /></button>
        </div>
        <div className="relative rounded-md overflow-hidden bg-black mb-3">
          <video ref={videoRef} autoPlay playsInline className="w-full" style={{ transform: "scaleX(-1)" }} />
          <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-xs text-[#F4C842]">
            <Camera size={16} /> LIVE
          </div>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" className="w-full bg-[#1A0810] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F5F5] mb-3" data-testid="attendance-note" />
        <button onClick={doCapture} disabled={busy} data-testid={`capture-${mode}-btn`}
                className={`w-full py-3 rounded-md font-semibold uppercase tracking-widest text-sm transition-colors flex items-center justify-center gap-2 ${
                  mode === "in" ? "bg-[#F4C842] text-[#1A0810] hover:bg-[#FFDD5C]" : "bg-[#8B0000] text-white hover:bg-[#A00000]"
                } disabled:opacity-50`}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
          {mode === "in" ? "Konfirmasi Absen Masuk" : "Konfirmasi Absen Keluar"}
        </button>
      </div>
    </div>
  );
}

function formatDuration(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}j ${m}m`;
}

export default function Attendance() {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState([]);
  const [cameraMode, setCameraMode] = useState(null); // "in" | "out" | null
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const [a, h] = await Promise.all([api.get("/attendance/active"), api.get("/attendance?limit=50")]);
    setActive(a.data);
    setHistory(h.data);
  };
  useEffect(() => { load(); }, []);

  const doClockIn = async (photo, note) => {
    try {
      await api.post("/attendance/clock-in", { photo, note });
      toast.success("Absen masuk berhasil");
      setCameraMode(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const doClockOut = async (photo, note) => {
    try {
      await api.post("/attendance/clock-out", { photo, note });
      toast.success("Absen keluar berhasil");
      setCameraMode(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  return (
    <div>
      <PageHeader title="Absensi Karyawan" subtitle="Clock-in & clock-out dengan verifikasi foto webcam" actions={
        active ? (
          <button onClick={() => setCameraMode("out")} data-testid="clock-out-btn" className="flex items-center gap-2 bg-[#8B0000] text-white px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#A00000] transition-colors">
            <LogOut size={16} /> Absen Keluar
          </button>
        ) : (
          <button onClick={() => setCameraMode("in")} data-testid="clock-in-btn" className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors">
            <LogIn size={16} /> Absen Masuk
          </button>
        )
      } />
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {active && (
          <div className="bg-gradient-to-r from-[#331419] to-[#4A1A22] gold-border-active rounded-lg p-6" data-testid="active-attendance">
            <div className="flex items-center gap-4">
              {active.clock_in_photo && <img src={active.clock_in_photo} alt="Absen masuk" className="w-20 h-20 rounded-full object-cover border-2 border-[#F4C842]" style={{ transform: "scaleX(-1)" }} />}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={16} className="text-[#F4C842]" />
                  <h3 className="font-serif-luxury text-xl text-[#F4C842]">Sedang Bertugas</h3>
                </div>
                <p className="text-[#F5F5F5]">{active.cashier_name}</p>
                <p className="text-sm text-[#C4A484]">Sejak {new Date(active.clock_in_at).toLocaleString("id-ID")}</p>
              </div>
              <LiveDuration startTime={active.clock_in_at} />
            </div>
          </div>
        )}

        <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#C4A484] border-b border-[rgba(244,200,66,0.15)]">
                <th className="px-6 py-4">Karyawan</th>
                <th className="px-6 py-4">Masuk</th>
                <th className="px-6 py-4">Keluar</th>
                <th className="px-6 py-4 text-right">Durasi</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-[#C4A484]">Belum ada riwayat absensi</td></tr>}
              {history.map((a) => (
                <tr key={a.id} onClick={() => setDetail(a)} className="border-b border-[rgba(244,200,66,0.08)] last:border-0 hover:bg-[#4A1A22] transition-colors cursor-pointer" data-testid={`att-row-${a.id}`}>
                  <td className="px-6 py-3 text-sm text-[#F5F5F5]">{a.cashier_name}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{new Date(a.clock_in_at).toLocaleString("id-ID")}</td>
                  <td className="px-6 py-3 text-xs text-[#C4A484]">{a.clock_out_at ? new Date(a.clock_out_at).toLocaleString("id-ID") : <span className="text-[#F4C842]">MASIH BERTUGAS</span>}</td>
                  <td className="px-6 py-3 text-right text-sm text-[#F5F5F5]">{formatDuration(a.duration_minutes)}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${a.status === 'active' ? 'bg-[#F4C842]/20 text-[#F4C842]' : 'bg-[#7FD68F]/20 text-[#7FD68F]'}`}>{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cameraMode && (
        <CameraModal
          mode={cameraMode}
          onClose={() => setCameraMode(null)}
          onCapture={cameraMode === "in" ? doClockIn : doClockOut}
        />
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#2A1015] gold-border rounded-lg max-w-full sm:max-w-md mx-4 w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-luxury text-xl text-[#F4C842]">{detail.cashier_name}</h3>
              <button onClick={() => setDetail(null)} className="text-[#C4A484]"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs uppercase text-[#C4A484] mb-1">Absen Masuk</p>
                {detail.clock_in_photo ? <img src={detail.clock_in_photo} alt="in" className="w-full rounded border border-[#F4C842]/30" style={{ transform: "scaleX(-1)" }} /> : <div className="text-xs text-[#C4A484] italic">Tanpa foto</div>}
                <p className="text-[10px] text-[#C4A484] mt-1">{new Date(detail.clock_in_at).toLocaleString("id-ID")}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-[#C4A484] mb-1">Absen Keluar</p>
                {detail.clock_out_photo ? <img src={detail.clock_out_photo} alt="out" className="w-full rounded border border-[#F4C842]/30" style={{ transform: "scaleX(-1)" }} /> : <div className="text-xs text-[#C4A484] italic">{detail.clock_out_at ? "Tanpa foto" : "Belum keluar"}</div>}
                {detail.clock_out_at && <p className="text-[10px] text-[#C4A484] mt-1">{new Date(detail.clock_out_at).toLocaleString("id-ID")}</p>}
              </div>
            </div>
            <div className="border-t border-dashed border-[rgba(244,200,66,0.2)] pt-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-[#C4A484]">Durasi</span><span className="text-[#F5F5F5]">{formatDuration(detail.duration_minutes)}</span></div>
              {detail.clock_in_note && <div><p className="text-xs text-[#C4A484]">Catatan masuk:</p><p className="text-[#F5F5F5]">{detail.clock_in_note}</p></div>}
              {detail.clock_out_note && <div><p className="text-xs text-[#C4A484]">Catatan keluar:</p><p className="text-[#F5F5F5]">{detail.clock_out_note}</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveDuration({ startTime }) {
  const [dur, setDur] = useState("");
  useEffect(() => {
    const upd = () => {
      const ms = Date.now() - new Date(startTime).getTime();
      const mins = Math.floor(ms / 60000);
      setDur(formatDuration(mins));
    };
    upd();
    const t = setInterval(upd, 30000);
    return () => clearInterval(t);
  }, [startTime]);
  return <div className="text-right"><p className="text-xs uppercase text-[#C4A484]">Durasi Sesi</p><p className="font-serif-luxury text-3xl text-[#F4C842]">{dur}</p></div>;
}
