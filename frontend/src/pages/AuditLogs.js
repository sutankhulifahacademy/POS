import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { useOutlet } from "../context/OutletContext";
import PageHeader from "../components/PageHeader";
import { FileText, Search, Filter } from "lucide-react";

export default function AuditLogs() {
  const { outletIdForApi } = useOutlet();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ entity: "", action: "", limit: 50 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletIdForApi) params.append("outlet_id", outletIdForApi);
      if (filters.entity) params.append("entity", filters.entity);
      if (filters.action) params.append("action", filters.action);
      params.append("limit", filters.limit);
      const { data } = await api.get(`/audit-logs?${params}`);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      console.error("Audit logs error:", e);
    } finally {
      setLoading(false);
    }
  }, [outletIdForApi, filters]);

  useEffect(() => { load(); }, [load]);

  const actionColors = {
    create: "text-green-400",
    update: "text-yellow-400",
    delete: "text-red-400",
    login: "text-blue-400",
    logout: "text-gray-400",
  };

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Log aktivitas sistem" />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Filters */}
        <div className="bg-[#331419] gold-border rounded-lg p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-[#C4A484]" />
            <select
              value={filters.entity}
              onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
              className="bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-1.5 text-sm text-[#F5F5F5]"
            >
              <option value="">Semua Entity</option>
              <option value="sale">Sale</option>
              <option value="product">Product</option>
              <option value="user">User</option>
              <option value="expense">Expense</option>
              <option value="outlet">Outlet</option>
            </select>
          </div>
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="bg-[#2A1015] border border-[rgba(244,200,66,0.3)] rounded-md px-3 py-1.5 text-sm text-[#F5F5F5]"
          >
            <option value="">Semua Action</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
          </select>
          <span className="text-sm text-[#C4A484] ml-auto">Total: {total} log</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-[#C4A484]">Memuat...</div>
        ) : logs.length === 0 ? (
          <div className="bg-[#331419] gold-border rounded-lg p-8 text-center text-[#C4A484]">
            <FileText size={32} className="mx-auto mb-3 opacity-50" />
            Belum ada log aktivitas
          </div>
        ) : (
          <div className="bg-[#331419] gold-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(244,200,66,0.2)]">
                  <th className="text-left py-3 px-4 text-[#C4A484]">Waktu</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">User</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Role</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Action</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Entity</th>
                  <th className="text-left py-3 px-4 text-[#C4A484]">Outlet</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[rgba(244,200,66,0.08)]">
                    <td className="py-3 px-4 text-[#C4A484] text-xs">
                      {log.created_at ? new Date(log.created_at).toLocaleString("id-ID") : "-"}
                    </td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{log.user_name || "-"}</td>
                    <td className="py-3 px-4 text-[#C4A484]">{log.role || "-"}</td>
                    <td className={`py-3 px-4 font-medium ${actionColors[log.action] || "text-[#F5F5F5]"}`}>
                      {log.action}
                    </td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{log.entity}</td>
                    <td className="py-3 px-4 text-[#C4A484]">{log.outlet_name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
