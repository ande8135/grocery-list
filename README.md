# Groceries

A simple, shared grocery list for the family. Mobile-first React site served as static files from S3 through CloudFront, with a small Lambda + DynamoDB API behind API Gateway. Sign-in with Google or an email + password (Apple and other OpenID Connect providers can be switched on later), via Amazon Cognito. Deployed with Terraform.

## Design mockups

Open these in a browser (standalone files, no build or backend):

- [`mockup/index.html`](mockup/index.html): the list screen, empty state, dark mode, dictation (interactive).
- [`mockup/accounts.html`](mockup/accounts.html): sign-in, creating a household, invite link, household sheet, list tabs.

They use the app's real stylesheet, so what you see is what ships.

## Accounts, households and lists

- **Sign in** with Google, or register with an email address and password (Cognito emails a verification code). Apple and any other OIDC provider can be added later in Terraform.
- A **household** is the unit of sharing. A person can **own at most one** household, and can be a **member of any number** of others (by invitation).
- A household can hold up to **10 lists** (Groceries, Costco, Hardware...). Lists belong to the household, so every member sees them.
- **Invites** are links the owner creates and sends however they like. A link works once and expires after 7 days.

| | Owner | Member |
|---|---|---|
| Use lists and items | yes | yes |
| Create / rename lists | yes | yes |
| Delete a list (a household keeps at least one) | yes | no |
| Create invite links, remove members | yes | no |
| Leave the household | no | yes |

Households can't be deleted and ownership can't be transferred yet, which is how "a user can only ever own one household" stays simple and true.

## Store sections

Items on a list are grouped by where they are in the store (Produce, Bakery, Meat & seafood, Dairy & eggs, Frozen, Pantry, Snacks, Beverages, Household, Personal care, Other), in roughly the order you walk through one. The tag button on a row lets anyone move an item to a different section.

How an item gets its section when it's added (`Service.categoryFor`):

1. **The household's memory.** Every household remembers what it decided for each item ("banana" is Produce), whoever moved it. A lookup ignores case, punctuation and simple plurals, so "Bananas" and "banana" match. If it's known, that's the answer and nothing else runs.
2. **A small model on Amazon Bedrock** (Claude Haiku 5.5), only for an item the household hasn't had before. It may only answer with one of the fixed sections; anything else is ignored. The answer is remembered, so each household asks about each item about once.
3. **"Other"**, if the model is switched off, slow (4 s limit), unreachable, or gives an unusable answer. Adding an item never fails or waits long because of this, and a failed guess isn't remembered, so it's tried again next time.

A person moving an item always wins: it overwrites the remembered answer, and a later model guess never replaces it. Only the item's name is sent to the model, never who or which household it came from.

It's **off by default** (`enable_categorization = false`) because the model has to be enabled for your AWS account first. To turn it on:

1. In the AWS console open **Amazon Bedrock → Model access** (in the region you'll use) and enable **Claude Haiku 5.5**. It isn't open to every account by default, so check the status shows as granted.
2. Set `enable_categorization = true` in `infra/terraform.tfvars` (and `bedrock_region` if Bedrock should be called in a different region than `aws_region`), then run `./scripts/deploy.sh`. Terraform gives the API Lambda permission to call the model and tells it which one.
3. Add an item the app hasn't seen (say "gochujang") and check it lands in a section. If everything stays in "Other", look in CloudWatch Logs `/aws/lambda/<project>-api` for `Categorizer call failed`; the error says whether it's model access or permissions.

Items added before this existed have no section and show under "Other" until someone moves them or adds them again. Cost for a family: a few cents a month at most (about 300 tokens in and a handful out per *new* item). Locally (`npm run dev`) a small built-in keyword list stands in for the model, so there's nothing to set up.

## How it works

```
Phone ──► CloudFront ──┬─ /*      ──► S3 (private, via Origin Access Control)   static files + config.json
                       └─ /api/*  ──► API Gateway (HTTP API) ──► Lambda ──► DynamoDB
                                                                   └──► Bedrock (new items only, optional)
                          + secret header         │
                          + Authorization: Bearer │ Lambda authorizer: checks both
                                                  ▼
Sign-in: browser ◄──► Cognito hosted UI ◄──► Google (or email + password)
```

- **Frontend** (`frontend/`): Vite + React + TypeScript. Signs in with Cognito's hosted UI using the authorization-code flow with PKCE. Optimistic updates, and it polls every 5 s (lists and members every 15 s) so changes from other people show up on their own. Installable to the home screen. Voice dictation via the browser's speech recognition. Items are grouped into store sections (see below).
- **Backend** (`backend/`): TypeScript Lambda (Node 22). Rules live in `service.ts`, storage behind an interface (`store.ts`) with DynamoDB and in-memory implementations. Store sections are picked through a small `Categorizer` interface (`categorizer.ts`), implemented for Bedrock in `bedrockCategorizer.ts`.
- **Infra** (`infra/`): Terraform for S3, CloudFront, API Gateway, Lambdas, DynamoDB and Cognito.

### API

All routes are under `/api` and need a signed-in user.

| | |
|---|---|
| `GET /me` | Current user and their households (creates the profile on first call) |
| `POST /households` | Create your household (409 if you already own one) |
| `GET /households/{hid}` | Members and lists |
| `POST /households/{hid}/invites` | Owner: new invite link token |
| `DELETE /households/{hid}/members/{uid}` | Owner removes someone, or a member leaves (their own id) |
| `GET /invites/{token}`, `POST /invites/{token}/accept` | Preview / accept an invite |
| `POST /households/{hid}/lists`, `PATCH`/`DELETE .../lists/{lid}` | Manage lists (max 10) |
| `GET`/`POST .../lists/{lid}/items`, `PATCH`/`DELETE .../items/{id}`, `POST .../items/clear-checked` | Items. Each has a `category`; `PATCH` takes `name`, `checked` and/or `category` (moving an item teaches the household) |

Someone who isn't in a household gets 404 for anything inside it, so ids never reveal whether a household exists.

### DynamoDB (single table, `pk` / `sk`)

| pk | sk | item |
|---|---|---|
| `USER#<uid>` | `PROFILE` | user; `ownedHouseholdId` once they own one |
| `USER#<uid>` | `HH#<hid>` | their membership (to list their households) |
| `HH#<hid>` | `META` | household, with `listCount` |
| `HH#<hid>` | `MEMBER#<uid>` | household-side membership |
| `HH#<hid>` | `LIST#<lid>` | list |
| `LIST#<lid>` | `ITEM#<id>` | grocery item, with its `category` |
| `HH#<hid>` | `CAT#<name key>` | what the household decided an item's section is; `expiresAt` (a year out, refreshed on each write) is the TTL |
| `INVITE#<token>` | `INVITE` | invite; `expiresAt` is the table's TTL attribute |

The three rules are enforced with DynamoDB conditions inside transactions, so they hold even with simultaneous requests: one owned household per user (condition on the user profile), at most 10 lists (condition on `listCount`, changed together with the new list), invites usable once (the invite is deleted in the same transaction that adds the member).

### Who can call the API

Two checks, both in one Lambda authorizer on every route:

1. **Through CloudFront only.** CloudFront adds a secret header (`x-origin-verify`) to every `/api/*` request and overwrites any value a viewer sends. Direct calls to API Gateway lack it.
2. **Signed in.** The request must carry a valid Cognito ID token for this app's user pool (from Google or an email + password account). The verified user id, email and name are passed to the API Lambda; the API never trusts anything the browser says about who it is.

API Gateway rejects requests missing either header (401) before any Lambda runs. The secret is generated by Terraform and stored in state, so keep state private. Rotate with `terraform -chdir=infra apply -replace=random_password.origin_verify`. (HTTP APIs don't support WAF or resource policies, hence the authorizer.)

## Local development

```bash
npm install
npm run dev        # Vite on :5173 + local API on :3001 (in-memory data, no AWS needed)
npm test           # unit tests
npm run typecheck
```

Locally there's no Cognito: the sign-in screen offers "Continue as Alice / Bob / Carol". Use two browser profiles to try invites between them. Data resets when the API restarts.

To also run the backend tests against real DynamoDB semantics (transactions, conditions), point them at DynamoDB Local:

```bash
docker run --rm -p 8000:8000 amazon/dynamodb-local
DYNAMODB_ENDPOINT=http://localhost:8000 npm test -w backend
```

## Deploy

Prerequisites: Node 20+, Terraform ≥ 1.6, AWS CLI with credentials for the target account, and a Google account.

1. **Configure.** Copy `infra/example.tfvars` to `infra/terraform.tfvars` (git-ignored). Choose a `cognito_domain_prefix` (for example `smith-groceries`; it must be unique in the AWS region, with no "aws", "amazon" or "cognito" in it). That fixes your sign-in redirect URI before anything is deployed:
   `https://<prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
2. **Google.** In https://console.cloud.google.com create a project, set up the OAuth consent screen (External), then create an OAuth client of type **Web application** with:
   - Authorized JavaScript origin: `https://<prefix>.auth.<region>.amazoncognito.com`
   - Authorized redirect URI: the redirect URI above

   Put the client ID and secret in `terraform.tfvars`, and publish the app (Audience → Publish app) so anyone can sign in rather than only listed test users.
3. **Deploy**: `./scripts/deploy.sh`. It installs, tests, builds, runs `terraform apply` (shows the plan and asks), uploads the site to S3 and invalidates CloudFront. It prints the site URL.
4. Open the site on each phone and use *Share → Add to Home Screen*.

Email + password sign-up is on by default (`allow_email_password`); set it to `false` to allow Google only. Leave `cognito_domain_prefix` empty and Terraform picks `<project>-<random>` instead, in which case run `terraform -chdir=infra apply -target=aws_cognito_user_pool_domain.main` first and read the redirect URI from `terraform -chdir=infra output idp_redirect_uri`.

`config.json` (Cognito domain, client id, enabled providers) is written by Terraform next to the site, so the same build works anywhere. The Lambda zip is built from `backend/dist`, so always build before `terraform apply`.

To add Apple or another OIDC provider later, fill in its variables (see the commented examples in `example.tfvars`), register the same redirect URI with it, and run the deploy again.

Check the lock-down after deploying:

```bash
curl -i "$(terraform -chdir=infra output -raw api_direct_url)/api/me"   # 401: direct access blocked
curl -i "$(terraform -chdir=infra output -raw site_url)/api/me"         # 401: via CloudFront but not signed in
```

Settings are in `infra/variables.tf`. Terraform state is local by default; a commented S3 backend is in `infra/versions.tf`.

### Notes and limits

- The same person signing in with Google and with an email + password gets **two separate accounts**, even with the same address. Linking them needs a Cognito pre-sign-up trigger.
- Password accounts have no display name, so the app shows the part of their email before the `@`. (Google accounts use their Google name.)
- Cognito's built-in email sender allows about 50 emails a day (verification codes, password resets), plenty for a family. For more, switch the pool to Amazon SES.
- `username_attributes` can't change on an existing user pool. If you deployed an earlier version of this branch, applying this change **replaces the pool and its users**.
- Tokens are kept in the browser's `localStorage`. They can only read and edit grocery lists, and expire after an hour (refreshed automatically for 30 days).
- Sign-in buttons are plain text. Before sharing the app publicly, check Google's branding guidelines for their official button style.
- Not included yet: custom domain, deleting a household, transferring ownership, emailing invites, offline mode, editing an item's name from the UI (the API supports it).

## Voice dictation

When the input is empty, the right-hand button is a mic. Tap it, say "milk, eggs and a loaf of bread", tap again, and three items are added. It uses the browser's built-in Web Speech API, so there is no backend, cost or extra infrastructure; the mic button simply doesn't appear in browsers without support (e.g. Firefox). `frontend/src/parseItems.ts` splits the transcript into items (commas, "and", "then"...; strips "add", "we need", "a", "some"...). Known limit: "mac and cheese" becomes two items.

Upgrade path if the rules prove too crude: add `POST /api/items/parse` that sends the transcript text (not audio) to an LLM (e.g. Bedrock) and returns item names.
