---
title: Networking
sidebar:
  order: 3
---

## Public Subdomain

An app can have a unique public subdomain. This allows AnvilOps to make your app accessible at `<your subdomain>.anvilcloud.rcac.purdue.edu`, or `<your subdomain>.geddes.rcac.purdue.edu`. This subdomain can be changed later.

Your public subdomain only supports HTTP. Services like databases which rely on other protocols won't be accessible to the public.

When a user visits `https://<your subdomain>.anvilcloud.rcac.purdue.edu`, or `https://<your subdomain>.geddes.rcac.purdue.edu`, AnvilOps routes the traffic to the corresponding app over the port number specified in the app's configuration. If the page does not load, check your app's configuration settings to ensure that the port number is correct.

## Accessing From Other AnvilOps Apps

Your AnvilOps app is accessible to other apps inside the Kubernetes cluster at the following address, on port 80:

```
<namespace>.<namespace>.svc.cluster.local
```

**Your service is always exposed at this address on port 80 internally, even if you specified a different port in your configuration.**
