from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


class InvalidCredentials(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Invalid email or password")


class InvalidApiKey(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "invalid_api_key", "Invalid or missing API key")


class PermissionDenied(AppError):
    def __init__(self, message: str = "Permission denied") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "permission_denied", message)


class NotFound(AppError):
    def __init__(self, what: str = "resource") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, f"{what}_not_found", f"{what.capitalize()} not found")


class ProfileBusy(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_409_CONFLICT, "profile_busy", "Profile is currently running another job")


class InvalidPayload(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_payload", message)


class RateLimited(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited", "Rate limit exceeded")


class EntitlementBlocked(AppError):
    """Raised when the user's plan/overrides don't permit an action.

    Distinct from PermissionDenied (role-based) and RateLimited (transient): this
    is a soft-deny with a human-readable upgrade hint."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(status.HTTP_402_PAYMENT_REQUIRED, code, message)


class EmailAlreadyRegistered(AppError):
    def __init__(self) -> None:
        super().__init__(
            status.HTTP_409_CONFLICT,
            "email_already_registered",
            "Email này đã được đăng ký. Vui lòng login hoặc dùng email khác.",
        )
