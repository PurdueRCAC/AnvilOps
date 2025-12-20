FROM golang:1.25.5-alpine AS build

WORKDIR /work
COPY . .
RUN CGO_ENABLED=0 go build

FROM scratch
USER 65532:65532

COPY --from=build /work/sample /bin/sample

ENTRYPOINT [ "/bin/sample" ]
