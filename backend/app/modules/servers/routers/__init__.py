"""Sub-routers for the servers module.

Layout:
    crud.py     /api/admin/servers  (list/create/get/patch/delete)
    actions.py  /api/admin/servers/{id}/actions/<verb>
    backups.py  /api/admin/servers/{id}/backups[/{backup_id}/restore]
"""
