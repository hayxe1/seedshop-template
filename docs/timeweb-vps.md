# Production on a Timeweb VPS

The production layout is deliberately small: Caddy terminates HTTPS, the
standalone Next.js container serves the application, and PostgreSQL stores
catalog, orders, stock, and uploaded product images. This is suitable for the
Voronezh pilot and can be split into managed services later.

## 1. Prepare DNS and the server

Create an `A` record for the production domain that points to the VPS public
IPv4 address. On Ubuntu 24.04, install Docker Engine with the Compose plugin
from Docker's official repository, plus curl and `flock` (provided by
`util-linux`). Git is not required on the production host.

Choose a VPS data centre in Russia before real customer data is collected and
confirm the current personal-data localisation requirements with the seller's
legal adviser.

Allow SSH, HTTP, and HTTPS only:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Port `3000` is bound to `127.0.0.1` and must not be opened publicly. PostgreSQL
has no published host port.

Create `/opt/seedshop-template` and install only the versioned operational files:
`docker-compose.yml`, `deploy/Caddyfile`, and the scripts under `deploy/`.
Application source is built by GitHub Actions and is not updated on the VPS.

```bash
sudo mkdir -p /opt/seedshop-template
sudo chown root:root /opt/seedshop-template
sudo chmod 755 /opt/seedshop-template
```

## 2. Configure secrets

Copy `docker.env.example` to `.env.production`, replace every placeholder,
and restrict access:

```bash
cp docker.env.example .env.production
chmod 600 .env.production
```

Generate independent secrets rather than reusing passwords:

```bash
openssl rand -base64 48
```

Set `DOMAIN`, `SITE_URL`, and `NEXT_PUBLIC_SITE_URL` to the final HTTPS domain.
The application sends `https://<domain>/payment/result` as the payment return
URL. Configure the webhook `https://<domain>/api/yookassa/webhook` in YooKassa.
Leave optional mail, Telegram, analytics, and `RCLONE_REMOTE` values empty
until those integrations are intentionally enabled.

Never commit `.env.production`. Rotate a secret immediately if it appears in
logs, screenshots, Git history, or chat.

## 3. Releases through GitHub Actions

Pull requests and pushes to `main` run `.github/workflows/ci.yml` against an
isolated PostgreSQL service. A successful `push` CI on `main` also publishes an
immutable `linux/amd64` image to the private GHCR package
`ghcr.io/CLIENT/seedshop-template` and records its digest as a workflow artifact.

When that CI run completes successfully, `.github/workflows/production.yml`
starts automatically, verifies the exact triggering run and current `main`
revision, downloads its digest artifact, and invokes the restricted SSH gateway.
Superseded revisions and failed CI runs are never deployed. The workflow token
is sent over SSH only for the duration of `docker pull`; it is not persisted on
the server. The manual `Production` action is retained only for `rollback`.

The forced SSH key must use the following `authorized_keys` restrictions:

```text
restrict,command="/bin/sh /opt/seedshop-template/deploy/github-actions-gateway.sh" ssh-ed25519 <public-key> seedshop-template-github-actions
```

`deploy/release-vps.sh` serializes releases with `flock`, creates a fresh
PostgreSQL backup, applies Prisma migrations through the web entrypoint,
recreates only `web`, and waits for both container health and the public
readiness endpoint. If verification fails, it restores the previous image.
Release state is stored root-only under `/var/lib/seedshop-template-release`.

Caddy obtains and renews the TLS certificate automatically. Verify:

```bash
curl --fail https://<domain>/api/health
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 web caddy
```

The workflow requires repository secret `PROD_DEPLOY_SSH_KEY` and variables
`PROD_HOST`, `PROD_SSH_KNOWN_HOSTS`, and optional
`NEXT_PUBLIC_YANDEX_METRICA_ID`. Keep `.env.production` and all commerce
credentials only on the VPS. A Compose or gateway change is an explicit
infrastructure maintenance operation; ordinary application releases update
only the prebuilt image.

## 4. Commerce maintenance timer

Reservation expiry, outbox delivery, and rate-limit cleanup are handled by the
protected commerce endpoint. Install its five-minute systemd timer:

```bash
sudo cp deploy/systemd/seedshop-template-commerce.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now seedshop-template-commerce.timer
sudo systemctl start seedshop-template-commerce.service
sudo systemctl status seedshop-template-commerce.timer
```

Inspect a failed run with:

```bash
journalctl -u seedshop-template-commerce.service -n 100 --no-pager
```

## 5. Backups and restore drill

The daily timer creates a compressed custom-format PostgreSQL dump, a SHA-256
checksum, keeps local copies for `BACKUP_RETENTION_DAYS`, and optionally copies
both files to `RCLONE_REMOTE`:

```bash
sudo mkdir -p /var/backups/seedshop-template
sudo chown "$USER":"$USER" /var/backups/seedshop-template
sudo cp deploy/systemd/seedshop-template-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now seedshop-template-backup.timer
sudo systemctl start seedshop-template-backup.service
ls -lh /var/backups/seedshop-template
```

For production, configure an encrypted off-server rclone destination or a
Timeweb backup policy. A backup stored only on the same VPS is not sufficient.
Uploaded catalog images currently live in PostgreSQL, so database dumps include
them and will grow with the media library.

Test restore on a separate staging VPS before launch and after material schema
changes. Restoring the production database is destructive and therefore
requires an explicit phrase:

```bash
CONFIRM_RESTORE=RESTORE_SEEDSHOP_TEMPLATE \
  sh deploy/restore-postgres.sh /absolute/path/to/seedshop-template-YYYYMMDDTHHMMSSZ.dump
```

The restore script stops the web container during replacement and starts it
again afterward. Verify `/api/health`, admin access, catalog images, stock, and
a non-payment test order after every drill.

## 6. Operations checklist

- Watch disk usage for Docker layers, PostgreSQL, Caddy logs, and backups.
- Install Timeweb monitoring for HTTPS availability and low disk space.
- Review `docker compose logs` after each release.
- Keep the OS and Docker patched; reboot during a planned maintenance window.
- Export a fresh backup before risky catalog imports or schema migrations.
- Keep the exact pickup location out of public pages; send it after order
  confirmation.
- Do not treat the readiness endpoint as full business monitoring: also test
  catalog, checkout, YooKassa webhook delivery, and the admin order queue.
