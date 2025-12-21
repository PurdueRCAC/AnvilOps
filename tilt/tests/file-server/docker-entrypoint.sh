#!/bin/sh

# Start fcgiwrap as the nginx user on a unix socket
spawn-fcgi -s /var/run/fcgiwrap.socket -u nginx -g nginx -M 660 /usr/bin/fcgiwrap -f

# Start Nginx in the foreground
nginx -g "daemon off;"
