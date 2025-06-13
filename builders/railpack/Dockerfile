FROM debian:bookworm-slim AS railpack

# Install the Railpack CLI
# https://railpack.com/installation

# When changing the Railpack version, make sure the Mise version is updated as well (in the COPY --from=ghcr.io/jdx/mise:<version> and in the filename: mise-<version>)
ARG RAILPACK_VERSION=0.0.66

RUN apt update && apt install -y wget && rm -rf /var/lib/apt/lists/*
RUN wget https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
  tar -xzvf railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
  mv ./railpack /usr/local/bin/railpack

FROM debian:bookworm-slim

RUN apt update && apt install -y git wget libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl
COPY --from=ghcr.io/jdx/mise:2025.5.8 --chmod=755 /usr/local/bin/mise /tmp/railpack/mise/mise-2025.5.8
COPY --from=railpack --chmod=755 /usr/local/bin/railpack /usr/bin/railpack

COPY --chmod=755 docker-entrypoint.sh /var/run

WORKDIR /work

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]
