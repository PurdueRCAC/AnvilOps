# When changing the Railpack version, make sure the Mise version is updated as well
# Current Mise version: https://github.com/railwayapp/railpack/blob/main/core/mise/install.go#L20
ARG RAILPACK_VERSION=0.6.1
ARG MISE_VERSION=2025.9.9

FROM ghcr.io/jdx/mise:${MISE_VERSION} AS mise

FROM ubuntu:24.04 AS railpack

# Install the Railpack CLI
# https://railpack.com/installation

RUN apt-get update && apt-get install -y --no-install-recommends wget=1.21.4-1ubuntu4.1 ca-certificates=20240203 && rm -rf /var/lib/apt/lists/*

ARG RAILPACK_VERSION
RUN wget --progress=dot:giga https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
  tar -xzvf railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
  mv ./railpack /usr/local/bin/railpack

FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common=0.99.49.2 && \
    # ^ This package includes `add-apt-repository`
    add-apt-repository ppa:git-core/ppa && \
    apt-get update && \
    # ^ Get the latest version of Git from their PPA (we need 2.49.0 or later because we use the `git clone --revision` flag)
    apt-get install -y --no-install-recommends git=1:2.50.1-0ppa1~ubuntu24.04.1 wget=1.21.4-1ubuntu4.1 libssl3=3.0.13-0ubuntu3.5 ca-certificates=20240203 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl

ARG MISE_VERSION
COPY --from=mise --chmod=755 /usr/local/bin/mise /tmp/railpack/mise/mise-${MISE_VERSION}

COPY --from=railpack --chmod=755 /usr/local/bin/railpack /usr/bin/railpack

COPY --chmod=755 pre-stop.sh /var/run
COPY --chmod=755 docker-entrypoint.sh /var/run

WORKDIR /work

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]
