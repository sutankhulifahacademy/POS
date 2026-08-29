import { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatIDR } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { toast } from "sonner";
import {
  Shield,
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  Trash2,
  Edit,
  Save,
  Users,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  Store,
  BarChart3,
  Settings,
  ClipboardList,
  Clock,
  UserCog,
  ArrowRightLeft,
  Utensils,
  CreditCard,
  Circle,
  FileText,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Menu icon map                                                      */
/* ------------------------------------------------------------------ */

const MENU_ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  Truck,
  Store,
  BarChart3,
  Settings,
  ClipboardList,
  Clock,
  UserCog,
  ArrowRightLeft,
  Utensils,
  CreditCard,
  Shield,
  FileText,
  Circle,
};

function getMenuIcon(name) {
  if (!name) return Circle;
  // try exact match, then case-insensitive
  if (MENU_ICON_MAP[name]) return MENU_ICON_MAP[name];
  const key = Object.keys(MENU_ICON_MAP).find(
    (k) => k.toLowerCase() === String(name).toLowerCase()
  );
  return key ? MENU_ICON_MAP[key] : Circle;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Build a quick lookup of granted permissions from the role's permissions
// object: { module: { action: bool } }
function permissionsToMap(permissions) {
  const map = new Map();
  if (!permissions || typeof permissions !== "object") return map;
  for (const [module, actions] of Object.entries(permissions)) {
    if (!actions || typeof actions !== "object") continue;
    for (const [action, granted] of Object.entries(actions)) {
      if (granted) map.set(`${module}:${action}`, true);
    }
  }
  return map;
}

// Convert a Map of "module:action" -> bool back into the nested object form
function mapToPermissions(map) {
  const out = {};
  for (const [key, granted] of map.entries()) {
    const [module, action] = key.split(":");
    if (!out[module]) out[module] = {};
    out[module][action] = granted;
  }
  return out;
}

// Role-specific accent styling
function roleAccent(name) {
  switch (name) {
    case "admin":
      return {
        border: "border-[#F4C842]/70",
        glow: "shadow-[0_0_20px_rgba(244,200,66,0.18)]",
        badge: "text-[#F4C842] bg-[#F4C842]/10",
        dot: "bg-[#F4C842]",
      };
    case "manager":
      return {
        border: "border-[#2E8B57]/60",
        glow: "shadow-[0_0_18px_rgba(46,139,87,0.18)]",
        badge: "text-[#5FD89E] bg-[#2E8B57]/15",
        dot: "bg-[#5FD89E]",
      };
    case "kasir":
      return {
        border: "border-[rgba(244,200,66,0.18)]",
        glow: "",
        badge: "text-[#C4A484] bg-[#C4A484]/10",
        dot: "bg-[#C4A484]",
      };
    default:
      return {
        border: "border-[rgba(244,200,66,0.18)]",
        glow: "",
        badge: "text-[#C4A484] bg-[#C4A484]/10",
        dot: "bg-[#C4A484]",
      };
  }
}

/* ------------------------------------------------------------------ */
/*  PermissionTree — reusable component                                */
/* ------------------------------------------------------------------ */

function PermissionTree({ tree, permissions, onChange }) {
  // permissions is a Map of "module:action" -> bool
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggleCollapse = (module) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const moduleState = useCallback(
    (module, actions) => {
      const checked = actions.filter((a) => permissions.get(`${module}:${a}`)).length;
      if (checked === 0) return "unchecked";
      if (checked === actions.length) return "checked";
      return "indeterminate";
    },
    [permissions]
  );

  const toggleModule = (module, actions) => {
    const next = new Map(permissions);
    const allOn = actions.every((a) => next.get(`${module}:${a}`));
    actions.forEach((a) => {
      if (allOn) next.delete(`${module}:${a}`);
      else next.set(`${module}:${a}`, true);
    });
    onChange(next);
  };

  const toggleAction = (module, action) => {
    const next = new Map(permissions);
    const key = `${module}:${action}`;
    if (next.get(key)) next.delete(key);
    else next.set(key, true);
    onChange(next);
  };

  if (!tree || tree.length === 0) {
    return (
      <div className="text-sm text-[#C4A484] py-8 text-center">
        Tidak ada permission tree tersedia.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tree.map((node) => {
        const state = moduleState(node.module, node.actions);
        const isCollapsed = collapsed.has(node.module);
        return (
          <div key={node.module} className="rounded-md">
            {/* Parent row */}
            <div className="flex items-center gap-2 px-2 py-2 hover:bg-[#4A1A22] rounded-md transition-colors">
              <button
                type="button"
                onClick={() => toggleCollapse(node.module)}
                className="text-[#C4A484] hover:text-[#F4C842] transition-colors"
                aria-label={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>

              <Checkbox
                state={state}
                onChange={() => toggleModule(node.module, node.actions)}
              />

              <span className="text-sm font-medium text-[#F5F5F5] tracking-wide">
                {node.label || node.module}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#C4A484]/70 ml-auto">
                {node.actions.length} aksi
              </span>
            </div>

            {/* Children */}
            {!isCollapsed && (
              <div className="ml-6 pl-4 border-l border-[rgba(244,200,66,0.12)] space-y-0.5">
                {node.actions.map((action) => {
                  const key = `${node.module}:${action}`;
                  const checked = !!permissions.get(key);
                  return (
                    <div
                      key={action}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#4A1A22] rounded transition-colors"
                    >
                      <Checkbox
                        state={checked ? "checked" : "unchecked"}
                        onChange={() => toggleAction(node.module, action)}
                      />
                      <span className="text-sm text-[#C4A484] capitalize">{action}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Checkbox — supports checked / unchecked / indeterminate            */
/* ------------------------------------------------------------------ */

function Checkbox({ state, onChange }) {
  const indeterminate = state === "indeterminate";
  const checked = state === "checked";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-5 h-5 rounded border flex items-center justify-center transition-all shrink-0 ${
        checked || indeterminate
          ? "bg-[#F4C842] border-[#F4C842] text-[#1A0810]"
          : "bg-transparent border-[rgba(244,200,66,0.35)] hover:border-[#F4C842]"
      }`}
    >
      {indeterminate ? (
        <span className="block w-2.5 h-0.5 bg-[#1A0810] rounded" />
      ) : checked ? (
        <Check size={14} strokeWidth={3} />
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal shells                                                       */
/* ------------------------------------------------------------------ */

function Modal({ title, icon, onClose, children }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#2A1015] gold-border rounded-lg max-w-md w-full"
      >
        <div className="p-6 border-b border-[rgba(244,200,66,0.15)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#C4A484] hover:text-[#F5F5F5] transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-[#2A1015] border border-[rgba(244,200,66,0.2)] rounded-md px-3 py-2 text-[#F5F5F5] focus:outline-none focus:border-[#F4C842]/60 transition-colors";
const labelCls = "text-xs uppercase tracking-widest text-[#C4A484] mb-1 block";

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [tree, setTree] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Permission editor state
  const [permMap, setPermMap] = useState(new Map());
  const [savedPermMap, setSavedPermMap] = useState(new Map());
  const [savingPerm, setSavingPerm] = useState(false);

  // Right panel tab: "permissions" | "menus"
  const [rightTab, setRightTab] = useState("permissions");

  // Menu access state
  const [roleMenus, setRoleMenus] = useState([]); // current editable list
  const [originalRoleMenus, setOriginalRoleMenus] = useState([]); // snapshot for dirty check
  const [menuLoading, setMenuLoading] = useState(false);
  const [savingMenus, setSavingMenus] = useState(false);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [createForm, setCreateForm] = useState({ name: "", label: "", description: "" });
  const [editForm, setEditForm] = useState({ label: "", description: "", is_active: true });

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) || null,
    [roles, selectedId]
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!selected) return false;
    if (permMap.size !== savedPermMap.size) return true;
    for (const [k, v] of permMap.entries()) {
      if (savedPermMap.get(k) !== v) return true;
    }
    return false;
  }, [permMap, savedPermMap, selected]);

  // Menu dirty: compare current is_visible against original snapshot
  const menuDirty = useMemo(() => {
    if (!roleMenus.length && !originalRoleMenus.length) return false;
    if (roleMenus.length !== originalRoleMenus.length) return true;
    return roleMenus.some(
      (m, i) =>
        m.id !== originalRoleMenus[i]?.id ||
        !!m.is_visible !== !!originalRoleMenus[i]?.is_visible
    );
  }, [roleMenus, originalRoleMenus]);

  /* ------------------------- loading ------------------------- */

  const loadRoles = useCallback(async () => {
    try {
      const { data } = await api.get("/roles");
      setRoles(Array.isArray(data) ? data : []);
      return data;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat roles");
      return [];
    }
  }, []);

  const loadTree = useCallback(async () => {
    try {
      const { data } = await api.get("/roles/permission-tree");
      setTree(data?.tree || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat permission tree");
    }
  }, []);

  const loadRoleMenus = useCallback(async (roleId) => {
    setMenuLoading(true);
    try {
      const { data } = await api.get(`/menus/role/${roleId}`);
      const list = Array.isArray(data) ? data : [];
      // normalize is_visible to boolean
      const normalized = list.map((m) => ({ ...m, is_visible: !!m.is_visible }));
      setRoleMenus(normalized);
      setOriginalRoleMenus(normalized.map((m) => ({ ...m })));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memuat menu role");
      setRoleMenus([]);
      setOriginalRoleMenus([]);
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [data] = await Promise.all([loadRoles(), loadTree()]);
      if (data && data.length > 0) {
        setSelectedId(data[0].id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selection changes, load that role's permissions into editor
  useEffect(() => {
    if (!selected) {
      setPermMap(new Map());
      setSavedPermMap(new Map());
      setRoleMenus([]);
      setOriginalRoleMenus([]);
      return;
    }
    const map = permissionsToMap(selected.permissions);
    setPermMap(map);
    setSavedPermMap(new Map(map));
    // reset menu state on role switch
    setRoleMenus([]);
    setOriginalRoleMenus([]);
  }, [selectedId, selected]);

  // Fetch role menus when the menus tab is open for the selected role
  useEffect(() => {
    if (selected && rightTab === "menus") {
      loadRoleMenus(selected.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, rightTab]);

  /* ------------------------- actions ------------------------- */

  const selectRole = (id) => {
    if (hasUnsavedChanges || menuDirty) {
      if (
        !window.confirm(
          "Anda memiliki perubahan yang belum disimpan. Ganti role dan buang perubahan?"
        )
      )
        return;
    }
    setSelectedId(id);
  };

  const handlePermChange = (next) => {
    setPermMap(next);
  };

  const savePermissions = async () => {
    if (!selected) return;
    setSavingPerm(true);
    try {
      // Build payload: include every module:action from the tree, granted true/false
      const payload = [];
      tree.forEach((node) => {
        node.actions.forEach((action) => {
          payload.push({
            module: node.module,
            action,
            granted: !!permMap.get(`${node.module}:${action}`),
          });
        });
      });

      await api.put(`/roles/${selected.id}/permissions`, { permissions: payload });
      toast.success("Permissions disimpan");
      setSavedPermMap(new Map(permMap));
      // refresh roles to reflect server state
      await loadRoles();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan permissions");
    } finally {
      setSavingPerm(false);
    }
  };

  /* ------------------------- menu actions ------------------------- */

  const toggleMenuVisible = (menuId) => {
    setRoleMenus((prev) =>
      prev.map((m) =>
        m.id === menuId ? { ...m, is_visible: !m.is_visible } : m
      )
    );
  };

  const selectAllMenus = () => {
    setRoleMenus((prev) => prev.map((m) => ({ ...m, is_visible: true })));
  };

  const deselectAllMenus = () => {
    setRoleMenus((prev) => prev.map((m) => ({ ...m, is_visible: false })));
  };

  const saveMenus = async () => {
    if (!selected) return;
    setSavingMenus(true);
    try {
      const payload = {
        menus: roleMenus.map((m) => ({
          menu_id: m.id,
          is_visible: !!m.is_visible,
        })),
      };
      await api.put(`/menus/role/${selected.id}`, payload);
      toast.success("Menu access disimpan");
      setOriginalRoleMenus(roleMenus.map((m) => ({ ...m })));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan menu access");
    } finally {
      setSavingMenus(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const name = createForm.name.trim().toLowerCase();
    const label = createForm.label.trim();
    if (!name || !label) {
      toast.error("Name dan label wajib diisi");
      return;
    }
    try {
      await api.post("/roles", {
        name,
        label,
        description: createForm.description.trim(),
      });
      toast.success("Role dibuat");
      setShowCreate(false);
      setCreateForm({ name: "", label: "", description: "" });
      const data = await loadRoles();
      const created = data?.find((r) => r.name === name);
      if (created) setSelectedId(created.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal membuat role");
    }
  };

  const openEdit = () => {
    if (!selected) return;
    setEditForm({
      label: selected.label || "",
      description: selected.description || "",
      is_active: selected.is_active !== false,
    });
    setShowEdit(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api.put(`/roles/${selected.id}`, {
        label: editForm.label.trim(),
        description: editForm.description.trim(),
        is_active: editForm.is_active,
      });
      toast.success("Role diperbarui");
      setShowEdit(false);
      await loadRoles();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memperbarui role");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/roles/${deleteTarget.id}`);
      toast.success(`Role "${deleteTarget.label}" dihapus`);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
      }
      setDeleteTarget(null);
      await loadRoles();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menghapus role");
    }
  };

  /* ------------------------- render ------------------------- */

  return (
    <div className="min-h-screen bg-[#1A0810]">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Kelola peran pengguna dan hak akses modul"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            data-testid="create-role-btn"
            className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors"
          >
            <Plus size={16} /> Buat Role
          </button>
        }
      />

      <div className="p-8 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* ---------------- Left: Role list ---------------- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif-luxury text-xl text-[#F5F5F5]">Daftar Role</h2>
            <span className="text-xs text-[#C4A484]">{roles.length} role</span>
          </div>

          {loading && (
            <div className="text-sm text-[#C4A484] py-8 text-center bg-[#331419] gold-border rounded-lg">
              Memuat…
            </div>
          )}

          {!loading && roles.length === 0 && (
            <div className="text-sm text-[#C4A484] py-8 text-center bg-[#331419] gold-border rounded-lg">
              Belum ada role.
            </div>
          )}

          {roles.map((role) => {
            const accent = roleAccent(role.name);
            const isSelected = role.id === selectedId;
            return (
              <button
                key={role.id}
                onClick={() => selectRole(role.id)}
                data-testid={`role-card-${role.id}`}
                className={`w-full text-left bg-[#331419] rounded-lg p-4 border transition-all card-hover ${
                  isSelected
                    ? `${accent.border} ${accent.glow}`
                    : "border-[rgba(244,200,66,0.12)] hover:border-[rgba(244,200,66,0.35)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {role.is_system ? (
                      <Lock size={14} strokeWidth={1.5} className="text-[#F4C842] shrink-0" />
                    ) : (
                      <Shield size={14} strokeWidth={1.5} className="text-[#C4A484] shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-[#F5F5F5] truncate">
                      {role.label || role.name}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${accent.badge}`}
                  >
                    {role.name}
                  </span>
                </div>

                {role.description && (
                  <p className="text-xs text-[#C4A484] mt-2 line-clamp-2">
                    {role.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {role.is_system && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#F4C842] bg-[#F4C842]/10 px-2 py-0.5 rounded">
                      <Lock size={10} /> System
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${
                      role.is_active === false
                        ? "text-[#8B0000] bg-[#8B0000]/15"
                        : "text-[#5FD89E] bg-[#2E8B57]/15"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        role.is_active === false ? "bg-[#8B0000]" : "bg-[#5FD89E]"
                      }`}
                    />
                    {role.is_active === false ? "Nonaktif" : "Aktif"}
                  </span>
                  {typeof role.user_count === "number" && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#C4A484] bg-[#C4A484]/10 px-2 py-0.5 rounded">
                      <Users size={10} /> {role.user_count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ---------------- Right: Permission editor ---------------- */}
        <div className="bg-[#331419] gold-border rounded-lg overflow-hidden flex flex-col min-h-[600px]">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <Shield size={48} strokeWidth={1} className="text-[#C4A484]/40 mb-4" />
              <p className="text-[#C4A484]">
                Pilih sebuah role di sebelah kiri untuk mengelola permissions.
              </p>
            </div>
          ) : (
            <>
              {/* Role header */}
              <div className="p-6 border-b border-[rgba(244,200,66,0.15)]">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {selected.is_system ? (
                        <Lock size={18} strokeWidth={1.5} className="text-[#F4C842]" />
                      ) : (
                        <Shield size={18} strokeWidth={1.5} className="text-[#F4C842]" />
                      )}
                      <h2 className="font-serif-luxury text-2xl text-[#F5F5F5]">
                        {selected.label || selected.name}
                      </h2>
                      <span
                        className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${roleAccent(selected.name).badge}`}
                      >
                        {selected.name}
                      </span>
                      {selected.is_system && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#F4C842] bg-[#F4C842]/10 px-2 py-0.5 rounded">
                          <Lock size={10} /> System
                        </span>
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${
                          selected.is_active === false
                            ? "text-[#8B0000] bg-[#8B0000]/15"
                            : "text-[#5FD89E] bg-[#2E8B57]/15"
                        }`}
                      >
                        {selected.is_active === false ? "Nonaktif" : "Aktif"}
                      </span>
                    </div>
                    {selected.description && (
                      <p className="text-sm text-[#C4A484] mt-2 max-w-2xl">
                        {selected.description}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={openEdit}
                      data-testid="edit-role-btn"
                      className="flex items-center gap-1.5 border border-[rgba(244,200,66,0.3)] text-[#F4C842] px-3 py-2 rounded-md text-xs uppercase tracking-widest hover:bg-[#4A1A22] transition-colors"
                    >
                      <Edit size={14} strokeWidth={1.5} /> Edit Role
                    </button>
                    {!selected.is_system && (
                      <button
                        onClick={() => setDeleteTarget(selected)}
                        data-testid="delete-role-btn"
                        className="flex items-center gap-1.5 border border-[#8B0000]/40 text-[#8B0000] px-3 py-2 rounded-md text-xs uppercase tracking-widest hover:bg-[#8B0000]/15 transition-colors"
                      >
                        <Trash2 size={14} strokeWidth={1.5} /> Hapus Role
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tab switcher */}
              <div className="px-6 pt-5 flex items-center gap-2 border-b border-[rgba(244,200,66,0.15)]">
                <button
                  type="button"
                  onClick={() => setRightTab("permissions")}
                  data-testid="tab-permissions"
                  className={`px-4 py-2 rounded-t-md text-xs uppercase tracking-widest font-semibold transition-colors ${
                    rightTab === "permissions"
                      ? "bg-[#F4C842] text-[#1A0810]"
                      : "bg-transparent text-[#C4A484] hover:text-[#F4C842] hover:bg-[#4A1A22]"
                  }`}
                >
                  Permission Tree
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("menus")}
                  data-testid="tab-menus"
                  className={`px-4 py-2 rounded-t-md text-xs uppercase tracking-widest font-semibold transition-colors ${
                    rightTab === "menus"
                      ? "bg-[#F4C842] text-[#1A0810]"
                      : "bg-transparent text-[#C4A484] hover:text-[#F4C842] hover:bg-[#4A1A22]"
                  }`}
                >
                  Menu Access
                </button>
              </div>

              {/* Permission tree tab */}
              {rightTab === "permissions" && (
                <>
                  <div className="p-6 flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm uppercase tracking-widest text-[#C4A484]">
                        Permission Tree
                      </h3>
                      {hasUnsavedChanges && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#F4C842] bg-[#F4C842]/10 px-2 py-1 rounded">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F4C842] animate-pulse" />
                          Perubahan belum disimpan
                        </span>
                      )}
                    </div>

                    <PermissionTree
                      tree={tree}
                      permissions={permMap}
                      onChange={handlePermChange}
                    />
                  </div>

                  {/* Footer save bar */}
                  <div className="p-4 border-t border-[rgba(244,200,66,0.15)] flex items-center justify-between gap-3 bg-[#2A1015]">
                    <p className="text-xs text-[#C4A484]">
                      {permMap.size} permission aktif
                      {hasUnsavedChanges && " · ada perubahan belum disimpan"}
                    </p>
                    <button
                      onClick={savePermissions}
                      disabled={!hasUnsavedChanges || savingPerm}
                      data-testid="save-permissions-btn"
                      className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Save size={16} strokeWidth={2} />
                      {savingPerm ? "Menyimpan…" : "Simpan Permissions"}
                    </button>
                  </div>
                </>
              )}

              {/* Menu access tab */}
              {rightTab === "menus" && (
                <>
                  <div className="p-6 flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                      <h3 className="text-sm uppercase tracking-widest text-[#C4A484]">
                        Menu Access
                      </h3>
                      <div className="flex items-center gap-2">
                        {menuDirty && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#F4C842] bg-[#F4C842]/10 px-2 py-1 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#F4C842] animate-pulse" />
                            Perubahan belum disimpan
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={selectAllMenus}
                          disabled={menuLoading || roleMenus.length === 0}
                          className="text-[10px] uppercase tracking-widest border border-[rgba(244,200,66,0.3)] text-[#F4C842] px-2.5 py-1 rounded hover:bg-[#4A1A22] transition-colors disabled:opacity-40"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={deselectAllMenus}
                          disabled={menuLoading || roleMenus.length === 0}
                          className="text-[10px] uppercase tracking-widest border border-[rgba(244,200,66,0.3)] text-[#C4A484] px-2.5 py-1 rounded hover:bg-[#4A1A22] transition-colors disabled:opacity-40"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {menuLoading ? (
                      <div className="text-sm text-[#C4A484] py-8 text-center">
                        Memuat menu…
                      </div>
                    ) : roleMenus.length === 0 ? (
                      <div className="text-sm text-[#C4A484] py-8 text-center">
                        Tidak ada menu tersedia untuk role ini.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {roleMenus.map((menu) => {
                          const Icon = getMenuIcon(menu.icon);
                          const visible = !!menu.is_visible;
                          return (
                            <div
                              key={menu.id}
                              className="flex items-center gap-3 px-2 py-2.5 hover:bg-[#4A1A22] rounded-md transition-colors border border-transparent hover:border-[rgba(244,200,66,0.12)]"
                            >
                              <Checkbox
                                state={visible ? "checked" : "unchecked"}
                                onChange={() => toggleMenuVisible(menu.id)}
                              />
                              <Icon
                                size={18}
                                strokeWidth={1.5}
                                className="text-[#F4C842] shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-[#F5F5F5]">
                                    {menu.label || menu.name}
                                  </span>
                                  {menu.route && (
                                    <span className="text-[10px] uppercase tracking-widest text-[#C4A484]/70 bg-[#C4A484]/10 px-1.5 py-0.5 rounded">
                                      {menu.route}
                                    </span>
                                  )}
                                </div>
                                {menu.description && (
                                  <p className="text-xs text-[#C4A484] mt-0.5 line-clamp-1">
                                    {menu.description}
                                  </p>
                                )}
                              </div>
                              {menu.is_active === false && (
                                <span className="text-[10px] uppercase tracking-widest text-[#8B0000] bg-[#8B0000]/15 px-2 py-0.5 rounded shrink-0">
                                  Nonaktif
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer save bar */}
                  <div className="p-4 border-t border-[rgba(244,200,66,0.15)] flex items-center justify-between gap-3 bg-[#2A1015]">
                    <p className="text-xs text-[#C4A484]">
                      {roleMenus.filter((m) => m.is_visible).length} menu terlihat
                      {menuDirty && " · ada perubahan belum disimpan"}
                    </p>
                    <button
                      onClick={saveMenus}
                      disabled={!menuDirty || savingMenus || roleMenus.length === 0}
                      data-testid="save-menus-btn"
                      className="flex items-center gap-2 bg-[#F4C842] text-[#1A0810] px-5 py-2.5 rounded-md text-sm font-semibold uppercase tracking-wider hover:bg-[#FFDD5C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Save size={16} strokeWidth={2} />
                      {savingMenus ? "Menyimpan…" : "Simpan Menu"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------------- Create Role Modal ---------------- */}
      {showCreate && (
        <Modal
          title="Buat Role Baru"
          icon={<Shield size={18} strokeWidth={1.5} className="text-[#F4C842]" />}
          onClose={() => setShowCreate(false)}
        >
          <form onSubmit={submitCreate} className="p-6 space-y-4" data-testid="create-role-form">
            <div>
              <label className={labelCls}>Name (lowercase)</label>
              <input
                required
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value.toLowerCase() })
                }
                placeholder="contoh: supervisor"
                className={inputCls}
                data-testid="create-role-name"
              />
              <p className="text-[10px] text-[#C4A484] mt-1">
                Identifier unik, otomatis di-lowercase.
              </p>
            </div>
            <div>
              <label className={labelCls}>Label</label>
              <input
                required
                value={createForm.label}
                onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                placeholder="contoh: Supervisor"
                className={inputCls}
                data-testid="create-role-label"
              />
            </div>
            <div>
              <label className={labelCls}>Deskripsi</label>
              <textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
                rows={3}
                placeholder="Deskripsi singkat tanggung jawab role…"
                className={`${inputCls} resize-none`}
                data-testid="create-role-description"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="create-role-submit"
                className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors"
              >
                Buat
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------- Edit Role Modal ---------------- */}
      {showEdit && selected && (
        <Modal
          title="Edit Role"
          icon={<Edit size={18} strokeWidth={1.5} className="text-[#F4C842]" />}
          onClose={() => setShowEdit(false)}
        >
          <form onSubmit={submitEdit} className="p-6 space-y-4" data-testid="edit-role-form">
            <div>
              <label className={labelCls}>Label</label>
              <input
                required
                value={editForm.label}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                className={inputCls}
                data-testid="edit-role-label"
              />
            </div>
            <div>
              <label className={labelCls}>Deskripsi</label>
              <textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                rows={3}
                className={`${inputCls} resize-none`}
                data-testid="edit-role-description"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="checkbox"
                aria-checked={editForm.is_active}
                onClick={() =>
                  setEditForm((f) => ({ ...f, is_active: !f.is_active }))
                }
                className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                  editForm.is_active
                    ? "bg-[#F4C842] border-[#F4C842] text-[#1A0810]"
                    : "bg-transparent border-[rgba(244,200,66,0.35)]"
                }`}
              >
                {editForm.is_active && <Check size={14} strokeWidth={3} />}
              </button>
              <span className="text-sm text-[#F5F5F5]">Role aktif</span>
            </label>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="edit-role-submit"
                className="flex-1 bg-[#F4C842] text-[#1A0810] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#FFDD5C] transition-colors"
              >
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------- Delete Confirmation ---------------- */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#2A1015] gold-border rounded-lg max-w-sm w-full p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Trash2 size={18} strokeWidth={1.5} className="text-[#8B0000]" />
              <h3 className="font-serif-luxury text-xl text-[#F5F5F5]">Hapus Role</h3>
            </div>
            <p className="text-sm text-[#C4A484] mb-2">
              Yakin ingin menghapus role{" "}
              <span className="text-[#F5F5F5] font-semibold">
                {deleteTarget.label || deleteTarget.name}
              </span>
              ?
            </p>
            <p className="text-xs text-[#C4A484]/80 mb-6">
              Role hanya dapat dihapus jika bukan role sistem dan tidak ada pengguna
              yang terikat.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-[rgba(244,200,66,0.3)] text-[#F4C842] py-2.5 rounded-md text-sm uppercase tracking-widest hover:bg-[#331419] transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                data-testid="confirm-delete-role"
                className="flex-1 bg-[#8B0000] text-[#F5F5F5] py-2.5 rounded-md text-sm font-semibold uppercase tracking-widest hover:bg-[#A00000] transition-colors"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
