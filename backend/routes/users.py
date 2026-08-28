from routes.deps import *

router = APIRouter()

# ============ USERS (owner + manager can add/edit; only owner can delete) ============
@router.get("/users")
async def list_users(user=Depends(require_role("admin", "manager"))):
    rows = await q_all("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                  ktp_number, created_at, updated_at FROM users ORDER BY created_at DESC""")
    return clean_list(rows)

@router.get("/users/{user_id}")
async def get_user(user_id: str, user=Depends(require_role("admin", "manager"))):
    row = await q_one("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                 ktp_image, ktp_number, created_at, updated_at FROM users WHERE id=:id""", id=user_id)
    if not row: raise HTTPException(404, "User not found")
    return clean(row)

@router.post("/users")
async def create_user(body: UserCreate, user=Depends(require_role("admin", "manager"))):
    email = body.email.lower()
    if body.role == "admin" and user["role"] != "admin":
        raise HTTPException(403, "Hanya owner yang bisa membuat akun admin")
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
async def update_user(user_id: str, body: UserUpdate, user=Depends(require_role("admin", "manager"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates: raise HTTPException(400, "No updates")
    if updates.get("role") == "admin" and user["role"] != "admin":
        raise HTTPException(403, "Hanya owner yang bisa mengubah peran ke admin")
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = user_id
    r = await q_exec(f"UPDATE users SET {sets}, updated_at=NOW() WHERE id=:id", **updates)
    if r == 0: raise HTTPException(404, "User not found")
    return clean(await q_one("SELECT id, email, name, role, is_active FROM users WHERE id=:id", id=user_id))

@router.post("/users/{user_id}/reset-password")
async def reset_pw(user_id: str, body: PasswordReset, user=Depends(require_role("admin", "manager"))):
    if len(body.new_password) < 6: raise HTTPException(400, "Password minimal 6 karakter")
    r = await q_exec("UPDATE users SET password_hash=:h, updated_at=NOW() WHERE id=:id",
                     h=hash_password(body.new_password), id=user_id)
    if r == 0: raise HTTPException(404, "User not found")
    return {"ok": True}

@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_role("admin"))):
    if str(user_id) == str(user["id"]): raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    r = await q_exec("DELETE FROM users WHERE id=:id", id=user_id)
    if r == 0: raise HTTPException(404, "User not found")
    return {"ok": True}
