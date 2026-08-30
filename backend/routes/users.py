from routes.deps import *

router = APIRouter()

# ============ USERS (owner + manager can add/edit; only owner can delete) ============
@router.get("/users")
async def list_users(user=Depends(require_permission("users", "view"))):
    rows = await q_all("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                  ktp_number, created_at, updated_at FROM users ORDER BY created_at DESC""")
    users_list = clean_list(rows)
    # Attach outlet info for each user
    for u in users_list:
        outlets = await q_all("""
            SELECT uoa.outlet_id, o.name AS outlet_name, uoa.is_primary, uoa.assigned_at
            FROM user_outlet_access uoa
            JOIN outlets o ON o.id = uoa.outlet_id
            WHERE uoa.user_id = :uid
            ORDER BY uoa.is_primary DESC, o.name ASC
        """, uid=u["id"])
        u["outlets"] = [
            {
                "outlet_id": str(o["outlet_id"]),
                "outlet_name": o["outlet_name"],
                "is_primary": o["is_primary"],
                "assigned_at": o["assigned_at"].isoformat() if o.get("assigned_at") else None,
            }
            for o in outlets
        ]
        # Primary outlet name for quick display
        primary = next((o for o in outlets if o["is_primary"]), None)
        u["primary_outlet"] = primary["outlet_name"] if primary else (outlets[0]["outlet_name"] if outlets else None)
    return users_list

@router.get("/users/{user_id}")
async def get_user(user_id: str, user=Depends(require_permission("users", "view"))):
    row = await q_one("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                 ktp_image, ktp_number, created_at, updated_at FROM users WHERE id=:id""", id=user_id)
    if not row: raise HTTPException(404, "User not found")
    return clean(row)

@router.post("/users")
async def create_user(body: UserCreate, user=Depends(require_permission("users", "create"))):
    email = body.email.lower()
    if body.role in ("owner", "admin") and user["role"] != "owner":
        raise HTTPException(403, "Hanya owner yang bisa membuat akun owner/admin")
    exists = await q_one("SELECT id FROM users WHERE email = :e", e=email)
    if exists: raise HTTPException(400, "Email sudah terdaftar")
    uid = new_id()
    await q_exec("""INSERT INTO users (id, email, name, role, password_hash, is_active, phone, address,
                    job_title, photo, ktp_image, ktp_number, created_at)
                    VALUES (:id, :e, :n, :r, :h, TRUE, :ph, :ad, :jt, :pt, :ki, :kn, NOW())""",
                 id=uid, e=email, n=body.name, r=body.role, h=hash_password(body.password),
                 ph=body.phone or "", ad=body.address or "", jt=body.job_title or "",
                 pt=body.photo or "", ki=body.ktp_image or "", kn=body.ktp_number or "")
    return clean(await q_one("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                  ktp_number, created_at FROM users WHERE id=:id""", id=uid))

@router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user=Depends(require_permission("users", "update"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates: raise HTTPException(400, "No updates")
    if updates.get("role") in ("owner", "admin") and user["role"] != "owner":
        raise HTTPException(403, "Hanya owner yang bisa mengubah peran ke owner/admin")
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = user_id
    r = await q_exec(f"UPDATE users SET {sets}, updated_at=NOW() WHERE id=:id", **updates)
    if r == 0: raise HTTPException(404, "User not found")
    return clean(await q_one("SELECT id, email, name, role, is_active FROM users WHERE id=:id", id=user_id))

@router.post("/users/{user_id}/reset-password")
async def reset_pw(user_id: str, body: PasswordReset, user=Depends(require_permission("users", "update"))):
    if len(body.new_password) < 6: raise HTTPException(400, "Password minimal 6 karakter")
    r = await q_exec("UPDATE users SET password_hash=:h, updated_at=NOW() WHERE id=:id",
                     h=hash_password(body.new_password), id=user_id)
    if r == 0: raise HTTPException(404, "User not found")
    return {"ok": True}

@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_role("owner"))):
    if str(user_id) == str(user["id"]): raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    r = await q_exec("DELETE FROM users WHERE id=:id", id=user_id)
    if r == 0: raise HTTPException(404, "User not found")
    return {"ok": True}


# ============ USER OUTLET ACCESS ============
@router.get("/users/{user_id}/outlets")
async def get_user_outlets_access(user_id: str, user=Depends(require_permission("users", "update"))):
    rows = await q_all("""
        SELECT uoa.outlet_id, o.name AS outlet_name, uoa.is_primary, uoa.assigned_at
        FROM user_outlet_access uoa
        JOIN outlets o ON o.id = uoa.outlet_id
        WHERE uoa.user_id = :uid
        ORDER BY uoa.is_primary DESC, o.name ASC
    """, uid=user_id)
    return {
        "outlet_ids": [str(r["outlet_id"]) for r in rows],
        "outlets": [
            {
                "outlet_id": str(r["outlet_id"]),
                "outlet_name": r["outlet_name"],
                "is_primary": r["is_primary"],
                "assigned_at": r["assigned_at"].isoformat() if r.get("assigned_at") else None,
            }
            for r in rows
        ],
    }


@router.put("/users/{user_id}/outlets")
async def update_user_outlets_access(
    user_id: str,
    body: dict,
    user=Depends(require_permission("users", "update")),
):
    outlet_ids = body.get("outlet_ids", [])
    primary_outlet_id = body.get("primary_outlet_id")
    await q_exec("DELETE FROM user_outlet_access WHERE user_id = :uid", uid=user_id)
    for oid in outlet_ids:
        is_primary = (oid == primary_outlet_id)
        await q_exec(
            "INSERT INTO user_outlet_access (user_id, outlet_id, is_primary, assigned_at) VALUES (:uid, :oid, :ip, NOW()) ON CONFLICT DO NOTHING",
            uid=user_id, oid=oid, ip=is_primary,
        )
    # If no primary specified, set first as primary
    if not primary_outlet_id and outlet_ids:
        await q_exec(
            "UPDATE user_outlet_access SET is_primary = TRUE WHERE user_id = :uid AND outlet_id = :oid",
            uid=user_id, oid=outlet_ids[0],
        )
    return {"ok": True, "outlet_ids": outlet_ids}
