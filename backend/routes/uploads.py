"""
File upload endpoint — simpan gambar ke /app/uploads dan serve via /api/uploads
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import JSONResponse

from routes.deps import get_current_user

router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Upload gambar, return URL path yang bisa langsung dipakai di <img src>."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Tipe file tidak didukung: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "Ukuran file maksimal 5MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp", "gif", "svg"}:
        ext = "jpg"

    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(contents)

    return JSONResponse({"url": f"/api/uploads/{filename}", "filename": filename})
