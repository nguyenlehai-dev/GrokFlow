# Moving GrokFlow to another server

Step-by-step runbook to migrate a live stack to a fresh VPS without
downtime. Tested moving from `192.168.1.15` → `192.168.1.16`. ~30–60
minutes for a small dataset, longer for big browser_profiles dirs.

> **Quick mental model** — the project has 4 categories of state:
> 1. **Code** — in git, easy.
> 2. **Secrets** — `.env.prod` + maybe `~/.ssh/`. Never in git.
> 3. **Data** — Postgres DB + uploaded files + browser_profiles.
> 4. **Infra** — Docker, host nginx, DNS, SSL.

---

## ⚡ EXPRESS PATH (when the backup pipeline is set up)

If [HIGH-AVAILABILITY.md](./HIGH-AVAILABILITY.md) Tier 1 is already
configured (this is the project's current state), use this instead of
the full manual migration below. You skip every scp/pg_dump/tar step —
restic pulls everything from Drive.

### What you need from the old server

Nothing accessible. **All of this is in your password manager**:

- `RESTIC_PASSWORD` (the long random string)
- The Google account email + Drive folder ID (e.g. the
  `1Ypxf2J6g4gDix2Igo2iapqY_wcqfJbkK` folder)
- VPS credentials for the NEW server (you provisioned it)

### Run order

```bash
# 1. Provision new VPS (Ubuntu 22.04+, 4 vCPU / 8 GB RAM / 80 GB)
#    Follow SECTION 1 of this doc (apt install docker + nginx + ufw,
#    create vpsroot user, copy ssh key). 10-15 min.

ssh vpsroot@NEW_IP

# 2. Tools
sudo apt install -y rclone restic

# 3. Re-OAuth rclone (tokens don't transfer across machines)
#    Follow the SSH-tunnel trick from docs/HIGH-AVAILABILITY.md:
#      a. Open: ssh -L 53682:localhost:53682 vpsroot@NEW_IP
#      b. Run: rclone authorize drive
#      c. Click URL on laptop, approve, copy token JSON
#      d. Write ~/.config/rclone/rclone.conf with token + root_folder_id

# 4. Drop in the backup credentials (from your password manager)
mkdir -p /home/vpsroot/grokflow
cat > /home/vpsroot/grokflow/.backup-env <<'EOF'
export RESTIC_REPOSITORY="rclone:gdrive:grokflow-restic"
export RESTIC_PASSWORD="<paste from password manager>"
export RCLONE_CONFIG="/home/vpsroot/.config/rclone/rclone.conf"
EOF
chmod 600 /home/vpsroot/grokflow/.backup-env

# 5. Clone the code
cd /home/vpsroot
git clone https://github.com/nguyenlehai-dev/GrokFlow grokflow
cd grokflow
git checkout prod              # or your live branch
chmod +x scripts/*.sh

# 6. Bring up Postgres + Redis ONLY (we need an empty DB to restore into)
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
    up -d postgres redis
sleep 15

# 7. Restore EVERYTHING from Drive
./scripts/restore.sh latest --profiles
#  ↑ Pulls Postgres dump, storage volume, .env.prod, nginx vhosts,
#    browser_profiles. The script copies .env.prod into place too.

# 8. Bring up the rest of the stack
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
    up -d
sleep 30

# 9. Catch up any pending migrations (no-op if your backup was recent)
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
    exec backend alembic upgrade head

# 10. Wire up host nginx + per-tenant vhosts
#     (Section 4 of this doc — same as the manual path)

# 11. DNS cutover (Section 6 of this doc)

# 12. Verify backup pipeline kept running on the NEW server
crontab -l | grep grokflow      # paste the cron line back if missing
sudo /home/vpsroot/grokflow/scripts/backup-health.sh && echo OK
```

**Total time: ~40-60 minutes**, mostly Docker pulling base images.
Data loss window during the move: whatever's between your last cron
backup and the migration moment — currently capped at 15 minutes by
the */15 cron schedule.

The rest of this document is the MANUAL path. Use it when:
- You don't have backups (shouldn't happen — set them up first).
- You're moving so much data that backups would be slow to restore.
- You're debugging the backup pipeline itself.

---

## 0. Pre-flight on the OLD server (info to grab)

```bash
# On the OLD VPS
ssh vpsroot@OLD_IP

# Note these down before migrating
hostname -I                               # current IP
cat /etc/os-release                       # OS + version
docker --version && docker compose version
nginx -v
ls /etc/nginx/grokflow-vhosts/            # list of tenant vhosts
sudo cat /home/vpsroot/grokflow/.env.prod # secrets
ls /home/vpsroot/grokflow/browser_profiles/ | wc -l  # how many profiles?
sudo du -sh /var/lib/docker/volumes/grokflow_*    # data volume sizes
```

The checklist below assumes you'll keep the same project path
(`/home/vpsroot/grokflow`) on the new server. If you change it, search-
replace in `docker-compose.intranet.yml` (one place: `${PWD}/browser_profiles`
is fine — auto-uses current dir).

---

## 1. Provision the NEW server

Minimum spec for the current setup: 4 vCPU / 8 GB RAM / 80 GB SSD
Ubuntu 22.04 or 24.04 LTS.

### 1.1 Install base packages

```bash
ssh root@NEW_IP

# Create the deploy user (matches the existing project layout)
adduser --gecos "" vpsroot
usermod -aG sudo vpsroot
mkdir -p /home/vpsroot/.ssh
# Copy your public key in:
echo "ssh-ed25519 AAAA... laptop" >> /home/vpsroot/.ssh/authorized_keys
chown -R vpsroot:vpsroot /home/vpsroot/.ssh
chmod 700 /home/vpsroot/.ssh && chmod 600 /home/vpsroot/.ssh/authorized_keys

apt update && apt upgrade -y
apt install -y \
    nginx git curl ufw fail2ban \
    ca-certificates gnupg lsb-release

# Docker (official repo)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker vpsroot
```

### 1.2 Firewall + SSH hardening (optional but recommended)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
systemctl enable --now fail2ban
```

### 1.3 Lock down SSH (after testing key login works)

`/etc/ssh/sshd_config.d/99-grokflow.conf`:

```
PasswordAuthentication no
PermitRootLogin no
```

`systemctl restart ssh`. Test from a NEW terminal before disconnecting.

---

## 2. Bring the code over

### 2.1 Clone the repo

```bash
ssh vpsroot@NEW_IP
mkdir -p /home/vpsroot && cd /home/vpsroot
git clone https://github.com/nguyenlehai-dev/GrokFlow grokflow
cd grokflow
git checkout prod        # or whichever branch is live
```

### 2.2 Drop in secrets

Copy `.env.prod` from the OLD server (the one file NOT in git). On
your laptop:

```bash
ssh vpsroot@OLD_IP "sudo cat /home/vpsroot/grokflow/.env.prod" > /tmp/env.prod
scp /tmp/env.prod vpsroot@NEW_IP:/home/vpsroot/grokflow/.env.prod
ssh vpsroot@NEW_IP "chmod 600 /home/vpsroot/grokflow/.env.prod"
```

Make sure these are set (typical):
- `POSTGRES_PASSWORD=…`
- `JWT_SECRET=…`
- `SENTRY_DSN=…`
- `GUNICORN_WORKERS=4`
- Anything vendor-specific (Cloudflare tokens, etc.)

---

## 3. Bring the data over

### 3.1 Postgres dump → restore

**On the OLD server**:

```bash
sudo docker exec grokflow-postgres-1 \
  pg_dump -U grokflow -d grokflow --clean --if-exists --no-owner --format=custom \
  > /tmp/grokflow.dump
ls -lh /tmp/grokflow.dump    # check size
```

Copy to the new server:

```bash
# from your laptop
scp vpsroot@OLD_IP:/tmp/grokflow.dump /tmp/
scp /tmp/grokflow.dump vpsroot@NEW_IP:/tmp/
```

**On the NEW server**, start Postgres first (so the volume exists), then
restore:

```bash
cd /home/vpsroot/grokflow
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  up -d postgres
sleep 10                                       # wait for healthy
sudo docker exec -i grokflow-postgres-1 \
  pg_restore -U grokflow -d grokflow --clean --if-exists --no-owner \
  < /tmp/grokflow.dump
# Confirm
sudo docker exec grokflow-postgres-1 \
  psql -U grokflow -d grokflow -c "SELECT COUNT(*) FROM users;"
```

> **Note**: the dump uses the old data's Postgres role password. After
> restore, the role's password = whatever it was on the OLD server.
> If `.env.prod` on the NEW server has a different `POSTGRES_PASSWORD`,
> align them:
>
> ```bash
> PW=$(grep ^POSTGRES_PASSWORD= .env.prod | cut -d= -f2-)
> sudo docker exec grokflow-postgres-1 \
>   psql -U grokflow -d grokflow \
>   -c "ALTER USER grokflow WITH PASSWORD '$PW';"
> ```

### 3.2 Uploaded media + storage volume

```bash
# OLD server — find the volume's mount point
sudo docker volume inspect grokflow_storage_data --format '{{.Mountpoint}}'
# e.g. /var/lib/docker/volumes/grokflow_storage_data/_data

# Pack it
sudo tar czf /tmp/storage.tgz -C /var/lib/docker/volumes/grokflow_storage_data/_data .
```

Copy + restore on NEW:

```bash
# from laptop
scp vpsroot@OLD_IP:/tmp/storage.tgz /tmp/ && \
  scp /tmp/storage.tgz vpsroot@NEW_IP:/tmp/

# on NEW (after `up -d postgres` ran, volume now exists)
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  create backend                              # creates the volume mount
sudo tar xzf /tmp/storage.tgz \
  -C /var/lib/docker/volumes/grokflow_storage_data/_data
```

### 3.3 Browser profiles (bind mount)

These live as a regular host directory (`./browser_profiles/` in the
project root), not a Docker volume.

```bash
# OLD
sudo tar czf /tmp/profiles.tgz -C /home/vpsroot/grokflow browser_profiles
# laptop
scp vpsroot@OLD_IP:/tmp/profiles.tgz /tmp/ && \
  scp /tmp/profiles.tgz vpsroot@NEW_IP:/tmp/
# NEW
cd /home/vpsroot/grokflow
sudo tar xzf /tmp/profiles.tgz
sudo chown -R 10001:10001 browser_profiles    # container UID
```

### 3.4 Redis (skip — it's a cache)

Don't bother dumping Redis. Cache will rebuild from cold on first hits.
The only Redis-only state we have is `cache:*` keys + rate-limit
counters, both fine to lose.

---

## 4. Infrastructure on the new server

### 4.1 Host nginx — main vhost

Copy `/etc/nginx/sites-available/grokflow` from OLD or recreate. The
content is:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    "" close;
}

server {
    listen 80;
    listen [::]:80;
    server_name flowgrok.vpspanel.io.vn;     # change to your domain
    client_max_body_size 25m;

    # API + docs → backend
    location ~ ^/(api|openapi.json|docs|redoc)(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_buffering off;
    }

    # Everything else → frontend (nginx-in-container serving static dist)
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/grokflow /etc/nginx/sites-enabled/
sudo mkdir -p /etc/nginx/grokflow-vhosts
sudo chown vpsroot:vpsroot /etc/nginx/grokflow-vhosts   # backend writes here
```

### 4.2 Include the per-tenant vhost dir

Create `/etc/nginx/conf.d/grokflow-vhosts.conf`:

```nginx
include /etc/nginx/grokflow-vhosts/*.conf;
```

Then bring across whatever's currently in that dir on the OLD server:

```bash
# OLD → NEW
ssh vpsroot@OLD_IP "sudo tar czf /tmp/vhosts.tgz \
  -C /etc/nginx/grokflow-vhosts ."
scp vpsroot@OLD_IP:/tmp/vhosts.tgz /tmp/
scp /tmp/vhosts.tgz vpsroot@NEW_IP:/tmp/
ssh vpsroot@NEW_IP "sudo tar xzf /tmp/vhosts.tgz -C /etc/nginx/grokflow-vhosts"
sudo nginx -t && sudo systemctl reload nginx
```

### 4.3 nginx-reload trigger (so backend writes pick up automatically)

The backend writes `.conf` files into `/etc/nginx/grokflow-vhosts/` when
admins add a domain. A systemd path unit watches that dir and reloads
nginx on change. From the OLD server copy these two:

```
/etc/systemd/system/grokflow-nginx-reload.path
/etc/systemd/system/grokflow-nginx-reload.service
```

Or recreate (deploy/setup-host-nginx.sh in the repo has the canonical
content). Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now grokflow-nginx-reload.path
```

### 4.4 SSL — Cloudflare or Let's Encrypt

Two common setups:

**(a) Cloudflare in front (recommended for multi-tenant)** — orange
cloud each hostname; TLS terminates at Cloudflare; origin nginx stays
on port 80. No certbot needed.

**(b) Direct certs via certbot** — only viable if you control DNS for
each tenant hostname. Skip unless you're sure.

---

## 5. First boot

```bash
ssh vpsroot@NEW_IP
cd /home/vpsroot/grokflow

# Build images
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  build

# Bring up the full stack
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  up -d

# Wait for healthchecks
sleep 30
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml ps

# Run any pending migrations (should be no-op if you restored a fresh
# enough dump; otherwise this catches up)
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  exec backend alembic upgrade head
```

Verify locally from the VPS itself:

```bash
curl -sS http://127.0.0.1:8000/health
curl -sS http://127.0.0.1:8000/api/domains/config?host=$(hostname)
```

Both should return `200`. If they don't, `docker logs grokflow-backend-1`
will say why.

---

## 6. DNS cutover

For each hostname pointing at the OLD server:

1. Lower TTL on the A record to 60–300s **a day before** the migration
   so the new value propagates fast.
2. When ready: update the A record to NEW_IP.
3. Watch traffic shift on both servers; once OLD is quiet (10–15 min),
   stop accepting requests on it (`sudo systemctl stop nginx` on OLD).
4. Bump the TTL back up.

If you use Cloudflare, the change propagates ~instantly.

---

## 7. Smoke test the new stack

```bash
# As super_admin
curl -sS -X POST https://YOUR_DOMAIN/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@grokflow.io","password":"YOUR_PASSWORD"}' | jq

# Check a tenant domain config
curl -sS "https://YOUR_DOMAIN/api/domains/config?host=YOUR_DOMAIN" | jq

# In the UI
#   - log in
#   - hit /admin/users — list should populate
#   - hit /gateway/dashboard — counts should match the OLD server
#   - send a test request through /gateway/playground
```

---

## 8. Rollback plan

If anything's broken and you need to revert:

1. Flip DNS back to OLD_IP. (1 minute with low TTL.)
2. On the OLD server: `sudo docker compose … start` to wake the stack
   up. Postgres restart is safe — it has its own data.

The new server's Postgres will be slightly behind once OLD starts
accepting writes again. Drop the new DB and re-dump from OLD before
trying the migration again.

---

## 9. Cleanup on the OLD server (after you're confident)

```bash
ssh vpsroot@OLD_IP
sudo docker compose -f docker-compose.intranet.yml down -v   # -v drops volumes!
sudo systemctl stop nginx grokflow-nginx-reload.path
sudo rm -rf /home/vpsroot/grokflow           # only after verifying everything
```

Wait at least a week before deleting volumes on OLD — gives you a fallback.

---

## 10. Stuff that's easy to forget

- **Skill catalog** — `.claude/skills/` is in git, comes across with
  `git clone`. No action needed.
- **Per-domain Roles** — stored in Postgres, comes with the dump.
- **Gateway API keys** — also in Postgres. Customers don't need to
  reissue.
- **Audit logs** — in Postgres. Preserved.
- **Cookies / session tokens encrypted** in profiles — preserved in
  `browser_profiles/`. Their encryption derives from `JWT_SECRET`, so
  **don't change `JWT_SECRET`** during a migration or every profile
  will need re-login.

If your `JWT_SECRET` is rotated as part of the migration, plan a
follow-up "reset profile cookies" task; otherwise keep it identical
between OLD and NEW.

---

## 11. Repeatable runbook (TL;DR)

```
[on OLD]    pg_dump | tar storage | tar profiles | tar vhosts | grab .env.prod
[laptop]    scp everything OLD → laptop → NEW
[on NEW]    apt install docker+nginx+ufw+fail2ban
            adduser vpsroot, ssh keys
            git clone, drop .env.prod
            docker compose up -d postgres
            pg_restore the dump
            untar storage into volume, profiles into project dir
            untar vhosts into /etc/nginx/grokflow-vhosts/
            ln -s sites-available/grokflow
            systemctl enable grokflow-nginx-reload.path
            docker compose build && up -d
            alembic upgrade head
[laptop]    curl smoke tests
            update DNS A records
[on OLD]    docker compose down (after 1 week, with -v if confident)
```
