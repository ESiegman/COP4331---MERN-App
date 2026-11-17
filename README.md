# COP4331 MERN App

A tier list app: make a template of things to rank, rank them from S to F, share your list, and see how everyone else ranked the same thing. MongoDB, Express, React, and Node, running in Docker. Production is at https://mern.esiegman.dev.

## Project layout

- `client/` - React app (Vite). In production it's served by Caddy, which also proxies `/api` to the server and handles HTTPS.
- `server/` - Express API. See [server/README.md](server/README.md) for how it is built and every endpoint.
- `db/` - `setup.js` creates the app's database user, its collections, and their validation rules and indexes. It runs before the API starts, on every deploy. See [db/README.md](db/README.md) for changing collections.
- `compose.yaml` - local dev.
- `compose.prod.yaml` - production, copied to the droplet by the deploy workflow.
- `deploy/bootstrap-droplet.sh` - one-time droplet setup.

The database is MongoDB Atlas Local (`mongodb/mongodb-atlas-local`), MongoDB's Docker image of Atlas.

## How it fits together

```mermaid
flowchart LR
    B[Browser] -- HTTPS --> W

    subgraph Droplet["Droplet: mern.esiegman.dev"]
        W["web (Caddy)<br/>ports 80, 443"]
        API["api (Express)<br/>port 5001"]
        M[("mongodb<br/>Atlas Local")]
        S["db-setup<br/>runs on each deploy"]

        W -- "/api/*" --> API
        W -- "everything else" --> R[React build]
        API -- Mongoose --> M
        S -- "creates user, collections, indexes" --> M
    end
```

The browser only talks to Caddy. Caddy serves the React build and forwards anything under `/api` to Express, which is the only thing that talks to MongoDB. In local dev, the Vite dev server does Caddy's job of forwarding `/api`.

## Local development

With Docker Desktop running:

```sh
docker compose up --build
```

- React: http://localhost:5173
- API: http://localhost:5001/api/health
- MongoDB: `mongodb://root:devpassword@localhost:27017/?directConnection=true`

`client/` and `server/` are mounted into the containers, so changes show up without rebuilding. After adding dependencies, run `docker compose up --build -V`. `docker compose down -v` wipes the database.

To run Node directly instead and only use Docker for the database:

```sh
docker compose up -d mongodb db-setup
cp server/.env.example server/.env
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

Run the server tests with `cd server && npm test`. The tests that need a database are skipped unless `MONGODB_URI` is set; [server/README.md](server/README.md#tests) shows how to run them against the dev stack.

Unless `SMTP_URL` is set, no email is sent. When you register locally, the verification link is written to the API log instead:

```sh
docker compose logs api
```

To fill the database with sample accounts, templates, rankings, likes and comments to try things with (password `tierlist-dev` for every account):

```sh
docker compose run --rm --build db-setup node seed.js
```

[db/README.md](db/README.md#sample-data) explains what it adds and how to take it out again.

## API

All requests and responses are JSON. See [server/README.md](server/README.md) for the full reference, with request and response examples for each endpoint.

| Area | Under | What it covers |
| --- | --- | --- |
| Auth | `/api/auth` | Register, verify email, log in (also with Google or Discord), reset password |
| Users | `/api/users` | Your account, notification settings and linked Google or Discord accounts, public profiles |
| Templates | `/api/templates` | The things to rank and their items, search, the community ranking |
| Rankings | `/api/rankings` | A person's tier list for a template, the feed, likes |
| Comments | `/api/rankings/:rankingId/comments`, `/api/comments` | Comments on a ranking |
| Notifications | `/api/notifications` | Who ranked, liked or commented on your content |
| Health | `/api/health` | Health check |

Browsing, searching and viewing public templates and rankings needs no account. Everything else needs the token from logging in, sent as `Authorization: Bearer <token>`. A new account has to verify its email before it can log in.

Image uploads are not built yet. The Status section of [server/README.md](server/README.md#status) covers that, along with the settings that email, push, AI suggestions and Google and Discord login need.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`:

1. Checks which of `db/`, `server/`, and `client/` changed.
2. Runs the server tests and the client build. Pull requests stop here.
3. Builds the changed images and pushes them to `ghcr.io/esiegman/mern-db`, `mern-api`, and `mern-web`.
4. SSHes into the droplet, copies the API source to `/opt/mern/server`, pulls the new images, and runs `docker compose up -d`. Only changed containers restart.
5. Checks that https://mern.esiegman.dev/api/health responds.

```mermaid
flowchart TD
    P[Push to main] --> C[Detect changed folders]
    C --> T[Server tests and client build]
    T -- pull request --> Stop[Stop]
    T -- push to main --> Bd[Build changed images]
    Bd --> G[(GitHub Container Registry)]
    G --> D[SSH to droplet]
    D --> U[Copy compose file and API source]
    U --> Up[docker compose pull and up -d]
    Up --> H{"/api/health returns 200?"}
    H -- yes --> OK[Done]
    H -- no --> F[Fail and print container logs]
```

You can also redeploy everything from the Actions tab with "Run workflow".

### Droplet setup

This only has to be done once.

1. Point an A record for `mern.esiegman.dev` at the droplet's IP.
2. Make a deploy key:
   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/mern_deploy -C github-actions-deploy -N ""
   ```
3. Run the bootstrap script as root. It installs Docker, adds swap, creates a `deploy` user, opens ports 22, 80, and 443, and generates `/opt/mern/.env` with random database passwords and a `JWT_SECRET`.
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
5. So the site can send verification and password reset emails, add your email provider's SMTP details to `/opt/mern/.env`, then restart the API:
   ```sh
   SMTP_URL=smtps://USER:PASSWORD@smtp.example.com:465
   EMAIL_FROM=Tier List <no-reply@esiegman.dev>
   ```
   ```sh
   cd /opt/mern && docker compose up -d api
   ```
   Most providers only send from a domain you have verified with them, which means adding the DNS records they give you.

Atlas Local needs a fair amount of memory, so use a droplet with at least 2 GB.

### On the droplet

```sh
ssh deploy@mern.esiegman.dev
cd /opt/mern
docker compose ps
docker compose logs -f api
```

The API source is at `/opt/mern/server` (for example `vi /opt/mern/server/src/modules/auth/auth.service.js`). It's a copy updated on every deploy; the running container uses the image built from the same commit.

MongoDB only listens on the droplet itself. To open it in Compass, tunnel in over SSH first:

```sh
ssh -N -L 27018:127.0.0.1:27017 deploy@mern.esiegman.dev
```

Then connect to `mongodb://root:<MONGO_ROOT_PASSWORD>@localhost:27018/?directConnection=true`, using the password from `/opt/mern/.env`.

To roll back a service, use an image tag from a commit where that service was built:

```sh
IMAGE_TAG=<commit sha> docker compose up -d --no-deps api
```
