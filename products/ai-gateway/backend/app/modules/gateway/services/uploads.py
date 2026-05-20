"""Gateway upload constants — file extension whitelist, size cap, storage dir."""

import os
from pathlib import Path

ALLOWED_UPLOAD_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB

# Where multipart uploads land. Same volume as the rest of the app storage
# so /api/v1/gateway/uploads/{filename} can serve them straight back.
UPLOAD_DIR = Path(os.environ.get("LOCAL_STORAGE_PATH", "/app/storage")) / "gateway-uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
