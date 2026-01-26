---
title: App Configuration
sidebar:
  order: 1
---

AnvilOps applications can be configured in a number of ways. All listed parameters can be updated later unless otherwise specified.

Parameters marked with a \* are required.

## Organization <span style="color: #cfb991">\*</span>

The Organization that the app belongs to. The app will be viewable in the AnvilOps dashboard by all users who belong to this organization.

This value cannot be changed after an app is created.

## Group <span style="color: #cfb991">\*</span>

An application can be deployed on its own as a standalone app, or it can be organized into an App Group.

This is useful for applications that are built as many [microservices](https://aws.amazon.com/microservices/), or many independent components that communicate to handle requests from users. For instance, a web app and a database. AnvilOps ensures that apps in the same App Group can communicate within the cluster.

## Project <span style="color: #cfb991">\*</span>

The Rancher Project to deploy the application within.

In Rancher-managed Kubernetes clusters, a [Project](https://ranchermanager.docs.rancher.com/v2.9/how-to-guides/new-user-guides/manage-clusters/projects-and-namespaces) is a group of namespaces. Using Rancher Projects, users can be granted access to several namespaces at once, and a resource limit can be assigned to a collection of namespaces rather than just one.

AnvilOps connects to Rancher in order to read the projects you have been given access to, allowing you to select one for your App. Through AnvilOps, you can also deploy applications inside the `anvilops_sandbox` Project. However, this project has limited resources and may not be suitable for more than brief tests.

## Replicas

The number of identical copies of your application to run at a time. Replicas increase fault tolerance, as when one instance of the application fails, another can replace it. Replicas also increase availability, as traffic can be distributed between replicas of an application.

Note: if your app uses Volume Mounts, each replica will get its own separate volume that can only be accessed by that replica. Data written by one replica will not be visible to other replicas.
## Deployment Source <span style="color: #cfb991">\*</span>

AnvilOps supports deploying applications from a **Git repository** or a publicly available **OCI-compliant container image**. Applications deployed from Git repositories can be automatically rebuilt and redeployed on a specified event.

### Git Options

- **Repository**: If you selected Git Repository as your Deployment Source, the Repository menu will be populated with a list of all the repositories AnvilOps can access.
  If you can't see your repository:

  - For personal accounts, go to GitHub, click on your profile picture in the top right > `Settings` > `Applications` > `Configure` (next to AnvilOps).
  - For organizations, go to GitHub, click on your profile picture in the top right > `Your organizations` > `Settings` next( to the organization you installed the app on) > `GitHub Apps` > `Configure` (next to AnvilOps.)

  Then, make your changes in the Repository Access section and click Save.

- **Branch**: The Git branch to deploy from. When you select a repository, this field will be populated with a list of branches in your repository.

  Only pushes to this branch will be considered for automatic deployments.

- **Event**: The event that triggers a redeployment of your application. AnvilOps supports these triggers:
  - **Push**: A commit is pushed to the specified branch.
  - **Successful workflow run**: A specified GitHub Actions workflow completes successfully on the specified branch. This setting is useful for running automated tests before deploying a new version of your app to users. If the workflow run fails or is canceled, the deployment will be skipped.

### Image Options

Here are some [guidelines](https://kubernetes.io/docs/concepts/containers/images/#image-names) for allowed image names.

Singularity images are not supported at this time.

## Build Options

These options must be configured for applications deployed from Git repositories so that AnvilOps can build a container image. In the case of an image deployment, these options are not necessary because a container image is already available.

### Root directory <span style="color: #cfb991">\*</span>

A path in your repository to consider as the root.

Your root directory must start with `./` to denote the original root of the repository. For example, if you want AnvilOps to build and deploy the `app` directory in your repository, your root directory would be `./app`.

### Builder <span style="color: #cfb991">\*</span>

The module to use to build your repository into a container image, from the specified root directory.

**If you have written a Dockerfile**, select the **Dockerfile builder**. AnvilOps will look for a Dockerfile at the specified location and use it to build and deploy a container image for your app.

Note that the Dockerfile path is relative to the root directory that you specified earlier. For example, if your root directory is `./app` and your Dockerfile is at `./app/Dockerfile`, then your Dockerfile path would just be `Dockerfile` or `./Dockerfile`.

**If you do not have a Dockerfile**, try the **Railpack builder**. It will attempt to detect the language and framework you are using to automatically build it. See the [Railpack reference](/reference/railpack) for a list of supported technologies.

## Public URL <span style="color: #cfb991">\*</span>

A unique subdomain. AnvilOps can make your application publicly accessible at

```
https://<subdomain>.anvilcloud.rcac.purdue.edu
```

or

```
https://<subdomain>.geddes.rcac.purdue.edu
```

on port 80, without any authentication. **This setting cannot be changed later.**

## Port Number <span style="color: #cfb991">\*</span>

Set this to the port that your app runs on. Depending on your web framework, this will likely be one of these common default ports: 80, 3000, 4321, 5173, 8000, or 8080.

If this setting is not set correctly, you will see a "This app is not available" page when you try to visit your app at its Public URL.

If you are unsure, consult the documentation of the framework or web server you are using, or check the logs of your app after it starts up.

## Environment Variables

Environment variables to make available to your app. Values are interpreted literally, so there is no need to quote or escape special characters.

An environment variable can be marked as `Sensitive`, so that its value cannot be viewed in the dashboard later and its name cannot be changed. However, its value can be updated. The application will still receive the variable as usual.

Environment variables are provided at runtime, and can be provided at build time as well.

- If you are using the Railpack builder, your build commands have access to all of your environment variables.
- If you are using the Dockerfile builder, you will need to mount them as a secret and read them to retrieve their values:

  ```dockerfile
  RUN --mount=type=secret,id=VARIABLE_NAME cat /run/secrets/VARIABLE_NAME
  ```

  If you want to use it as an environment variable, you can do something like this:

  ```dockerfile
  RUN --mount=type=secret,id=VARIABLE_NAME export VARIABLE_NAME=$(cat /run/secrets/VARIABLE_NAME) && npm run build # <-- Your build command here
  ```

  Read more about secret mounts [here](https://docs.docker.com/build/building/secrets/#using-build-secrets). Each environment variable is given a secret with the same name.

## Volume Mounts

You application will run in a container, so any data written to files will not be persisted unless it is written in a directory mounted as a [Persistent Volume](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).

- All files outside of a Persistent Volume should be considered temporary and may be deleted at any time.
- All files inside a Persistent Volume (directly and recursively) will be saved.

**This setting cannot be changed later.** Make sure to allocate enough storage when you create your app! You cannot resize a persistent volume after creating it.

## Resources

If you request more CPU or memory than is currently available within the selected Project, the app deployment will fail, and the cause will be reflected in the Logs tab of the dashboard.

### CPU Cores <span style="color: #cfb991">\*</span>

The amount of [CPU units](https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/#cpu-units) to allocate to your application. Precision of up to 3 decimal places is allowed.

### Memory <span style="color: #cfb991">\*</span>

The amount of memory, in MiB, to allocate to your application.

## Advanced

### Keep Historical Logs

By default, AnvilOps wraps your application in a process in a command that captures its logs and sends them to AnvilOps to be viewed from the dashboard. This behavior can be disabled later.

### Namespace

When creating an app, AnvilOps will automatically generate a namespace for your application. You can also specify the namespace. It cannot be changed later.
