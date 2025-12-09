# This Dockerfile builds a container that copies the log-shipper binary into a destination specified in a command-line argument.
# See the wrapWithLogExporter function in backend/src/lib/cluster/resources/logs.ts for more details on how this is used.

FROM golang:1.24.7-alpine AS build

WORKDIR /work
COPY go.mod go.sum ./

RUN go mod download

COPY *.go ./
RUN go build

FROM scratch

COPY --from=busybox:1.37-musl /bin/cp /bin/cp 
COPY --from=build /work/log-shipper /bin/log-shipper

ENTRYPOINT [ "/bin/cp", "/bin/log-shipper" ]

# When starting up this image, set the CMD to the name of the destination file.
# That command will be appended to the entrypoint, which sets up `cp` with the name of the source file.