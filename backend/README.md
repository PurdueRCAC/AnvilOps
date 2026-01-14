# backend

When AnvilOps is built as a Docker image, this Node.js app serves the static files in the `frontend` directory.

## Setup

### GitHub App

Create a GitHub App with the following settings:

| Setting                                                | Value (local development)                                                             | Value (production)                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Homepage URL                                           | http://localhost:5173                                                                 | https://anvilops.rcac.purdue.edu                                                                            |
| Callback URL                                           | http://localhost:5173/api/github/oauth2-callback<br>http://localhost:5173/import-repo | https://anvilops.rcac.purdue.edu/api/github/oauth2-callback<br>https://anvilops.rcac.purdue.edu/import-repo |
| Expire user authentication tokens                      | Yes                                                                                   | Yes                                                                                                         |
| Request user authorization (OAuth) during installation | No                                                                                    | No                                                                                                          |
| Setup URL                                              | http://localhost:5173/api/github/installation-callback                                | https://anvilops.rcac.purdue.edu/api/github/installation-callback                                           |
| Webhook: Active                                        | Yes                                                                                   | Yes                                                                                                         |
| Webhook URL                                            | See note below                                                                        | https://anvilops.rcac.purude.edu/api/github/webhook                                                         |
| Redirect on Update                                     | No                                                                                    | No                                                                                                          |

Note on webhook URLs in development: To receive webhook payloads, you will need to create a publicly-accessible URL that forwards to your machine. The GitHub docs recommend using [`smee`](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events#get-a-webhook-proxy-url) for this, or you could also use [`ngrok`](https://ngrok.com/) (account required).

Generate a random string for the webhook secret (e.g. `openssl rand -hex 32`). In development, add it to your `.env` file as `GITHUB_WEBHOOK_SECRET`, and in production, create a Kubernetes `Secret` called `github-app` and the key `webhook-secret`.

Repository Permissions:

- Actions: read-only
- Administration: read and write (to import repos)
- Checks: read and write
- Contents: read and write
- Deployments: read and write
- Metadata: read-only

Leave all other permissions on "No access".

Subscribe to events:

- Meta
- Push
- Repository
- Workflow dispatch
- Workflow run

After you create the app, copy the Client ID. In development, add it to `.env` as `GITHUB_CLIENT_ID`, and in production, add it to a key called `client-id` in the Secret you created earlier.

Do the same thing for the App ID, which should be an integer. Save it as `GITHUB_APP_ID` (`.env`) or `app-id` (K8s Secret).

Under "Client Secrets", click "Generate a new client secret". Copy the secret and save it as `GITHUB_CLIENT_SECRET` (`.env`) or `client-secret` (K8s Secret).

Scroll all the way down and click "Generate a private key". Copy the content of the downloaded file, encode it as Base64, and save it as `GITHUB_PRIVATE_KEY` (`.env`) or `private-key` (K8s Secret).

Finally, look at the URL in your browser. It should look something like this:

```
{your GitHub base URL}/settings/apps/{your app name}
```

Add them as environment variables:

- `GITHUB_APP_NAME` (in secret: `app-name`): Your app name (derived from the display name that you entered while creating the app)
- `GITHUB_BASE_URL` (`base-url`): The URL you use to access GitHub, including the protocol, with no trailing slash. Typically this is `https://github.com`, but it will vary if you're using GitHub Enterprise.
- `GITHUB_API_URL` (`api-url`): The URL of the GitHub API, including the protocol, with no trailing slash. For GitHub.com, this is `https://api.github.com`, but on GitHub Enterprise, it will likely be `https://<your GHES server>/api/v3`.

### CILogon

Environment variables:

- `CLIENT_ID`
- `CLIENT_SECRET`
- `ALLOwED_IDPS`: Optional comma-separated list of EntityIDs for CILogon IDPs to allow, e.g. https://access-ci.org/idp,https://idp.purdue.edu/idp/shibboleth. See https://cilogon.org/idplist/ for more supported IDPs.
- `SESSION_SECRET`: generate a random value, e.g. `openssl rand -hex 32`
- `BASE_URL`: the base URL of your AnvilOps deployment, e.g. http://localhost:3000 or https://anvilops.rcac.purdue.edu. When you set up CILogon, add "/api/oauth_callback" to this URL and use it as the OAuth callback URL.

### Postgres

Set the `DATABASE_URL` environment variable to a valid PostgreSQL connection string, including the username and password. In production, set the `password` key in the `postgres-credentials` secret. AnvilOps will attempt to connect to a database at the `anvilops-postgres` hostname with `anvilops` as the username and database name.

In addition, set `FIELD_ENCRYPTION_KEY` to a 32-byte base64-encoded key, which will be used to encrypt the keys used to protect app secrets.

If you need a temporary Postgres database, create one with Docker:

```sh
docker run -p 5432:5432 --rm -it -v anvilops:/var/lib/postgresql/data -e POSTGRES_USER=anvilops -e POSTGRES_PASSWORD=password postgres
```

### Rancher

For access control, AnvilOps can integrate with the Rancher API. If you are not using Rancher, leave the following values unset.

In development, set the environment variable `RANCHER_API_BASE` to the Rancher v3 API base URL (e.g. https://composable.anvil.rcac.purdue.edu/v3). In production, set the `api-base` key of the `rancher-config` secret instead. Also provide a non-cluster scoped token (base64-encoded) for the AnvilOps service user's account, under the `RANCHER_TOKEN` environment variable or the `api-token` key of `rancher-config`.

If you would like to make a sandbox project available to users, set the environment variable `SANDBOX_ID` to its project ID. In production, set the the `sandbox-id` key of the `rancher-config` secret.

To obtain the ID of a Rancher project, first create a namespace inside it.

Then, run this command, substituting `$NAMESPACE` with the name of the namespace you just created:

```sh
kubectl get ns $NAMESPACE -o jsonpath='{.metadata.annotations.field\.cattle\.io/projectId}'
```

The project ID should look something like this:

```
c-xxxxx:p-xxxxx
```

Copy this value into your configuration.

Ensure that the user associated with the kubeconfig file has permissions to view Users, Projects, and ProjectRoleTemplateBindings, as well as to manage namespaces within the sandbox project.

Finally, in order to link users with their Rancher accounts, AnvilOps needs additional information about how to match login information with user ids.

Set the environment variable `LOGIN_TYPE` to the name of the login method that AnvilOps users use to sign into Rancher, e.g. `shibboleth`, `azuread`, or `github`. To obtain the exact name, visit `https://<RANCHER_API_BASE>/authConfigs` and use the `id` field for the configuration matching your selected login method. Also set the environment variable `LOGIN_CLAIM` to the CILogon OIDC claim that Rancher uses to set principalIds. See available claims at `https://www.cilogon.org/oidc`. It should represent the same value as the UID field of your Rancher authentication config.

### Kubernetes API

A kubeconfig file is needed to manage resources through the Kubernetes API. Specify the file by setting `KUBECONFIG` environment variable to its path. In development, if `KUBECONFIG` is not set, a kubeconfig file will be loaded from `$HOME/.kube`. In production, set the key `kubeconfig` in the secret `kube-auth` to the kubeconfig file.

---

**Note for Rancher-managed clusters**

If your cluster uses a Rancher version < v2.10, the kubeconfig file must be configured to use an [Authorized Cluster Endpoint](https://ranchermanager.docs.rancher.com/reference-guides/rancher-manager-architecture/communicating-with-downstream-user-clusters#4-authorized-cluster-endpoint). This is to avoid a [bug](https://github.com/rancher/rancher/issues/41988) related to user impersonation. See the documentation for your Rancher version on configuring an Authorized Cluster Endpoint and using its context in your kubeconfig.

---

### Registry API

AnvilOps expects environment variables to be set to credentials of an account with repository delete permissions from your Harbor project:

- `DELETE_REPO_HOST`: the hostname of the registry
- `DELETE_REPO_USERNAME`: the account's username (if you're using a robot account, which we recommend, make sure to include the `robot$<project name>+` prefix)
- `DELETE_REPO_PASSWORD`: the account's password (if you're using a robot account, this is referred to as the account's secret in the Harbor UI)

## Running

**Note**: We're using Node.js's new TypeScript type stripping support, which requires Node.js version 23.6 or higher. When running the server manually, make sure to pass the `--experimental-strip-types` flag. If you can't update Node.js, use [`ts-node`](https://typestrong.org/ts-node/docs/usage).

**Note**: `regctl` must be installed on your system to fetch the image information needed to wrap images with the `log-shipper`. If you're running AnvilOps locally outside of one of the development or production container images, install `regctl` with one of the methods in this guide: https://regclient.org/install/.

First, install packages with `npm install`.

To work on the project locally, run `npm run dev`.
The app will restart whenever you make changes to `index.ts`.

To run without automatically reloading whenever source files change, run `npm run start`.

The server runs on port 3000 by default.

## Generating and Running Database Migrations

We use Prisma Migrate to handle database migrations. When you make a change to `prisma/schema.prisma`, create a migration:

```sh
npx prisma migrate dev --name $DESCRIPTIVE_MIGRATION_NAME
```

This will automatically create a SQL file at `prisma/migrations/(your migration name)/migration.sql` and apply the changes to the database (determined by the `DATABASE_URL` environment variable).

In production, apply the changes like this:

```sh
npx prisma migrate deploy
```

## OpenTelemetry

AnvilOps can push logs, traces, and metrics to an OpenTelemetry collector. Set the `OTEL_EXPORTER_OTLP_ENDPOINT` field to a gRPC OTLP endpoint and make sure the app is being started with `--require backend/src/instrumentation.ts` (that path is `/app/src/instrumentation.ts` in Docker).

You can modify the service name with the `OTEL_SERVICE_NAME` environment variable. By default, it's "anvilops".
