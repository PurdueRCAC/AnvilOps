FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common=0.99.49.3 wget=1.21.4-1ubuntu4.1 libssl3=3.0.13-0ubuntu3.6 ca-certificates=20240203 && \
    # ^ This package includes `add-apt-repository`
    add-apt-repository ppa:git-core/ppa && \
    apt-get update && \
    # ^ Get the latest version of Git from their PPA (we need 2.49.0 or later because we use the `git clone --revision` flag)
    apt-get install -y --no-install-recommends git=1:2.51.2-0ppa1~ubuntu24.04.1 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl

COPY --chmod=755 pre-stop.sh /var/run
COPY --chmod=755 docker-entrypoint.sh /var/run

WORKDIR /work

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]