# file-server

This directory contains an HTTP server container image that's used to serve the source code of the [sample application](../sample/README.md).

In tests, the AnvilOps builders clone the sample app's source code from this server instead of from an external source like GitHub.

Once the container is running, the `sample` repository can be cloned with:

```sh
git clone http://host:port/git/sample.git
```
