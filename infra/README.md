### Requirements

Before deploying these manifests, add the following secrets in the `anvilops-dev` namespace:

1. `anvilops` - should contain a GitHub deploy key. You can use the Flux CLI to generate this: https://fluxcd.io/flux/installation/bootstrap/github/#github-deploy-keys
2. `webhook-token` - should contain a random string in a key called `token`. You should use the contents of this secret in the Authorization header of any Harbor webhook requests
3. `postgres-password` - should contain a random string in a key called `password`.
