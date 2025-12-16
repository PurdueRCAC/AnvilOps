# When changing the Railpack version, make sure the Mise version is updated as well
# Current Mise version: https://github.com/railwayapp/railpack/blob/main/core/mise/install.go#L20
ARG RAILPACK_VERSION=0.15.1
ARG MISE_VERSION=2025.11.8

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
    apt-get install -y --no-install-recommends software-properties-common=0.99.49.3 wget=1.21.4-1ubuntu4.1 libssl3=3.0.13-0ubuntu3.6 ca-certificates=20240203 && \
    # ^ This package includes `add-apt-repository`
    add-apt-repository ppa:git-core/ppa && \
    apt-get update && \
    # ^ Get the latest version of Git from their PPA (we need 2.49.0 or later because we use the `git clone --revision` flag)
    apt-get install -y --no-install-recommends git=1:2.52.0-0ppa1~ubuntu24.04.1 && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -g 65532 -r appuser && \
    useradd  -u 65532 -m -g appuser appuser

COPY --chown=appuser:appuser --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl

ARG MISE_VERSION
COPY --chown=appuser:appuser --chmod=500 --from=mise /usr/local/bin/mise /usr/bin/mise/mise-${MISE_VERSION}

COPY --chown=appuser:appuser --chmod=500 --from=railpack /usr/local/bin/railpack /usr/bin/railpack

COPY --chown=appuser:appuser --chmod=500 pre-stop.sh /var/run
COPY --chown=appuser:appuser --chmod=500 docker-entrypoint.sh /var/run

WORKDIR /home/appuser

USER appuser
ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]
