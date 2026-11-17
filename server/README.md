# API

Express API for the tier list app. Every route is under `/api`, and all request and response bodies are JSON.

- Production: `https://mern.esiegman.dev/api`
- Local: `http://localhost:5001/api`

## Status

43 of the 44 routes work. The other one is wired up, validated and guarded, but answers `501 Not Implemented` until someone picks a provider and writes the integration:

| Waiting on | Routes | Where the work goes |
| --- | --- | --- |
| Image storage | `POST /uploads/sign` | `integrations/storage.js` |

Email, push, AI suggestions and Google and Discord login work, each once its settings are in place:

- **Email** goes out through any SMTP server once `SMTP_URL` is set (see Configuration). Until it is set in `/opt/mern/.env`, production drops every email, so nobody new can verify an account there. In development without it, the email, link included, is written to the API log.
- **Push notifications** go through Expo's push service as soon as the app registers a phone with `POST /api/users/me/push-tokens`. No account or key is needed unless "enhanced push security" is turned on in Expo's dashboard, which needs `EXPO_ACCESS_TOKEN`. Phones Expo reports as uninstalled are dropped from the account.
- **AI item suggestions** use Claude through Anthropic's API once `ANTHROPIC_API_KEY` is set. Until then `POST /api/templates/suggest-items` answers `501`, which the web app shows as "not available yet".
- **Google and Discord login** need each provider's client id and secret (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`). A provider without them answers `501` and is left out of `GET /api/auth/oauth/providers`. See [Google and Discord](#google-and-discord).

## Endpoints

"Optional" means guests may call it and a token only personalizes the answer.

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | none | Create an account and email a verification link |
| POST | `/api/auth/verify-email` | none | Redeem the emailed link, get a token |
| POST | `/api/auth/resend-verification` | none | Email a new verification link |
| POST | `/api/auth/login` | none | Log in with email and password |
| POST | `/api/auth/forgot-password` | none | Email a password reset link |
| POST | `/api/auth/reset-password` | none | Redeem the reset link, set a new password |
| GET | `/api/auth/oauth/providers` | none | Which of Google and Discord login are set up, with what a client needs to start them |
| POST | `/api/auth/oauth/:provider` | none | Log in with Google or Discord, creating the account the first time |

### Users

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/users/me` | token | Get your account |
| PATCH | `/api/users/me` | token | Change your profile and notification switches |
| POST | `/api/users/me/push-tokens` | token | Register this phone for push notifications |
| DELETE | `/api/users/me/push-tokens` | token | Stop push notifications on this phone |
| POST | `/api/users/me/oauth/:provider` | token | Link a Google or Discord account |
| DELETE | `/api/users/me/oauth/:provider` | token | Unlink it |
| GET | `/api/users/:username` | none | Someone's public profile |
| GET | `/api/users/:username/templates` | optional | Their templates |
| GET | `/api/users/:username/rankings` | optional | Their rankings |

### Templates

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/templates` | none | Browse and search public templates |
| POST | `/api/templates` | token | Create a template with its starting items |
| POST | `/api/templates/suggest-items` | token | Ask AI for items to rank |
| GET | `/api/templates/:templateId` | optional | One template with its items |
| PATCH | `/api/templates/:templateId` | token, owner | Change a template |
| DELETE | `/api/templates/:templateId` | token, owner | Delete a template and everything on it |
| POST | `/api/templates/:templateId/items` | token, owner | Add an item |
| PATCH | `/api/templates/:templateId/items/:itemId` | token, owner | Rename an item or change its image |
| DELETE | `/api/templates/:templateId/items/:itemId` | token, owner | Remove an item |
| GET | `/api/templates/:templateId/rankings` | optional | Public rankings of this template |
| POST | `/api/templates/:templateId/rankings` | token | Start (or fetch) your ranking of this template |
| GET | `/api/templates/:templateId/community-ranking` | optional | Everyone's rankings averaged into one |

### Rankings

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/rankings` | none | Feed of public rankings |
| GET | `/api/rankings/:rankingId` | optional | One ranking with everything needed to draw it |
| PUT | `/api/rankings/:rankingId` | token, owner | Save the board, and optionally publish it |
| DELETE | `/api/rankings/:rankingId` | token, owner | Delete a ranking |
| PUT | `/api/rankings/:rankingId/like` | token | Like a ranking |
| DELETE | `/api/rankings/:rankingId/like` | token | Take the like back |

### Comments

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/rankings/:rankingId/comments` | optional | Comments on a ranking, oldest first |
| POST | `/api/rankings/:rankingId/comments` | token | Comment on a ranking |
| PATCH | `/api/comments/:commentId` | token, author | Edit your comment |
| DELETE | `/api/comments/:commentId` | token, author or ranking owner | Delete a comment |

### Notifications and the rest

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/notifications` | token | Your notifications, newest first |
| PATCH | `/api/notifications/:notificationId` | token | Mark one as read |
| POST | `/api/notifications/read-all` | token | Mark all as read |
| POST | `/api/uploads/sign` | token | Get a ticket for uploading an image (501) |
| GET | `/api/health` | none | Check the API is up |

## Code layout

```
src/
  server.js                   connects to MongoDB, starts listening, shuts down cleanly
  app.js                      Express app: security headers, logging, JSON, routes, error handlers
  routes.js                   mounts /health and every module under /api
  config/env.js               every environment variable, checked once at startup
  lib/
    db.js                     connectDb, withTransaction, KEEP_UPDATED_AT
    errors.js                 HttpError and helpers: badRequest, notFound, forbidden, ...
    jwt.js                    signToken, verifyToken
    tokens.js                 one-time tokens for emailed links
    pagination.js             findPage and cursors for list endpoints
    schemas.js                Zod pieces shared by the modules
    sharedContent.js          canView, isOwner, shareUrl for templates and rankings
    logger.js                 pino logger and the request logger
  middleware/
    auth.js                   requireAuth, optionalAuth
    validate.js               validate({ params, query, body }) with Zod
    rateLimit.js              limits on auth and AI routes
    errorHandler.js           404 for unknown routes, one place that turns errors into JSON
  models/                     one Mongoose model per collection, plus enums.js
  integrations/               email, push, storage, ai, oauth: the outside services
  modules/
    auth/  users/  templates/  rankings/  comments/  notifications/  uploads/
test/                         see Tests below
```

Each folder in `modules/` holds the same four files:

| File | Job |
| --- | --- |
| `*.routes.js` | The paths, and which middleware runs on each |
| `*.schemas.js` | Zod schemas for the params, query and body of each route |
| `*.controller.js` | Reads the validated input, calls the service, sends the response |
| `*.service.js` | The actual logic and database work. Throws errors instead of sending them |

The services match the service box in the class diagram: `auth.service.js` is AuthService, `rankings.service.js` is RankingService, and so on. EmailService is `integrations/email.js`.

## How a request is handled

Each request passes through the middleware in order. Any step can stop the request and send an error response.

```mermaid
flowchart TD
    A[Request] --> B[helmet sets security headers]
    B --> C[pino-http logs it]
    C --> D[express.json parses the body]
    D --> E{Route matches?}
    E -- no --> N[notFound: 404]
    E -- yes --> F{Rate limited route?}
    F -- over the limit --> F1[429]
    F -- no, or under --> G{requireAuth or optionalAuth}
    G -- token missing on a requireAuth route --> G1[401]
    G -- token invalid or expired --> G1
    G -- ok --> H{validate: params, query, body match the Zod schemas?}
    H -- no --> H1[400 with a list of the problems]
    H -- yes --> K[Controller]
    K --> L[Service]
    L --> M[Mongoose query or transaction]
    M --> R[JSON response]
    L -. throws .-> X[errorHandler: 400, 403, 404, 409, 500 or 501]
```

Three things to know when reading or writing a route:

- **Validated input lives on `req.valid`.** `validate()` puts the parsed params, query and body there: trimmed, coerced to the right types, defaults applied, unknown keys dropped. Controllers read `req.valid.body`, never `req.body`.
- **`req.userId` is the caller.** `requireAuth` guarantees it is set. `optionalAuth` sets it to `null` for a guest.
- **Nothing catches errors by hand.** Express 5 forwards anything thrown from an async handler to `errorHandler`, so services just `throw notFound('Template')`.

## Authentication

Login returns a JSON Web Token. It is signed with `JWT_SECRET`, holds the user's id in its `sub` claim, and expires after 7 days (`JWT_EXPIRES_IN`). Protected routes need it in the `Authorization` header:

```
Authorization: Bearer <token>
```

A new account cannot log in until its email is verified. Registering emails a link to `APP_URL/verify-email?token=...`. The web app reads the token from that address and posts it to `/api/auth/verify-email`, which answers with a login token.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant DB as MongoDB
    participant E as Email

    C->>A: POST /api/auth/register { username, email, password }
    A->>DB: users.findOne(email or username)
    alt already used
        A-->>C: 409 { error }
    else new account
        A->>A: bcrypt.hash(password)
        A->>DB: insert user (emailVerified false) and a verify_email token, in one transaction
        A->>E: send link with the token
        A-->>C: 201 { message }
    end

    Note over C,E: later, from the email
    C->>A: POST /api/auth/verify-email { token }
    A->>DB: mark the token used, set emailVerified true
    A-->>C: 200 { token, user }

    C->>A: GET /api/users/me<br/>Authorization: Bearer token
    A->>A: requireAuth verifies the token, sets req.userId
    A->>DB: users.findById(req.userId)
    A-->>C: 200 account
```

- Passwords are hashed with bcrypt (10 rounds). The hash is never loaded unless a query asks for it, and never sent in a response.
- The links in emails carry a random one-time token. The database stores only its SHA-256 hash, and MongoDB deletes expired tokens on its own. A verification link lasts 24 hours, a reset link 1 hour, and asking for a new link cancels the old one.
- Rate limits, per client address: login, password reset and Google/Discord login allow 100 requests per 15 minutes, enough for a classroom on one network. Routes that send an email (register, resend verification, forgot password) allow 50 per hour. Verifying an email has no limit, since its token can't be guessed.
- Tokens are stateless: logging out is the client forgetting the token, and changing a password does not cancel tokens that were already issued.

### Google and Discord

The web and Expo apps run the provider's sign-in page themselves, using the authorization code flow with PKCE, and hand the result to the API. Only the API has the client secrets, so only it can turn the code into who the person is.

1. `GET /api/auth/oauth/providers` gives each set-up provider's `authorizeUrl`, `clientId` and `scope`.
2. The client makes a random `state` and a random `codeVerifier`, keeps both, and sends the person to `authorizeUrl` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge` (the base64url SHA-256 of the verifier) and `code_challenge_method=S256`.
3. The provider sends them back to `redirect_uri` with `?code=...&state=...`. The client checks `state` matches what it kept.
4. The client posts `{ code, codeVerifier, redirectUri }` to `/api/auth/oauth/:provider`, or to `/api/users/me/oauth/:provider` to link the provider to the account that is logged in.

```mermaid
sequenceDiagram
    participant C as Client
    participant P as Google or Discord
    participant A as API
    participant DB as MongoDB

    C->>P: sign-in page with code_challenge and state
    P-->>C: redirect_uri?code&state
    C->>A: POST /api/auth/oauth/google { code, codeVerifier, redirectUri }
    A->>P: code, verifier and client secret for an access token
    A->>P: who is this? (id, email, whether the email is verified, name, picture)
    A->>DB: oauthaccounts.findOne(provider, providerUserId)
    alt linked already
        A-->>C: 200 { token, user }
    else the verified email belongs to a user
        A->>DB: link the provider to that user
        A-->>C: 200 { token, user }
    else new person
        A->>DB: insert user (no password, email verified) and the link, in one transaction
        A-->>C: 200 { token, user }
    end
```

- `redirectUri` has to be on the API's list, `OAUTH_REDIRECT_URIS`, which defaults to `APP_URL/oauth/callback`. The same address must also be registered with the provider (Google Cloud console, Discord Developer Portal). Both providers already have `https://mern.esiegman.dev/oauth/callback` and `http://localhost:5173/oauth/callback`.
- An account is only matched or created by email when the provider says it checked the address. Otherwise the answer is `403` `OAUTH_EMAIL_UNVERIFIED`.
- If someone registered that email with a password but never verified it, logging in with the provider takes the account over and removes that password, since nobody proved it belonged to the email's owner.
- A new account's username comes from the person's name, with a number added if it is taken. They can change their display name later; the username stays.
- Each user can link one Google and one Discord account, and each of those can belong to only one user. Unlinking is refused while it is the only way in (no password, nothing else linked). Such an account can still set a password through forgot password.

## Who can see what

Templates and rankings both have a `visibility`:

| Visibility | Who can open it | Listed in feeds and search |
| --- | --- | --- |
| `public` | Anyone | Yes |
| `unlisted` | Anyone who has the link | No |
| `private` | Only its owner | No |

A ranking is also a **draft** until it is published (`publishedAt` is `null`). Only its owner can see a draft, and drafts cannot be liked or commented on.

**A ranking is never more visible than its template.** A public ranking of an unlisted template behaves as unlisted: it opens by link and appears on the template's page, but never in the feed or on profiles. Any ranking of a private template behaves as private. This also applies when a template is made private after other people ranked it: their rankings disappear for everyone else, and each owner keeps seeing their own.

When someone may not see a template or ranking, the API answers `404`, the same as if it did not exist. `403` is only used when they can see it but may not change it.

## Data model

```mermaid
erDiagram
    users ||--o{ oauthaccounts : "signs in with"
    users ||--o{ authtokens : has
    users ||--o{ templates : creates
    users ||--o{ rankings : ranks
    users ||--o{ comments : writes
    users ||--o{ likes : gives
    users ||--o{ notifications : receives
    templates ||--o{ items : contains
    templates ||--o{ rankings : "ranked in"
    rankings ||--o{ comments : has
    rankings ||--o{ likes : has
    rankings ||--o{ notifications : about

    users {
        ObjectId _id PK
        string username UK "stored lowercase"
        string email UK "stored lowercase"
        string passwordHash "null for Google or Discord only accounts"
        boolean emailVerified
        string displayName
        string bio
        string avatarUrl
        string[] pushTokens
        object notificationPrefs "newComment, newRanking, newLike"
        date createdAt
    }
    oauthaccounts {
        ObjectId _id PK
        ObjectId userId FK
        string provider "google or discord"
        string providerUserId
        string email
        date linkedAt
    }
    authtokens {
        ObjectId _id PK
        ObjectId userId FK
        string type "verify_email or reset_password"
        string tokenHash
        date expiresAt
        date usedAt
    }
    templates {
        ObjectId _id PK
        ObjectId ownerId FK
        string title
        string description
        string category "stored lowercase"
        string coverImageUrl
        string[] tierLabels "default S A B C D F"
        string visibility
        number rankingCount "published rankings"
        date createdAt
        date updatedAt
    }
    items {
        ObjectId _id PK
        ObjectId templateId FK
        string name
        string imageUrl
        date createdAt
    }
    rankings {
        ObjectId _id PK
        ObjectId templateId FK
        ObjectId ownerId FK
        string title
        Tier[] tiers "label, color, order, itemIds"
        string visibility
        number likeCount
        number commentCount
        date publishedAt "null while a draft"
        date createdAt
        date updatedAt
    }
    comments {
        ObjectId _id PK
        ObjectId rankingId FK
        ObjectId authorId FK
        string body
        date updatedAt "later than createdAt once edited"
        date createdAt
    }
    likes {
        ObjectId _id PK
        ObjectId rankingId FK
        ObjectId userId FK
        date createdAt
    }
    notifications {
        ObjectId _id PK
        ObjectId recipientId FK
        ObjectId actorId FK
        string type "new_ranking, new_comment or new_like"
        ObjectId rankingId FK
        boolean read
        date createdAt
    }
```

- **`db/setup.js` owns the database.** It creates the collections, a validator for each, and every index. The Mongoose models in `src/models/` mirror it and are told not to create collections or indexes themselves. If a field changes, change both places, or writes fail with a `500` and "Document rejected by the db/setup.js validator" in the log.
- **Tiers live inside the ranking**, so one read loads a whole board. An item of the template that appears in no tier is unranked.
- **One ranking per person per template**, enforced by a unique index.
- **Counters are kept in step in transactions.** Anything that touches more than one document (a like and `likeCount`, a comment and `commentCount`, a publish and `rankingCount`, every delete that cascades) runs inside `withTransaction()`, so it all saves or none of it does.
- **MongoDB does not cascade deletes**, so the services do: deleting a template removes its items, its rankings, and their comments, likes and notifications.

## Conventions

**Ids and dates.** Ids are 24-character strings in `_id`. Dates are ISO 8601 strings in UTC.

**Lists.** Every list answers the same shape and takes the same two query parameters:

```json
{ "items": [], "nextCursor": "eyJ2YWx1ZSI6Ii4uLiJ9" }
```

| Query | Meaning |
| --- | --- |
| `limit` | Items per page, 1 to 50, default 20 |
| `cursor` | The `nextCursor` from the previous page. Leave it out for the first page |

`nextCursor` is `null` on the last page. Treat it as opaque, and only reuse it with the same filters and sort.

**Deletes** answer `204` with no body, and so do the routes that only flip a switch (push tokens, marking notifications read).

**Clearing a field.** In a `PATCH`, send only the fields that change. Where a field can be cleared, send `null`.

## Errors

Every error response has the same shape. `details` is only present for validation errors.

```json
{
  "error": "username: must be 3-20 letters, numbers or underscores",
  "code": "VALIDATION",
  "details": [
    { "in": "body", "field": "username", "message": "must be 3-20 letters, numbers or underscores" },
    { "in": "body", "field": "email", "message": "must be a valid email address" }
  ]
}
```

`error` is a sentence that can be shown to the user. `code` is for the client's logic.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION` | A param, query value or body field is missing or invalid. `details` lists every problem |
| 400 | `BAD_REQUEST` | Invalid JSON, a used or expired link, an item that is not in the template, liking or commenting on a draft |
| 401 | `UNAUTHORIZED` | No token, an invalid or expired token, or a wrong email or password |
| 403 | `EMAIL_NOT_VERIFIED` | Logging in before verifying the email |
| 403 | `FORBIDDEN` | You can see it, but only its owner or author may change it |
| 404 | `NOT_FOUND` | No such route or document, or one you are not allowed to see |
| 409 | `CONFLICT` | The email or username is already taken, or a Google or Discord account is already linked |
| 413 | `TOO_LARGE` | A body over 100 kB |
| 429 | `RATE_LIMITED` | Too many login, sign-up or email requests, or AI suggestions (see Authentication) |
| 500 | `INTERNAL` | Anything unexpected. The details are logged on the server, not sent back |
| 422, 502, 503 | `AI_…` | AI suggestions only: see `POST /api/templates/suggest-items` |
| 400, 403, 501, 502, 503 | `OAUTH_…` | Google and Discord login only: see `POST /api/auth/oauth/:provider` |
| 501 | `NOT_IMPLEMENTED` | A route from the Status table above, or AI suggestions without `ANTHROPIC_API_KEY` |

## Objects

The shapes that come back from more than one endpoint. Optional fields are left out when they are not set, rather than sent as `null`, unless noted.

### Account

Your own user, from login and `/users/me`. `displayName`, `bio` and `avatarUrl` only appear once set.

```json
{
  "_id": "6721a3f0c2b8a1d4e5f60701",
  "username": "ada",
  "email": "ada@example.com",
  "emailVerified": true,
  "displayName": "Ada L.",
  "bio": "Ranks snacks.",
  "notificationPrefs": { "newComment": true, "newRanking": true, "newLike": false },
  "createdAt": "2026-11-15T17:28:23.200Z"
}
```

`GET /api/users/me` also includes how the account can log in, for a settings page:

```json
{
  "hasPassword": false,
  "linkedAccounts": [{ "provider": "google", "email": "ada@gmail.com", "linkedAt": "2026-11-16T21:40:00.000Z" }]
}
```

### Public profile

What everyone else sees of a user. It appears as `owner`, `author` and `actor` on other objects.

```json
{
  "_id": "6721a3f0c2b8a1d4e5f60701",
  "username": "ada",
  "displayName": "Ada L.",
  "bio": "Ranks snacks.",
  "createdAt": "2026-11-15T17:28:23.200Z"
}
```

### Template

`coverImageUrl` is `null` when there is none. `rankingCount` is the number of published, public rankings: the ones the template's page lists. A private template's is always 0.

```json
{
  "_id": "6721a4b2c2b8a1d4e5f60711",
  "ownerId": "6721a3f0c2b8a1d4e5f60701",
  "title": "Gas station snacks",
  "description": "The classics.",
  "category": "food",
  "coverImageUrl": null,
  "tierLabels": ["S", "A", "B", "C", "D", "F"],
  "visibility": "public",
  "rankingCount": 1,
  "createdAt": "2026-11-15T17:28:23.546Z",
  "updatedAt": "2026-11-15T17:28:23.546Z"
}
```

### Item

```json
{
  "_id": "6721a4b2c2b8a1d4e5f60721",
  "templateId": "6721a4b2c2b8a1d4e5f60711",
  "name": "Chips",
  "imageUrl": null,
  "createdAt": "2026-11-15T17:28:23.547Z"
}
```

### Ranking

`tiers` are in display order, top first. `publishedAt` is `null` while it is a draft. `updatedAt` only moves when the owner edits the ranking, not when it is liked or commented on.

```json
{
  "_id": "6721a5c3c2b8a1d4e5f60731",
  "templateId": "6721a4b2c2b8a1d4e5f60711",
  "ownerId": "6721a3f0c2b8a1d4e5f60702",
  "title": "Road trip picks",
  "tiers": [
    { "label": "S", "color": "#ff7f7f", "order": 0, "itemIds": ["6721a4b2c2b8a1d4e5f60721"] },
    { "label": "A", "color": "#ffbf7f", "order": 1, "itemIds": ["6721a4b2c2b8a1d4e5f60722"] },
    { "label": "F", "color": "#7fbfff", "order": 2, "itemIds": ["6721a4b2c2b8a1d4e5f60723"] }
  ],
  "visibility": "public",
  "likeCount": 1,
  "commentCount": 1,
  "publishedAt": "2026-11-15T17:28:23.590Z",
  "createdAt": "2026-11-15T17:28:23.582Z",
  "updatedAt": "2026-11-15T17:28:23.590Z"
}
```

### Comment

```json
{
  "_id": "6721a6d4c2b8a1d4e5f60741",
  "rankingId": "6721a5c3c2b8a1d4e5f60731",
  "authorId": "6721a3f0c2b8a1d4e5f60701",
  "body": "Chips in S tier, bold.",
  "createdAt": "2026-11-15T17:28:23.630Z",
  "updatedAt": "2026-11-15T17:28:23.630Z",
  "author": {
    "_id": "6721a3f0c2b8a1d4e5f60701",
    "username": "ada",
    "displayName": "Ada L.",
    "bio": "Ranks snacks.",
    "createdAt": "2026-11-15T17:28:23.200Z"
  }
}
```

### Notification

`type` is `new_ranking` (someone ranked your template), `new_comment` or `new_like` (on your ranking). `actor` is who did it.

```json
{
  "_id": "6721a6d4c2b8a1d4e5f60751",
  "recipientId": "6721a3f0c2b8a1d4e5f60702",
  "actorId": "6721a3f0c2b8a1d4e5f60701",
  "type": "new_comment",
  "rankingId": "6721a5c3c2b8a1d4e5f60731",
  "read": false,
  "createdAt": "2026-11-15T17:28:23.631Z",
  "actor": {
    "_id": "6721a3f0c2b8a1d4e5f60701",
    "username": "ada",
    "displayName": "Ada L.",
    "bio": "Ranks snacks.",
    "createdAt": "2026-11-15T17:28:23.200Z"
  },
  "ranking": {
    "_id": "6721a5c3c2b8a1d4e5f60731",
    "title": "Road trip picks",
    "template": { "_id": "6721a4b2c2b8a1d4e5f60711", "title": "Gas station snacks" }
  }
}
```

## Endpoint reference

Every route can also answer `400 VALIDATION` for bad input and, where a token is needed, `401`. Those are not repeated below.

### POST /api/auth/register

Creates an unverified account and emails a verification link. No token comes back: the user logs in by opening the link.

| Field | Rules |
| --- | --- |
| `username` | 3 to 20 letters, numbers or underscores. Stored lowercase, so `Ada` and `ada` are the same name. `admin`, `api`, `support` and `system` are refused |
| `email` | A valid address. Stored lowercase |
| `password` | At least 8 characters, at most 72 |

```json
{ "username": "ada", "email": "ada@example.com", "password": "correct horse battery" }
```

Response `201`:

```json
{ "message": "Account created. Check your inbox to verify your email." }
```

Errors: `409` `Email already in use` or `Username already taken`.

### POST /api/auth/verify-email

Redeems the token from the emailed link. It works once.

```json
{ "token": "KeQBGTZASF3VrCwdXjHvT67t5Na_fnbiC78tz14i72Q" }
```

Response `200`: `{ "token": "eyJhbGciOi...", "user": Account }`. The `token` in the response is the login token.

Errors: `400` `This link is invalid or has expired`.

### POST /api/auth/resend-verification

Body: `{ "email": "ada@example.com" }`. Emails a fresh link if that account exists and is not verified yet.

Response `202`, always the same, so it never reveals which emails have accounts:

```json
{ "message": "If that account still needs verifying, a new link is on its way." }
```

### POST /api/auth/login

```json
{ "email": "ada@example.com", "password": "correct horse battery" }
```

Response `200`: `{ "token": "eyJhbGciOi...", "user": Account }`.

Errors: `401` `Invalid email or password` (the same message for an unknown email and a wrong password), `403` `EMAIL_NOT_VERIFIED`.

### POST /api/auth/forgot-password

Body: `{ "email": "ada@example.com" }`. Emails a link to `APP_URL/reset-password?token=...`.

Response `202`, always the same:

```json
{ "message": "If that email has an account, a reset link is on its way." }
```

### POST /api/auth/reset-password

```json
{ "token": "the token from the link", "password": "a brand new password" }
```

Response `200`: `{ "message": "Password updated. You can log in now." }`. Using the link also counts as verifying the email.

Errors: `400` `This link is invalid or has expired`.

### GET /api/auth/oauth/providers

The providers this server has set up. One that isn't set up is left out, so the client can hide its button.

```json
{
  "providers": [
    {
      "provider": "google",
      "name": "Google",
      "clientId": "1234-abc.apps.googleusercontent.com",
      "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
      "scope": "openid email profile"
    },
    {
      "provider": "discord",
      "name": "Discord",
      "clientId": "1572074089659637760",
      "authorizeUrl": "https://discord.com/oauth2/authorize",
      "scope": "identify email"
    }
  ]
}
```

### POST /api/auth/oauth/:provider

`:provider` is `google` or `discord`. The client runs the provider's sign-in page itself (see [Google and Discord](#google-and-discord)) and sends what it got back:

```json
{ "code": "...", "codeVerifier": "...", "redirectUri": "https://mern.esiegman.dev/oauth/callback" }
```

Response `200`: the same as login, `{ token, user }`. The first login creates the account.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `OAUTH_CODE_INVALID` | The code expired, was already used, or doesn't match `codeVerifier`. Start the sign-in again |
| 400 | `OAUTH_REDIRECT_NOT_ALLOWED` | `redirectUri` is not in `OAUTH_REDIRECT_URIS` |
| 403 | `OAUTH_EMAIL_UNVERIFIED` | The provider has no verified email for this person |
| 409 | `CONFLICT` | The user with this email already has a different account from this provider linked |
| 501 | `OAUTH_NOT_CONFIGURED` | This provider's client id and secret aren't set on the server |
| 502 | `OAUTH_FAILED` | The provider refused our request, usually a wrong secret or an unregistered redirect URI. The reason is in the API log |
| 503 | `OAUTH_UNAVAILABLE` | The provider couldn't be reached |

### GET /api/users/me

Response `200`: your Account.

### PATCH /api/users/me

Send only what changes. `null` clears `displayName`, `bio` or `avatarUrl`.

| Field | Rules |
| --- | --- |
| `displayName` | 1 to 50 characters, or `null` |
| `bio` | Up to 300 characters, or `null` |
| `avatarUrl` | An `https` URL, or `null` |
| `notificationPrefs` | Any of `newComment`, `newRanking`, `newLike`, each `true` or `false` |

```json
{ "displayName": "Ada L.", "notificationPrefs": { "newLike": true } }
```

Response `200`: the updated Account.

### POST /api/users/me/push-tokens

The Expo app calls this after the user allows notifications.

```json
{ "token": "ExponentPushToken[abc123]" }
```

Response `204`. Registering the same phone twice is harmless. A token belongs to one account at a time: registering it here removes it from any other account, so a shared phone stops getting the previous user's notifications.

### DELETE /api/users/me/push-tokens

Same body. The Expo app calls this on logout. Response `204`.

### POST /api/users/me/oauth/:provider

Links a Google or Discord account to the account that is logged in. Same body and provider errors as `POST /api/auth/oauth/:provider`. The provider's email doesn't have to match.

Response `201`: `{ "provider": "discord", "email": "ada@example.com", "linkedAt": "2026-11-16T21:40:00.000Z" }`.

Errors: `409` if that provider account is already linked (to you or to someone else), or you already have one from this provider.

### DELETE /api/users/me/oauth/:provider

Response `204`.

Errors: `404` nothing linked from that provider. `409` it is the only way into the account (no password and nothing else linked).

### GET /api/users/:username

Response `200`: a Public profile. The username is matched in any case.

Errors: `404`.

### GET /api/users/:username/templates

A list of Templates, newest first, each with `owner`. Guests and other users get the public ones. The owner, when logged in, also gets their unlisted and private ones.

Errors: `404` no such user.

### GET /api/users/:username/rankings

A list of Rankings, newest first, each with `owner` and `template` (see `GET /api/rankings`). Guests and other users get the public, published ones. The owner also gets their drafts and private ones.

Errors: `404` no such user.

### GET /api/templates

Public templates, as a list.

| Query | Meaning |
| --- | --- |
| `q` | Search words, in any case. Each word has to match the start of a word in the title, description or category, so `snack` and `gas sn` both find "Gas station snacks" |
| `category` | Exact category, in any case |
| `sort` | `new` (default, newest first) or `popular` (most rankings first) |
| `limit`, `cursor` | See Lists |

```
GET /api/templates?q=snacks&sort=popular
```

Response `200`: each item is a Template with its `owner`.

```json
{
  "items": [
    {
      "_id": "6721a4b2c2b8a1d4e5f60711",
      "title": "Gas station snacks",
      "rankingCount": 1,
      "owner": { "_id": "6721a3f0c2b8a1d4e5f60701", "username": "ada" }
    }
  ],
  "nextCursor": null
}
```

(Shortened: every Template field is there.)

### POST /api/templates

Creates the template and its starting items together.

| Field | Rules |
| --- | --- |
| `title` | Required, 1 to 100 characters |
| `description` | Up to 500 characters |
| `category` | Up to 40 characters. Stored lowercase |
| `coverImageUrl` | An `https` URL, or `null` |
| `tierLabels` | 1 to 12 labels of 1 to 20 characters. Default `S A B C D F` |
| `visibility` | `public` (default), `unlisted` or `private` |
| `items` | Up to 200 of `{ name, imageUrl }`. `name` is 1 to 60 characters, `imageUrl` an `https` URL or `null` |

```json
{
  "title": "Gas station snacks",
  "category": "food",
  "items": [{ "name": "Chips" }, { "name": "Jerky" }, { "name": "Gum" }]
}
```

Response `201`, where the capitalized names stand for the objects above:

```
{
  "template": Template,
  "items": [Item, Item, Item],
  "owner": Public profile,
  "shareUrl": "https://mern.esiegman.dev/templates/6721a4b2c2b8a1d4e5f60711"
}
```

### POST /api/templates/suggest-items

Asks Claude (Claude Opus 5.5, through Anthropic's API) for things to rank. Limited to 20 requests an hour per client.

```json
{ "topic": "fast food chains", "count": 10 }
```

`topic` is 2 to 80 characters, `count` 1 to 30 (default 10). Response `200`:

```json
{ "items": ["McDonald's", "Wendy's", "Taco Bell"] }
```

Nothing is saved: the client shows the names and sends the ones the user keeps to `POST /api/templates`. The names are trimmed, repeats and names over 60 characters are dropped, and there are at most `count` of them (sometimes fewer). If Claude declines a topic, Anthropic retries it on another Claude model before giving up.

| Status | `code` | When |
| --- | --- | --- |
| 501 | `AI_NOT_CONFIGURED` | `ANTHROPIC_API_KEY` is not set on the server |
| 422 | `AI_REFUSED` | Claude would not suggest items for that topic |
| 502 | `AI_FAILED` | Claude's API returned an error, or an answer in the wrong shape |
| 503 | `AI_BUSY` | Claude's API is rate limiting the server: try again in a minute |
| 503 | `AI_UNAVAILABLE` | The API key was rejected, or the API couldn't be reached |

### GET /api/templates/:templateId

Response `200`: the same shape as `POST /api/templates`. Items come in the order they were added.

Errors: `404` no such template, or a private one that is not yours.

### PATCH /api/templates/:templateId

Any of `title`, `description`, `category`, `coverImageUrl`, `tierLabels`, `visibility`, with the rules above. Changing `tierLabels` only affects rankings started afterwards.

Response `200`: the updated Template.

Errors: `403` not the owner, `404`.

### DELETE /api/templates/:templateId

Deletes the template with its items, every ranking of it, and their comments, likes and notifications.

Response `204`. Errors: `403`, `404`.

### POST /api/templates/:templateId/items

```json
{ "name": "Soda", "imageUrl": null }
```

Response `201`: the new Item. It shows up as unranked in every existing ranking.

Errors: `403`, `404`.

### PATCH /api/templates/:templateId/items/:itemId

Either or both of `name` and `imageUrl`. Response `200`: the updated Item.

Errors: `403`, `404` no such template, or the item is not in it.

### DELETE /api/templates/:templateId/items/:itemId

Removes the item and takes it out of every ranking of this template.

Response `204`. Errors: `403`, `404`.

### GET /api/templates/:templateId/rankings

The public, published rankings of this template, newest first. Same shape as `GET /api/rankings`.

Errors: `404` template not visible to you.

### POST /api/templates/:templateId/rankings

Starts your ranking of this template. There is one per person per template, so this is safe to call every time the user opens the ranking screen:

- `201` and a new draft Ranking the first time. It has one tier per `tierLabels` entry, colored from a default palette, with nothing placed yet.
- `200` and your existing Ranking after that.

No body. Errors: `404` template not visible to you.

### GET /api/templates/:templateId/community-ranking

Every public, published ranking of the template averaged into one board, using the template's own tier labels. Each placement is scored by how far down the list its tier sits, so rankings with different numbers of tiers still compare. An item lands in the tier nearest its average. Items nobody ranked are left out.

Response `200`:

```json
{
  "tiers": [
    { "label": "S", "color": "#ff7f7f", "itemIds": ["6721a4b2c2b8a1d4e5f60721"] },
    { "label": "A", "color": "#ffbf7f", "itemIds": [] },
    { "label": "B", "color": "#ffdf7f", "itemIds": ["6721a4b2c2b8a1d4e5f60722"] },
    { "label": "C", "color": "#ffff7f", "itemIds": [] },
    { "label": "D", "color": "#bfff7f", "itemIds": [] },
    { "label": "F", "color": "#7fbfff", "itemIds": ["6721a4b2c2b8a1d4e5f60723"] }
  ],
  "rankingCount": 2
}
```

Errors: `404` template not visible to you.

### GET /api/rankings

The feed: public, published rankings from everyone.

| Query | Meaning |
| --- | --- |
| `sort` | `new` (default, most recently published first) or `top` (most likes first) |
| `limit`, `cursor` | See Lists |

Response `200`: each item is a Ranking plus who made it and what it ranks.

```json
{
  "items": [
    {
      "_id": "6721a5c3c2b8a1d4e5f60731",
      "title": "Road trip picks",
      "likeCount": 1,
      "owner": { "_id": "6721a3f0c2b8a1d4e5f60702", "username": "bob" },
      "template": { "_id": "6721a4b2c2b8a1d4e5f60711", "title": "Gas station snacks", "coverImageUrl": null }
    }
  ],
  "nextCursor": null
}
```

(Shortened: every Ranking field is there.)

### GET /api/rankings/:rankingId

Everything needed to draw the board in one response. `items` is every item of the template: the ones in no tier are the unranked ones. `likedByMe` is `false` for guests.

Response `200`:

```
{
  "ranking": Ranking,
  "template": Template,
  "items": [Item, Item, Item],
  "owner": Public profile,
  "likedByMe": false,
  "shareUrl": "https://mern.esiegman.dev/rankings/6721a5c3c2b8a1d4e5f60731"
}
```

Errors: `404` no such ranking, a private one, or someone else's draft.

### PUT /api/rankings/:rankingId

Saves the whole board. Send it while the user drags to autosave, and with `publish: true` when they press Publish.

| Field | Rules |
| --- | --- |
| `tiers` | Required. 1 to 12 tiers, top first. Each is `{ label, color, itemIds }`: a label of 1 to 20 characters, a hex color like `#ff7f7f`, and the item ids in order. An item can only be in one tier |
| `visibility` | Required. `public`, `unlisted` or `private` |
| `title` | Up to 100 characters. Left out, the current title is kept |
| `publish` | `true` to publish. Default `false` |

```json
{
  "title": "Road trip picks",
  "visibility": "public",
  "publish": true,
  "tiers": [
    { "label": "S", "color": "#ff7f7f", "itemIds": ["6721a4b2c2b8a1d4e5f60721"] },
    { "label": "A", "color": "#ffbf7f", "itemIds": ["6721a4b2c2b8a1d4e5f60722"] },
    { "label": "F", "color": "#7fbfff", "itemIds": ["6721a4b2c2b8a1d4e5f60723"] }
  ]
}
```

Do not send `order`: the API numbers the tiers by their position.

Response `200`: `{ "ranking": Ranking, "shareUrl": "..." }`.

The first time a ranking is published, the API sets `publishedAt` and notifies the template's owner, unless that is you, they turned those notifications off, or the ranking counts as private (see Who can see what). Publishing again changes nothing more, and a ranking cannot be unpublished. Every save of a published ranking recounts the template's `rankingCount`, so it stays right when the ranking changes visibility.

Errors: `400` `Every item must belong to the template being ranked`, `403` not the owner, `404`.

### DELETE /api/rankings/:rankingId

Deletes the ranking with its comments, likes and notifications, and recounts the template's `rankingCount`.

Response `204`. Errors: `403`, `404`.

### PUT /api/rankings/:rankingId/like and DELETE /api/rankings/:rankingId/like

No body. Both are safe to repeat: liking twice counts once, and unliking something you had not liked changes nothing.

Response `200`:

```json
{ "liked": true, "likeCount": 1 }
```

The ranking's owner is notified of a new like only if they turned on `newLike`, which is off by default.

Errors: `400` `Only published rankings can be liked`, `404`.

### GET /api/rankings/:rankingId/comments

A list of Comments, oldest first, each with its `author`.

Errors: `404` ranking not visible to you.

### POST /api/rankings/:rankingId/comments

```json
{ "body": "Chips in S tier, bold." }
```

`body` is 1 to 1000 characters. Response `201`: the Comment. The ranking's `commentCount` goes up and its owner is notified (unless that is you, or they turned those notifications off).

Errors: `400` `Only published rankings can be commented on`, `404`.

### PATCH /api/comments/:commentId

Body: `{ "body": "..." }`. Response `200`: the updated Comment. A comment counts as edited when its `updatedAt` is later than its `createdAt`.

Errors: `403` not the author, `404`.

### DELETE /api/comments/:commentId

Allowed for the comment's author, and for the owner of the ranking it is on.

Response `204`. Errors: `403`, `404`.

### GET /api/notifications

Your notifications, newest first.

| Query | Meaning |
| --- | --- |
| `unread` | `true` for unread ones only. Default `false` |
| `limit`, `cursor` | See Lists |

Response `200`. `unreadCount` is your total unread, whatever the filter, for a badge.

```
{ "items": [Notification], "nextCursor": null, "unreadCount": 1 }
```

### PATCH /api/notifications/:notificationId

Body: `{ "read": true }`. The apps call this when a push or a list entry is opened. Notifications cannot be marked unread again.

Response `204`. Errors: `404` no such notification, or not yours.

### POST /api/notifications/read-all

No body. Response `204`.

### POST /api/uploads/sign

Not built yet (`501`). The plan: the client asks for a ticket, uploads the image straight to storage with it, then sends the resulting URL as `imageUrl`, `avatarUrl` or `coverImageUrl` on the normal routes. Image bytes never pass through this API.

```json
{ "kind": "item", "contentType": "image/png" }
```

`kind` is `item`, `avatar` or `cover`. `contentType` is `image/jpeg`, `image/png` or `image/webp`.

### GET /api/health

Response `200`:

```json
{ "status": "ok" }
```

Used by the Docker healthcheck and the check at the end of each deploy.

## Adding or changing a route

1. Describe its input in the module's `*.schemas.js`.
2. Write the logic in `*.service.js`. Throw the helpers from `lib/errors.js`. Use `withTransaction()` if it writes more than one document, and `findPage()` if it returns a list.
3. Add a thin function to `*.controller.js` and a line to `*.routes.js`.
4. Add its row to the table in `test/routes.test.js`, and cover it in one of the `*.integration.test.js` files.

For the five unwritten routes, steps 1 and 3 are done. Each service or integration function has a comment above it listing what it must do. When you finish one, change its row in `test/routes.test.js` from `TODO` to `DONE`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5001` | Port the API listens on |
| `MONGODB_URI` | | Connection string for the `app` database user. Required |
| `JWT_SECRET` | | Signs login tokens. Required, the API won't start without it |
| `JWT_EXPIRES_IN` | `7d` | How long a login lasts |
| `APP_URL` | `http://localhost:5173` | Where the web app is served. Email links and share links point here |
| `NODE_ENV` | `development` | `production` turns on JSON logs and trusts Caddy's forwarded client address |
| `SMTP_URL` | | SMTP server for email, such as `smtps://USER:PASSWORD@smtp.example.com:465`. Any provider works. Without it no email is sent, and production logs a warning at startup |
| `EMAIL_FROM` | `Tier List <no-reply@APP_URL's domain>` | Who emails come from. Most providers only accept a domain you have verified with them |
| `EXPO_ACCESS_TOKEN` | | Only if "enhanced push security" is on in Expo's dashboard |
| `ANTHROPIC_API_KEY` | | Claude API key for AI item suggestions. Create one in the Claude Console; it starts with `sk-ant-api`. Without it, suggest-items answers `501` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | The "Tier List Web" OAuth client in the Google Cloud project "Tier List App" (Google Auth Platform > Clients). Without both, Google login answers `501` |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | | The "Tier List App" application in the Discord Developer Portal (OAuth2 page). Without both, Discord login answers `501` |
| `OAUTH_REDIRECT_URIS` | `APP_URL/oauth/callback` | Comma-separated redirect URIs clients may use for Google and Discord login, such as an Expo app's. Each must also be registered with the provider |

The API checks these at startup and stops with a message naming any that are missing or malformed. In Docker they come from `compose.yaml` locally and from `/opt/mern/.env` on the droplet. To run outside Docker, copy `.env.example` to `.env`.

The first time you start the stack after pulling this API, rebuild with fresh dependencies:

```sh
docker compose up --build -V
```

## Tests

```sh
npm test
```

Without a database this runs the tests that never touch one: validation, tokens, guards on every route, the helpers. The tests that sign up, rank, like and comment for real are skipped unless `MONGODB_URI` points at a database that `db/setup.js` has prepared, so the validators and unique indexes are part of the test. With the dev stack running:

```sh
MONGODB_URI='mongodb://app:apppassword@localhost:27017/app?directConnection=true' npm test
```

Those tests create their own users with random names and delete everything they made afterwards, so they also pass with the sample data from [db/README.md](../db/README.md#sample-data) in the database, and leave it alone.

For trying the API by hand rather than in tests, the sample data gives you accounts to log in as and content in every state: drafts, private and unlisted content, custom tiers, comment threads and notifications.

| File | Covers |
| --- | --- |
| `app.test.js` | Health, 404s, invalid JSON, validation messages, bad tokens and cursors |
| `routes.test.js` | Every route: guests get `401` where a token is needed, unwritten routes answer `501` |
| `lib.test.js` | Tokens, cursors, visibility rules, community ranking maths, notification switches |
| `auth.integration.test.js` | Sign-up, verification, login, password reset, `/users/me` |
| `oauth.integration.test.js` | Google and Discord login, matching by verified email, taking over unverified sign-ups, linking and unlinking (providers faked) |
| `models.integration.test.js` | Every model saves against the validators in `db/setup.js` |
| `content.integration.test.js` | Templates, items, rankings, publishing, likes, community ranking, cascading deletes |
| `social.integration.test.js` | Profiles, push tokens, comments and edits, the notification list |
| `visibility.integration.test.js` | Rankings follow their template's visibility, `rankingCount` through every change, push on publish |
| `integrations.test.js` | The Expo push request and its replies, the email settings, AI suggestions (with Claude's API swapped out), the Google and Discord requests and their errors |
