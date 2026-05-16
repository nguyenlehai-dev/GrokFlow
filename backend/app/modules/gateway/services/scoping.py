"""Gateway tenant-scope helpers."""

from app.models import GwGatewayKey


def scope_keys_query(q, admin):
    """Scope a GwGatewayKey query to the admin's domain (super sees all).

    Also surfaces legacy NULL-domain keys to super_admin only — a domain admin
    can't see (or steal) keys that weren't tagged with a tenant.
    """
    if admin.role == "super_admin":
        return q
    return q.where(GwGatewayKey.domain_id == admin.domain_id)
