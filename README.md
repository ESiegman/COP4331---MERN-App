# COP4331 MERN App

MongoDB (Atlas Local) · Express · React (Vite) · Node.js. Runs in Docker locally and on the droplet at **https://mern.esiegman.dev**.

```
db/       one-shot setup container (db/setup.js), runs before the API on every start/deploy
server/   Express API  (src/routes, src/middleware, src/models)
client/   React SPA + Caddyfile (prod image = Caddy serving the build, proxying /api, HTTPS)
compose.yaml        local dev stack
compose.prod.yaml   production stack (copied to the droplet by CI)
deploy/             one-time droplet bootstrap
```

```
browser ──▶ web (Caddy :443) ──/api/*──▶ api (Express :5000) ──▶ mongodb (Atlas Local)
                 └── everything else: React build                    ▲
                                                 db-setup (runs on each deploy)
```

## Local development

Requires Docker Desktop.

```sh
docker compose up --build
```

| What | Where |
| --- | --- |
| React (hot reload) | http://localhost:5173 |
| API (restarts on save) | http://localhost:5000/api/health |
| MongoDB (Compass / mongosh) | `mongodb://root:devpassword@localhost:27017/?directConnection=true` |

`server/` and `client/` are bind-mounted, so edits apply immediately. After changing dependencies, run `docker compose up --build`. To wipe the database, run `docker compose down -v`.

**Running Node natively instead.** Run only the database in Docker:

```sh
docker compose up -d mongodb db-setup
cp server/.env.example server/.env
(cd server && npm install && npm run dev)
(cd client && npm install && npm run dev)   # proxies /api to localhost:5000
```

**Tests:** `cd server && npm test`

### What the infrastructure expects from the code

The source files are empty stubs. The Docker and CI setup assumes the following once they're written:

- **`db/setup.js`** connects with `MONGO_ROOT_URI`, creates the user `MONGO_APP_USER`/`MONGO_APP_PASSWORD` with `readWrite` on `MONGO_APP_DB`, and exits 0. Write it so it's safe to run every time. The API's `MONGODB_URI` logs in as that user, so the API can't reach the database until this exists.
- **`server/src/index.js`** reads `MONGODB_URI` and `PORT` (5000) and serves everything under `/api`.
- **`GET /api/health`** returns 200 when the API is up. Both the container healthcheck and the post-deploy smoke test call it.
- **`client/vite.config.js`** proxies `/api` to `process.env.API_PROXY_TARGET ?? 'http://localhost:5000'`, so dev matches production, where Caddy does the proxying.
- **`client/index.html`** is the Vite entry, and `npm run build` outputs to `dist/`.

## Deployment

On every push to `main`, GitHub Actions:

1. Detects which of `db/`, `server/`, `client/` and `compose.prod.yaml` changed.
2. Runs the API tests and the client build for the parts that changed (these also run on PRs).
3. Builds and pushes only the changed images to GHCR: `ghcr.io/esiegman/mern-{db,api,web}`, tagged `latest` plus the commit SHA.
4. Over SSH, copies `compose.prod.yaml`, pulls the images and runs `docker compose up -d`. Only the containers whose image changed restart. `db-setup` reruns on each deploy.
5. Smoke tests `https://mern.esiegman.dev/api/health`.

To redeploy everything by hand, use **Actions → CI/CD → Run workflow**.

### One-time droplet setup

1. **DNS:** add an `A` record from `mern.esiegman.dev` to the droplet's IP. If you use Cloudflare's proxy, set SSL mode to *Full (strict)*. Caddy gets the Let's Encrypt certificate itself.
2. **Deploy key** (on your machine):
   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/mern_deploy -C github-actions-deploy -N ""
   ```
3. **Bootstrap.** This installs Docker, adds 2 GB swap, creates the `deploy` user, enables ufw (22/80/443), and creates `/opt/mern/.env` with random DB passwords:
   ```sh
   scp deploy/bootstrap-droplet.sh root@mern.esiegman.dev:
   ssh root@mern.esiegman.dev "bash bootstrap-droplet.sh '$(cat ~/.ssh/mern_deploy.pub)'"
   ```
4. **GitHub secrets.** Under repo **Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   | --- | --- |
   | `DEPLOY_HOST` | `mern.esiegman.dev` (or the droplet IP) |
   | `DEPLOY_USER` | `deploy` |
   | `DEPLOY_SSH_KEY` | contents of `~/.ssh/mern_deploy` (private key) |
   | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan mern.esiegman.dev` |

5. Push to `main`.

A 2 GB droplet or larger is recommended. Atlas Local runs both `mongod` and `mongot` (the search engine).

### Operating the droplet

```sh
ssh deploy@mern.esiegman.dev
cd /opt/mern
docker compose ps
docker compose logs -f api
```

**Connect Compass to production** through an SSH tunnel. Mongo listens only on the droplet's loopback.

```sh
ssh -N -L 27018:127.0.0.1:27017 deploy@mern.esiegman.dev
# then: mongodb://root:<MONGO_ROOT_PASSWORD from /opt/mern/.env>@localhost:27018/?directConnection=true
```

**Roll back** one component on the droplet:

```sh
IMAGE_TAG=<sha> docker compose up -d --no-deps api
```

Use a commit where that component was actually built. You can find these as tags on its GHCR package page.

**Move to a hosted Atlas cluster later:** point `MONGODB_URI` and `MONGO_ROOT_URI` at the `mongodb+srv://` string. Then remove the `mongodb` service and the `depends_on` that waits for it.
