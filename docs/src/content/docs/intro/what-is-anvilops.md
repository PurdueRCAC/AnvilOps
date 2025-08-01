---
title: What is AnvilOps?
---

AnvilOps is a platform-as-a-service for Kubernetes.

- Platform-as-a-service: a system that allows users to deploy applications with no concern for the underlying infrastructure. A PaaS typically provides conveniences, like logging and monitoring, CI/CD, and horizontal scaling so that users do not have to manage them themselves.
- Kubernetes: a container orchestration system that maximizes availability of applications by scaling across multiple servers.

## Key Features

### Easy Configuration

Kubernetes is extremely powerful, but its large feature set makes it quite complex to configure. AnvilOps automates the process of writing Kubernetes manifests and provides a simple user interface that's accessible to beginners.

![AnvilOps deployment options. A form with fields for a public URL, port number, environment variables, volume mounts, and some hidden advanced options.](./what-is-anvilops/deployment-options.png)

### CI/CD

CI/CD stands for Continuous Intgration and Continuous Delivery/Deployment. It's the name for a set of systems that enable software developers to release updates quickly by automating the build, testing, and deployment processes.

When you create an App with AnvilOps, the platform gives you the option to enable automatic builds and deployments. When you push a commit to your GitHub repository, AnvilOps will rebuild your application and immediately deploy the change, allowing you to iterate quickly without writing a complex, custom CI/CD pipeline.

### Logging and Monitoring

The AnvilOps web dashboard provides tools to view your application's logs in real time.

![The Logs tab on the App page. Contains a list of logs from a demo application along with their timestamps.](./what-is-anvilops/logs-tab.png)

You can also see the current status of all your application's pods in realtime along with any events or conditions that could be preventing them from running.

![The Status tab on the App page. Contains a list of pods, each one containing a name, creation date, status, node name, and IP address.](./what-is-anvilops/status-tab.png)

### Automatic Subdomain and TLS Certificate

Every app deployed on AnvilOps gets its own subdomain of `anvilops.rcac.purdue.edu`, and TLS encryption is handled for you.
