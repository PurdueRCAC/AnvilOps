FROM alpine/helm:3.19.0

RUN addgroup -g 65532 appuser && \
  adduser -u 65532 -G appuser -D appuser

COPY --chown=appuser:appuser --chmod=500 pre-stop.sh /var/run
COPY --chown=appuser:appuser --chmod=500 docker-entrypoint.sh /var/run

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "/var/run/docker-entrypoint.sh"]