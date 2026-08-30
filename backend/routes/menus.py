"""Menus & Role-Menus routes — dynamic menu management."""
import json
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


# ============ MENUS CRUD ============
@router.get("/menus")
async def list_menus(user=Depends(get_current_user)):
    """List all menus (admin/manager only for full list)."""
    rows = await q_all("SELECT * FROM menus ORDER BY sort_order ASC, label ASC")
    return clean_list(rows)


@router.post("/menus")
async def create_menu(body: MenuCreate, user=Depends(require_permission("roles", "manage"))):
    """Create a new menu item."""
    existing = await q_one("SELECT id FROM menus WHERE name=:n", n=body.name)
    if existing:
        raise HTTPException(400, "Menu name already exists")
    mid = new_id()
    actions_json = json.dumps(body.actions) if body.actions else json.dumps(["view"])
    await q_exec(
        """INSERT INTO menus (id, name, label, description, route, icon, sort_order, parent_id, is_active, actions, created_at, updated_at)
           VALUES (:id, :n, :l, :d, :r, :i, :s, :p, :a, :act, NOW(), NOW())""",
        id=mid, n=body.name, l=body.label, d=body.description or "",
        r=body.route, i=body.icon, s=body.sort_order,
        p=_u(body.parent_id), a=body.is_active, act=actions_json,
    )
    return clean(await q_one("SELECT * FROM menus WHERE id=:id", id=mid))


@router.put("/menus/{menu_id}")
async def update_menu(menu_id: str, body: MenuUpdate, user=Depends(require_permission("roles", "manage"))):
    """Update a menu item."""
    menu = await q_one("SELECT * FROM menus WHERE id=:id", id=menu_id)
    if not menu:
        raise HTTPException(404, "Menu not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No updates")
    if "parent_id" in updates:
        updates["parent_id"] = _u(updates["parent_id"])
    if "actions" in updates:
        updates["actions"] = json.dumps(updates["actions"])
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = menu_id
    await q_exec(f"UPDATE menus SET {sets}, updated_at=NOW() WHERE id=:id", **updates)
    return clean(await q_one("SELECT * FROM menus WHERE id=:id", id=menu_id))


@router.delete("/menus/{menu_id}")
async def delete_menu(menu_id: str, user=Depends(require_permission("roles", "manage"))):
    """Delete a menu item."""
    r = await q_exec("DELETE FROM menus WHERE id=:id", id=menu_id)
    if r == 0:
        raise HTTPException(404, "Menu not found")
    return {"ok": True}


# ============ ROLE MENUS ============
@router.get("/menus/my-menus")
async def get_my_menus(user=Depends(get_current_user)):
    """Get menus visible to the current user based on their role."""
    role = await q_one("SELECT id FROM roles WHERE name=:n", n=user["role"])
    if not role:
        return []
    rows = await q_all(
        """SELECT m.* FROM menus m
           INNER JOIN role_menus rm ON rm.menu_id = m.id
           WHERE rm.role_id = :rid AND rm.is_visible = TRUE AND m.is_active = TRUE
           ORDER BY m.sort_order ASC, m.label ASC""",
        rid=role["id"],
    )
    return clean_list(rows)


@router.get("/menus/role/{role_id}")
async def get_role_menus(role_id: str, user=Depends(require_permission("roles", "manage"))):
    """Get all menus with visibility status for a specific role."""
    menus = await q_all("SELECT * FROM menus ORDER BY sort_order ASC, label ASC")
    role_menus = await q_all(
        "SELECT menu_id, is_visible FROM role_menus WHERE role_id=:rid",
        rid=role_id,
    )
    vis_map = {str(rm["menu_id"]): rm["is_visible"] for rm in role_menus}
    result = []
    for m in menus:
        result.append({
            "id": str(m["id"]),
            "name": m["name"],
            "label": m["label"],
            "description": m.get("description"),
            "route": m["route"],
            "icon": m.get("icon", "Circle"),
            "sort_order": m.get("sort_order", 0),
            "is_active": m.get("is_active", True),
            "is_visible": vis_map.get(str(m["id"]), False),
        })
    return result


@router.put("/menus/role/{role_id}")
async def update_role_menus(role_id: str, body: RoleMenusUpdate, user=Depends(require_permission("roles", "manage"))):
    """Bulk update which menus are visible to a role."""
    role = await q_one("SELECT * FROM roles WHERE id=:id", id=role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    # Delete existing
    await q_exec("DELETE FROM role_menus WHERE role_id=:rid", rid=role_id)
    # Insert new
    for item in body.menus:
        if item.is_visible:
            await q_exec(
                "INSERT INTO role_menus (id, role_id, menu_id, is_visible, created_at) VALUES (:id, :rid, :mid, TRUE, NOW()) ON CONFLICT (role_id, menu_id) DO UPDATE SET is_visible=TRUE",
                id=new_id(), rid=role_id, mid=item.menu_id,
            )
    return {"ok": True}
