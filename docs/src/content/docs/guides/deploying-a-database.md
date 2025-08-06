---
title: Deploying a Database on AnvilOps
---

This guide will walk you through how to install your own instance of PostgreSQL on AnvilOps.

We will learn:

- How to deploy an app from a container image
- How to use environment variables and volume mounts
- AnvilOps networking concepts

## 1. Create an App

Navigate to the [Create App form](https://anvilops.rcac.purdue.edu/create-app).

Select an organization and a Rancher project.

## 2. Configure Source Options

Set the **Deployment Source** to `OCI Image` and **Image Tag** to `postgres:17`.
This tells AnvilOps to pull a Postgres image from Docker Hub and deploy it in the Kubernetes cluster.

![](./deploying-a-database/source-options.png)

## 3. Configure Deployment Options

Set the **Public URL** subdomain to a unique name. Postgres communicates with clients over TCP, not HTTP, so it will not be publicly accessible at this URL.
Instead, we will need to use the cluster-internal hostname below. In this screenshot, that's `anvilops-pg-example.anvilops-pg-example.svc.cluster.local`.
**Write down this value. We will need it to connect to the database.**

Set the port number to `5432` so that AnvilOps knows which port to expose outside of the Postgres container.

You can leave CPU and Memory requirements at the defaults unless your database will receive a lot of traffic.

![](./deploying-a-database/deployment-options.png)

## 4. Configure Environment Variables

The Postgres Docker image uses environment variables to initialize a new database with a user account.

In this example, we're initializing a database called `testdb` and a user called `anvilops` (with the password `password`) that can access it.

![A grid of environment variables. POSTGRES_DB=testdb, POSTGRES_USER=anvilops, and POSTGRES_PASSWORD=password.](./deploying-a-database/environment-variables.png)

**Note**: Nothing will happen if you change these environment variables after creating the app. They are only used to initialize the database when Postgres detects an empty data folder.

## 5. Configure Volume Mounts

Add a volume mount for `/var/lib/postgresql/data`. Make sure you allocate the right amount of storage because it cannot be increased or decreased later.

:::note
If you are following this tutorial with Postgres version 18 or higher, set the mount path to `/var/lib/postgresql` instead.
:::

![](./deploying-a-database/volume-mounts.png)

We use volume mounts to specify the paths we want to keep when the app is updated or the container is rescheduled on another node. Without this volume mount, we would lose our entire database every time we redeployed the app.

Consider the file system to be ephemeral except the paths included in your volume mounts.

## 6. Connect to the Database

Recall the internal address you created earlier.
In this example, it's `anvilops-pg-example.anvilops-pg-example.svc.cluster.local`. It should follow the form `anvilops-{subdomain}.anvilops-{subdomain}.svc.cluster.local`, where `{subdomain}` is what you typed into the Public URL field.

Let's create a connection string from this hostname. We can connec to the database at:

```
postgresql://anvilops:password@anvilops-pg-example.anvilops-pg-example.svc.cluster.local:80
```

Assuming these values:

- Host: `anvilops-pg-example.anvilops-pg-example.svc.cluster.local`
- Port: `80` (The port must be set to 80. AnvilOps always exposes your service at port 80 within the cluster.)
- Username: `anvilops` (from the environment variable you set in Step 4)
- Password: `password` (from the environment variable you set in Step 4)

Any application running in the same Kubernetes cluster can now access your database with this connection string.

If you want to access your database from another AnvilOps app, we recommend placing your connection string in an environment variable and marking it as sensitive.

## Limitations

1. This deployment is not designed to scale past one replica. **Do not increase the `Replicas` field.** In AnvilOps, a unique volume is created for every replica, so the instances will not be able to share information.

   In most cases, you can get away with scaling vertically by increasing the app's CPU and memory limits.

2. AnvilOps does not expose non-HTTP services to the public. Your database will not be accessible at the "Public URL" because Postgres uses TCP to communicate with clients.
