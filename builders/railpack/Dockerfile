# When changing the Railpack version, make sure the Mise version is updated as well
# Current Mise version: https://github.com/railwayapp/railpack/blob/main/core/mise/install.go#L20
ARG RAILPACK_VERSION=0.0.69
ARG MISE_VERSION=2025.6.1

FROM ghcr.io/jdx/mise:${MISE_VERSION} AS mise

FROM ubuntu:24.04 AS railpack

# Install the Railpack CLI
# https://railpack.com/installation

RUN apt update && apt install -y wget && rm -rf /var/lib/apt/lists/*

ARG RAILPACK_VERSION
RUN wget https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
  tar -xzvf railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
  mv ./railpack /usr/local/bin/railpack

FROM ubuntu:24.04

RUN apt update && \
    apt install -y software-properties-common && \
    # ^ This package includes `add-apt-repository`
    add-apt-repository ppa:git-core/ppa && \
    apt update && \
    # ^ Get the latest version of Git from their PPA (we need 2.49.0 or later because we use the `git clone --revision` flag)
    apt install -y git wget libssl3 ca-certificates && \
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
