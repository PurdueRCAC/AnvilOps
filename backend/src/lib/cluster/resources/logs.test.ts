import { http } from "msw";
import { setupServer } from "msw/node";
import { expect, test } from "vitest";
import { getImageConfig, parseImageRef, parseWwwAuthHeader } from "./logs.ts";

test("Parses Docker image reference properly", () => {
  expect(parseImageRef("nginx")).toEqual({
    repository: "registry-1.docker.io",
    image: "library/nginx",
    tag: "latest",
  });

  expect(parseImageRef("nginx:latest")).toEqual({
    repository: "registry-1.docker.io",
    image: "library/nginx",
    tag: "latest",
  });

  expect(parseImageRef("library/nginx")).toEqual({
    repository: "registry-1.docker.io",
    image: "library/nginx",
    tag: "latest",
  });

  expect(parseImageRef("docker.io/library/nginx")).toEqual({
    repository: "registry-1.docker.io",
    image: "library/nginx",
    tag: "latest",
  });

  expect(parseImageRef("docker.io/library/nginx:latest")).toEqual({
    repository: "registry-1.docker.io",
    image: "library/nginx",
    tag: "latest",
  });

  expect(
    parseImageRef(
      "registry.anvil.rcac.purdue.edu/anvilops/railpack-builder:latest",
    ),
  ).toEqual({
    repository: "registry.anvil.rcac.purdue.edu",
    image: "anvilops/railpack-builder",
    tag: "latest",
  });

  expect(
    parseImageRef("registry.anvil.rcac.purdue.edu/anvilops/railpack-builder"),
  ).toEqual({
    repository: "registry.anvil.rcac.purdue.edu",
    image: "anvilops/railpack-builder",
    tag: "latest",
  });

  expect(
    parseImageRef("registry.anvil.rcac.purdue.edu/railpack-builder:test-tag"),
  ).toEqual({
    repository: "registry.anvil.rcac.purdue.edu",
    image: "railpack-builder",
    tag: "test-tag",
  });
});

test("Parses Www-Authenticate header properly", () => {
  expect(
    parseWwwAuthHeader(
      `Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"`,
    ),
  ).toEqual({
    realm: "https://auth.docker.io/token",
    scope: "repository:library/nginx:pull",
    service: "registry.docker.io",
  });

  // Change the order of the directives
  expect(
    parseWwwAuthHeader(
      `Bearer service="registry.docker.io",realm="https://auth.docker.io/token",scope="repository:library/nginx:pull"`,
    ),
  ).toEqual({
    realm: "https://auth.docker.io/token",
    scope: "repository:library/nginx:pull",
    service: "registry.docker.io",
  });

  expect(parseWwwAuthHeader(`Bearer a="b",c="d",e="f"`)).toEqual({
    a: "b",
    c: "d",
    e: "f",
  });

  expect(parseWwwAuthHeader("")).toEqual({});
  expect(parseWwwAuthHeader("Bearer")).toEqual({});
  expect(parseWwwAuthHeader("Bearer ")).toEqual({});
});

test("Retrieves entrypoint of OCI image", async () => {
  const handlers = [
    http.get(
      "https://registry-1.docker.io/v2/library/nginx/manifests/1.29.1",
      (ctx) => {
        if (ctx.request.headers.get("Authorization") === "Bearer abc123") {
          return new Response(
            JSON.stringify({
              manifests: [
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "amd64",
                    "org.opencontainers.image.base.digest":
                      "sha256:48fa1e32d5ad897f7748b4b67d1ffb9e2ec46f4129f037afa3456a99f937203a",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:55:17Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:17ae566734b63632e543c907ba74757e0c1a25d812ab9f10a07a6bed98dd199c",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "amd64", os: "linux" },
                  size: 2292,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "amd64",
                    "vnd.docker.reference.digest":
                      "sha256:17ae566734b63632e543c907ba74757e0c1a25d812ab9f10a07a6bed98dd199c",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:ae6fc6312bf38984127207743a23938b1ff1bc1d306acc86fed4e98bb1e9ae1f",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "arm32v5",
                    "org.opencontainers.image.base.digest":
                      "sha256:fd9c5a3142530f265261391c2b96d79a3a61dbcf2822d4e270cac65a2ce24b3d",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:56:09Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:0546c3c7854a63daae1fa6dd25a14d21dc1ed9a94fa662fbef080ceb06cd5fab",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "arm", os: "linux", variant: "v5" },
                  size: 2294,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "arm32v5",
                    "vnd.docker.reference.digest":
                      "sha256:0546c3c7854a63daae1fa6dd25a14d21dc1ed9a94fa662fbef080ceb06cd5fab",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:53802b6f8a422595ddddae80d0a9f397d1dcc1c2fb2257ff439b4c61512feccc",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "arm32v7",
                    "org.opencontainers.image.base.digest":
                      "sha256:7ca7e29c57992884d3c75d66a35cb45780616802b1cd3ec694ed8748e17d6714",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:58:15Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:dd176a1a03d141c57da4221680ae5120d786bc965f18d644283e293e096729b5",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "arm", os: "linux", variant: "v7" },
                  size: 2294,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "arm32v7",
                    "vnd.docker.reference.digest":
                      "sha256:dd176a1a03d141c57da4221680ae5120d786bc965f18d644283e293e096729b5",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:e181c2faf986ce6fb22c317bf2f8e02c07f9983099376d15f46d8a2c4bf033dc",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "arm64v8",
                    "org.opencontainers.image.base.digest":
                      "sha256:611ff4b679d5e1c4689505782f8ad2e60cda1f075f47311f7ca63f9ea5030276",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:55:40Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:e041cf856a0f3790b5ef37a966f43d872fba48fcf4405fd3e8a28ac5f7436992",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: {
                    architecture: "arm64",
                    os: "linux",
                    variant: "v8",
                  },
                  size: 2294,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "arm64v8",
                    "vnd.docker.reference.digest":
                      "sha256:e041cf856a0f3790b5ef37a966f43d872fba48fcf4405fd3e8a28ac5f7436992",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:ed906453ed3702965b89cb888adae9f9537ad9993b1ba1f6ad5c50721a05aa76",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "i386",
                    "org.opencontainers.image.base.digest":
                      "sha256:96e103b4715d1777c321dd7384d13d268b387897a7ad86b78ae0d3a474aec366",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:55:22Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:19a49ca07e70a5c8b1950fc906b6d9426321a9ef02a182c4190f253d12988986",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "386", os: "linux" },
                  size: 2291,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "i386",
                    "vnd.docker.reference.digest":
                      "sha256:19a49ca07e70a5c8b1950fc906b6d9426321a9ef02a182c4190f253d12988986",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:6a55bf79c3edaffd677bc8e14b53659a14937255ad480bc8c05aae7a0b7fbd2d",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "mips64le",
                    "org.opencontainers.image.base.digest":
                      "sha256:e9d05707bfe6ba79ac5275cac026fd736389e8a8b020c6eafbe8d46e0d4bf3e8",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:50:48Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:e3c09c211ae2f01df8a43c6c322b44cc88046f8842698e56063767cea323f2a6",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "mips64le", os: "linux" },
                  size: 2295,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "mips64le",
                    "vnd.docker.reference.digest":
                      "sha256:e3c09c211ae2f01df8a43c6c322b44cc88046f8842698e56063767cea323f2a6",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:a93ad1d17f912c620d9f3bf75385eb183b9afd748a1b976deadef31861bb80dc",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 567,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "ppc64le",
                    "org.opencontainers.image.base.digest":
                      "sha256:51dc6740058eb40e581560939250898aab646b363412ab2ce7533494443628c4",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:57:20Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:cf23757a83fcbc977eff6f15df4209fb7122cf090d6d313bf3c1d614f95bc977",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "ppc64le", os: "linux" },
                  size: 2294,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "ppc64le",
                    "vnd.docker.reference.digest":
                      "sha256:cf23757a83fcbc977eff6f15df4209fb7122cf090d6d313bf3c1d614f95bc977",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:e1b43bdef5cb756c0cb744886364f69cf5f6c5004bbef21a7443c712b08af64f",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "s390x",
                    "org.opencontainers.image.base.digest":
                      "sha256:393e02b5766cfe8405db98ecd4449b7004e6b380e11d615e2afa24a9c2451174",
                    "org.opencontainers.image.base.name":
                      "debian:bookworm-slim",
                    "org.opencontainers.image.created": "2025-09-29T23:49:49Z",
                    "org.opencontainers.image.revision":
                      "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
                    "org.opencontainers.image.source":
                      "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
                    "org.opencontainers.image.url":
                      "https://hub.docker.com/_/nginx",
                    "org.opencontainers.image.version": "1.29.1",
                  },
                  digest:
                    "sha256:35d8313cc59728b641898708adaafcde8399a6b57ae2f27ec68f10a2b628317d",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "s390x", os: "linux" },
                  size: 2292,
                },
                {
                  annotations: {
                    "com.docker.official-images.bashbrew.arch": "s390x",
                    "vnd.docker.reference.digest":
                      "sha256:35d8313cc59728b641898708adaafcde8399a6b57ae2f27ec68f10a2b628317d",
                    "vnd.docker.reference.type": "attestation-manifest",
                  },
                  digest:
                    "sha256:d31b68a082fbb13ae10d5505374a88943c19cd2b19694d4802a35b6f8e501ed1",
                  mediaType: "application/vnd.oci.image.manifest.v1+json",
                  platform: { architecture: "unknown", os: "unknown" },
                  size: 841,
                },
              ],
              mediaType: "application/vnd.oci.image.index.v1+json",
              schemaVersion: 2,
            }),
          );
        } else {
          return new Response(
            JSON.stringify({
              errors: [
                {
                  code: "UNAUTHORIZED",
                  message: "authentication required",
                  detail: [
                    {
                      Type: "repository",
                      Class: "",
                      Name: "library/nginx",
                      Action: "pull",
                    },
                  ],
                },
              ],
            }),
            {
              status: 401,
              headers: new Headers({
                "Www-Authenticate": `Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"`,
              }),
            },
          );
        }
      },
    ),

    http.get(
      "https://auth.docker.io/token",
      () =>
        // Expect query parameters: scope=repository:library/nginx:pull&service=registry.docker.io
        new Response(
          JSON.stringify({
            token: "abc123",
            access_token: "abc123",
            expires_in: 300,
            issued_at: "2025-10-14T04:27:52.041963236Z",
          }),
        ),
    ),

    http.get(
      "https://registry-1.docker.io/v2/library/nginx/manifests/sha256:17ae566734b63632e543c907ba74757e0c1a25d812ab9f10a07a6bed98dd199c",
      () =>
        new Response(
          JSON.stringify({
            schemaVersion: 2,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            config: {
              mediaType: "application/vnd.oci.image.config.v1+json",
              digest:
                "sha256:203ad09fc1566a329c1d2af8d1f219b28fd2c00b69e743bd572b7f662365432d",
              size: 8594,
            },
            layers: [
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:5c32499ab806884c5725c705c2bf528662d034ed99de13d3205309e0d9ef0375",
                size: 28228336,
              },
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:375a694db7346a00da49aac62757cec58667d0c90874d4b08edef1814161f8f2",
                size: 44065216,
              },
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:5f825f15e2e0140c77e43d026664718f274284e907b3dbfea8af5c3f2e843673",
                size: 629,
              },
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:16d05858bb8d98a948d273ef83ff992f7eb4b7b50b9d92dcb186ec02d6cd1089",
                size: 955,
              },
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:08cfef42fd24116711bc1e323e83d40e6145937250f876e0342c2c90426c3bfb",
                size: 404,
              },
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:3cc5fdd1317a723bde90305759b954dda6335ade70354d860e82c59588df4e4b",
                size: 1211,
              },
              {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest:
                  "sha256:4f4e50e2076584d483a45b2db7718a03e941045e8dcd0023b6d326b743b282a1",
                size: 1398,
              },
            ],
            annotations: {
              "com.docker.official-images.bashbrew.arch": "amd64",
              "org.opencontainers.image.base.digest":
                "sha256:48fa1e32d5ad897f7748b4b67d1ffb9e2ec46f4129f037afa3456a99f937203a",
              "org.opencontainers.image.base.name": "debian:bookworm-slim",
              "org.opencontainers.image.created": "2025-08-13T16:34:01Z",
              "org.opencontainers.image.revision":
                "5a4ad48c733b365d69a4d1c9946a9d8480469c7f",
              "org.opencontainers.image.source":
                "https://github.com/nginx/docker-nginx.git#5a4ad48c733b365d69a4d1c9946a9d8480469c7f:mainline/debian",
              "org.opencontainers.image.url": "https://hub.docker.com/_/nginx",
              "org.opencontainers.image.version": "1.29.1",
            },
          }),
        ),
    ),

    http.get(
      "https://registry-1.docker.io/v2/library/nginx/blobs/sha256:203ad09fc1566a329c1d2af8d1f219b28fd2c00b69e743bd572b7f662365432d",
      () =>
        new Response(
          JSON.stringify({
            architecture: "amd64",
            config: {
              ExposedPorts: { "80/tcp": {} },
              Env: [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "NGINX_VERSION=1.29.1",
                "NJS_VERSION=0.9.1",
                "NJS_RELEASE=1~bookworm",
                "PKG_RELEASE=1~bookworm",
                "DYNPKG_RELEASE=1~bookworm",
              ],
              Entrypoint: ["/docker-entrypoint.sh"],
              Cmd: ["nginx", "-g", "daemon off;"],
              Labels: {
                maintainer: "NGINX Docker Maintainers <docker-maint@nginx.com>",
              },
              StopSignal: "SIGQUIT",
            },
            created: "2025-08-13T16:34:01Z",
            history: [
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  "# debian.sh --arch 'amd64' out/ 'bookworm' '@1759104000'",
                comment: "debuerreotype 0.16",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  "LABEL maintainer=NGINX Docker Maintainers <docker-maint@nginx.com>",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "ENV NGINX_VERSION=1.29.1",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "ENV NJS_VERSION=0.9.1",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "ENV NJS_RELEASE=1~bookworm",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "ENV PKG_RELEASE=1~bookworm",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "ENV DYNPKG_RELEASE=1~bookworm",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  'RUN /bin/sh -c set -x     && groupadd --system --gid 101 nginx     && useradd --system --gid nginx --no-create-home --home /nonexistent --comment "nginx user" --shell /bin/false --uid 101 nginx     && apt-get update     && apt-get install --no-install-recommends --no-install-suggests -y gnupg1 ca-certificates     &&     NGINX_GPGKEYS="573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62 8540A6F18833A80E9C1653A42FD21310B49F6B46 9E9BE90EACBCDE69FE9B204CBCDCD8A38D88A2B3";     NGINX_GPGKEY_PATH=/etc/apt/keyrings/nginx-archive-keyring.gpg;     export GNUPGHOME="$(mktemp -d)";     found=\'\';     for NGINX_GPGKEY in $NGINX_GPGKEYS; do     for server in         hkp://keyserver.ubuntu.com:80         pgp.mit.edu     ; do         echo "Fetching GPG key $NGINX_GPGKEY from $server";         gpg1 --batch --keyserver "$server" --keyserver-options timeout=10 --recv-keys "$NGINX_GPGKEY" && found=yes && break;     done;     test -z "$found" && echo >&2 "error: failed to fetch GPG key $NGINX_GPGKEY" && exit 1;     done;     gpg1 --batch --export $NGINX_GPGKEYS > "$NGINX_GPGKEY_PATH" ;     rm -rf "$GNUPGHOME";     apt-get remove --purge --auto-remove -y gnupg1 && rm -rf /var/lib/apt/lists/*     && dpkgArch="$(dpkg --print-architecture)"     && nginxPackages="         nginx=${NGINX_VERSION}-${PKG_RELEASE}         nginx-module-xslt=${NGINX_VERSION}-${DYNPKG_RELEASE}         nginx-module-geoip=${NGINX_VERSION}-${DYNPKG_RELEASE}         nginx-module-image-filter=${NGINX_VERSION}-${DYNPKG_RELEASE}         nginx-module-njs=${NGINX_VERSION}+${NJS_VERSION}-${NJS_RELEASE}     "     && case "$dpkgArch" in         amd64|arm64)             echo "deb [signed-by=$NGINX_GPGKEY_PATH] https://nginx.org/packages/mainline/debian/ bookworm nginx" >> /etc/apt/sources.list.d/nginx.list             && apt-get update             ;;         *)             tempDir="$(mktemp -d)"             && chmod 777 "$tempDir"                         && savedAptMark="$(apt-mark showmanual)"                         && apt-get update             && apt-get install --no-install-recommends --no-install-suggests -y                 curl                 devscripts                 equivs                 git                 libxml2-utils                 lsb-release                 xsltproc             && (                 cd "$tempDir"                 && REVISION="${NGINX_VERSION}-${PKG_RELEASE}"                 && REVISION=${REVISION%~*}                 && curl -f -L -O https://github.com/nginx/pkg-oss/archive/${REVISION}.tar.gz                 && PKGOSSCHECKSUM="43ecd667d9039c9ab0fab9068c16b37825b15f7d4ef6ea8f36a41378bdf1a198463c751f8b76cfe2aef7ffa8dd9f88f180b958a8189d770258b5a97dc302daf4 *${REVISION}.tar.gz"                 && if [ "$(openssl sha512 -r ${REVISION}.tar.gz)" = "$PKGOSSCHECKSUM" ]; then                     echo "pkg-oss tarball checksum verification succeeded!";                 else                     echo "pkg-oss tarball checksum verification failed!";                     exit 1;                 fi                 && tar xzvf ${REVISION}.tar.gz                 && cd pkg-oss-${REVISION}                 && cd debian                 && for target in base module-geoip module-image-filter module-njs module-xslt; do                     make rules-$target;                     mk-build-deps --install --tool="apt-get -o Debug::pkgProblemResolver=yes --no-install-recommends --yes"                         debuild-$target/nginx-$NGINX_VERSION/debian/control;                 done                 && make base module-geoip module-image-filter module-njs module-xslt             )                         && apt-mark showmanual | xargs apt-mark auto > /dev/null             && { [ -z "$savedAptMark" ] || apt-mark manual $savedAptMark; }                         && ls -lAFh "$tempDir"             && ( cd "$tempDir" && dpkg-scanpackages . > Packages )             && grep \'^Package: \' "$tempDir/Packages"             && echo "deb [ trusted=yes ] file://$tempDir ./" > /etc/apt/sources.list.d/temp.list             && apt-get -o Acquire::GzipIndexes=false update             ;;     esac         && apt-get install --no-install-recommends --no-install-suggests -y                         $nginxPackages                         gettext-base                         curl     && apt-get remove --purge --auto-remove -y && rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/nginx.list         && if [ -n "$tempDir" ]; then         apt-get purge -y --auto-remove         && rm -rf "$tempDir" /etc/apt/sources.list.d/temp.list;     fi     && ln -sf /dev/stdout /var/log/nginx/access.log     && ln -sf /dev/stderr /var/log/nginx/error.log     && mkdir /docker-entrypoint.d # buildkit',
                comment: "buildkit.dockerfile.v0",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "COPY docker-entrypoint.sh / # buildkit",
                comment: "buildkit.dockerfile.v0",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  "COPY 10-listen-on-ipv6-by-default.sh /docker-entrypoint.d # buildkit",
                comment: "buildkit.dockerfile.v0",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  "COPY 15-local-resolvers.envsh /docker-entrypoint.d # buildkit",
                comment: "buildkit.dockerfile.v0",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  "COPY 20-envsubst-on-templates.sh /docker-entrypoint.d # buildkit",
                comment: "buildkit.dockerfile.v0",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by:
                  "COPY 30-tune-worker-processes.sh /docker-entrypoint.d # buildkit",
                comment: "buildkit.dockerfile.v0",
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: 'ENTRYPOINT ["/docker-entrypoint.sh"]',
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "EXPOSE map[80/tcp:{}]",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: "STOPSIGNAL SIGQUIT",
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
              {
                created: "2025-08-13T16:34:01Z",
                created_by: 'CMD ["nginx" "-g" "daemon off;"]',
                comment: "buildkit.dockerfile.v0",
                empty_layer: true,
              },
            ],
            os: "linux",
            rootfs: {
              type: "layers",
              diff_ids: [
                "sha256:aca83606673032726b42f8e1396ceb979c32bfb26b602732baf699053e46b33e",
                "sha256:c9314274c8aefb8518681aa80b2352a1dd07a4f8bbca2709973472e9b441236e",
                "sha256:1acc971d8a3daa05e9e05d98d8b488da4a5b69805605d48e977532111ac18364",
                "sha256:fe540ea49339936f9ca0a0e958e623a3438137aa40d3fb4279f23b5d1b2ec87d",
                "sha256:cd35d865f504cb0528a5ca2995dd68e875f026f8e3c859a0ecf941f256a253b8",
                "sha256:4e8d3453aa66b2fe41872a4fd4050eb74e52ffdf8512a57beec063947e79bcd6",
                "sha256:131c1c486b1725d863010cbd1403e9173d791d7e83337bdb46095cbc97f9d27f",
              ],
            },
          }),
        ),
    ),
  ];

  const server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: "error" });

  const config = await getImageConfig({
    repository: "registry-1.docker.io",
    image: "library/nginx",
    tag: "1.29.1",
  });
  expect(config.config.Entrypoint).toEqual(["/docker-entrypoint.sh"]);
  expect(config.config.Cmd).toEqual(["nginx", "-g", "daemon off;"]);

  server.close();
});
