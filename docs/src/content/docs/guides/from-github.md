---
title: First Git Deployment
sidebar:
  order: 1
---

This tutorial will demonstrate:

- How to deploy one of AnvilOps' template applications.
- How to use Railpack to build applications without a Dockerfile.
- How to use AnvilOps' GitHub integrations for continuous deployment.

Follow along at [`https://anvilops.rcac.purdue.edu`](https://anvilops.rcac.purdue.edu) or [`https://anvilops.geddes.rcac.purdue.edu`](https://anvilops.geddes.purdue.edu).

### Prerequisites

You will need to have the AnvilOps GitHub App installed for your organization. This allows AnvilOps to deploy repositories on the cluster. In particular, for this tutorial, the GitHub App is needed for AnvilOps to clone the template repository to your account.

If you do not have access to your own project on Anvil Composable, select the `anvilops_sandbox` project. This project can be used temporarily for tests and tutorials, but applications deployed to this project may be deleted at any time.

### Initial Configuration

1. Click the Create App button on the AnvilOps dashboard.
   ![Create App buttons](./tutorial/create-app-buttons.png)

2. Select a Rancher project to deploy the application into. A project is a grouping of applications within a Kubernetes cluster. If you do not have access to your own project on Anvil Composable, select the `anvilops_sandbox` project.

3. Select `Git Repository` as the Deployment Source. If the form prompts you to install the GitHub App on your organization, click the button and follow the instructions. The AnvilOps GitHub App allows AnvilOps to clone repositories to your account as well as redeploy applications in response to events.

4. Click the repository dropdown, and select `External Git Repository`.

5. Select the `AnvilOps Demo` template app. You will be prompted to import the `anvilops-demo` repository to your account.

   The default settings configure AnvilOps to automatically redeploy your application when a new commit is pushed to the `main` branch of your repository.

   ![Settings for a deployment of the AnvilOps Demo app from a Git repository. The branch is set to main, and the event is set to push.](./tutorial/git-demo.png)

6. Look over the settings that have been autofilled.

   **Build**: AnvilOps will use Railpack to detect the framework the repository uses([Astro](https://astro.build/)) and build it without extra configuration.

   **Port**: The application will listen on port 80 for requests.

   If you would like, replace the randomly generated subdomain with something nice.

   ![Build and deployment options for the AnvilOps demo app. The builder is Railpack, the subdomain is anvilops-demo-96ynq, and the port number is 80.](./tutorial/git-build-deploy.png)

7. Click `Deploy`. In a few minutes, the application should be up and running at \
   `https://<subdomain>.anvilcloud.rcac.purdue.edu`, or `https://<subdomain>.geddes.rcac.purdue.edu`.

   ![A screenshot of the AnvilOps demo web app.](./tutorial/anvilops-git-demo-app.png)

### Continuous Deployment

Try pushing a commit to the repository to see how AnvilOps updates the deployment.

1. Open the file `/src/pages/index.astro`.

2. Find the section that says `Try editing this text!` and change it to say `Hello, World!` or another phrase of your choice. Then commit and push your changes to the repository.

3. Go back to the dashboard for your app in AnvilOps. Under `Recent Deployments`, you should see a new entry. If you click the `Logs` button for that deployment, you can watch the logs as AnvilOps rebuilds the application.
   ![A screenshot of the recent deployments for an AnvilOps app. The latest entry has the status Building.](./tutorial/git-recent-deployments.png)

4. When the build completes, reopen your application and reload the page. It should have the updated text.
