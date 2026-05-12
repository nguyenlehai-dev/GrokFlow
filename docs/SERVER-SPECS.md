# Server specs to buy

What to look for when picking a VPS for GrokFlow, with concrete tiers
and provider recommendations.

## 1. RAM is the bottleneck — size for this first

The stack runs many containers. Idle baseline + per-active-VNC-profile:

| Component | Idle RAM | Notes |
|---|---|---|
| `postgres` | 200-300 MB | Grows slowly with connection count |
| `redis` | 50 MB | Tiny |
| `backend` (gunicorn × 4 workers) | 500-800 MB | 4 workers default |
| `worker` | 150-250 MB | One queue consumer |
| `idle-cleanup` | 50-80 MB | Runs every 15 min |
| `frontend` (nginx static) | 50 MB | After the prod build switch |
| Docker daemon + kernel | 200 MB | Linux overhead |
| **IDLE TOTAL** | **~1.5 GB** | nothing running |
| Each active VNC profile | **+150 MB** | One Chromium + window manager |

Real-world ceiling: 5-8 simultaneous Grok automation jobs → 750-1200 MB
extra on top of idle = ~2.5-2.7 GB peak. Leave 50% headroom for spikes,
caches, OS, and your future growth.

**Rule of thumb**: `RAM_GB = 4 + (max concurrent profiles ÷ 5)`.

## 2. CPU is rarely the bottleneck

The backend is async — one vCPU handles hundreds of concurrent
connections idle. CPU spikes during:

- Postgres queries on dashboard reload (low % thanks to indexes + cache)
- LLM Gateway HTTP calls to vendors (almost all wait time, not CPU)
- Image / video generation (vendor does the work, we just shuttle bytes)
- VNC + Chromium per profile (~50-100% of one core per active session)

**Rule of thumb**: `vCPU = max(2, max_concurrent_profiles)`.

## 3. Disk — SSD always, NVMe if you can

Docker overhead, Postgres, uploads, profiles add up.

| Path | Size baseline | Growth |
|---|---|---|
| Docker images | 3-4 GB | Stable (unless you `--no-prune`) |
| Postgres data | 100 MB → growth | Audit logs + gw_requests dominate over time |
| storage_data volume | 0 → user uploads | Caps at plan limits |
| browser_profiles | ~50 MB / profile | Grows linearly with customers |
| Container logs (rotated) | 150 MB / service | Bounded by `max-size: 50m × max-file: 3` |
| Backups (LOCAL workspace) | < 1 GB | Streamed straight to Drive, tiny on disk |

**Rule of thumb**: 40 GB minimum, 80-160 GB for breathing room.

NVMe vs SATA SSD: cron backups + Postgres are I/O-light, so SATA SSD is
fine. NVMe is a nice-to-have, not a must.

## 4. Network — IPv4 + decent transit

- **IPv4 public** — non-negotiable. Cloudflare needs it for proxy.
  IPv6-only VPS won't work for your customer DNS.
- **Bandwidth** — anything above 1 TB/month transfer is plenty. The
  app itself moves small JSON; the heavy lift is image responses from
  vendors which are proxied (small).
- **Latency to your customers** — pick a region close to them. For VN
  audience: Singapore, Hong Kong, or VN datacenters.

## 5. Other must-haves

- **OS**: Ubuntu 22.04 LTS or 24.04 LTS. (Debian 12 also fine.)
  Avoid CentOS Stream — fewer Docker tutorials match.
- **Root / sudo access**: required (Docker daemon + nginx config).
- **Persistent storage**: not "container service" / "FaaS" tiers.
  You need a regular VPS with a disk.
- **Reboots OK**: most providers reboot occasionally for kernel
  patches. Our stack survives with `restart: unless-stopped`.

## 6. Tiered recommendations

### Tier S — Solo / dev / staging

Run the stack at home or on a $5-7 VPS.

| Spec | Value |
|---|---|
| vCPU | 2 |
| RAM | 4 GB |
| Disk | 40 GB SSD |
| Bandwidth | 1 TB/month |
| Concurrent VNC profiles | 1-3 |
| Customers it handles | 1-5 |
| Price | ~$5-10/month |

**Picks**: Hetzner CX22 (€4.51), Vultr Cloud Compute 2GB ($12), Linode
Nanode 1GB ($5), Contabo VPS S ($6).

### Tier M — Small prod (your current size)

What `192.168.1.16` looks like today, comfortably.

| Spec | Value |
|---|---|
| vCPU | 4 |
| RAM | 8 GB |
| Disk | 80-120 GB SSD |
| Bandwidth | 5 TB/month |
| Concurrent VNC profiles | 5-10 |
| Customers it handles | 5-50 |
| Price | ~$20-40/month |

**Picks**: Hetzner CX42 (€8.32 — best value), Vultr High Frequency 8GB
($48 — pricier but VN-close), DigitalOcean Premium AMD 8GB ($48),
Linode Dedicated 8GB ($72), Contabo VPS M ($9 — cheap but variable).

### Tier L — Growing prod (10+ paying customers)

When `Tier M` starts hitting RAM ceiling during peak hours.

| Spec | Value |
|---|---|
| vCPU | 8 |
| RAM | 16 GB |
| Disk | 160 GB SSD |
| Bandwidth | 10 TB/month |
| Concurrent VNC profiles | 10-25 |
| Customers it handles | 50-200 |
| Price | ~$60-120/month |

**Picks**: Hetzner CX52 (€16.20), DO Premium Intel 16GB ($96), Vultr
High Frequency 16GB ($96), AWS Lightsail 16GB ($80).

### Tier XL — Multi-server (post-product-market-fit)

At this point, stop scaling the single VPS. Move to:

- **Managed Postgres** (DigitalOcean / AWS RDS / Supabase) — $30-100/mo,
  removes the biggest single-point-of-failure.
- **App server** stays a VPS (8-16 GB).
- **Redis** also managed if you can swing it.
- **Object storage** for `storage_data` instead of local volume (S3/R2).
- Backup pipeline already supports this — just point at managed
  Postgres endpoint instead of the container.

This is where Tier 2 standby (warm replica) and load balancing start
mattering — see [HIGH-AVAILABILITY.md](./HIGH-AVAILABILITY.md).

## 7. Providers — opinions

| Provider | Pros | Cons | When to pick |
|---|---|---|---|
| **Hetzner** | Cheapest by a mile, fast network, simple panel | Datacenter in EU (slower for VN) | Best value globally |
| **Vultr High Frequency** | SG datacenter (low VN latency), fast NVMe | More expensive | VN customers, latency-sensitive |
| **DigitalOcean** | Polished UI, great docs, $200 trial credit | Pricier than Hetzner | If you want hand-holding |
| **Linode (Akamai)** | Same league as DO, good network | Pricey | Same use case as DO |
| **Contabo** | 2-3× cheaper than DO at same specs | Variable performance, slower support | Dev/staging, not prod |
| **AWS Lightsail** | Same hardware as EC2 but flat-rate, easy | Bandwidth charged after limit | If you're already in AWS |
| **VPSPanel / VinaHost / Mat Bao** | VN datacenters, VN payment methods | Smaller providers, fewer regions | VN-only customers, want VND billing |

For this project at its current size (Tier M), my call: **Hetzner CX42
+ Cloudflare in front** is the best price/performance — €8.32/month
for 8 GB / 4 vCPU / 80 GB NVMe + 20 TB traffic. Cloudflare proxy
handles the VN-latency problem since CF has VN edge nodes.

## 8. Before you buy — checklist

- [ ] OS: Ubuntu 22.04+ available (not CentOS-only)
- [ ] Root SSH access in the panel (some "managed" tiers lock you out)
- [ ] IPv4 public IP included (separate add-on at some shops)
- [ ] Docker / KVM virtualization (avoid OpenVZ — it limits cgroups,
      Docker can misbehave)
- [ ] 1 TB+ outbound bandwidth (you'll never hit this, but cheap shops
      throttle hard above their cap)
- [ ] Snapshots / image backups in the panel (extra insurance — your
      backup pipeline is the real DR, this is just speed-of-rollback)
- [ ] Reasonable SLA (99.9% uptime is the marketing claim; what matters
      is the refund policy if they miss it)
- [ ] Same region as your customers — for VN, pick **Singapore** or
      **Hong Kong** if no VN-local option

## 9. After you buy

1. Read [SERVER-MIGRATION.md](./SERVER-MIGRATION.md) "Express path"
   section — if you've already got the backup pipeline running on the
   old box, the new one is restorable in ~1 hour.
2. Set up the Tier 1 backup as section 1 of
   [HIGH-AVAILABILITY.md](./HIGH-AVAILABILITY.md) — do this BEFORE
   pointing real customers at the new server.
3. Lock down SSH: key-only login, disable root login, fail2ban on.
   [SERVER-MIGRATION.md](./SERVER-MIGRATION.md) section 1.3 has the
   exact `sshd_config` snippet.
