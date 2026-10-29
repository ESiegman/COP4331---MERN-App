# COP4331 MERN App

MongoDB, Express, React, and Node, running in Docker. Production is at https://mern.esiegman.dev.

## Project layout

- `client/` - React app (Vite). In production it's served by Caddy, which also proxies `/api` to the server and handles HTTPS.
- `server/` - Express API.
- `db/` - `setup.js` creates the app's database user. It runs before the API starts, on every deploy.
- `compose.yaml` - local dev.
- `compose.prod.yaml` - production, copied to the droplet by the deploy workflow.
- `deploy/bootstrap-droplet.sh` - one-time droplet setup.

The database is MongoDB Atlas Local (`mongodb/mongodb-atlas-local`), MongoDB's Docker image of Atlas.

## Local development

With Docker Desktop running:

```sh
docker compose up --build
```

- React: http://localhost:5173
- API: http://localhost:5000/api/health
- MongoDB: `mongodb://root:devpassword@localhost:27017/?directConnection=true`

`client/` and `server/` are mounted into the containers, so changes show up without rebuilding. Rebuild with `docker compose up --build` after adding dependencies. `docker compose down -v` wipes the database.

To run Node directly instead and only use Docker for the database:

```sh
docker compose up -d mongodb db-setup
cp server/.env.example server/.env
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

Run the server tests with `cd server && npm test`.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`:

1. Checks which of `db/`, `server/`, and `client/` changed.
2. Runs the server tests and the client build. Pull requests stop here.
3. Builds the changed images and pushes them to `ghcr.io/esiegman/mern-db`, `mern-api`, and `mern-web`.
4. SSHes into the droplet, pulls the new images, and runs `docker compose up -d`. Only changed containers restart.
5. Checks that https://mern.esiegman.dev/api/health responds.

You can also redeploy everything from the Actions tab with "Run workflow".

### Droplet setup

This only has to be done once.

1. Point an A record for `mern.esiegman.dev` at the droplet's IP.
2. Make a deploy key:
   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/mern_deploy -C github-actions-deploy -N ""
   ```
3. Run the bootstrap script as root. It installs Docker, adds swap, creates a `deploy` user, opens ports 22, 80, and 443, and generates `/opt/mern/.env` with random database passwords.
   ```sh
   scp deploy/bootstrap-droplet.sh root@mern.esiegman.dev:
   ssh root@mern.esiegman.dev "bash bootstrap-droplet.sh '$(cat ~/.ssh/mern_deploy.pub)'"
   ```
4. Add these repository secrets in Settings > Secrets and variables > Actions:

   | Secret | Value |
   | --- | --- |
   | `DEPLOY_HOST` | `mern.esiegman.dev` |
   | `DEPLOY_USER` | `deploy` |
   | `DEPLOY_SSH_KEY` | contents of `~/.ssh/mern_deploy` |
   | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan mern.esiegman.dev` |

Atlas Local needs a fair amount of memory, so use a droplet with at least 2 GB.

### On the droplet

```sh
ssh deploy@mern.esiegman.dev
cd /opt/mern
docker compose ps
docker compose logs -f api
```

MongoDB only listens on the droplet itself. To open it in Compass, tunnel in over SSH first:

```sh
ssh -N -L 27018:127.0.0.1:27017 deploy@mern.esiegman.dev
```

Then connect to `mongodb://root:<MONGO_ROOT_PASSWORD>@localhost:27018/?directConnection=true`, using the password from `/opt/mern/.env`.

To roll back a service, use an image tag from a commit where that service was built:

```sh
IMAGE_TAG=<commit sha> docker compose up -d --no-deps api
```
