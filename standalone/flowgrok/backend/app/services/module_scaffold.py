"""Scaffold a new module from a built-in template.

Two flows use this:

  * **Auto-scaffold on install** — admin pastes a URL of an empty repo
    with the `auto_scaffold` flag set; we drop the template into the
    clone and `git push` it back so the repo now matches the contract.
  * **Create-and-install wizard** — admin enters a repo name (not URL);
    we create the GitHub repo via API, populate it from the template,
    then proceed with the normal install.

Both require a GitHub PAT with `repo` scope (write). For dev-only test
flows without push access, callers can skip the push step and just keep
the scaffold in the local clone — it still installs because we read the
manifest from disk, but the repo on GitHub remains empty.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import httpx

from app.core.exceptions import InvalidPayload


# Where the built-in templates live in the GrokFlow tree. Mounted into
# the backend container via the standard /app code mount.
TEMPLATE_ROOT = Path(__file__).resolve().parents[2] / ".." / "packages" / "grokflow-module-sdk" / "template"
# When running inside the docker container the path resolution above
# walks out of /app — fall back to the absolute path inside the repo
# bind-mount.
if not TEMPLATE_ROOT.exists():
    TEMPLATE_ROOT = Path("/app/../packages/grokflow-module-sdk/template").resolve()
if not TEMPLATE_ROOT.exists():
    # Last-resort: look for it sibling to the backend dir.
    TEMPLATE_ROOT = Path("/packages/grokflow-module-sdk/template")


SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{2,30}$")


def _slugify(name: str) -> str:
    """Normalise a human name to a valid module slug.

    'My Cool Module!' → 'my_cool_module'. If the result still doesn't
    match SLUG_RE we raise — caller surfaces a 422 with a useful hint.
    """
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not SLUG_RE.match(s):
        raise InvalidPayload(
            f"Cannot derive a valid slug from '{name}'. "
            f"Slugs must match {SLUG_RE.pattern}."
        )
    return s


def looks_empty(repo_dir: Path) -> bool:
    """A repo is 'empty enough to scaffold' when it has no manifest. We
    deliberately don't require ZERO files — many empty repos still have
    a README.md, a LICENSE, or .gitignore from GitHub's init UI."""
    return not (repo_dir / "module.manifest.json").exists()


def copy_template(into_dir: Path, slug: str, *, label: str | None = None) -> None:
    """Copy the bundled SDK template into `into_dir` (which already
    contains a .git from `git clone`), then customise manifest fields.
    Overwrites existing files in `into_dir` only when they collide with
    template paths — README.md etc. are kept if present."""
    if not TEMPLATE_ROOT.exists():
        raise InvalidPayload(
            f"Template not found at {TEMPLATE_ROOT} — re-deploy core "
            f"with the packages/grokflow-module-sdk dir present."
        )

    for src in TEMPLATE_ROOT.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(TEMPLATE_ROOT)
        dest = into_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Manifest gets a tailored copy below; everything else is verbatim.
        if rel.name == "module.manifest.json":
            continue
        shutil.copy2(src, dest)

    manifest = json.loads((TEMPLATE_ROOT / "module.manifest.json").read_text(encoding="utf-8"))
    manifest["name"] = slug
    manifest.setdefault("menu", {})
    if label:
        manifest["menu"]["label"] = label
    elif manifest["menu"].get("label") in (None, "", "Hello World"):
        manifest["menu"]["label"] = slug.replace("_", " ").title()
    manifest.setdefault("database", {})["schema"] = f"mod_{slug}"

    (into_dir / "module.manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


def commit_and_push(repo_dir: Path, *, branch: str, pat: str | None,
                    git_url: str, author: str = "GrokFlow Marketplace") -> None:
    """git add -A && git commit && git push. Requires a PAT with `repo`
    scope. Local-only callers (tests, no-push mode) pass pat=None to
    skip the push — the working dir still has the scaffold so install
    can proceed; the upstream repo just stays untouched."""
    def run(*args: str) -> None:
        subprocess.run(args, cwd=repo_dir, check=True, capture_output=True)

    run("git", "config", "user.email", "marketplace@grokflow.local")
    run("git", "config", "user.name", author)
    run("git", "add", "-A")
    # Allow empty commit so re-scaffold of an already-templated repo is
    # idempotent (no-op rather than failure).
    subprocess.run(
        ["git", "commit", "--allow-empty", "-m",
         "init: scaffold from grokflow module SDK template"],
        cwd=repo_dir, capture_output=True,
    )

    if pat:
        # Embed the PAT in the remote URL for this single push. We undo
        # this immediately after so the token never lands in .git/config
        # on disk where a later reader could grab it.
        authed = git_url.replace("https://", f"https://{pat}@", 1)
        subprocess.run(["git", "remote", "set-url", "origin", authed],
                       cwd=repo_dir, check=True, capture_output=True)
        try:
            run("git", "push", "-u", "origin", branch)
        finally:
            subprocess.run(["git", "remote", "set-url", "origin", git_url],
                           cwd=repo_dir, capture_output=True)


# ─── GitHub API helpers (for the create-and-install wizard) ───────────


async def github_create_repo(*, owner: str, name: str, pat: str,
                              private: bool = False) -> dict[str, Any]:
    """Create a new repository via the GitHub REST API.

    `owner` can be either a user login (uses /user/repos) or an
    organization name (uses /orgs/<org>/repos). We auto-detect by
    probing /user — if the authenticated PAT user matches `owner`,
    it's a user repo; otherwise we assume it's an org.
    """
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(base_url="https://api.github.com", timeout=15.0) as client:
        # Who is the PAT for?
        me = (await client.get("/user", headers=headers)).json()
        endpoint = "/user/repos" if me.get("login") == owner else f"/orgs/{owner}/repos"
        body = {
            "name": name,
            "private": private,
            "auto_init": True,            # creates an initial commit so we can clone
            "description": "GrokFlow module — scaffolded via marketplace wizard",
        }
        r = await client.post(endpoint, headers=headers, json=body)
        if r.status_code >= 400:
            raise InvalidPayload(
                f"GitHub repo create failed ({r.status_code}): "
                f"{r.json().get('message', r.text)[:200]}"
            )
        return r.json()
