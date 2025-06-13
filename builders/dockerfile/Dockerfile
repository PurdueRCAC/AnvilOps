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

COPY --chmod=755 pre-stop.sh /var/run
COPY --chmod=755 docker-entrypoint.sh /var/run

WORKDIR /work

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]