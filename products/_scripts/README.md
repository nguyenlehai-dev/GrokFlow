# Customer-facing scripts

These scripts live at the **root of every product repo** the customer
clones — i.e. they ship to:

- `nt7310063-boop/flowgrok`
- `nt7310063-boop/ai-gateway`
- `nt7310063-boop/plxeditor-studio`

The vendor (you) edits them here in the monorepo's `products/_scripts/`
and the export workflow copies them to each product repo's root.

| Script | Purpose | Audience |
|--------|---------|----------|
| `customer_setup.sh` | First-time install on the customer's VPS. Asks for domain, ports, admin creds; generates secrets; brings up the stack; runs migrations; smoke-tests. | Customer |
| `customer_update.sh` | Pull latest code from GitHub, rebuild images, run migrations, restart. Idempotent — safe to run on a cron. | Customer |
| `deploy_plxeditor_studio.sh` | Internal — was used to spin up the plxeditor-studio test stack on the dev VPS. Kept for reference. | Vendor (you) |
| `promote_super_admin.sh` | Internal — promotes all `admin` users to `super_admin` on the dev VPS test stacks. | Vendor (you) |

## Customer onboarding flow

1. You provision a **read-only GitHub PAT** for the customer (scope:
   `Contents: Read-only`, expires in 1 year) and add them as a `read`
   collaborator on the product repo.
2. Customer SSH-es into their fresh Ubuntu 22.04 VPS (or Windows
   Server + WSL2 Ubuntu) and runs:
   ```bash
   # As root
   apt-get update && apt-get install -y docker.io docker-compose-plugin git curl openssl python3
   systemctl enable --now docker

   # As whatever non-root user owns the deploy
   cd /opt
   git clone https://<github-user>:<PAT>@github.com/nt7310063-boop/<product>.git
   cd <product>
   bash _scripts/customer_setup.sh
   ```
3. Customer opens the printed URL and logs in.

## Auto-update (optional, recommended)

The customer can add to root's crontab:
```cron
0 3 * * * cd /opt/<product> && bash _scripts/customer_update.sh \
           >> /var/log/<product>-update.log 2>&1
```

Every night at 3am, the host pulls your latest push, rebuilds, runs
new migrations, and restarts. If you push at noon, customers have
the new version by 3am the next day with zero manual intervention.
