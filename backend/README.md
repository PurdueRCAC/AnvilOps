# backend

When AnvilOps is built as a Docker image, this Node.js app serves the static files in the `frontend` directory.

## Project Structure

The backend is divided into a few major components:

| Path           | Purpose                 | Allowed Imports | Notes                                                                                                                                                                      |
| -------------- | ----------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db`       | Database access         |                 |                                                                                                                                                                            |
| `src/handlers` | API route handlers      | `src/service`   | Handlers should only contain the logic required to map an HTTP request to a Service function call and back to an HTTP response. They shouldn't contain any business logic. |
| `src/service`  | Business logic          | `src/db`        | Services should explicitly list all their dependencies (repositories and other services) in their constructor so that they can be swapped out when necessary for testing.  |
| `src/jobs`     | Scripts run as cronjobs |                 | Jobs shouldn't import any AnvilOps code directly since some files have side effects (e.g. quitting if environment variables are invalid) that are unexpected in cron jobs. |

When a request is received, it'll go through a Handler first, which will call a function on its corresponding Service, which may execute database operations in the Database module or call other Services.

All of a Service's dependencies are defined in its constructor. The default instances of each Service are created in `src/service/index.ts`. At runtime, those instances are always used, and custom instances may be created with mock dependencies for testing.

All methods in the DB and Service modules should catch exceptions that reveal implementation details (e.g. Prisma errors) and rethrow them with classes enumerated in the method's `@throws` clause. The `cause` parameter should still include the original error.

Import restrictions are enforced by the `eslint-plugin-boundaries` ESLint plugin.

### Adding a new API Handler

1. Add a new entry to `paths` in the OpenAPI spec.
2. Run `npm run generate` in the `openapi` directory.
3. Create a new file in `service/` named after the operationId in the OpenAPI spec. This file should contain a class with one function, both named after the operationId. The class's constructor should receive the service's dependencies (repositories and other services) and store them as private instance variables so that the function can use them. This file shouldn't contain any HTTP implementation details like requests, responses, or status codes.
4. Create a new instance of the class you created in Step 4 in `src/service/index.ts`, plugging in default dependencies from the `db` and `service` modules.
5. Create a new file in `handlers/` named after the operationId in the OpenAPI spec. The file should contain one exported function named after the operationId plus the word "Handler". Use the HandlerMap type from `src/types.ts` to explicitly define the type of the handler function. This function should parse the request, call the corresponding Service function, catch any errors, and return a response.
6. Add the handler to the `handlers` map in `src/handlers/index.ts`.

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

### OIDC

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

In development, set the environment variable `RANCHER_BASE_URL` to the Rancher base URL (e.g. https://composable.anvil.rcac.purdue.edu). Also provide a non-cluster scoped token (base64-encoded) for the AnvilOps service user's account, under the `RANCHER_TOKEN` environment variable or the `api-token` key of the secret `rancher-config`.

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

Set the environment variable `LOGIN_TYPE` to the name of the login method that AnvilOps users use to sign into Rancher, e.g. `shibboleth`, `azuread`, or `github`. To obtain the exact name, visit `https://<RANCHER_API_BASE_URL>/v3/authConfigs` and use the `id` field for the configuration matching your selected login method. Also set the environment variable `LOGIN_CLAIM` to the CILogon OIDC claim that Rancher uses to set principalIds. See available claims at `https://www.cilogon.org/oidc`. It should represent the same value as the UID field of your Rancher authentication config.

### Kubernetes API

A kubeconfig file is needed to manage resources through the Kubernetes API. Specify the file by setting `KUBECONFIG` environment variable to its path. In development, if `KUBECONFIG` is not set, a kubeconfig file will be loaded from `$HOME/.kube`.

In production, create a secret `kube-auth` and set the key `kubeconfig` in the secret `kube-auth` to the kubeconfig file.

On Rancher-managed clusters, AnvilOps can automatically refresh the kubeconfig file. `kubeconfig` can be omitted from the secret, because AnvilOps will automatically fetch a kubeconfig during installation. In `kube-auth`, set the key `cluster-id` to the cluster ID associated with the kubeconfig. When viewing a cluster in Rancher, the URL will look something like `https://<RANCHER_SERVER>/dashboard/c/<cluster id>/explorer`.

Ensure that the user associated with the kubeconfig has permission to read namespaces globally.

---

**Note for Rancher-managed clusters**

If your cluster uses a Rancher version < v2.10, the kubeconfig file must be configured to use an [Authorized Cluster Endpoint](https://ranchermanager.docs.rancher.com/reference-guides/rancher-manager-architecture/communicating-with-downstream-user-clusters#4-authorized-cluster-endpoint). This is to avoid a [bug](https://github.com/rancher/rancher/issues/41988) related to user impersonation. See the documentation for your Rancher version on configuring an Authorized Cluster Endpoint and using its context in your kubeconfig.
In order to correctly refresh the kubeconfig, set the key `use-cluster-name` in the secret `kube-auth` to the name of the endpoint.

---

### Registry API

AnvilOps expects environment variables to be set to credentials of an account with repository delete permissions from your Harbor project:

- `REGISTRY_HOSTNAME`: the hostname of the registry
- `REGISTRY_PROTOCOL`: the protocol registry (`http` or `https`)
- `DELETE_REPO_USERNAME`: the account's username (if you're using a robot account, which we recommend, make sure to include the `robot$<project name>+` prefix)
- `DELETE_REPO_PASSWORD`: the account's password (if you're using a robot account, this is referred to as the account's secret in the Harbor UI)

## Running

**Note**: We're using Node.js's new TypeScript type stripping support, which requires Node.js version 23.6 or higher. When running the server manually, make sure to pass the `--experimental-strip-types` flag. If you can't update Node.js, use [`ts-node`](https://typestrong.org/ts-node/docs/usage).

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

AnvilOps can push logs, traces, and metrics to an OpenTelemetry collector. Set the `OTEL_EXPORTER_OTLP_ENDPOINT` field to a gRPC OTLP endpoint and make sure the app is being started with `--require backend/src/instrumentation.ts` (that path is `/app/src/instrumentation.ts` in Docker). In the default Docker container, the flag is added to the ENTRYPOINT, so you don't need to add it manually.

You can modify the service name with the `OTEL_SERVICE_NAME` environment variable. By default, it's "anvilops".
