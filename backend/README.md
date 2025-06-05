# backend

When AnvilOps is built as a Docker image, this Node.js app serves the static files in the `frontend` directory.

## Setup

### GitHub App

Create a GitHub App with the following settings:

| Setting                                                | Value (local development)                              | Value (production)                                                |
| ------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Homepage URL                                           | http://localhost:5173                                  | https://anvilops.rcac.purdue.edu                                  |
| Callback URL                                           | http://localhost:5173/api/github/oauth2-callback       | https://anvilops.rcac.purdue.edu/api/github/oauth2-callback       |
| Expire user authentication tokens                      | Yes                                                    | Yes                                                               |
| Request user authorization (OAuth) during installation | Yes                                                    | Yes                                                               |
| Setup URL                                              | http://localhost:5173/api/github/installation-callback | https://anvilops.rcac.purdue.edu/api/github/installation-callback |
| Webhook: Active                                        | Yes                                                    | Yes                                                               |
| Webhook URL                                            | See note below                                         | https://anvilops.rcac.purude.edu/api/github-webhook               |
| Redirect on Update                                     | No                                                     | No                                                                |

Note on webhook URLs in development: To receive webhook payloads, you will need to create a publicly-accessible URL that forwards to your machine. The GitHub docs recommend using [`smee`](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events#get-a-webhook-proxy-url) for this, or you could also use [`ngrok`](https://ngrok.com/) (account required).

Generate a random string for the webhook secret (e.g. `openssl rand -hex 32`). In development, add it to your `.env` file as `GITHUB_WEBHOOK_SECRET`, and in production, create a Kubernetes `Secret` called `github-app` and the key `webhook-secret`.

Repository Permissions:

- Contents: read-only
- Deployments: read and write
- Metadata: read-only

Leave all other permissions on "No access".

Subscribe to events:

- Push
- Repository
- Meta

After you create the app, copy the Client ID. In development, add it to `.env` as `GITHUB_CLIENT_ID`, and in production, add it to a key called `client-id` in the Secret you created earlier.

Under "Client Secrets", click "Generate a new client secret". Copy the secret and save it as `GITHUB_CLIENT_SECRET` (`.env`) or `client-secret` (K8s Secret).

Scroll all the way down and click "Generate a private key". Copy the content of the downloaded file, encode it as Base64, and save it as `GITHUB_PRIVATE_KEY` (`.env`) or `private-key` (K8s Secret).

Finally, look at the URL in your browser. It should look something like this:

```
{your GitHub base URL}/settings/apps/{your app name}
```

Add them as environment variables:

- `GITHUB_APP_NAME`: Your app name (derived from the display name that you entered while creating the app)
- `GITHUB_BASE_URL`: The URL you use to access GitHub, including the protocol, with no trailing slash. Typically this is `https://github.com`, but it will vary if you're using GitHub Enterprise.

### CILogon

Environment variables:

- `CLIENT_ID`
- `CLIENT_SECRET`
- `SESSION_SECRET`: generate a random value, e.g. `openssl rand -hex 32`
- `CALLBACK_URL`: the URL to redirect to after authorization, e.g. `http://localhost:3000/api/oauth_callback`

### Postgres

Set the `DATABASE_URL` environment variable to a valid PostgreSQL connection string, including the username and password. In production, set the `password` key in the `postgres-password` secret. AnvilOps will attempt to connect to a database at the `anvilops-postgres` hostname with `anvilops` as the username and database name.

If you need a temporary Postgres database, create one with Docker:

```sh
docker run -p 5432:5432 --rm -it -v anvilops:/var/lib/postgresql/data -e POSTGRES_USER=anvilops -e POSTGRES_PASSWORD=password postgres
```

## Running

**Note**: We're using Node.js's new TypeScript type stripping support, which requires Node.js version 23.6 or higher. When running the server manually, make sure to pass the `--experimental-strip-types` flag. If you can't update Node.js, use [`ts-node`](https://typestrong.org/ts-node/docs/usage).

First, install packages with `npm install`.

To work on the project locally, run `npm run dev`.
The app will restart whenever you make changes to `index.ts`.

In production, run `npm run start`.

The server runs on port 3000 by default.
