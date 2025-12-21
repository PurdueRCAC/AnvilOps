# Build this Dockerfile with tilt/tests (one level above the directory this file is in) as context.

FROM alpine/git:v2.52.0@sha256:f951cb5a23a5be670adc22a73a50df8e8df2a53e16a5dabb8973279e4341f34d AS prepare

COPY sample /tmp/repo

WORKDIR /tmp/repo
RUN git config --global user.name "anvilops" && \
    git config --global user.email "test@anvilops.local" && \
    git init && \
    git branch -m main && \
    git add . && \
    git commit -m "Initial commit"

FROM nginx:1.29.4-alpine3.23-slim@sha256:fc0cff8d49db19250104d2fba8bd1ee3fc2a09ed8163de582804e5d137df7821

# Install Git and FCGI wrapper
# - fcgiwrap connects Nginx to the git-http-backend binary
# - spawn-fcgi spawns the fcgiwrap process
RUN apk add --no-cache git-daemon fcgiwrap spawn-fcgi

COPY --from=prepare --chown=nginx:nginx /tmp/repo/.git /srv/git/sample.git

COPY file-server/nginx.conf /etc/nginx/conf.d/default.conf

# Use a startup script to launch both fcgiwrap and nginx
COPY --chown=nginx:nginx --chmod=500 file-server/docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]

# Clone the repository with `git clone http://host:port/git/sample.git`
