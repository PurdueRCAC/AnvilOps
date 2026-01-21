# regclient-napi

This package is a Node-API binding for `regclient`, a tool for interacting with OCI image registries.

`regclient` is written in Go, so to use it in AnvilOps, we have a Go file (with CGo enabled) that imports regclient and contains a function that interacts with it.
That function is exported, which allows code in other compilation units to use it.

`binding.cc` is a C++ binding that uses Node.js's Node-API interface to expose the Go function to Node.js.

`binding.cc` and `main.go` are compiled into a binary called `dist/regclient_napi.node`, which is imported in `src/index.ts`.

From there, this directory is used as a normal Node.js package in the `backend` project.
When the package is installed, it automatically compiles the binary from source.

## Requirements

- Node.js
- The Go compiler
- Python (for `node-gyp`)
- A C++ compiler

## Build

```sh
npm run build
```

_(executed automatically when the package is installed, as long as lifecycle scripts aren't skipped)_

Note that the binary is dynamically linked against system libraries like the C++ standard library. Make sure you are running it on a system similar to the one you're building it on.

## Usage

```typescript
import { getImageConfig } from "regclient-napi";

const config = await getImageConfig("nginx:latest");
console.log(config);

/*
{
  "created": "2026-01-09T18:54:49.668289531Z",
  "architecture": "amd64",
  "os": "linux",
  "config": {
    "ExposedPorts": { "80/tcp": {} },
    "Env": [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "NGINX_VERSION=1.29.4",
      "NJS_VERSION=0.9.4",
      "NJS_RELEASE=1~trixie",
      "ACME_VERSION=0.3.1",
      "PKG_RELEASE=1~trixie",
      "DYNPKG_RELEASE=1~trixie"
    ],
    "Entrypoint": ["/docker-entrypoint.sh"],
    "Cmd": ["nginx", "-g", "daemon off;"],
    "Labels": {
      "maintainer": "NGINX Docker Maintainers \u003cdocker-maint@nginx.com\u003e"
    },
    "StopSignal": "SIGQUIT"
  },
  "rootfs": {
    "type": "layers",
    "diff_ids": [
      "sha256:6a7f953ae30c9f480e6eaf7be8b1ba742bce57a3a83c43e927348e763cff7472",
      "sha256:22851f4f9a0b3923f9c108c0a3b60c7c259cc3ddaac73fafb6464f3e32c76954",
      "sha256:675cd787fdd989e6eb40205ae0bc9a1dfb4a78bf1e593a04aca324d1937f61ba",
      "sha256:62bbe9e286ea9cff9a71ab5ca817b64cba3ae6a818dbd30d00c388742336d9b3",
      "sha256:f248169098dd71376eafb23039cec798f44adbb2d7665cd3531d3fdc9a727892",
      "sha256:a91b21b8651d846f7a613cae09396c9eb414c31f7c7b3e7fa191c1b768aed332",
      "sha256:7bc3e3f1caf4417366bc519903e188a00d00dbaa59c07ab8c82ca8e868463208"
    ]
  },
  "history": [
    {
      "created": "2025-12-29T00:00:00Z",
      "created_by": "# debian.sh --arch 'amd64' out/ 'trixie' '@1766966400'",
      "comment": "debuerreotype 0.17"
    },
    {
      "created": "2026-01-09T18:54:49.532488654Z",
      "created_by": "LABEL maintainer=NGINX Docker Maintainers \u003cdocker-maint@nginx.com\u003e",
      "comment": "buildkit.dockerfile.v0",
      "empty_layer": true
    },
    ...
  ]
}

*/
```
