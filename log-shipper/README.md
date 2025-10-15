# AnvilOps Log Shipper

This program wraps a user-provided executable, sending logs to the AnvilOps backend.

Signals sent by the operating system to this process are forwarded to the child process, and exit statuses are forwarded from the child process to the parent process.

## Why?

Most Kubernetes users will install a logging agent in their cluster, like Logstash, Fluentd, or Fluent Bit. However, AnvilOps is designed to be as portable as possible, so we don't want system administrators to have to install an operator and give it permissions to access the container engine's log directory on every node.

Instead, AnvilOps ships with a wrapper process (the log shipper) which sends logs from the user's process to AnvilOps transparently.

In the future, we hope to provide integrations for common logging operators; however, the log shipper will likely remain the default option as it's the lowest friction for system administrators.

## How?

This program is compiled into a single static binary, which is built into a container image.

When a user creates an app or starts a build with AnvilOps, an `initContainer` is created which copies the log-shipper binary from the log-shipper image to a shared volume that's also mounted in the user's container.

> _Note_: This step will be redundant when [`image` volumes](https://kubernetes.io/docs/concepts/storage/volumes/#image) become more widely supported. They allow files to be mounted from OCI images, making the intermediate volume redundant; however, they were introduced in Kubernetes 1.33 and are not yet enabled by default.

Then, the user's provided startup command is replaced with a call to this binary, which receives the user's startup command as a command-line argument.

This may seem quite complicated, and it is, but it's the best solution given our unique constraints:

1. **Constraint**: AnvilOps should be portable and extremely simple to install on any Kubernetes cluster.

   **Result**: We can't use anything that directly accesses the container runtime's log directory on each node (i.e. a logging operator that runs a DaemonSet). Therefore, everything needed for a default, "out-of-the-box" installation of AnvilOps must happen within the cluster.

2. **Constraint**: AnvilOps should be compatible with any user-provided image.

   **Result**: We can't rely on a shell or programs like `curl` existing inside the user's container. Therefore, we need to make a self-contained binary with everything we need, which is why we wrote the log shipper in Go.

3. **Constraint**: AnvilOps should not require any special (i.e. nonstandard) configuration from the user. Any program that runs in Docker should run on AnvilOps with no configuration changes.

   **Result**: We can't ask the user to write their logs to a special file or manually wrap their process with a logging agent. Therefore, we need to make an agent that can read from the standard output of the user's process.

## Other Possible Logging Implementations

There are a few other ways to collect logs that fit our requirements:

1. Querying the Kubernetes API continuously with `follow` set to `true`

   Positive: This approach is much simpler than writing a custom log shipper and wrapping users' programs with it.

   Drawback: This solution requires the AnvilOps backend to maintain an open HTTP connection to the Kubernetes API for every pod that it manages, which could put significant burden on the API server. We would rather shift the burden to a system that we control (the AnvilOps backend) and scale it independently.

2. Querying the Kubernetes API periodically

   Positive: This approach is much simpler than writing a custom log shipper and wrapping users' programs with it.

   Drawback: Looking for new logs every few seconds may be less of a burden on the API server than the `follow` approach, but we lose some durability. If a container outputs some logs, crashes, and is recreated before the next log collection, then those logs are lost. Kubernetes only keeps logs from the current and most recent previous run of a container. Periodic querying also results in longer latency in the UI when users are debugging something in real-time.

## How do I disable this?

Disable the "Keep Historical Logs" option in your app's Config tab via the AnvilOps web dashboard.

This will disable the log shipper, and AnvilOps will only show logs from current instances of your app. When your app's pods are deleted, you will no longer be able to view any of their logs.
