FROM moby/buildkit:rootless
# ^ This image contains both the client and daemon parts of BuildKit. Here, we're using the client, buildctl.

COPY --chmod=755 docker-entrypoint.sh /var/run

ENTRYPOINT ["/bin/sh"]
CMD ["sh", "-c", "/var/run/docker-entrypoint.sh"]