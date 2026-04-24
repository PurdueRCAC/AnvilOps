FROM ubuntu:26.04

# https://docs.docker.com/reference/dockerfile/#example-cache-apt-packages
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
# hadolint ignore=DL3008 # Pinning apt package versions is fragile since old versions are removed after new versions are published. We're using an Ubuntu LTS base, so the chances of breaking changes are low.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends git wget libssl3 ca-certificates jq

RUN groupadd -g 65532 -r appuser && \
    useradd  -u 65532 -m -g appuser appuser

COPY --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl

COPY --chown=appuser:appuser --chmod=500 pre-stop.sh /var/run
COPY --chown=appuser:appuser --chmod=500 docker-entrypoint.sh /var/run

WORKDIR /home/appuser

USER appuser
ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]
