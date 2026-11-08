# Deploy on Oracle Cloud Always Free VM

Runs the full stack (Postgres, Flask APIs, workers, Next.js) behind **Caddy** with automatic HTTPS.

## 1. Create the free VM

1. Sign in to [Oracle Cloud](https://cloud.oracle.com/).
2. **Compute → Instances → Create instance**.
3. Recommended Always Free shape:
   - Image: **Canonical Ubuntu 22.04 or 24.04**
   - Shape: **VM.Standard.A1.Flex** (Ampere), e.g. **2 OCPU / 12 GB RAM**  
     (or an Always Free AMD micro if Ampere quota is unavailable)
4. Add an SSH key you control.
5. Create the instance and note the **public IP**.

## 2. Open ports in OCI (required)

In the instance VCN → **Security List** (or NSG attached to the VNIC), allow ingress:

| Port | Protocol | Source |
|------|----------|--------|
| 22 | TCP | your IP (or `0.0.0.0/0` if you accept the risk) |
| 80 | TCP | `0.0.0.0/0` |
| 443 | TCP | `0.0.0.0/0` |
| 443 | UDP | `0.0.0.0/0` (HTTP/3) |

Without these rules, HTTPS will not work even if the host firewall is open.

## 3. Point DNS at the VM

Create an **A** record (and **AAAA** if you use IPv6) for your domain → the VM public IP.  
Wait until DNS resolves before the first deploy so Caddy can issue a Let’s Encrypt certificate.

## 4. Bootstrap the VM

```bash
ssh ubuntu@YOUR_PUBLIC_IP

# clone your repo (example)
git clone YOUR_REPO_URL ~/qrs-booking
cd ~/qrs-booking

bash deploy/scripts/bootstrap-oracle.sh
# then: logout/login  OR  newgrp docker
```

## 5. Configure secrets

```bash
cp deploy/.env.prod.example deploy/.env.prod
nano deploy/.env.prod   # set DOMAIN, ACME_EMAIL, passwords, salts, …
```

Required fields are validated by `deploy.sh` (no placeholder `CHANGE_ME*` values).

## 6. Deploy

```bash
bash deploy/scripts/deploy.sh
```

Then open:

- `https://YOUR_DOMAIN`
- `https://YOUR_DOMAIN/admin`

## Day-2 commands

```bash
# Update after git changes
bash deploy/scripts/update.sh

# Logs
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs -f

# Stop
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod down
```

## What this pack changes vs local compose

| Local `docker-compose.yml` | Production (`deploy/`) |
|----------------------------|-------------------------|
| Publishes 3000 / 8000 / 8001 / 5433 / 8088 | Only **80/443** via Caddy |
| Adminer included | Adminer **removed** |
| Default DB/admin passwords | Required strong secrets from `.env.prod` |
| HTTP localhost URLs | HTTPS via Let’s Encrypt |

## Notes

- **Ampere (ARM)** images for Postgres / Python / Node / Caddy are multi-arch; no special tags needed.
- DB init SQL runs only on the **first** empty Postgres volume. Changing `IIKO_API_LOGIN` / org IDs later does not re-seed automatically.
- iiko auth needs **`IIKO_APP_ID` + `IIKO_CLIENT_SECRET`** (developer portal) plus the organization API key in `IIKO_API_LOGIN` / DB.
- If Postgres ever failed with `03_historical_data.sql: Is a directory`, remove that path on the host (`rm -rf sql/03_historical_data.sql`) before a fresh volume init.
- Keep `deploy/.env.prod` only on the server; it is gitignored.
- Free-tier quotas and account verification are controlled by Oracle; if create-instance fails, check Always Free capacity in your home region.

## Moving the database to Supabase

The Supabase project already holds the QRS platform tables in `public`
(`restaurants`, `restaurant_reservations`, …). The booking app goes into its own
schema **`booking`**; nothing in `public` is read or changed.

1. Take the **Session pooler** connection string (port **5432**). Not the
   transaction pooler (6543): reservation locking needs session advisory locks.
2. Copy the data (app services are stopped during the copy, Postgres keeps running):

   ```bash
   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
     bash deploy/scripts/migrate-to-supabase.sh
   ```

   It backs up the local DB to `deploy/backups/`, copies tables → rows →
   constraints into `booking`, applies migrations and compares row counts table
   by table; on a mismatch it stops and tells you not to switch.
3. In `deploy/.env.prod` set `DATABASE_URL` (same string), `DB_SSLMODE=require`,
   `DB_SCHEMA=booking`, then `bash deploy/scripts/update.sh`.
4. Check what the app is connected to (`schema=booking`, `ssl=True`, row counts):

   ```bash
   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec admin-app python db_check.py
   ```

Supabase is in eu-west-1 (Ireland): every query costs a network round trip, so
a VM in a nearby region keeps the booking form fast.

## Importing reserves from iiko

Needs `IIKO_APP_ID` / `IIKO_CLIENT_SECRET`. Writes into whatever database the app uses (Supabase after step 3):

```bash
C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod"
$C exec iiko-sync python import_iiko_reserves.py --from 2026-07-01 --to 2027-01-01 --dry-run
$C exec iiko-sync python import_iiko_reserves.py --from 2026-07-01 --to 2027-01-01
```
