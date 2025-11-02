---
title: Frequently Asked Questions
sidebar:
  order: 20
---

## GitHub

### I can't install the GitHub App on my account.

- If you previously installed the app, go to `<your_GitHub_base_URL>/settings/installations` and uninstall it.

### My build failed.

- First, check the build logs. To do so, go to the overview tab for the application and click the three lines next to the matching deployment entry.
- For Railpack issues, also check the [Railpack documentation](https://railpack.com/getting-started).

### My application doesn't redeploy when I push a commit.

- On the overview tab for the app and ensure that continuous deployment is turned on.
- Go to the configuration tab. Ensure that the app is configured to redeploy on push events, and that the correct branch is selected.

### My application doesn't redeploy when a workflow runs.

- On the overview tab for the app, ensure that continuous deployment is turned on.
- Go to the configuration tab. Ensure that the app is configured to redeploy on workflow run.
- Also ensure that the correct branch and workflow have been selected.
- **AnvilOps does not redeploy applications when workflows are manually triggered on GitHub.**

## Rancher

### AnvilOps can't find my Rancher account.

- If you do not have a Rancher account, contact your administrator to get a Rancher account set up.
- Currently, AnvilOps only supports signing in with Shibboleth. If you use a different method to sign in, you will not be able to use AnvilOps.

## Misc

### AnvilOps doesn't support the Kubernetes configurations I need for my application.

- If you would like to stop managing an application with AnvilOps, open the Danger tab of the application page. From here, you may delete the application from AnvilOps, without deleting the associated deployment and other resources on the cluster.
- **For Git deployments:** AnvilOps will delete the image repository associated with the application!

### My question isn't listed here.

- Please contact us.
