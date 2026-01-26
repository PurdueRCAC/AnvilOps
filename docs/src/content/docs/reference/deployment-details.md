---
title: Deployment Details
sidebar:
  order: 21
---

## App

AnvilOps apps are deployed as [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) in the Kubernetes cluster. Each app runs in its own namespace. For each app, AnvilOps creates a [ClusterIP Service](https://kubernetes.io/docs/concepts/services-networking/service/) with the same name as the namespace to expose it within the cluster. Regardless of the port provided in the app configuration, it will always be available at `<namespace>.<namespace>.svc.cluster.local:80` within the cluster.

## Networking

HTTP apps can optionally be made public. AnvilOps will create an [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) resource to expose the app to the internet at an available subdomain of your choice. The app will be available at `https://<subdomain>.anvil.rcac.purdue.edu` or `https://<subdomain>.geddes.rcac.purdue.edu` depending on the cluster. If the app does not use HTTP, the app will not be accessible from this address.

AnvilOps creates a [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/) in each app namespace to restrict ingress. Ingress is restricted to traffic from within the current Rancher project, the System project, and from any namespaces of the same app group.

## Secrets

All environment variables set in the app configuration are stored in a [Secret](https://kubernetes.io/docs/concepts/configuration/secret/) in the app namespace, which is referenced in the app's StatefulSet.
