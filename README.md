# GrokFlow

## Branching model

Three long-lived branches:

| Branch | Purpose | Direct push? |
|---|---|---|
| `prod` | Production code, deployed to live | ❌ PR only |
| `staging` | QA / demo environment | ❌ PR only |
| `dev` | Integration of all in-progress features | ✅ via PR review |

Working branches:

- `feat/<feature_name>` — new feature, branched from `dev`
- `fix/<bug_name>` — bug fix, branched from `dev`
- `hotfix/<name>` — emergency fix, branched from `prod`

### Standard flow

```
dev
 └── feat/login_page          → PR → dev
                                       └── promote → staging  (QA)
                                                       └── promote → prod  (release)
```

### Hotfix flow

```
prod
 └── hotfix/payment_crash     → PR → prod
                                       ├── back-merge → staging
                                       └── back-merge → dev
```

## Commit convention

Format: `<type>[optional scope]: <description> [#issue_id]`

- ≤ 50 chars, no trailing period, single language per message.
- Reference the issue id when one exists.

| Type | Use for |
|---|---|
| `feat` | new feature |
| `fix` | bug fix |
| `refactor` | code improvement, no behavior change |
| `docs` | documentation only |
| `chore` | minor non-code changes |
| `style` | UI / CSS / formatting |
| `perf` | performance improvement |
| `vendor` | dependency / lockfile bump |

Examples:

```
feat: add login page #12
fix(login): handle empty username #34
vendor(docker-compose): bump redis to latest
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full rules.
