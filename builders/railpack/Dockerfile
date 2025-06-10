FROM ubuntu AS railpack

# Install the Railpack CLI
# https://railpack.com/installation
RUN apt update && apt install -y wget
RUN wget https://github.com/railwayapp/railpack/releases/download/v0.0.66/railpack-v0.0.66-x86_64-unknown-linux-musl.tar.gz && \
  gunzip railpack-v0.0.66-x86_64-unknown-linux-musl.tar.gz && \
  tar -xvf railpack-v0.0.66-x86_64-unknown-linux-musl.tar

FROM moby/buildkit:rootless
# ^ This image contains both the client and daemon parts of BuildKit. Here, we're using the client, buildctl.

COPY --from=railpack /railpack /usr/bin/railpack

COPY --chmod=755 docker-entrypoint.sh /var/run

ENTRYPOINT ["/bin/sh"]
CMD ["sh", "-c", "/var/run/docker-entrypoint.sh"]
