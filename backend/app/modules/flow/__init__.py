"""Flow module — thin reverse proxy in front of the standalone
`video-processing-service` (deployed as the `flow-api` Docker service).

The proxy exists so:
  - GrokFlow JWT remains the only auth the FE has to think about; the
    flow-api X-API-Key never leaves the backend container.
  - Job ownership is keyed off the GrokFlow user, not the flow-api admin
    user that owns every job upstream.
  - Output URLs can be rewritten to point at our own nginx so we can
    serve via the GrokFlow domain instead of exposing flow-api directly.
"""
