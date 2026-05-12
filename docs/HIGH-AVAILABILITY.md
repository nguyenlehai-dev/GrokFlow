# Disaster Recovery & High Availability

3 tiers of "what happens when the server dies", ordered cheapest to
priciest. Pick the one that matches your downtime budget.

| Tier | RTO (downtime) | RPO (data loss) | Effort | Cost extra |
|---|---|---|---|---|
| **1 — Off-site backup** | 1–2h (provision new VPS + restore) | up to 24h | ~30min setup | ~$1–5/month storage |
| **2 — Warm standby** | 5–10min (manual DNS flip) | seconds–minutes | half a day | 1× extra VPS |
| **3 — Cloudflare failover** | seconds (automatic) | seconds–minutes | half a day + Tier 2 | 1× extra VPS + ~$5/mo CF LB |

> **Honest recommendation for this project right now**: **Tier 1**. It's
> 5–10× cheaper than the others, the only realistic risk for a single
> VPS is "VPS provider has an outage / disk dies", and a 1–2h restore
> on a fresh VPS is acceptable for the current revenue level. Move to
> Tier 2 when you start having paying customers who SLA you, or when
> you handle data that's painful to lose 24h of.

---

## Tier 1 — Off-site backup (DO THIS FIRST)

Nightly dump of everything that matters to a cloud bucket. If the VPS
disappears, you provision a new one and restore from the bucket — same
runbook as [SERVER-MIGRATION.md](./SERVER-MIGRATION.md) but with
`/tmp/grokflow.dump` coming from S3 instead of OLD.

### 1.1 Pick a storage provider

| Provider | Free tier | Restic backend | Best for |
|---|---|---|---|
| **Cloudflare R2** | 10 GB | native S3 | most reliable for cron, no egress fee |
| **Backblaze B2** | 10 GB | native S3 | cheapest paid ($0.006/GB/mo) |
| **Google Drive** | **15 GB** | via `rclone` | familiar UI, but needs rclone + OAuth |

For this project's data size (Postgres dump < 200 MB, browser profiles
1-5 GB), the 15 GB free Google Drive is realistically enough for years.

Pick one path below.

### 1.1a Option A: Cloudflare R2 (recommended for cron reliability)

Create a bucket `grokflow-backups`, generate an Access Key + Secret.
Note the endpoint (e.g. `https://<accountid>.r2.cloudflarestorage.com`).
Skip to [section 1.3 — Initialize the repo](#13-initialize-the-repo).

### 1.1b Option B: Google Drive (via rclone)

Restic talks to Drive through `rclone`. Setup:

```bash
# 1. Install rclone on the VPS
ssh vpsroot@VPS
sudo apt install -y rclone

# 2. Authorize against Google Drive — headless flow since the VPS has no browser
rclone config
#   n) new remote
#   name> gdrive
#   Storage> drive   (Google Drive)
#   client_id/secret> press Enter for the rclone defaults (rate-limited
#                     but fine for nightly backups) — OR create your own
#                     OAuth client at https://console.cloud.google.com
#                     for higher quotas
#   scope> 1 (Full access)
#   service_account_file> (blank)
#   Edit advanced config> n
#   Use auto config> n (because headless)
#
#   It prints a URL — open it on your LAPTOP:
#     1. Log into the Google account that will OWN the backups
#     2. Approve rclone access
#     3. Copy the verification token back to the VPS prompt
#   Configure as team drive> n
#   y) Yes, this is OK
#   q) Quit config

# 3. Test the connection
rclone mkdir gdrive:grokflow-backups
rclone ls gdrive:grokflow-backups        # should be empty
```

> **Trade-offs vs R2** to know in advance:
> - Drive's API has tighter rate limits — first full backup of a 5GB
>   profiles dir can throttle (HTTP 403 "User rate limit exceeded").
>   `rclone --tpslimit 8` mitigates if it happens.
> - OAuth tokens refresh automatically but rarely (every few months)
>   re-prompt. If a cron run fails with "token expired", run
>   `rclone config reconnect gdrive:` once interactively.
> - For higher reliability, use a **Google Workspace service account**
>   instead of personal-account OAuth — set `service_account_file` in
>   rclone config. Service accounts don't expire and get a higher
>   default quota.

Then point restic at the rclone remote — same `restic init` flow:

```bash
# In .backup-env instead of S3 vars:
export RESTIC_REPOSITORY="rclone:gdrive:grokflow-backups"
export RESTIC_PASSWORD="<long random string>"
# (no AWS_* vars — rclone uses its own ~/.config/rclone/rclone.conf)

source /home/vpsroot/grokflow/.backup-env
restic init
```

Everything from section 1.4 onwards (backup script, cron, restore)
works identically — `restic` doesn't care which backend it's writing
to. Just remember `rclone` must be installed on whichever VPS runs the
restore too.

### 1.1c Quick comparison

| Aspect | R2 / B2 | Google Drive |
|---|---|---|
| Setup time | 5 min (just credentials) | 15 min (rclone config + OAuth) |
| Restore from a fresh VPS | install restic only | install **rclone + restic + restore OAuth** |
| Reliability for daily cron | 99.99% | 99% (occasional 403s) |
| Cost over 15 GB | $0.006-0.015/GB | needs Google One ($2/mo for 100 GB) |
| Vendor lock-in | low (S3 API everywhere) | medium (rclone abstracts but Drive is Drive) |

**Honest pick**: if you already pay for Google One or use Workspace,
Drive is fine and the 15 GB free tier is plenty. If you don't, R2 is
faster to set up and 10× more reliable for unattended cron.

### 1.2 Install `restic` on the VPS

`restic` does dedupe + encryption + incremental backups. Perfect fit.

```bash
ssh vpsroot@VPS
sudo apt install -y restic
```

### 1.3 Initialize the repo

```bash
# Put these in /home/vpsroot/grokflow/.backup-env (chmod 600)
cat > /home/vpsroot/grokflow/.backup-env <<'EOF'
export RESTIC_REPOSITORY="s3:https://<accountid>.r2.cloudflarestorage.com/grokflow-backups"
export AWS_ACCESS_KEY_ID="<r2 access key>"
export AWS_SECRET_ACCESS_KEY="<r2 secret>"
export RESTIC_PASSWORD="<long random string — write it down somewhere safe>"
EOF
chmod 600 /home/vpsroot/grokflow/.backup-env

source /home/vpsroot/grokflow/.backup-env
restic init
```

> **Lose the `RESTIC_PASSWORD` = lose the backup.** Store it in a
> password manager and ALSO write it on paper somewhere offline.

### 1.4 The backup script

`/home/vpsroot/grokflow/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/vpsroot/grokflow
source ./.backup-env

STAGING=/tmp/grokflow-backup-$$
mkdir -p "$STAGING"
trap "rm -rf $STAGING" EXIT

# 1. Postgres dump (compressed custom format)
sudo docker exec grokflow-postgres-1 \
  pg_dump -U grokflow -d grokflow \
  --clean --if-exists --no-owner --format=custom \
  > "$STAGING/grokflow.dump"

# 2. .env.prod — encrypted inside restic, fine to include
cp .env.prod "$STAGING/env.prod"

# 3. List of per-tenant nginx vhost files (so we can recreate them)
sudo tar czf "$STAGING/grokflow-vhosts.tgz" \
  -C /etc/nginx/grokflow-vhosts .

# 4. Push to restic. browser_profiles is a separate tag because it's the
# slow + huge part — restic dedupes between snapshots so re-uploads
# of unchanged profiles cost nothing.
restic backup \
  --tag db --tag config \
  --host grokflow \
  "$STAGING"

restic backup \
  --tag profiles \
  --host grokflow \
  ./browser_profiles

# 5. Retention: keep 7 daily, 4 weekly, 6 monthly. Prune older snapshots.
restic forget --prune \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6

# 6. Sanity check — readable + intact
restic snapshots --last 1
```

```bash
chmod +x /home/vpsroot/grokflow/scripts/backup.sh
# First run — interactive so you see any error
sudo /home/vpsroot/grokflow/scripts/backup.sh
```

### 1.5 Schedule with cron

```bash
sudo crontab -e
# Add:
0 3 * * * /home/vpsroot/grokflow/scripts/backup.sh >> /var/log/grokflow-backup.log 2>&1
```

Runs daily at 03:00 (VPS local time). Adjust for your traffic.

### 1.6 Verify the restore path BEFORE you need it

Once a quarter, spin up a throwaway VPS, run `restic restore`, then
walk through [SERVER-MIGRATION.md](./SERVER-MIGRATION.md) starting at
section 3 (using the restored files). Tear it down after.

A backup you've never restored is just hope. **Test it.**

### 1.7 Restore (when the day comes)

```bash
# On a freshly provisioned VPS (after section 1+2 of SERVER-MIGRATION.md)
ssh vpsroot@NEW_IP
sudo apt install -y restic
cat > .backup-env <<EOF  # paste the same env, password from password manager
...
EOF
chmod 600 .backup-env && source .backup-env

# Pull the latest snapshots
restic restore latest --tag db --target /tmp/restore
restic restore latest --tag profiles --target /tmp/restore-profiles

# Then follow SERVER-MIGRATION.md section 3 onwards with these files
# as the source.
```

---

## Tier 2 — Warm standby (active-passive)

A second VPS runs the full Docker stack in lock-step with the primary.
DB replication keeps it ≤ seconds behind. When primary dies, you flip
DNS to the standby manually.

### 2.1 Provision the standby

Same OS / packages as the primary. Run sections 1+2 of
[SERVER-MIGRATION.md](./SERVER-MIGRATION.md) to get the code + secrets +
nginx in place. **Don't** restore data — replication handles that.

### 2.2 Configure Postgres streaming replication

On **primary**:

```sql
-- Inside grokflow-postgres-1
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET max_wal_senders = 3;
ALTER SYSTEM SET wal_keep_size = '512MB';
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<random>';
```

Edit `pg_hba.conf` on primary to allow replication from the standby's
IP:

```
host replication replicator STANDBY_IP/32 scram-sha-256
```

Restart primary postgres.

On **standby**, run `pg_basebackup` to seed its data dir from the
primary, then start in standby mode. (Out-of-scope for this doc — see
the [Postgres docs on streaming replication](https://www.postgresql.org/docs/current/warm-standby.html#STREAMING-REPLICATION)
for the exact 5-step recipe. Plan 1–2 hours the first time.)

### 2.3 Replicate the non-DB state

Standby also needs `browser_profiles/` and the storage volume. `rsync`
on a cron:

```bash
# On the primary, every 10 minutes:
*/10 * * * * rsync -azP --delete \
  /home/vpsroot/grokflow/browser_profiles/ \
  vpsroot@STANDBY_IP:/home/vpsroot/grokflow/browser_profiles/

*/10 * * * * sudo rsync -azP --delete \
  /var/lib/docker/volumes/grokflow_storage_data/_data/ \
  vpsroot@STANDBY_IP:/tmp/storage-staged/
```

On standby, a watchdog cron moves `/tmp/storage-staged` into the docker
volume + reloads the backend.

### 2.4 Failover procedure

When primary is dead:

1. SSH to standby.
2. Promote Postgres to primary: `docker exec grokflow-postgres-1 pg_ctl promote`.
3. Start the Docker stack: `docker compose ... up -d`.
4. Flip DNS A records (Cloudflare API or web UI) to STANDBY_IP.
5. (After original primary recovers) re-seed it as the new standby.

### 2.5 What standby gets you over Tier 1

- RTO drops from 1–2h to ~5min (no provisioning, no restore).
- RPO drops from 24h to seconds (streaming replication is continuous).
- You pay for an idle VPS 99% of the time.

Worth it if you have paying customers who'd notice 2h of downtime.

---

## Tier 3 — Cloudflare automatic failover

Add Cloudflare Load Balancer in front of the Tier 2 setup. CF health-
checks both origins and routes around the dead one within seconds. No
manual DNS flip.

1. Both VPSes (primary + standby) keep their own DNS A records.
2. Create a Cloudflare Load Balancer with two origins, one per VPS.
3. Health monitor: `GET /health` every 30s, mark unhealthy after 2
   failures.
4. Pool order: primary first, standby second.
5. Point your public hostname (e.g. `flowgrok.vpspanel.io.vn`) at the
   load balancer CNAME instead of a direct A record.

Cost: ~$5/month per load-balancer rule.

You still need Tier 2's data replication — CF only routes traffic, it
doesn't sync your DB.

---

## Comparison

```
                    Tier 1 (off-site backup)
        ┌──────────┐
        │  VPS     │ ──nightly──► [S3 bucket]
        └──────────┘                  │
            ✗ dies                    │
                                      ▼
                          [provision new VPS, restore — 1-2h]


                    Tier 2 (warm standby)
        ┌──────────┐                       ┌──────────┐
        │ PRIMARY  │ ──stream replication──►│ STANDBY  │
        │   VPS    │ ──rsync profiles─────►│   VPS    │
        └──────────┘                       └──────────┘
            ✗ dies                             ↑
                                               │ DNS flip (manual, ~5min)
                                          [you point here]


                    Tier 3 (CF auto-failover)
                       [Cloudflare LB]
                       /            \
                      ▼              ▼
               ┌──────────┐    ┌──────────┐
               │ PRIMARY  │    │ STANDBY  │
               └──────────┘    └──────────┘
                  ✗ dies      ─auto▲ within seconds
```

---

## Decision tree

```
Do you have paying customers who'd notice 1h downtime?
├─ No  → Tier 1 only. Test the restore quarterly.
└─ Yes → Tier 2.
         Do you also need failover to happen at 3am while you sleep?
         ├─ No  → Tier 2 is enough. Document the failover steps.
         └─ Yes → Tier 3.
```

For this project today: **start at Tier 1**. Set up restic + nightly
cron + verify one restore. Total work: 30 minutes. After that, every
day's data is safe against losing the VPS entirely.
