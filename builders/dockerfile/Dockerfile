FROM ubuntu:24.04

# https://docs.docker.com/reference/dockerfile/#example-cache-apt-packages
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common=0.99.49.3 wget=1.21.4-1ubuntu4.1 libssl3=3.0.13-0ubuntu3.6 ca-certificates=20240203 && \
    # ^ This package includes `add-apt-repository`
    add-apt-repository ppa:git-core/ppa && \
    apt-get update && \
    # ^ Get the latest version of Git from their PPA (we need 2.49.0 or later because we use the `git clone --revision` flag)
    apt-get install -y --no-install-recommends git=1:2.52.0-0ppa1~ubuntu24.04.3 && \
    apt-get remove -y software-properties-common && \
    apt-get autoremove -y

RUN groupadd -g 65532 -r appuser && \
    useradd  -u 65532 -m -g appuser appuser

COPY --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl

COPY --chown=appuser:appuser --chmod=500 pre-stop.sh /var/run
COPY --chown=appuser:appuser --chmod=500 docker-entrypoint.sh /var/run

WORKDIR /home/appuser

USER appuser
ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]
