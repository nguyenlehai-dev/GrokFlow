"""Sub-routers for the admin module.

The parent `app.modules.admin.router` aggregates these under
`/api/admin/*`. Each file owns one resource area:

    stats          /api/admin/stats
    users          /api/admin/users
    entitlements   /api/admin/entitlements/*
    plans          /api/admin/plans
    subscriptions  /api/admin/subscriptions
    payments       /api/admin/payments
    invoices       /api/admin/invoices

Shared helpers live in `_helpers.py`.
"""
