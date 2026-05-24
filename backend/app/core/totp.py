"""TOTP (RFC 6238) 2FA helpers.

Architecture:
  - User table cột totp_secret lưu Fernet-encrypted base32 string
  - Plaintext secret chỉ tồn tại in-memory trong request scope khi
    generate (show QR cho user 1 lần) và verify (decrypt, check code)
  - Backup codes là 8 mã ngẫu nhiên hash SHA256, single-use khi marked
  - Verify dùng pyotp với window=1 (chấp nhận ±30s drift) — match
    Google Authenticator / Authy behavior

Why Fernet không bcrypt: secret cần decrypt được để verify (TOTP yêu
cầu cùng secret). Bcrypt là one-way → không dùng được. Fernet đối xứng
+ key trong env → DB leak cũng không break được nếu env an toàn.

Backup codes thì lại HASH (SHA256), single-use — user nhập, server
hash + so sánh + đánh dấu used. Không cần decrypt như TOTP secret.
"""
from __future__ import annotations

import hashlib
import secrets
from base64 import urlsafe_b64encode

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings


def _fernet() -> Fernet:
    """Derive Fernet key từ TOTP_ENCRYPTION_KEY (or fallback JWT_SECRET).

    Same pattern với api_key_pepper — config có thì dùng, không thì
    fallback. Khuyến nghị set TOTP_ENCRYPTION_KEY riêng, rotation
    riêng với JWT (rotate JWT không invalidate 2FA setup).
    """
    raw = getattr(settings, "TOTP_ENCRYPTION_KEY", None) or settings.JWT_SECRET
    if isinstance(raw, str):
        raw = raw.encode()
    # PBKDF2 derive 32-byte Fernet key. Salt static — single deploy, single
    # key. Rotation = generate new TOTP_ENCRYPTION_KEY + re-encrypt secrets.
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"grokflow-totp-v1",
        iterations=100_000,
    )
    key = urlsafe_b64encode(kdf.derive(raw))
    return Fernet(key)


def new_totp_secret() -> str:
    """Generate fresh base32 TOTP secret (160 bits = 32 base32 chars)."""
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    """Encrypt before storing in DB. Returns Fernet token (string)."""
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    """Decrypt for verify. Returns None if token invalid (key rotation
    edge case or DB corruption) — caller treats as "2FA broken, escalate
    to admin". Never raise so login path stays graceful."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def verify_totp_code(encrypted_secret: str, code: str) -> bool:
    """Verify 6-digit TOTP code against stored secret. window=1 cho
    phép ±30s drift (clock skew). Code phải đúng 6 ký tự số."""
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
        return False
    secret = decrypt_secret(encrypted_secret)
    if not secret:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def provisioning_uri(secret: str, email: str, issuer: str = "GrokFlow") -> str:
    """otpauth:// URI cho QR code. Authenticator app scan → tự thêm
    issuer + account name."""
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def new_backup_codes(count: int = 8) -> tuple[list[str], list[str]]:
    """Sinh N backup code 10-char (5 digits 5 letters). Return
    (plaintext_codes_to_show_user_once, hashes_to_store_in_db).
    Plaintext không được lưu — user copy/print 1 lần."""
    plaintext = [secrets.token_hex(5).upper() for _ in range(count)]
    hashes_db = [hashlib.sha256(c.encode()).hexdigest() for c in plaintext]
    return plaintext, hashes_db


def verify_backup_code(
    stored_hashes: list[str], code: str,
) -> tuple[bool, list[str]]:
    """Check code against unused backup hashes.

    Returns (matched, updated_list). Caller persists updated_list khi
    matched=True (single-use: code đã verify → xóa khỏi DB)."""
    code = (code or "").strip().upper()
    if not code or len(code) != 10:
        return False, stored_hashes
    h = hashlib.sha256(code.encode()).hexdigest()
    if h not in stored_hashes:
        return False, stored_hashes
    return True, [x for x in stored_hashes if x != h]
