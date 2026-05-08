# Contributing to GrokFlow

## 1. Branching

We use a three-branch Gitflow:

- `prod` — production. Only merges from `staging` (releases) or `hotfix/*`.
- `staging` — QA / demo. Only merges from `dev` or `hotfix/*` (back-merge).
- `dev` — integration. Default target for all working branches.

### Working branch naming

```
feat/<short_name>      e.g. feat/login_page
fix/<short_name>       e.g. fix/empty_username
hotfix/<short_name>    e.g. hotfix/payment_crash
refactor/<short_name>
docs/<short_name>
```

### Standard workflow

1. `git checkout dev && git pull`
2. `git checkout -b feat/<name>`
3. Commit + push.
4. Open PR → `dev`.
5. After review + merge, `dev` is promoted to `staging` for QA.
6. From `staging`, promote to `prod` to release.

### Hotfix workflow

1. `git checkout prod && git pull`
2. `git checkout -b hotfix/<name>`
3. Commit + push.
4. PR → `prod` (review + merge).
5. Back-merge `prod` into `staging` and `dev` so they receive the fix.

### Protection rules (recommended on GitHub)

- `prod` and `staging`: PR-only, require review, require status checks to pass.
- `dev`: PR-only, allow self-review for solo work.

## 2. Commits

### Format

```
<type>[optional scope]: <description> [#issue_id]

[optional body — wrapped at 72 chars]

[optional footer — BREAKING CHANGE / Co-Authored-By / Refs]
```

### Rules

- **Subject ≤ 50 chars**, no trailing period, imperative mood.
- **Reference an issue** with `#<id>` when one exists.
- **One language per message** (English or Vietnamese), unless using technical terminology.
- **Type matters** — picking `feat` for a bug fix breaks changelog automation.

### Types

| Type | Use for |
|---|---|
| `feat` | new feature visible to users |
| `fix` | bug fix |
| `refactor` | code change without behavior change |
| `docs` | documentation only |
| `chore` | minor non-code (config, .gitignore, build scripts) |
| `style` | formatting, whitespace, UI-only CSS |
| `perf` | performance improvement |
| `vendor` | dependency / lockfile updates |

### Examples

```
feat: add login page #12
feat(auth): support OAuth via Google #45
fix(login): handle empty username #34
refactor(api): split user controller into modules
docs: explain hotfix workflow in CONTRIBUTING
chore: add .editorconfig
style(home): tighten card spacing on mobile
perf(query): index user.email column #88
vendor(docker-compose): bump redis to latest
```

## 3. Pull Requests

- Title follows the same convention as commit messages.
- Description: what & why (one paragraph), screenshots if UI, test plan if non-trivial.
- Link the issue: `Closes #<id>`.
- Squash-merge by default; let the PR title become the commit on `dev`.

## 4. Setup local commit template

```
git config commit.template .gitmessage
```

After this, `git commit` (without `-m`) opens an editor prefilled with the template.
