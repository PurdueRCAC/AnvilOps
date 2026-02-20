ARG RAILPACK_VERSION=0.17.1

FROM ubuntu:24.04

# https://docs.docker.com/reference/dockerfile/#example-cache-apt-packages
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common=0.99.49.3 wget=1.21.4-1ubuntu4.1 libssl3=3.0.13-0ubuntu3.7 ca-certificates=20240203 jq=1.7.1-3ubuntu0.24.04.1 && \
    # ^ This package includes `add-apt-repository`
    add-apt-repository ppa:git-core/ppa && \
    apt-get update && \
    # ^ Get the latest version of Git from their PPA (we need 2.49.0 or later because we use the `git clone --revision` flag)
    apt-get install -y --no-install-recommends git=1:2.52.0-0ppa1~ubuntu24.04.3 && \
    apt-get remove -y software-properties-common && \
    apt-get autoremove -y

ARG RAILPACK_VERSION
RUN \
  # Install Railpack
  wget --progress=dot:giga "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz" && \
  tar -xz "railpack" -f "railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz" && \
  rm "railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz" && \
  mv "./railpack" "/usr/bin/railpack" && \
  # Install Mise
  MISE_VERSION=$(wget --quiet -O- "https://raw.githubusercontent.com/railwayapp/railpack/refs/tags/v${RAILPACK_VERSION}/core/mise/version.txt") && \
  mkdir /usr/bin/mise && \
  wget --progress=dot:giga -O "/usr/bin/mise/mise-$MISE_VERSION" "https://github.com/jdx/mise/releases/download/v$MISE_VERSION/mise-v$MISE_VERSION-linux-x64" && \
  # Create container user & update file permissions
  groupadd -g 65532 -r appuser && \
  useradd  -u 65532 -m -g appuser appuser && \
  chmod 500 "/usr/bin/railpack" "/usr/bin/mise/mise-$MISE_VERSION" && \
  chown appuser:appuser "/usr/bin/railpack" "/usr/bin/mise/mise-$MISE_VERSION"

COPY --chown=appuser:appuser --chmod=500 --from=moby/buildkit:rootless /usr/bin/buildctl /usr/bin/buildctl
COPY --chown=appuser:appuser --chmod=500 pre-stop.sh /var/run
COPY --chown=appuser:appuser --chmod=500 docker-entrypoint.sh /var/run

WORKDIR /home/appuser
USER appuser:appuser

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]
