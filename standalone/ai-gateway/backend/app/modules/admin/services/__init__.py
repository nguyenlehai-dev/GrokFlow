"""Admin module services — business logic separated from HTTP concerns.

Layout:
    tenancy.py     — domain-scoping helpers (who can see / touch what)
    serializers.py — DB row → response model converters

Routers import from these; tests can call them directly without spinning
up FastAPI dependencies.
"""
