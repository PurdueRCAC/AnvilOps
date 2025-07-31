# AnvilOps Helm Chart

This chart will install AnvilOps (and optionally, its dependencies) in your Kubernetes cluster.

## Requirements

To install this chart, you will need a Kubernetes cluster with:

- A persistent volume provisioner (or you can create the volumes manually)
- An ingress controller that handles TLS termination

### Local Minikube Setup

If you are using Minikube to install AnvilOps locally, you can enable these with built-in addons:

(In a production environment, your cluster should already have these features set up! Only use this convenience script for local development.)

1. Default StorageClass
2. `hostPath` persistent volume provisioner
3. Ingress
   - Requires setting up a TLS certificate. In the script below, we use `mkcert` to generate a certificate. Then, we create a Kubernetes secret with the leaf certificate and copy the CA cert to the trust stores of your host system and the Minikube nodes.
4. Ingress DNS
   - Requires updating your system's DNS configuration to point to Minikube for `.minikube.local` domains. See link below for a guide.

This will help us replicate a production environment as closely as possible. If your cluster already has a storage provisioner, skip steps 1 and 2, and if it already has Ingress set up, skip steps 3 and 4.

```sh
set -e

NAMESPACE=default # The namespace that you're installing AnvilOps in

# STEP 1: Default StorageClass
minikube addons enable default-storageclass

# STEP 2: hostPath provisioner
minikube addons enable storage-provisioner

# STEP 3: Ingress and TLS certificate generation
minikube addons enable ingress

# Configure the Ingress addon to use a custom TLS certificate and then make your Minikube nodes trust that certificate
# This is necessary to run an image registry locally
CERTDIR="${MINIKUBE_HOME:-$HOME/.minikube}/files/etc/anvilops-tls"
CA_CERT="$CERTDIR/_wildcard.minikube.local.pem"
ROOT_CA="$CERTDIR/rootCA.pem"
mkdir -p $CERTDIR

if [ ! -f "$CERTDIR/rootCA.pem" ]; then
  # Generate a new certificate
  docker run -v $CERTDIR:/work -w /work --entrypoint=sh alpine/mkcert:latest -c 'mkcert "*.minikube.local" && cp /root/.local/share/mkcert/* .'
  sudo chown -R "$USER:$USER" "$CERTDIR"

  # Install the certificate in the system's local trust store
  if which apt; then
    # Assume Ubuntu or Debian
    sudo cp "$ROOT_CA" /etc/ssl/certs/_wildcard.minikube.local.crt
    sudo update-ca-certificates
  elif which dnf; then
    # Assume Fedora or RHEL
    sudo cp "$ROOT_CA" /etc/pki/ca-trust/source/anchors/
    sudo update-ca-trust
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    # Assume macOS
    sudo security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain "$ROOT_CA"
  else
    echo "Unknown OS. Can't install certificate manually."
    echo "Install the certificate at $(pwd)/_wildcard.minikube.local.pem into your system's local trust store."
  fi
fi

kubectl delete --ignore-not-found -n kube-system secret ingress-cert
kubectl delete --ignore-not-found -n ${NAMESPACE:-default} secret root-ca-cert

kubectl -n kube-system create secret tls ingress-cert --key $CERTDIR/_wildcard.minikube.local-key.pem --cert "$CA_CERT"
kubectl -n ${NAMESPACE:-default} create secret tls root-ca-cert --key $CERTDIR/rootCA-key.pem --cert "$ROOT_CA"

# If this command results in a "Are you sure you want to override?" message, just run `minikube addons configure ingress`, then type in `kube-system/ingress-cert` followed by `y` (to confirm you want to make the change)
echo "kube-system/ingress-cert" | minikube addons configure ingress || true # (if already configured, assume it was us)

# Re-enable the addon to apply the certificate change
minikube addons disable ingress
minikube addons enable ingress

# Copy the certificates to Minikube's certificate directory so that each node trusts our new CA (for the VM-based Minikube drivers)
mkdir -p "${MINIKUBE_HOME:-$HOME/.minikube}/files/etc/ssl/certs"
cp "$ROOT_CA" "${MINIKUBE_HOME:-$HOME/.minikube}/files/etc/ssl/certs"

# Restart Minikube to sync the certificates with the nodes
minikube start
echo 'sudo update-ca-certificates && exit' | minikube ssh || true

# STEP 4: Ingress DNS
minikube addons enable ingress-dns
```

Then, [follow steps 3 and 4 in this guide](https://minikube.sigs.k8s.io/docs/handbook/addons/ingress-dns/#:~:text=Add%20the%20%60minikube%20ip%60%20as%20a%20DNS%20server) to add Minikube as a DNS server on your machine and inside the cluster.

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
|     | **App proxy configuration**                                                                            | _The app proxy routes requests from one centralized location to users' apps based on the `Host` header._                                                                                                                                                               |                                                                                                 |
|     | `appProxy.image`                                                                                       | The image to use for the AnvilOps app proxy.                                                                                                                                                                                                                           | registry.anvil.rcac.purdue.edu/anvilops/sandbox-proxy:latest                                    |
|     | `appProxy.service.type`                                                                                | The type of service that AnvilOps runs in the cluster.                                                                                                                                                                                                                 | ClusterIP                                                                                       |
|     | `appProxy.service.port`                                                                                | The port that the AnvilOps app proxy will be accessible at within the cluster through its service.                                                                                                                                                                     | 80                                                                                              |
| ⭐  | `appProxy.ingress.enabled`                                                                             | Enable Ingress for the AnvilOps app proxy                                                                                                                                                                                                                              | true                                                                                            |
| ⭐  | `appProxy.ingress.className`                                                                           | Ingress class name for the AnvilOps app proxy                                                                                                                                                                                                                          |                                                                                                 |
|     | `appProxy.ingress.annotations`                                                                         | The public hostname of the AnvilOps dashboard. Should not contain the protocol.                                                                                                                                                                                        |                                                                                                 |
| ⭐  | `appProxy.ingress.hosts[].host`                                                                        |                                                                                                                                                                                                                                                                        | \*.minikube.local                                                                               |
| ⭐  | `appProxy.ingress.tls[].secretName`                                                                    | The name of the K8s Secret containing a wildcard TLS certificate                                                                                                                                                                                                       |                                                                                                 |
| ⭐  | `appProxy.ingress.tls[].hosts[]`                                                                       | A string array of the host names covered by the TLS certificate. Should contain a wildcard subdomain, e.g. `*.anvilops.rcac.purdue.edu`.                                                                                                                               |                                                                                                 |
|     | **Postgres configuration**                                                                             | _AnvilOps uses Postgres to store all user data except container images._                                                                                                                                                                                               |                                                                                                 |
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
|     | **Kubernetes Logging Operator configuration**                                                          | _AnvilOps uses the kube-logging operator to monitor pod logs and forward them to the backend for storage._                                                                                                                                                             |                                                                                                 |
| ⭐  | `logging-operator.install`                                                                             | Set to `true` to install the `kube-logging` operator in the cluster. This is required, but if you already have it installed, you should set this to `false`.                                                                                                           | true                                                                                            |
|     | **Tenant app configuration**                                                                           | _Options that apply to your users' apps when deployed in the cluster._                                                                                                                                                                                                 |                                                                                                 |
| ⭐  | `tenants.storageClassName`                                                                             | The storage class name that tenant persistent volume claims will use. Set to an empty string to disable persistent volume allocation in the UI.                                                                                                                        | standard                                                                                        |
| ⭐  | `tenants.accessModes`                                                                                  | The storage access modes that tenant persistent volume claims will use.                                                                                                                                                                                                | [ReadWriteOnce]                                                                                 |

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

## Utilities for Local Development

- If you're developing AnvilOps in a local Kubernetes cluster, you can rebuild and redeploy the app using the `charts/anvilops/scripts/redeploy.sh` script. This will build the image using Minikube's container engine and then patch the deployment to point to the new image tag. To prevent chart upgrades from overriding the image tag, add the `--set=anvilops.image=anvilops/anvilops:dev` flag to `helm [install|upgrade]`.

- If your CILogon configuration requires your redirect URL to be on localhost instead of `anvilops.minikube.local`, you can proxy traffic from the AnvilOps deployment to `localhost`:

  ```sh
  # 1) Set the base URL
  helm upgrade --install $RELEASE_NAME . --set anvilops.env.baseURL=http://localhost:3000

  # 2) Proxy traffic to that URL
  kubectl proxy svc/anvilops 3000:80

  # If you're restarting the AnvilOps deployment frequently, it may be useful to run `kubectl proxy` in a loop:
  while true; kubectl proxy svc/anvilops 3000:80 ; done
  ```

- If you need to delete the database volume, SSH into the Minikube node (replace `default` with the name of your namespace):
  ```
  echo 'sudo rm -rf /tmp/hostpath-provisioner/default/db-data-anvilops-postgres-0/* & exit' | minikube ssh && kubectl rollout restart statefulset anvilops-postgres
  ```

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

### `app-config`

#### What is this?

AnvilOps uses the values in this secret to associate end users' app namespaces with a Rancher project.

If you aren't using Rancher or if you want namespaces to be created outside of any Rancher project, you may omit this secret.

#### How to obtain

Create a namespace in the Rancher project that you want your users' apps to be deployed into.

Then, run this command, substituting `$NAMESPACE` with the name of the namespace you just created:

```sh
kubectl get ns $NAMESPACE -o jsonpath='{.metadata.annotations.field\.cattle\.io/projectId}'
```

The output should look something like this:

```
c-xxxxx:p-xxxxx
```

The identifier before the colon (`c-xxxxx`) is your cluster ID, and after the colon (`p-xxxxx`) is your project ID.

#### Keys

- `project-ns`: The cluster ID (the `c-xxxxx` part of the string above)
- `project-name`: The project ID (the `p-xxxxx` part of the string above)
