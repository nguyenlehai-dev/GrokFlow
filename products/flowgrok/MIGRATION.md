# flowgrok — extraction plan from GrokFlow monorepo

This document tracks what was extracted from the GrokFlow monorepo
into this standalone product, and what was intentionally dropped.

## Keep — shared core (needed by every product)
- `app/core/*` — config, database, deps, security, exceptions, http_client
- `app/models/*` — ORM models (filtered: keep User, Profile, Job, File,
  ApiKey, GrokProject; drop Flow-specific tables)
- `app/modules/auth/*` — login, password reset, JWT, API keys
- `app/modules/admin/*` — user mgmt, domain mgmt, audit log
  - Drop sub-modules unrelated: `git_admin` (deploy mgmt is per-customer)
- `app/modules/entitlements/*` — plan/quota/billing primitives
- `app/modules/landing/billing/*` — Stripe/payment integration
- `app/modules/landing/plans_public/*` — plan listing for landing page

## Keep — Grok product surface
- `app/modules/grok/profiles/*` — Grok account browser profiles
- `app/modules/grok/jobs/*` — image/video generation job pipeline
- `app/modules/grok/files/*` — generated outputs storage
- `app/modules/grok/projects/*` — Grok project/workspace mgmt
- `app/modules/landing/client_api/*` — **partner-facing API** (the
  /api/client/* endpoints partners integrate with — keep frozen)
- `app/modules/landing/public_v1/*` — JWT-authed public API
- `app/services/nginx_sync.py` — VNC map writer
- `app/services/vnc_event_listener.py` — docker event listener
- `app/services/vnc_tab_gc.py` — periodic tab cleanup
- `app/services/vnc_cdp_watchdog.py` — CDP health auto-restart
- `app/browser/*` — vnc_manager, playwright_session
- `app/providers/*` — Grok provider only (drop OpenAI, Anthropic,
  Replicate gateway providers)
- `app/workers/*` — job runner (idle_cleanup, run, webhook)

## Drop — other products
- `app/modules/flow/*` — Flow video tools (separate product)
- `app/modules/gateway/*` — LLM gateway (separate product)
- `app/modules/tool/*` — super_admin VIP dashboard
- `app/modules/tool_install/*` — desktop installer registry
- `app/modules/servers/*` — server mgmt UI
- `app/modules/sdk/*` — Module Marketplace SDK (host-specific)
- `app/modules/admin_modules/*` — Module Marketplace installer
- `app/modules/admin/git_admin/*` — git deploy from admin UI

## Drop — landing pages for other products
- `app/modules/landing/public_try/*` — try-it-free landing flow
- Flow-specific landing pages

## Open questions
- Should `admin_modules` (Module Marketplace) stay? Useful for letting
  customer self-install custom modules, but adds complexity. Lean: SKIP
  for handoff; can be added back later as opt-in.
- `gallery` admin module — keep for image browsing? Useful for Grok
  product. KEEP.
- `notifications` admin module — used by webhooks (job.success/failed).
  KEEP.
- `domains` admin module — multi-tenant feature. For a SAAS standalone,
  KEEP. For a single-tenant deploy, optional.

## What to publish as `grokflow-core` (private pypi)
The shared bits not specific to any product:
- `app/core/*`
- `app/models/__init__.py` + base models (User, ApiKey, Domain, etc.)
- `app/modules/auth/*`
- `app/modules/admin/audit/*`
- `app/modules/admin/dashboard/*`
- `app/modules/admin/domains/*`
- `app/modules/admin/notifications/*`
- `app/modules/admin/roles/*`
- `app/modules/admin/settings/*`
- `app/modules/entitlements/*`
- `app/modules/landing/billing/*`
- `app/modules/landing/plans_public/*`

flowgrok-specific (NOT in core):
- All `grok/*` modules
- `client_api`, `public_v1` (Grok-specific)
- VNC stack (`browser/`, `services/vnc_*`)
- Providers
- Workers

## Strategy
1. **Phase A (this session)**: vendor everything as a flat copy into
   `standalone/flowgrok/`. Inline the would-be-`grokflow-core` code.
   Goal: standalone repo builds + boots.
2. **Phase B (later)**: extract `grokflow-core` into a separate
   package. flowgrok imports core via pyproject dep. Same for 2 other
   products.
