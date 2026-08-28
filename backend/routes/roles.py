"""Roles & Permissions routes — CRUD untuk role management dan permission tree."""
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()

# Permission tree definition — semua module dan action yang tersedia
PERMISSION_TREE = [
    {"module": "dashboard", "label": "Dashboard", "actions": ["view"]},
    {"module": "attendance", "label": "Absensi", "actions": ["view", "create", "update", "delete"]},
    {"module": "pos", "label": "POS", "actions": ["view", "create"]},
    {"module": "dinein", "label": "Dine In", "actions": ["view", "create"]},
    {"module": "products", "label": "Produk", "actions": ["view", "create", "update", "delete"]},
    {"module": "inventory", "label": "Inventory", "actions": ["view", "create", "update", "delete"]},
    {"module": "reports", "label": "Reports", "actions": ["view", "export", "detail"]},
    {"module": "roles", "label": "Role", "actions": ["view", "create", "update", "delete"]},
    {"module": "settings", "label": "Settings", "actions": ["view", "update"]},
    {"module": "users", "label": "Users", "actions": ["view", "create", "update", "delete"]},
    {"module": "customers", "label": "Customers", "actions": ["view", "create", "update", "delete"]},
    {"module": "suppliers", "label": "Suppliers", "actions": ["view", "create", "update", "delete"]},
    {"module": "categories", "label": "Categories", "actions": ["view", "create", "update", "delete"]},
    {"module": "outlets", "label": "Outlets", "actions": ["view", "create", "update", "delete"]},
    {"module": "tables", "label": "Tables", "actions": ["view", "create", "update", "delete"]},
    {"module": "shifts", "label": "Shift", "actions": ["view", "open", "close"]},
    {"module": "purchase_orders", "label": "Purchase Orders", "actions": ["view", "create", "update", "delete"]},
    {"module": "stock_transfers", "label": "Stock Transfers", "actions": ["view", "create"]},
    {"module": "payment_accounts", "label": "Payment Accounts", "actions": ["view", "create", "update", "delete"]},
]


@router.get("/roles/permission-tree")
async def get_permission_tree(user=Depends(get_current_user)):
    """Return the full permission tree definition (modules + available actions)."""
    return {"tree": PERMISSION_TREE}


@router.get("/roles")
async def list_roles(user=Depends(get_current_user)):
    """List all roles with their permissions grouped by module."""
    roles = await q_all("SELECT * FROM roles ORDER BY is_system DESC, label ASC")
    result = []
    for role in roles:
        perms = await q_all(
            "SELECT module, action, granted FROM role_permissions WHERE role_id=:rid ORDER BY module, action",
            rid=role["id"],
        )
        # Group permissions by module
        perm_tree = {}
        for p in perms:
            if p["module"] not in perm_tree:
                perm_tree[p["module"]] = {}
            perm_tree[p["module"]][p["action"]] = p["granted"]

        result.append({
            "id": str(role["id"]),
            "name": role["name"],
            "label": role["label"],
            "description": role.get("description"),
            "is_system": role.get("is_system", False),
            "is_active": role.get("is_active", True),
            "created_at": str(role["created_at"]) if role.get("created_at") else None,
            "permissions": perm_tree,
        })
    return result


@router.get("/roles/my-permissions")
async def get_my_permissions(user=Depends(get_current_user)):
    """Get the current user's permissions based on their role."""
    role = await q_one("SELECT id FROM roles WHERE name=:n", n=user["role"])
    if not role:
        return {"role": user["role"], "permissions": {}}
    perms = await q_all(
        "SELECT module, action, granted FROM role_permissions WHERE role_id=:rid",
        rid=role["id"],
    )
    perm_tree = {}
    for p in perms:
        if p["module"] not in perm_tree:
            perm_tree[p["module"]] = {}
        perm_tree[p["module"]][p["action"]] = p["granted"]
    return {"role": user["role"], "permissions": perm_tree}


@router.get("/roles/{role_id}")
async def get_role(role_id: str, user=Depends(get_current_user)):
    """Get a single role with its permissions."""
    role = await q_one("SELECT * FROM roles WHERE id=:id", id=role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    perms = await q_all(
        "SELECT module, action, granted FROM role_permissions WHERE role_id=:rid ORDER BY module, action",
        rid=role_id,
    )
    perm_tree = {}
    for p in perms:
        if p["module"] not in perm_tree:
            perm_tree[p["module"]] = {}
        perm_tree[p["module"]][p["action"]] = p["granted"]
    return {
        "id": str(role["id"]),
        "name": role["name"],
        "label": role["label"],
        "description": role.get("description"),
        "is_system": role.get("is_system", False),
        "is_active": role.get("is_active", True),
        "created_at": str(role["created_at"]) if role.get("created_at") else None,
        "permissions": perm_tree,
    }


@router.post("/roles")
async def create_role(body: RoleCreate, user=Depends(require_role("admin"))):
    """Create a new custom role."""
    name = body.name.strip().lower().replace(" ", "_")
    existing = await q_one("SELECT id FROM roles WHERE name=:n", n=name)
    if existing:
        raise HTTPException(400, "Role name already exists")
    rid = new_id()
    await q_exec(
        "INSERT INTO roles (id, name, label, description, is_system, is_active, created_at, updated_at) VALUES (:id, :n, :l, :d, FALSE, TRUE, NOW(), NOW())",
        id=rid, n=name, l=body.label, d=body.description or "",
    )
    return await get_role(rid, user)


@router.put("/roles/{role_id}")
async def update_role(role_id: str, body: RoleUpdate, user=Depends(require_role("admin"))):
    """Update a role's label/description/active status. System roles cannot be deactivated."""
    role = await q_one("SELECT * FROM roles WHERE id=:id", id=role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    if role.get("is_system") and body.is_active is False:
        raise HTTPException(400, "Cannot deactivate system role")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No updates")
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = role_id
    await q_exec(f"UPDATE roles SET {sets}, updated_at=NOW() WHERE id=:id", **updates)
    return await get_role(role_id, user)


@router.put("/roles/{role_id}/permissions")
async def update_role_permissions(role_id: str, body: RolePermissionsUpdate, user=Depends(require_role("admin"))):
    """Bulk update permissions for a role. Replaces existing permissions."""
    role = await q_one("SELECT * FROM roles WHERE id=:id", id=role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    # Delete existing permissions
    await q_exec("DELETE FROM role_permissions WHERE role_id=:rid", rid=role_id)
    # Insert new permissions
    for perm in body.permissions:
        await q_exec(
            "INSERT INTO role_permissions (id, role_id, module, action, granted, created_at) VALUES (:id, :rid, :m, :a, :g, NOW()) ON CONFLICT (role_id, module, action) DO UPDATE SET granted=:g",
            id=new_id(), rid=role_id, m=perm.module, a=perm.action, g=perm.granted,
        )
    return await get_role(role_id, user)


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, user=Depends(require_role("admin"))):
    """Delete a custom role. System roles cannot be deleted."""
    role = await q_one("SELECT * FROM roles WHERE id=:id", id=role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    if role.get("is_system"):
        raise HTTPException(400, "Cannot delete system role")
    # Check if any users use this role
    users_count = await q_one("SELECT COUNT(*) as c FROM users WHERE role=:r", r=role["name"])
    if users_count["c"] > 0:
        raise HTTPException(400, f"Cannot delete: {users_count['c']} user(s) still assigned to this role")
    await q_exec("DELETE FROM role_permissions WHERE role_id=:rid", rid=role_id)
    await q_exec("DELETE FROM roles WHERE id=:id", id=role_id)
    return {"ok": True}
