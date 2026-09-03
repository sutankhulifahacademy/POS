"""
File upload endpoint — simpan gambar ke /app/uploads dan serve via /api/uploads
Security: magic-byte validation, no SVG (XSS risk), size limit, UUID filename.
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

# Allowed MIME types — SVG removed due to stored XSS risk
ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

# Allowed extensions (must match ALLOWED_TYPES)
ALLOWED_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}

MAX_SIZE = 5 * 1024 * 1024  # 5MB

# Magic bytes for real file-type validation (not just content_type header)
MAGIC_BYTES = {
    b"\xff\xd8\xff": "jpg",        # JPEG
    b"\x89PNG\r\n\x1a\n": "png",   # PNG
    b"RIFF": "webp",               # WebP (RIFF....WEBP)
    b"GIF87a": "gif",              # GIF87a
    b"GIF89a": "gif",              # GIF89a
}


def _detect_real_type(contents: bytes) -> str | None:
    """Detect file type from magic bytes. Returns extension or None."""
    for magic, ext in MAGIC_BYTES.items():
        if contents.startswith(magic):
            # For WebP, verify the WEBP marker at offset 8
            if ext == "webp" and len(contents) >= 12:
                if contents[8:12] == b"WEBP":
                    return "webp"
                continue
            return ext
    return None


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Upload gambar, return URL path yang bisa langsung dipakai di <img src>.
    Validates file type via magic bytes (not just content_type header)."""

    # 1. Check content_type header (fast rejection)
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Tipe file tidak didukung: {file.content_type}")

    # 2. Read contents (with size check)
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "Ukuran file maksimal 5MB")

    if len(contents) == 0:
        raise HTTPException(400, "File kosong")

    # 3. Magic byte validation — verify actual file content
    real_ext = _detect_real_type(contents)
    if not real_ext:
        raise HTTPException(400, "File tidak valid atau tipe tidak didukung")

    # 4. Use the detected extension (not the client-supplied one)
    ext = real_ext
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, "Tipe file tidak didukung")

    # 5. Save with UUID filename (no path traversal possible)
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(contents)

    return JSONResponse({"url": f"/api/uploads/{filename}", "filename": filename})
