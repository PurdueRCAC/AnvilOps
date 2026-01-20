# AnvilOps Helm Chart

This chart will install AnvilOps (and optionally, its dependencies) in your Kubernetes cluster.

## Requirements

To install this chart, you will need a Kubernetes cluster with:

- A persistent volume provisioner (or you can create the volumes manually)
- An ingress controller that handles TLS termination and DNS name generation

## Configuration

If an option has a ⭐ beside it, you will likely have to change it to fit your environment. Make sure you fill in values for at least those variables.

|     | Option                                                                                                 | What it does                                                                                                                                                                                                                                                           | Default                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
|     | `anvilops.replicaCount`                                                                                | Scale the AnvilOps deployment to this many replicas                                                                                                                                                                                                                    | 1                                                                                               |
|     | `anvilops.image`                                                                                       | Sets the image to use for the AnvilOps deployment                                                                                                                                                                                                                      | `registry.anvil.rcac.purdue.edu/anvilops/anvilops:latest`                                       |
|     | `anvilops.imagePullPolicy`                                                                             |                                                                                                                                                                                                                                                                        | `IfNotPresent`                                                                                  |
| ⭐  | `anvilops.env.baseURL`                                                                                 | The base URL that AnvilOps should be publicly accessible at, including the protocol. Used to determine the redirect URL for CILogon.                                                                                                                                   | http://anvilops.minikube.local                                                                  |
| ⭐  | `anvilops.env.appDomain`                                                                               | The domain name that AnvilOps apps are deployed on. Users will be shown subdomains of this domain as their custom subdomain.                                                                                                                                           | http://minikube.local                                                                           |
| ⭐  | `anvilops.env.harborProjectName`                                                                       | The name of the Harbor project to put users' AnvilOps apps in.                                                                                                                                                                                                         | anvilops                                                                                        |
| ⭐  | `anvilops.env.allowedIdps`                                                                             | An optional comma-separated list of [CILogon EntityIDs](https://cilogon.org/idplist/) to allow login from.                                                                                                                                                             | https://access-ci.org/idp                                                                       |
| ⭐  | `anvilops.cluster.name`                                                                                | The name of the cluster, which will be displayed on the landing page.                                                                                                                                                                                                  |
| ⭐  | `anvilops.cluster.faq.question`                                                                        | The title of an FAQ item which will be displayed on the landing page, and can be used to describe the cluster.                                                                                                                                                         |
| ⭐  | `anvilops.cluster.faq.answer`                                                                          | The answer of an FAQ item which will be displayed on the landing page, and can be used to describe the cluster.                                                                                                                                                        |
| ⭐  | `anvilops.cluster.faq.link`                                                                            | A link to more information about the cluster.                                                                                                                                                                                                                          |
|     | `anvilops.nameOverride`                                                                                | Override the name used in the `kubernetes.io/name` label.                                                                                                                                                                                                              |                                                                                                 |
|     | `anvilops.fullnameOverride`                                                                            | Override the DNS label name used to create K8s resource names within the chart.                                                                                                                                                                                        |                                                                                                 |
|     | `anvilops.securityContext`                                                                             | The AnvilOps pod's security context.                                                                                                                                                                                                                                   |                                                                                                 |
| ⭐  | `anvilops.serviceAccount.create`                                                                       | Set to `true` to create a ServiceAccount for AnvilOps.                                                                                                                                                                                                                 | true                                                                                            |
|     | `anvilops.serviceAccount.annotations`                                                                  | Add annotations to the automatically-created ServiceAccount.                                                                                                                                                                                                           |                                                                                                 |
| ⭐  | `anvilops.serviceAccount.name`                                                                         | If `create` is `false`, this field specifies the name of the ServiceAccount to use. If `create` is `true`, this field specifies the name of the ServiceAccount to generate.                                                                                            | ""                                                                                              |
| ⭐  | `anvilops.serviceAccount.secretName`                                                                   | If present, specified the name of a Secret that contains a key called "kubeconfig" with the full contents of a kube config file. This option allows you to run AnvilOps with a user account instead of a ServiceAccount.                                               | ""                                                                                              |
|     | `anvilops.service.type`                                                                                | The type of service that AnvilOps runs in the cluster.                                                                                                                                                                                                                 | ClusterIP                                                                                       |
|     | `anvilops.service.port`                                                                                | The port that AnvilOps will be accessible at within the cluster through its service.                                                                                                                                                                                   | 80                                                                                              |
| ⭐  | `anvilops.ingress.enabled`                                                                             | Enable Ingress for the AnvilOps dashboard                                                                                                                                                                                                                              | true                                                                                            |
| ⭐  | `anvilops.ingress.className`                                                                           | Ingress class name for the AnvilOps dashboard                                                                                                                                                                                                                          | ""                                                                                              |
|     | `anvilops.ingress.annotations`                                                                         |                                                                                                                                                                                                                                                                        |                                                                                                 |
| ⭐  | `anvilops.ingress.hosts[].host`                                                                        | The public hostname of the AnvilOps dashboard. Should not contain the protocol.                                                                                                                                                                                        | anvilops.minikube.local                                                                         |
|     | `anvilops.ingress.hosts[].paths[].path`                                                                | The base path to run AnvilOps on. Currently, AnvilOps only supports running on `/`.                                                                                                                                                                                    | /                                                                                               |
|     | `anvilops.ingress.hosts[].paths[].pathType`                                                            | [Path type](https://kubernetes.io/docs/concepts/services-networking/ingress/#path-types)                                                                                                                                                                               | Prefix                                                                                          |
| ⭐  | `anvilops.ingress.tls[].secretName`                                                                    | The name of the K8s Secret containing a TLS certificate                                                                                                                                                                                                                |                                                                                                 |
| ⭐  | `anvilops.ingress.tls[].hosts[]`                                                                       | A string array of the host names covered by the TLS certificate                                                                                                                                                                                                        |                                                                                                 |
|     | `anvilops.resources`                                                                                   | Kubernetes [resource quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/) for each AnvilOps pod                                                                                                                                                        | Requests: CPU: 500m, memory: 512Mi, Limits: CPU: 1000m, memory: 1Gi                             |
|     | `anvilops.nodeSelector`                                                                                |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | `anvilops.tolerations`                                                                                 |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | `anvilops.affinity`                                                                                    |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | **App ingress configuration**                                                                          | _These values influence the generated `Ingress` configuration created for every app._                                                                                                                                                                                  |                                                                                                 |
| ⭐  | `anvilops.apps.ingress.className`                                                                      | Ingress class name                                                                                                                                                                                                                                                     | nginx                                                                                           |
|     | `anvilops.apps.ingress.annotations`                                                                    | Annotations added to end users' `Ingress` resources.                                                                                                                                                                                                                   |                                                                                                 |
|     | **Rancher configuration**                                                                              | _AnvilOps can integrate with Rancher to deploy applications inside Projects._                                                                                                                                                                                          |                                                                                                 |
| ⭐  | `rancher.enabled`                                                                                      | Enable Rancher integrations.                                                                                                                                                                                                                                           | false                                                                                           |
| ⭐  | `rancher.apiBase`                                                                                      | Base URL of the Rancher v3 API.                                                                                                                                                                                                                                        |                                                                                                 |
|     | `rancher.refreshTokens`                                                                                | Enable automatic rotation of Rancher API tokens and kubeconfig files via a CronJob.                                                                                                                                                                                    | true                                                                                            |
| ⭐  | `rancher.refreshSchedule`                                                                              | Cron schedule for the token rotation job. Uses standard cron format (minute hour day month weekday).                                                                                                                                                                   | "0 0 25 \* \*"                                                                                  |
|     | **Postgres configuration**                                                                             | _AnvilOps uses Postgres to store all user data except container images._                                                                                                                                                                                               |                                                                                                 |
|     | `postgres.generateCredentials`                                                                         | Automatically generate a password and field encryption secret and store them in a secret called `postgres-credentials`. If you set this to `false`, populate that secret with random values in the `password` and `field-encryption-key` keys.                         | true                                                                                            |
|     | `postgres.image`                                                                                       | The image to use for the Postgres deployment.                                                                                                                                                                                                                          | postgres:17                                                                                     |
|     | `postgres.nodeSelector`                                                                                |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | `postgres.tolerations`                                                                                 |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | `postgres.affinity`                                                                                    |                                                                                                                                                                                                                                                                        |                                                                                                 |
| ⭐  | `postgres.volumeClaimTemplate`                                                                         | The PersistentVolumeClaim template to use for Postgres. Alter this to fit your cluster's storage class and desired volume size. See [the Kubernetes docs]() for more info.                                                                                             | accessModes: ["ReadWriteOnce"], storageClassName: "standard", resources.requests.storage: "1Gi" |
|     | **BuildKit daemon configuration**                                                                      | _AnvilOps uses BuildKit to run image builds._                                                                                                                                                                                                                          |                                                                                                 |
| ⭐  | `buildkitd.install`                                                                                    | Set to `true` to install the BuildKit daemon in the cluster. This is required, but if you already have it installed, you should set this to `false`. Note that this requires `privileged: true` to be set on the Pod.                                                  | true                                                                                            |
| ⭐  | `buildkitd.address`                                                                                    | The address of the BuildKit daemon. Should start with `tcp://` unless you modify the chart to use a Unix socket.                                                                                                                                                       | tcp://buildkitd:1234                                                                            |
|     | `buildkitd.replicaCount`                                                                               | The number of BuildKit pods to run                                                                                                                                                                                                                                     | 1                                                                                               |
|     | `buildkitd.nodeSelector`                                                                               |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | `buildkitd.tolerations`                                                                                |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | `buildkitd.affinity`                                                                                   |                                                                                                                                                                                                                                                                        |                                                                                                 |
|     | **Harbor configuration**                                                                               | _AnvilOps uses Harbor to store users' container images. See the [README](https://github.com/goharbor/harbor-helm/?tab=readme-ov-file#configuration) for more details._                                                                                                 |                                                                                                 |
| ⭐  | `harbor.install`                                                                                       | Set to `true` to install the Harbor image registry in the cluster. This is required, but if you already have it installed, you should set this to `false`. **If you choose to set `install` to `false`, you will need to fill in `harbor.expose.ingress.hosts.core`!** | true                                                                                            |
| ⭐  | `harbor.persistence.persistentVolumeClaim.{registry,jobservice,database,redis,trivy}.storageClassName` | Set the storage class names of Harbor's persistent volume claims.                                                                                                                                                                                                      | standard                                                                                        |
| ⭐  | `harbor.expose.type`                                                                                   | Set to `ingress`, `clusterIP`, `nodePort` or `loadBalancer`.                                                                                                                                                                                                           | ingress                                                                                         |
| ⭐  | `harbor.expose.tls.enabled`                                                                            | Set to `false` if you are terminating TLS before hitting the registry pod, e.g. with an Ingress controller. If you set this to `true`, you will need to configure TLS according to the Harbor Helm chart's README linked above.                                        | false                                                                                           |
| ⭐  | `harbor.expose.ingress.hosts.core`                                                                     | The public hostname of your container registry. **This value is used by AnvilOps to push images and write Kubernetes specs.**                                                                                                                                          | registry.minikube.local                                                                         |
|     | **Tenant app configuration**                                                                           | _Options that apply to your users' apps when deployed in the cluster._                                                                                                                                                                                                 |                                                                                                 |
| ⭐  | `tenants.storageClassName`                                                                             | The storage class name that tenant persistent volume claims will use. Set to an empty string to disable persistent volume allocation in the UI.                                                                                                                        | standard                                                                                        |
| ⭐  | `tenants.accessModes`                                                                                  | The storage access modes that tenant persistent volume claims will use.                                                                                                                                                                                                | [ReadWriteOnce]                                                                                 |
|     | **OpenTelemetry configuration**                                                                        |                                                                                                                                                                                                                                                                        |                                                                                                 |
| ⭐  | `anvilops.env.otelEndpoint`                                                                            | The OpenTelementry endpoint (must be gRPC) to send logs, traces, and metrics to.                                                                                                                                                                                       |                                                                                                 |
| ⭐  | `anvilops.env.otelServiceName`                                                                         | The OpenTelemetry service name                                                                                                                                                                                                                                         | anvilops                                                                                        |

## Installation

1. Install [`helm`](https://helm.sh/docs/intro/install/) on your system
2. Create secrets in your cluster as described in the [Required Secrets](#required-secrets) section
3. Create a `values.yaml` file if you need to customize any AnvilOps configuration options. Use [this file](/charts/anvilops/values.yaml) as a guide.
4. Install the chart:

```sh
RELEASE_NAME=anvilops

git clone https://github.rcac.purdue.edu/RCAC-Staff/AnvilOps
cd AnvilOps/charts/anvilops
helm upgrade --install $RELEASE_NAME .
# (`upgrade --install` will install the chart or update it if it's already installed)
```

## More on Ingress Configuration

When you configure AnvilOps to support public subdomains by setting the `anvilops.env.appDomain` field, AnvilOps creates an `Ingress` for every user's app. It's configured to route requests from the user's subdomain on any path to the app's `Service`.

This default configuration assumes that your networking setup already handles TLS termination and DNS resolution.

If you need to set this up, it's easiest to create a wildcard TLS certificate for all subdomains of your `appDomain`.
Then, configure your DNS records to point all subdomains of your `appDomain` to your cluster's ingress controller.

For example, if your `appDomain` was `https://example.com` (users' apps would be subdomains of this, e.g. `myapp1.example.com` and `myapp2.example.com`):

1. Create a TLS certificate for `*.example.com` and configure your ingress controller to use it by default. If you're using the Nginx ingress controller, follow [this guide](https://kubernetes.github.io/ingress-nginx/user-guide/tls/#default-ssl-certificate) to set a default certificate.
2. Create a DNS record:

- Type: `A` or `AAAA`
- Domain: `*.example.com`
- IP: the public IP address of your ingress controller

## Required Secrets

Every secret in this section must exist for AnvilOps to run.
The Helm chart does not create these secrets automatically unless stated otherwise.

You can create a secret in Kubernetes with this command:

```sh
kubectl create secret generic $SECRET_NAME --from-literal=$KEY=$VALUE
```

In this example, `$SECRET_NAME` is the name of the secret (later specified in headings) and `$KEY` and `$VALUE` are a key-value pair that belongs to the secret. You can repeat the `--from-literal` argument as many times as needed, e.g. `--from-literal=key1=value1 --from-literal=key2=value2` to create a secret with two key-value pairs.

If you are not using the default namespace, add the `-n $NAMESPACE` argument, where `$NAMESPACE` is the name of your namespace.

**Make sure you create your secrets in the same namespace that you install the Helm chart!**

### `cilogon-credentials`

#### What is this?

CILogon is the sign-in provider that AnvilOps uses. Before gaining access to the dashboard, users sign in with CILogon, which gives them the option to sign in with a number of other providers, including ACCESS CI.

#### How to obtain

Follow the steps in the Client Registration section of [CILogon's OICD Guide](https://www.cilogon.org/oidc#:~:text=Client%20Registration).

#### Keys

- `client-id`: Your CILogon OAuth client ID
- `client-secret`: Your CILogon OAuth client secret

### Registry Credentials

#### What is this?

These secrets allow AnvilOps to interact with your container registry. AnvilOps needs to be able to pull images (to run users' apps), push images (to make users' apps accessible in the cluster), and delete images (to clean up apps' images when the app is deleted). These credentials are used in different places, so they are separated across multiple accounts. It is recommended to use different robot accounts, but you could also create one robot account with all of the necessary permissions and copy the credentials three times.

The secret for pulling images needs to be separate because Kubernetes has a special secret type to be used in the `ImagePullSecrets` field of a container.

#### How to obtain

**If you set `install: true` in the `harbor` section of `values.yaml`, this secret will be populated automatically** a few minutes after installing the chart for the first time. If not, you will need to create a few robot accounts and populate their details manually into a new secret.

#### Keys

These secrets (except for the last one) have to be created with the type `kubernetes.io/dockerconfigjson`. The easiest way to do this is with `kubectl`:

```sh
NAMESPACE=default

# If you're deploying locally, use a subdomain of the local hostname you set up above (*.minikube.local):
HOSTNAME=registry.minikube.local

# If you're deploying to production, use a domain that your Ingress controller allows.
# HOSTNAME=registry.anvil.rcac.purdue.edu

# Credentials for a robot account with repository pull permissions:
PULL_USERNAME= # The username of the robot account (including the `robot$<project name>+` part at the beginning)
PULL_PASSWORD= # The secret displayed in the UI after you created the robot account

# Credentials for a robot account with repository push and pull permissions:
PUSH_USERNAME= # (remember to escape dollar signs in single quotes!)
PUSH_PASSWORD=

# Credentials for a robot account with repository delete permissions:
DELETE_USERNAME=
DELETE_PASSWORD=

kubectl create secret -n $NAMESPACE docker-registry image-pull-secret --docker-server=$HOSTNAME --docker-username=$PULL_USERNAME --docker-password=$PULL_PASSWORD
kubectl create secret -n $NAMESPACE docker-registry image-push-secret --docker-server=$HOSTNAME --docker-username=$PUSH_USERNAME --docker-password=$PUSH_PASSWORD
kubectl create secret -n $NAMESPACE generic image-delete-secret --from-literal=server=$HOSTNAME --from-literal=username=$DELETE_USERNAME --from-literal=password=$DELETE_PASSWORD
```

### `github-app`

#### What is this?

GitHub Apps allow users to grant authorization for an application to access certain repositories and be notified of changes to those repositories. We use our GitHub App to:

- monitor repositories for new pushes
- clone repositories
- update commit statuses when builds start and end
- ...and more

#### How to obtain

Follow the steps in the GitHub App section of the [backend setup guide](/backend/README.md#github-app).

#### Keys

Each key here is documented in further detail in the guide linked above in the "How to obtain" section.

- `webhook-secret`: A randomly-generated secret that you add to your GitHub App configuration
- `client-id`: Your GitHub OAuth client ID
- `client-secret`: Your GitHub OAuth client secret
- `app-id`: Your GitHub app ID (should be a number, e.g. `11`)
- `app-name`: Your GitHub app slug (should be a lowercase, alphanumeric version of your app's display name, e.g. `anvilops`)
- `base-url`: The base URL of your GitHub instance (e.g. `https://github.com` or `https://github.rcac.purdue.edu`)
- `api-url`: The API URL of your GitHub instance (e.g. `https://api.github.com` or `https://github.rcac.purdue.edu/api/v3`)
- `private-key`: Your GitHub app's private key encoded as Base64

  All K8s secret values are encoded as Base64, but this one is encoded twice because it contains newlines, so the application expects to receive it in Base64 format.

### `rancher-config`

#### What is this?

AnvilOps uses the values in this secret to integrate with [Rancher](https://www.rancher.com/).

If you aren't using Rancher, you may omit this secret.

#### How to obtain

Follow the instructions in the Rancher section of the [backend setup guide](/backend/README.md#rancher).

#### Keys

- `api-base`: The Rancher v3 API base URL (e.g. https://composable.anvil.rcac.purdue.edu/v3).
- `rancher-token`: Non-scoped, Base64-encoded service user token for calling the Rancher v3 API.
- `sandbox_id`(optional): The ID of the sandbox project, something like `c-xxxxx:p-xxxxx`.

## `postgres-credentials`

AnvilOps uses the values in this secret to protect the database, which contains app configurations.

#### How to obtain

Follow the instructions in the Rancher section of the [backend setup guide](/backend/README.md#postgres).

#### Keys

- `password`: The password for the database to use.
- `field-encryption-key`: 32-byte, base64-encoded key used to encrypt app secrets before they are entered in the database.
