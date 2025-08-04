---
title: Networking
---

## Public Subdomain

AnvilOps assigns a public subdomain to every app. This subdomain is unique and cannot be changed after the app is created. Your subdomain will always look like this:

```
<your prefix>.anvilops.rcac.purdue.edu
```

Your public subdomain only supports HTTP. Services like databases which rely on other protocols

When a user visits an app's subdomain, AnvilOps routes the traffic to the corresponding app over the port number specified in the app's configuration.

If your port number is not set properly, you may see a message like this when you visit your public subdomain:

![A web page that says "This app is not available."](networking/app-unavailable.png)

## Accessing From Other AnvilOps Apps

Your AnvilOps app is accessible to other apps inside the Kubernetes cluster at the following address:

```
anvilops-<subdomain>.anvilops-<subdomain>.svc.cluster.local
```

Where `<subdomain>` is the portion of the URL after `https://` and before `.anvilops.rcac.purdue.edu` in the URL.

**Your service is always exposed at this address on port 80**, even if you chose a different port number when you created or last updated your app.
