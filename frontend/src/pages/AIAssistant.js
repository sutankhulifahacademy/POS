import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { Sparkles, Send, TrendingUp, AlertTriangle, Calendar, Bot, Lightbulb } from "lucide-react";
import { toast } from "sonner";

const SUGGESTED_QUESTIONS = [
  "Cabang mana yang penjualannya paling tinggi hari ini?",
  "Produk apa yang paling laku minggu ini?",
  "Berapa total penjualan bulan ini?",
  "Produk apa yang berpotensi habis?",
  "Kenapa penjualan turun?",
  "Siapa yang paling sering terlambat?",
];

export default function AIAssistant() {
  const { outletIdForApi } = useOutlet();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [activeTab, setActiveTab] = useState("assistant");

  const loadBriefing = useCallback(async () => {
    try {
      const outletParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
      const { data } = await api.get(`/ai/daily-briefing${outletParam}`);
      setBriefing(data);
    } catch (e) {
      console.error("Briefing error:", e);
    }
  }, [outletIdForApi]);

  const loadAnomalies = useCallback(async () => {
    try {
      const outletParam = outletIdForApi ? `?outlet_id=${outletIdForApi}` : "";
      const { data } = await api.get(`/ai/anomalies${outletParam}`);
      setAnomalies(data);
    } catch (e) {
      console.error("Anomalies error:", e);
    }
  }, [outletIdForApi]);

  const loadForecast = useCallback(async () => {
    try {
      const outletParam = outletIdForApi ? `&outlet_id=${outletIdForApi}` : "";
      const { data } = await api.get(`/ai/forecast?days=7${outletParam}`);
      setForecast(data);
    } catch (e) {
      console.error("Forecast error:", e);
    }
  }, [outletIdForApi]);

  useEffect(() => {
    loadBriefing();
    loadAnomalies();
    loadForecast();
  }, [loadBriefing, loadAnomalies, loadForecast]);

  const askQuestion = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const { data } = await api.post("/ai/assistant", {
        question: query,
        outlet_id: outletIdForApi,
      });
      setAnswer(data);
    } catch (e) {
      toast.error("Gagal mendapatkan jawaban");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="AI Business Assistant" subtitle="Insight bisnis berbasis data real-time" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-[rgba(244,200,66,0.15)]">
          {[
            { id: "assistant", label: "Assistant", icon: Bot },
            { id: "briefing", label: "Daily Briefing", icon: Calendar },
            { id: "anomalies", label: "Anomaly Detection", icon: AlertTriangle },
            { id: "forecast", label: "Forecasting", icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#F4C842] text-[#F4C842]"
                  : "border-transparent text-[#C4A484] hover:text-[#F5F5F5]"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Assistant Tab */}
        {activeTab === "assistant" && (
          <div className="space-y-6">
            <div className="bg-[#331419] gold-border rounded-lg p-6">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                  placeholder="Tanyakan sesuatu tentang bisnis Anda..."
                  className="flex-1 bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-4 py-3 text-[#F5F5F5] outline-none focus:border-[#F4C842]"
                />
                <button
                  onClick={() => askQuestion()}
                  disabled={loading}
                  className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-6 py-3 rounded-md font-medium hover:bg-[#E6B835] disabled:opacity-50"
                >
                  <Send size={16} />
                  {loading ? "..." : "Tanya"}
                </button>
              </div>

              {/* Suggested Questions */}
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setQuestion(q); askQuestion(q); }}
                    className="text-xs bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-full px-3 py-1.5 text-[#C4A484] hover:text-[#F4C842] hover:border-[#F4C842]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Answer */}
            {answer && (
              <div className="bg-[#331419] gold-border rounded-lg p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="text-[#F4C842] mt-1 flex-shrink-0" size={20} />
                  <div>
                    <p className="text-xs uppercase tracking-widest text-[#C4A484] mb-1">Jawaban AI</p>
                    <p className="text-[#F5F5F5] text-base">{answer.answer}</p>
                  </div>
                </div>

                {answer.facts && answer.facts.length > 0 && (
                  <div className="pl-8 space-y-1">
                    <p className="text-xs uppercase tracking-widest text-[#F4C842]">Fakta</p>
                    {answer.facts.map((f, i) => (
                      <p key={i} className="text-sm text-[#F5F5F5]">• {f}</p>
                    ))}
                  </div>
                )}

                {answer.observations && answer.observations.length > 0 && (
                  <div className="pl-8 space-y-1">
                    <p className="text-xs uppercase tracking-widest text-[#C4A484]">Observasi</p>
                    {answer.observations.map((o, i) => (
                      <p key={i} className="text-sm text-[#C4A484]">• {o}</p>
                    ))}
                  </div>
                )}

                {answer.recommendations && answer.recommendations.length > 0 && (
                  <div className="pl-8 space-y-1">
                    <p className="text-xs uppercase tracking-widest text-[#F4C842]">Rekomendasi</p>
                    {answer.recommendations.map((r, i) => (
                      <p key={i} className="text-sm text-[#F4C842]">• {r}</p>
                    ))}
                  </div>
                )}

                <div className="pl-8 pt-2 border-t border-[rgba(244,200,66,0.1)]">
                  <p className="text-xs text-[#C4A484]">
                    Sumber data: {answer.data_sources?.join(", ")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Daily Briefing Tab */}
        {activeTab === "briefing" && briefing && (
          <div className="space-y-6">
            <div className="bg-[#331419] gold-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="text-[#F4C842]" size={20} />
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#C4A484]">AI Daily Briefing</p>
                  <p className="text-sm text-[#F5F5F5]">{briefing.date}</p>
                </div>
              </div>
              <div className="space-y-3">
                {briefing.briefings?.map((b, i) => (
                  <div key={i} className="flex items-start gap-3 bg-[#2A1015] rounded-md p-4">
                    <Lightbulb className="text-[#F4C842] mt-0.5 flex-shrink-0" size={16} />
                    <p className="text-sm text-[#F5F5F5]">{b}</p>
                  </div>
                ))}
              </div>
            </div>

            {briefing.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#331419] gold-border rounded-lg p-4">
                  <p className="text-xs text-[#C4A484]">Revenue Hari Ini</p>
                  <p className="text-lg text-[#F4C842]">{briefing.summary.today_revenue?.toLocaleString()}</p>
                </div>
                <div className="bg-[#331419] gold-border rounded-lg p-4">
                  <p className="text-xs text-[#C4A484]">Transaksi</p>
                  <p className="text-lg text-[#F5F5F5]">{briefing.summary.today_transactions}</p>
                </div>
                <div className="bg-[#331419] gold-border rounded-lg p-4">
                  <p className="text-xs text-[#C4A484]">Rata-rata Harian</p>
                  <p className="text-lg text-[#F5F5F5]">{briefing.summary.avg_daily_revenue?.toLocaleString()}</p>
                </div>
                <div className="bg-[#331419] gold-border rounded-lg p-4">
                  <p className="text-xs text-[#C4A484]">Perubahan</p>
                  <p className={`text-lg ${briefing.summary.change_pct > 0 ? "text-green-400" : "text-red-400"}`}>
                    {briefing.summary.change_pct?.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === "anomalies" && anomalies && (
          <div className="space-y-4">
            {anomalies.count === 0 ? (
              <div className="bg-[#331419] gold-border rounded-lg p-8 text-center">
                <AlertTriangle size={32} className="text-green-400 mx-auto mb-3" />
                <p className="text-[#F5F5F5]">Tidak ada anomali terdeteksi</p>
                <p className="text-xs text-[#C4A484] mt-1">Semua metrik dalam batas normal</p>
              </div>
            ) : (
              anomalies.anomalies?.map((a, i) => (
                <div key={i} className={`bg-[#331419] gold-border rounded-lg p-6 border-l-4 ${
                  a.severity === "critical" ? "border-l-red-500" : "border-l-yellow-500"
                }`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={a.severity === "critical" ? "text-red-400" : "text-yellow-400"} size={20} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[#F5F5F5] font-medium">{a.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          a.severity === "critical" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
                        }`}>{a.severity.toUpperCase()}</span>
                      </div>
                      <p className="text-sm text-[#C4A484]">{a.message}</p>
                      <p className="text-xs text-[#C4A484] mt-2">Kategori: {a.category}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Forecast Tab */}
        {activeTab === "forecast" && forecast && (
          <div className="space-y-6">
            <div className="bg-[#331419] gold-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="text-[#F4C842]" size={20} />
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#C4A484]">Sales Forecast</p>
                  <p className="text-sm text-[#F5F5F5]">7 hari ke depan</p>
                </div>
              </div>

              {forecast.message ? (
                <p className="text-[#C4A484] text-sm">{forecast.message}</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <span className={`text-xs px-3 py-1 rounded-full ${
                      forecast.confidence === "high" ? "bg-green-500/20 text-green-400" :
                      forecast.confidence === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>Confidence: {forecast.confidence}</span>
                    <span className="text-xs text-[#C4A484]">{forecast.confidence_reason}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-[#2A1015] rounded-md p-4">
                      <p className="text-xs text-[#C4A484]">Total Prediksi 7 Hari</p>
                      <p className="text-xl text-[#F4C842]">{forecast.total_predicted?.toLocaleString()}</p>
                    </div>
                    <div className="bg-[#2A1015] rounded-md p-4">
                      <p className="text-xs text-[#C4A484]">Rata-rata Harian</p>
                      <p className="text-xl text-[#F5F5F5]">{forecast.average_daily_revenue?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {forecast.forecast?.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-[#2A1015] rounded-md p-3">
                        <span className="text-sm text-[#C4A484]">{f.date}</span>
                        <span className="text-sm text-[#F5F5F5]">{f.predicted_revenue?.toLocaleString()}</span>
                        <span className="text-xs text-[#C4A484]">{f.predicted_transactions} tx</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
