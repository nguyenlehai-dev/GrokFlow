"""Gateway module services — business logic separated from HTTP concerns.

Layout:
    execution.py   — pool resolution, key picking, provider invocation, quota
    serializers.py — DB row → response model
    scoping.py     — tenant-scope helpers
    uploads.py     — file-upload constants + path resolution
"""
