---
title: Git Integration
---

## Connecting a GitHub Organization

The AnvilOps GitHub App must be installed for an organization in order to deploy GitHub repositories directly on the cluster. This GitHub App allows AnvilOps to:

- Detect push events and workflow runs
- Clone the repository to your account when you deploy an AnvilOps template app
- Add commit statuses to your repository indicating the status of the deployment on AnvilOps

:::note
AnvilOps uses a unique GitHub app for each cluster. Anvil Composable uses the app named AnvilOps, while Geddes v2 uses the app named Anvilops-Geddes.
:::

## Events that Trigger Deployments

For an application deployed from a GitHub repository, AnvilOps can provide continuous deployment. In particular, AnvilOps can rebuild or redeploy an application when one of two events occur:

1. A commit is pushed to the selected branch.
2. A selected GitHub Actions workflow successfully runs on the specified branch.

For a smooth deployment experience, ensure that:

- The correct branch is selected in the AnvilOps app configuration. AnvilOps will ignore events on all other branches.
- The workflow has permission to run on the specified branch, if you are redeploying on workflow run.

## Disabling Automatic Deployments

Automatic redeployment can be disabled and reenabled at any time from the Overview page of an AnvilOps application.
