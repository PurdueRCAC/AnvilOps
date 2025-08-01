---
title: Basic Concepts
sidebar:
  order: 0
---

## Organization

An organization is a grouping of users and the apps that they own.

When an organization is created, the owner has the option to link the organization to GitHub and grant access to repositories.
Organizations keep information about this GitHub App installation to be used in any of the organization's apps.

Organizations can have many members. Any organization member can create, modify, and delete resources within the organization, so only add people you trust to your organization.

## App

Also called a "Project", an App is a resource that holds your current and previous Deployments.

Your App has a subdomain that allows external users to access your application at `<subdomain>.anvilops.rcac.purdue.edu`.

## Deployment

_Not to be confused with [the Kubernetes concept](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) with the same name._

A Deployment is a collection of all the configuration needed to build and run an app. It includes information like a linked Git repository, commit hash and message, environment variables, and port numbers.

If your App is connected to a Git repository, whenever a new commit is pushed, a new Deployment is created. AnvilOps starts from the [Deployment Config Template](#deployment-config-template) and then replaces the commit hash and message with their new values.

Deployments have statuses:

- Pending: The deployment has just been created
- Queued: AnvilOps is waiting for other builds to complete before starting a build
- Building: AnvilOps is cloning your repository and building it into a container image
- Deploying: AnvilOps is generating Kubernetes manifests from your Deployment configuration and applying them to the cluster
- Success: The deployment process is complete and the deployment is running
- Stopped: The deployment completed (successfully or not) in the past, but it's no longer running

On the Overview tab of the App page, you will see one Deployment with the "✓ Current" tag. The Current Deployment is the one that's currently receiving web traffic.
When a new Deployment's status is set to Success, it may take a minute for it to become the Current Deployment. You can monitor this progress in the Status tab.

## Deployment Config Template

Your App's Deployment Config Template is used to generate new Deployments when they need to be created automatically, like on a Git push.
You can modify your Deployment Config Template from the Configuration tab in the App page.

On the Configuration tab, when you click Save, AnvilOps updates the App's Deployment Config Template and then creates a new Deployment from that template.
You can create a Deployment without updating the Template by clicking the "↺ Rollback" button and selecting the "Run as a one-off deployment" option.
