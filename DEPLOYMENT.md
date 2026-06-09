# Self-Hosted Deployment Notes (pyedit.oinf.ch)

This document describes how this checkout differs from the upstream Trinket
repository, why each change was made, how to reproduce the setup from a clean
clone, and how to back the service up.

The guiding constraint for this deployment: **everything reproducible lives in
`docker-compose.yml`, `serverside/docker-compose.yml`,
`serverside/nginx/nginx.conf`, `config/local.yaml` and `.env`** — no manual
one-off commands (e.g. creating DB users) are required to stand the stack back
up.

## 1. Architecture overview

```
                         ┌────────────┐
  Internet ── :80/:443 ──│  Traefik   │── TLS termination (Let's Encrypt)
                         └─────┬──────┘
                  trinket-oss_trinket (external bridge network)
            ┌──────────────────┼────────────────────────┐
            │                  │                         │
       ┌────▼────┐       ┌─────▼─────┐           ┌───────▼────────┐
       │ trinket │       │   redis   │           │ serverside     │
       │  (app)  │──────▶│ (sessions)│           │   nginx        │
       │         │       └───────────┘           │ (path router,  │
       │         │       ┌───────────┐           │ /python3*, /java*│
       │         │──────▶│  mongodb  │           │ /r*, /pygame*) │
       └─────────┘       └───────────┘           └───────┬────────┘
                                              serverside_default network
                            ┌──────────────┬──────────────┴───────────────┐
                       python3-manager  java-manager / r-manager     pygame-manager
                       +python3-shell   +java-shell / r-shell        +pygame-worker
                       (socket.io)      (socket.io)              (socket.io, Xvfb+VNC)
```

Two independent Compose projects are used, exactly as upstream intends:

- `docker-compose.yml` (project `trinket-oss`) — Traefik, the Trinket app,
  Redis, MongoDB.
- `serverside/docker-compose.yml` (project `serverside`) — the language
  back-ends (only the `pygame` profile is enabled here).

The `serverside` nginx container is additionally attached to the
`trinket-oss_trinket` network so the *same* Traefik instance can terminate TLS
and route `/pygame*` to it — no second reverse proxy or duplicate certificate
is needed.

## 2. Changes vs. upstream

### 2.1 `docker-compose.yml`

| Change | Why |
|---|---|
| Added a `traefik` service (Traefik v3, Docker provider, `web`/`websecure` entrypoints, HTTP→HTTPS redirect, Let's Encrypt via `tlschallenge`) | Upstream ships no reverse proxy / TLS config; this is what fronts `pyedit.oinf.ch` with HTTPS |
| `app`: removed published `3000:3000`, replaced with `expose: 3000`; added Traefik router labels (`Host(\`pyedit.oinf.ch\`)`, `websecure`, `letsencrypt` cert resolver) | The app should only be reachable through Traefik, not directly on a raw port |
| `app`: added `user: root` | The bind-mounted source tree is owned by `root` on the host; the image's default `trinket` user (uid 999) can't write to it, which broke `npm run build:css` |
| `app`: `NODE_ENV=development` → `NODE_ENV=production` | Production hardening |
| `app`, `redis`, `mongodb`, `traefik`: added `restart: unless-stopped` | Survive host reboots / crashes without manual intervention |
| `redis`: `image: redis:latest` → `redis:7-alpine`; removed published `16379:6379`, replaced with `expose: 6379`; added `command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]` | Pin to a known-good version, stop exposing the port to the host, and password-protect it — all purely config-driven via `.env`, no setup script needed |
| `mongodb`: removed published `17017:27017`, replaced with `expose: 27017` | Stop exposing the DB port to the host. **Note:** authentication was deliberately *not* added — `node-config`/the official Mongo image both require either a one-off `db.createUser()` script or a non-declarative bootstrap step, which violates the "config files only" constraint. Network exposure is removed instead, which is the practical mitigation when the port isn't reachable from outside Docker. |
| Added `letsencrypt` named volume | Persists ACME certificates/account across container recreation |

### 2.2 `serverside/docker-compose.yml`

| Change | Why |
|---|---|
| `nginx`: commented out `ports: 8080:80` | No longer reachable directly — only through the main Traefik instance |
| `nginx`: added to both `default` (talks to the managers/workers in this Compose project) and `trinket` (the **external** `trinket-oss_trinket` network, so the main Traefik can reach it) | Lets one Traefik instance route to two separate Compose projects |
| `nginx`: added one Traefik router per language (`serverside-pygame`, `serverside-python3`, `serverside-java`, `serverside-r`) plus a single shared `serverside` service (`loadbalancer.server.port=80`), `websecure`/`letsencrypt` | Routes each language's serverside traffic through the same HTTPS entrypoint/cert as the main app — see **"Routing rule design"** below for *why* the rule is shaped the way it is |
| `nginx`: added `traefik.docker.network=trinket-oss_trinket` label | **Required** — nginx sits on two Docker networks, and Traefik's Docker provider picks an arbitrary one when constructing the backend connection. Without this explicit label, Traefik intermittently chooses the *unreachable* `serverside_default` IP and every request times out with `504 Gateway Timeout`, even though a direct connection from Traefik to nginx succeeds when manually targeted. |
| `nginx`: added explicit `traefik.http.routers.<name>.service=serverside` to every router | **Required once a second language was added.** Traefik's Docker provider can only auto-link a router to a service when the container exposes exactly one service. With four routers defined on one container, Traefik logged `cannot be linked automatically with multiple Services` and never created any of them — `/health`/`/stats.json`/etc. silently fell through to the main app (404 "Page not found") instead of reaching nginx. Naming the shared service explicitly and pointing every router at it fixes this. |
| `nginx`, `pygame-worker`, `pygame-manager`, `python3-manager`, `java-manager`, `r-manager`: added `restart: unless-stopped` | Same reasoning as above |
| `pygame-worker`: enabled the (previously commented-out) production resource limits `mem_limit: 1g`, `mem_reservation: 750m`, `cpus: 2.0` | Per the README's own production recommendation for the heavier graphical/VNC workload — prevents one runaway session from starving the host |
| Declared the external `trinket` network (`name: trinket-oss_trinket`) at the bottom | Required for the cross-project network attachment above |

#### Routing rule design (and a pre-existing bug it fixes)

The *naive* rule — `Host(\`pyedit.oinf.ch\`) && PathPrefix(\`/pygame\`)` — is what
this project shipped with initially for pygame, and it is **wrong**: it
matches *every* path starting with `/pygame`, including the main Trinket
app's own routes for that language —`GET /pygame` (the language landing page)
and `GET /pygame/{shortCode}` (viewing/sharing a pygame trinket), generated by
the per-language route loop in `config/routes.js` for every entry in
`trinketLangs`.

Those requests were being hijacked by Traefik and hand to the serverside
nginx, which rewrites them to `/` and proxies to `pygame-manager` — a bare
Socket.IO server with **no HTTP handler for `/`** — so the request just hung
until timeout (`curl https://pyedit.oinf.ch/pygame/` → nothing, 10s+ timeout).
The pygame *IDE* itself worked (it only ever calls `/pygame/socket.io/...`),
which is why this stayed hidden until the landing/share pages were checked
directly.

The fix: match **only** the literal sub-paths the embed client, admin pages,
and noVNC actually call against the serverside backend (confirmed by grepping
`public/js/embed/server.js` and all four `serverside/*/manager/*.js` sources):

- `/<lang>/socket.io/*` — the *only* Socket.IO path the embed client uses (`server.js`: `socket_options.path = url.pathname + '/socket.io/'`)
- `/<lang>/stats.json` and `/<lang>/health` — the only two custom HTTP routes any manager exposes
- `/<lang>-vnc/*` — pygame noVNC only
- `/<lang>-generated/*` — generated static assets (images, etc.)

`shortCode`s are always lowercase hex (sha1-derived, 10–12 chars —
`lib/models/trinket.js:120`), so they can never literally equal `socket.io`,
`stats.json`, `health`, etc. — these rules can never collide with a real
trinket's share URL. Applying this same precise pattern to python3/java/r
when enabling them was therefore also the fix for the pre-existing pygame bug.

### 2.3 `serverside/nginx/nginx.conf`

| Change | Why |
|---|---|
| `/pygame/` location: `proxy_set_header X-Forwarded-Proto $scheme;` → `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;` | **Bug fix.** Traefik terminates TLS and correctly sends `X-Forwarded-Proto: https` to nginx, but nginx's *own* connection from Traefik is plain internal HTTP, so `$scheme` always evaluates to `http` — silently overwriting the correct value. `pygame-manager` reads this header to decide whether to hand the browser a `ws://` or `wss://` VNC URL (`pygame/manager/manager.js:134`); with the wrong value it returned `ws://`, and the browser (on an HTTPS page) refused to open an insecure WebSocket with `SecurityError: The operation is insecure`. Forwarding the header through unchanged fixes the VNC connection. |

### 2.4 `config/local.yaml` (gitignored — not in version control)

This file does not exist upstream (`config/local.example.yaml` is the
template). Key values set here, beyond the example template:

```yaml
app:
  hostname: 0.0.0.0
  siteName: 'oinf pyedit'
  url:
    protocol: https
    hostname: pyedit.oinf.ch
    port:                       # empty — Traefik serves on the standard HTTPS port
  plugins:
    session:
      cookieOptions:
        password: '<59-char random string>'
        domain: 'pyedit.oinf.ch'
        isSecure: yes
  embed:
    skulpt:
      local: true               # serve the bundled /components/skulpt instead of
                                # the (unconfigured/placeholder) CDN bucket
  serverside:
    pygame:
      api:
        default: 'https://pyedit.oinf.ch/pygame'
    python3:
      api:
        default: 'https://pyedit.oinf.ch/python3'
    java8:
      api:
        default: 'https://pyedit.oinf.ch/java'
    r3:
      api:
        default: 'https://pyedit.oinf.ch/r'

features:
  trinkets:
    pygame: true
    python3: true
    java: true
    R: true
```

Note the `serverside` keys are the *internal* backend identifiers from
`config.app.serverside.langmap` (`python3 → python3`, `java → java8`,
`R → r3`, `pygame → pygame`), not the `features.trinkets` flag names — easy to
get wrong, and a mismatch here silently leaves a language's API URL pointing
at the upstream default (`http://localhost:8080/...`).

Why each matters:
- `app.url` / `app.hostname` / cookie `domain` / `isSecure` — must match the
  public HTTPS URL Traefik exposes. A stale `http://…:3000` here caused
  post-login redirects to the wrong, unreachable URL, and a wrong/duplicate
  `app:` block here was the original cause of a session-cookie crash loop
  (`config` merges YAML by full top-level key replacement, so a second `app:`
  block silently dropped `password`/`url`/`hostname`).
- `embed.skulpt.local: true` — without it, the embed page loads Skulpt from
  `config.aws.buckets.cdn.host`, which defaults to the **literal placeholder**
  `https://your-cdn-bucket.example.com`. That 404s, so `Sk` never gets defined
  and "Run" silently does nothing.
- `serverside.<key>.api.default` / `features.trinkets.<flag>` — point the app
  at each language's public API URL and turn the feature on (all four are off
  by default upstream).

### 2.5 `.env` (gitignored — not in version control)

```
REDIS_PASSWORD=<random 32-char string>
```

Consumed by `docker-compose.yml` via `${REDIS_PASSWORD}` in the `redis`
service's `command:`.

### 2.6 `.gitignore`

Added a `.env` entry so the secret above is never committed.

## 3. Reproducing this setup from a clean clone

1. **Clone and configure the app**
   ```bash
   git clone <this repo> trinket-oss && cd trinket-oss
   cp config/local.example.yaml config/local.yaml
   ```
   Edit `config/local.yaml` to match section 2.4 above — in particular set
   your own `app.url`/`hostname`/cookie `domain`, generate a fresh
   `cookieOptions.password` (≥ 32 chars, e.g. `openssl rand -base64 48`), set
   `embed.skulpt.local: true`, and (if you want Pygame) the
   `serverside.pygame.api.default` URL plus `features.trinkets.pygame: true`.

2. **Create `.env`** in the repo root:
   ```bash
   echo "REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/')" > .env
   ```

3. **Update Traefik settings** in `docker-compose.yml` for your own domain —
   change the `acme.email` and the `Host(\`pyedit.oinf.ch\`)` rule on the
   `trinket` router to your hostname, and point your DNS `A`/`AAAA` record at
   the host before starting (the `tlschallenge` ACME validation needs port 80
   reachable from the internet).

4. **Bring up the main stack**
   ```bash
   docker compose up -d --build
   ```
   Traefik will obtain a Let's Encrypt certificate on first request to your
   domain. Watch `docker logs -f traefik` if it doesn't come up immediately.

5. **Bring up the serverside back-ends**
   ```bash
   cd serverside
   docker compose build
   docker compose --profile pygame --profile python3 --profile java --profile r up -d
   ```
   Update the `Host(...)` rules in the `nginx` service's Traefik labels and the
   `traefik.docker.network` label's network *name* if your main project
   directory isn't called `trinket-oss` (Compose derives the network name from
   the project/directory name — check with `docker network ls`).

   Omit any `--profile <lang>` you don't want to run. The nginx container (and
   its Traefik labels) always starts regardless — only the manager/shell pairs
   are gated behind profiles. If you add or remove profiles later, run
   `docker compose up -d` again with the new profile set; Compose will start or
   stop only the affected containers.

6. **Restart the app** to pick up the new `config/local.yaml` entries:
   ```bash
   cd ..   # back to trinket-oss root
   docker compose restart app
   ```

7. **Verify**
   ```bash
   for lang in pygame python3 java r; do
     curl -s "https://<your-domain>/$lang/health"
     echo " <- $lang"
   done
   # each should print {"status":"ok"} (R uses lowercase /r for its API URL)
   ```

## 4. Backup strategy

### 4.1 What needs backing up (stateful / hard to regenerate)

| What | Where | Why it matters |
|---|---|---|
| MongoDB data | named volume `trinket-oss_mongodb_data` | All user accounts, trinkets, courses — **the only truly irreplaceable data** |
| Secrets/config | `config/local.yaml`, `.env` | Not in git; needed to stand the stack back up with the same identity (cookie password, domain, Redis password) |
| Compose files | `docker-compose.yml`, `serverside/docker-compose.yml`, `serverside/nginx/nginx.conf` | Already in git — back up via your normal git remote/mirror |

### 4.2 What does *not* need backing up

- `node_modules`, `public_components` volumes — rebuildable via `npm install` /
  the image build.
- Redis data — purely session cache; losing it just logs everyone out.
- All `serverside_*-sessions` / `serverside_*-generated` volumes — ephemeral
  per-run user code/output, regenerated continuously.
- Let's Encrypt certs/account (`trinket-oss_letsencrypt`) — Traefik
  re-obtains these automatically on a fresh volume; not worth backing up.

### 4.3 Recommended approach

A simple daily cron-driven script using `mongodump` (consistent, logical
backup — safer than copying raw data files of a live DB) plus a tar of the
small config files:

The implementation lives at `/usr/local/bin/backup-trinket.sh` (see section
4.6 for the actual installed version) and runs nightly via cron, writing to
`/var/backups/trinket/<date>/`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT=/var/backups/trinket
DATE=$(date +%F)
DEST="$BACKUP_ROOT/$DATE"
mkdir -p "$DEST"

# 1. Logical Mongo dump (consistent snapshot, no downtime)
docker exec mongodb mongodump --archive --gzip --db=trinket \
  > "$DEST/mongo-trinket.archive.gz"

# 2. Secrets / config that aren't in git
tar czf "$DEST/config.tar.gz" -C /trinket-oss config/local.yaml .env

# 3. Prune backups older than 14 days
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
```

Run it via cron (e.g. `0 3 * * * /usr/local/bin/backup-trinket.sh`) and **ship
the result off-host** (rsync/rclone to remote storage) — a backup that lives
on the same disk as the service protects against nothing but accidental
`rm -rf`.

### 4.4 Restore procedure

```bash
# Mongo
gunzip -c mongo-trinket.archive.gz | docker exec -i mongodb mongorestore --archive --gzip --drop

# Config
tar xzf config.tar.gz -C /trinket-oss
```

(Let's Encrypt certificates need no restore step — Traefik will silently
re-request them from a fresh `letsencrypt` volume on next start.)

### 4.5 Restore drills

A backup that has never been restored is unverified. Periodically (e.g.
quarterly) restore the latest dump into a throwaway Compose project on a test
host and confirm you can log in and load a trinket — this is the only way to
catch silent corruption or format-drift before you actually need the backup.

### 4.6 Installed implementation

The script above is installed at `/usr/local/bin/backup-trinket.sh` (mode
`755`, owned by root) and scheduled via root's crontab:

```
0 3 * * * /usr/local/bin/backup-trinket.sh >> /var/log/trinket-backup.log 2>&1
```

It writes timestamped dumps to `/var/backups/trinket/<YYYY-MM-DD>/` and prunes
anything older than 14 days. **Off-host shipping (rsync/rclone) is not yet
configured** — that requires choosing and authenticating to a remote
destination, which is an operational decision for the user to make. Until
that's wired up, these backups only protect against logical corruption /
accidental data loss inside MongoDB, not a lost or destroyed host.

## 5. Disabling registration

Trinket's open-source codebase has **no built-in config flag** to turn off
new account creation — the only related mechanism is a Redis-backed
per-domain email blocklist (`lib/util/store/emailStore.js`, populated at
runtime, not via config files), which doesn't amount to a global on/off
switch. Implementing it in the app itself would mean patching tracked source
files (`lib/controllers/users.js` `create`, `lib/controllers/pages.js`
`signup`) — a local fork to maintain across upstream updates.

Instead, the prepared approach blocks registration at the **Traefik** layer —
purely declarative, lives in `docker-compose.yml` labels, requires no app
changes, and is trivially reversible. It is currently **commented out** in the
`app` service's labels (`docker-compose.yml`); uncomment those 8 lines and run
`docker compose up -d app` to activate it (no other service needs touching).

### How it works

Two pieces, both Traefik-native:

1. **A precise router** (`trinket-block-registration`) that matches *only* the
   three registration entry points and nothing else:
   - `GET /signup` — the sign-up page itself
   - `POST /users` — the web sign-up form submission
   - `POST /api/users` — the JSON API registration endpoint

   The rule deliberately combines `Method()` with `Path()` so that it does
   **not** also catch `DELETE /api/users` (self-service account *deletion* —
   `users.remove` — which lives at the same `/api/users` path but a different
   method) or any other `/api/users/...` sub-route (profile, assets, password
   change, etc.). It's given an explicit `priority=100` so it's evaluated
   before the catch-all `trinket` router (`Host(...)`only).

2. **A `redirectregex` middleware** (`block-registration`) attached to that
   router which redirects any matching request to the homepage
   (`https://pyedit.oinf.ch/`) with a `302`, before Traefik ever opens a
   connection to the app.

Both routers point at the same `trinket` service — the middleware short-
circuits the request, so the backend is never actually reached for these
paths.

### What this looks like to a visitor

- Visiting `/signup` → redirected straight to the homepage; the sign-up form
  never renders.
- Submitting the sign-up form or calling the registration API → receives a
  redirect instead of the expected JSON response, so the attempt fails (the
  frontend will show a generic error rather than a friendly "registration is
  closed" message — getting a nicer message would require standing up a small
  static page/service for Traefik's `errors` middleware to serve, which felt
  like overkill for a feature that's currently disabled).
- Existing users are completely unaffected: login, password reset, profile
  management, asset uploads, and **account deletion** all continue to work
  normally, since the rule is scoped tightly enough to avoid them.

### To enable

```bash
# uncomment the 8 "block-registration" / "trinket-block-registration" label
# lines in docker-compose.yml, then:
docker compose up -d app
curl -sk -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://pyedit.oinf.ch/signup
# expect: 302 -> https://pyedit.oinf.ch/
```

### To disable again

Re-comment the same lines and `docker compose up -d app` — the `trinket`
router (and the app behind it) is untouched either way.
