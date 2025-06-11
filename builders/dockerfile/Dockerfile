FROM moby/buildkit:rootless
# ^ This image contains both the client and daemon parts of BuildKit. Here, we're using the client, buildctl.

COPY --chmod=755 docker-entrypoint.sh /var/run

WORKDIR /work

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]