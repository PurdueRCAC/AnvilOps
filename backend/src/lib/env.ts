type EnvVarDefinition =
  | {
      required: true;
    }
  | { required: false; defaultValue?: string };

const variables = {
  /**
   * Should be set to "development" when developing locally outside of a container and "production" otherwise
   */
  NODE_ENV: { required: false, defaultValue: "production" },
  /**
   * Set this to any non-null value when AnvilOps is running in a Tilt development environment
   */
  IN_TILT: { required: false, defaultValue: null },
  /**
   * The CILogon OAuth client ID
   */
  CLIENT_ID: { required: true },
  /**
   * The CILogon OAuth client secret
   */
  CLIENT_SECRET: { required: true },
  /**
   * A comma-separated list of CILogon identity provider identifiers(EntityIDs) to allow when users sign in to AnvilOps, e.g. https://access-ci.org/idp,https://idp.purdue.edu/idp/shibboleth
   */
  ALLOWED_IDPS: { required: false },
  /**
   * The name of the login method AnvilOps users would use to sign in on Rancher, e.g. shibboleth, azuread, github.
   */
  LOGIN_TYPE: { required: true },
  /**
   * A token claim from CILogon. The value from the IdP that Rancher uses to set the principalId, e.g. eppn. See more at https://www.cilogon.org/oidc
   */
  LOGIN_CLAIM: { required: true },
  /**
   * The absolute URL of your AnvilOps deployment on the internet, e.g. https://anvilops.rcac.purdue.edu
   */
  BASE_URL: { required: true },
  /**
   * The absolute URL of your AnvilOps deployment intended to be accessed within the cluster only, e.g. http://anvilops-service.anvilops-dev.svc.cluster.local
   *
   * Used for faster HTTP requests. If not specified, BASE_URL is used instead.
   */
  CLUSTER_INTERNAL_BASE_URL: {
    required: false,
    defaultValue: process.env.BASE_URL,
  },
  /**
   * An absolute URL of the domain name that end users' apps are accessible under when they're deployed,
   * e.g. https://anvilops.rcac.purdue.edu.
   *
   * When computing the subdomain to show to users, we will use the same protocol that you specify here and then place the user's subdomain before the domain name.
   *
   * For example, if APP_DOMAIN was https://anvilops.rcac.purdue.edu and the user set their subdomain to "test", then they should be able to access the app at https://test.anvilops.rcac.purdue.edu.
   *
   * If this variable is not specified, subdomains will not be shown to users.
   */
  APP_DOMAIN: { required: false },
  /**
   * Path to the JSON file describing the cluster on which AnvilOps is installed.
   */
  CLUSTER_CONFIG_PATH: { required: false },
  /**
   * A random value used to sign the session ID cookie
   */
  SESSION_SECRET: { required: true },
  /**
   * A Postgres connection string to connect to the AnvilOps database
   */
  DATABASE_URL: { required: false },
  /**
   * Include this if you didn't already specify DATABASE_URL
   */
  POSTGRES_USER: { required: false },
  /**
   * Include this if you didn't already specify DATABASE_URL
   */
  POSTGRES_PASSWORD: { required: false },
  /**
   * Include this if you didn't already specify DATABASE_URL
   */
  POSTGRES_HOSTNAME: { required: false },
  /**
   * Include this if you didn't already specify DATABASE_URL
   */
  POSTGRES_DB: { required: false },
  /**
   * A random value used to encrypt users' environment variables in the database
   */
  FIELD_ENCRYPTION_KEY: { required: true },
  /**
   * The base URL of the GitHub instance, e.g. https://github.com or https://github.rcac.purdue.edu
   */
  GITHUB_BASE_URL: { required: true },
  /**
   * The base URL of the GitHub instance's API, e.g. https://api.github.com or https://github.rcac.purdue.edu/api/v3
   */
  GITHUB_API_URL: { required: true },
  /**
   * The numeric ID of the GitHub App, e.g. 11
   */
  GITHUB_APP_ID: { required: true },
  /**
   * The slug of the GitHub App, e.g. anvilops
   */
  GITHUB_APP_NAME: { required: true },
  /**
   * The OAuth client ID associated with the GitHub App, used to authenticate as a user
   */
  GITHUB_CLIENT_ID: { required: true },
  /**
   * The OAuth client secret associated with the GitHub App, used to authenticate as a user
   */
  GITHUB_CLIENT_SECRET: { required: true },
  /**
   * The private key associated with the GitHub App, used to authenticate as an installation
   */
  GITHUB_PRIVATE_KEY: { required: true },
  /**
   * A secret value used by GitHub to sign its webhook requests so that we can verify that webhook payloads aren't being spoofed
   */
  GITHUB_WEBHOOK_SECRET: { required: true },
  /**
   * The hostname of a Harbor instance that contains users' app container images, e.g. https://registry.anvil.rcac.purdue.edu. Used to delete old images when an app is deleted.
   */
  DELETE_REPO_HOST: { required: true },
  /**
   * The username of a Harbor robot account that can delete image repositories (including the `robot$<project name>+` prefix). Used to delete old images when an app is deleted.
   */
  DELETE_REPO_USERNAME: { required: true },
  /**
   * The password of a Harbor robot account that can delete image repositories. Used to delete old images when an app is deleted.
   */
  DELETE_REPO_PASSWORD: { required: true },
  /**
   * The base URL for the Rancher v3 API, e.g. https://composable.anvil.rcac.purdue.edu/v3.
   */
  RANCHER_API_BASE: { required: false },
  /**
   * Unscoped token for making calls to the Rancher v3 API.
   */
  RANCHER_TOKEN: { required: false },
  /**
   * The Rancher project ID that all users on a Rancher-managed cluster are allowed to create apps in. If omitted, users will only be able to create applications in their own projects.
   */
  SANDBOX_ID: { required: false },
  /**
   * The Kubernetes namespace that all AnvilOps jobs should run in, e.g. anvilops-dev
   */
  CURRENT_NAMESPACE: { required: true },
  /**
   * The hostname for the image registry, e.g. registry.anvil.rcac.purdue.edu
   */
  REGISTRY_HOSTNAME: { required: true },
  /**
   * The protocol used to contact the image registry over HTTP (should be "http" or "https")
   */
  REGISTRY_PROTOCOL: { required: false, defaultValue: "https" },
  /**
   * The image that serves file information for the Files tab on the app page
   */
  FILE_BROWSER_IMAGE: {
    required: false,
    defaultValue: "registry.anvil.rcac.purdue.edu/anvilops/file-browser:latest",
  },
  /**
   * The image that clones a repository and uses its Dockerfile to send a build job to BuildKit
   */
  DOCKERFILE_BUILDER_IMAGE: {
    required: false,
    defaultValue:
      "registry.anvil.rcac.purdue.edu/anvilops/dockerfile-builder:latest",
  },
  /**
   * The image that clones a repository and uses Railpack to send a build job to BuildKit
   */
  RAILPACK_BUILDER_IMAGE: {
    required: false,
    defaultValue:
      "registry.anvil.rcac.purdue.edu/anvilops/railpack-builder:latest",
  },
  /**
   * The image that copies the log shipper binary to a destination path, used in an initContainer to start collecting logs from users' apps (see backend/src/lib/cluster/resources/logs.ts for more details)
   */
  LOG_SHIPPER_IMAGE: {
    required: false,
    defaultValue: "registry.anvil.rcac.purdue.edu/anvilops/log-shipper:latest",
  },
  /**
   * The storageClassName to use when provisioning tenant apps. If you omit this value, storage-related options will be hidden.
   */
  STORAGE_CLASS_NAME: { required: false },
  /**
   * The accessModes to use when provisioning tenant apps in a comma-separated list. Don't include any spaces before or after the commas.
   *
   * Defaults to "ReadWriteOnce". Read more about access modes here: https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes
   */
  STORAGE_ACCESS_MODES: { required: false, defaultValue: "ReadWriteOnce" },
  /**
   * The name of the Habor project to use. Used in image tags and when deleting images using the Harbor API.
   *
   * If your image tag looks like this:
   * ```
   * registry.anvil.rcac.purdue.edu/anvilops/my-app:latest
   *                                ^^^^^^^^
   *                                This is your project name
   * ```
   */
  HARBOR_PROJECT_NAME: { required: true },
  /**
   * The address of the BuildKit daemon. Must be accessible by the pods running image build jobs.
   */
  BUILDKITD_ADDRESS: { required: false, defaultValue: "tcp://buildkitd:1234" },
} as const satisfies Record<string, EnvVarDefinition>;

export const env = {} as Record<keyof typeof variables, string>;

for (const [key, _params] of Object.entries(variables)) {
  const params = _params as EnvVarDefinition;
  const value = process.env[key];
  if (value === undefined) {
    if (params.required === true) {
      throw new Error("Environment variable " + key + " not found.");
    } else if (params.defaultValue !== undefined) {
      env[key] = params.defaultValue;
    }
  } else {
    env[key] = value;
  }
}

// Either DATABASE_URL or the separate variables must be specified
if (
  !env["DATABASE_URL"] &&
  !(
    env["POSTGRES_DB"] &&
    env["POSTGRES_HOSTNAME"] &&
    env["POSTGRES_USER"] &&
    env["POSTGRES_PASSWORD"]
  )
) {
  throw new Error("Postgres environment variables are not set!");
}

export const parseCsv = (values: string | undefined) => {
  if (!values?.trim()) return undefined;
  const cleaned = values
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
};
