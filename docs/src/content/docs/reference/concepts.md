---
title: AnvilOps Concepts
sidebar:
  order: 0
---

## Organization

An organization is a grouping of users and the apps that they own. Any organization member can create, modify, and delete apps within the organization.

When an organization is created, the owner can link the organization to GitHub and grant access to repositories. This allows AnvilOps to redeploy the latest version of an app when its corresponding GitHub repository is updated.

Only an organization owner is allowed to delete the organization— and with it, all applications.

## App

This represents the application you would like to run on the Kubernetes cluster. An App can be created from a GitHub repository or an [OCI-compliant](https://opencontainers.org/) container image (e.g. a Docker image).

Your App may have a subdomain that allows external users to access your application at `<subdomain>.anvilcloud.rcac.purdue.edu` (Anvil Composable) or `<subdomain>.geddes.rcac.purdue.edu` (Geddes).

An app may be standalone, or it may belong to an app group. Within the cluster, an app is accessible to other apps in the same app group at `<namespace>.<namespace>`.

## App Group

[Apps](/reference/concepts#app) that belong to the same Organization can be organized into App Groups. This is useful for applications that are built as many [microservices](https://aws.amazon.com/microservices/), or many independent components that communicate to handle requests from users. For instance, a web app and a database. AnvilOps ensures that apps in the same App Group can communicate within the cluster.

## Deployment

_Not to be confused with [the Kubernetes concept](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) with the same name._

A Deployment is a collection of all the configuration needed to build and run an application on the cluster. It includes information like a linked Git repository or image tag, commit hash and message, environment variables, and port numbers.

A new Deployment is created for an App each time its configuration is updated, or if it is linked to a Git repository, each time you push a commit. Then, the changes are applied to the cluster so that the latest version of your application is running, with the latest configuration.

Deployments have statuses:

- Pending: The deployment has just been created
- Queued: AnvilOps is waiting for other builds to complete before starting a build
- Building: AnvilOps is cloning your repository and building it into a container image
- Deploying: AnvilOps is generating Kubernetes manifests from your Deployment configuration and applying them to the cluster
- Complete: The deployment process is complete and the deployment is running
- Stopped: The deployment completed (successfully or not) in the past, but it's no longer running
- Error: Something went wrong during the build or deployment process. Check the deployment logs for more information.

On the Overview tab of the App page, you will see one Deployment with the "✓ Current" tag. The Current Deployment is the one that's currently receiving web traffic.
When a new Deployment's status is set to Complete, it may take a minute for it to become the Current Deployment. You can monitor this progress in the Status tab.
