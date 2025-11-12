---
title: Railpack
---

**Railpack** is a tool that allows AnvilOps to build users' applications without Dockerfiles for supported languages and frameworks.
Railpack generates instructions to download dependencies and compilers and build your app, and then it generates a command to run your app.

## Supported Languages and Frameworks

- Node.js &mdash; uses dependencies and the `build` and `start` scripts defined in your `package.json`, with special caching for:
  - Next.js
  - Remix
  - Vite
  - Astro
  - Nuxt
- Python, including:
  - Django
- Go
- PHP, including:
  - Laravel
- HTML (and other static files)
- Java, including:
  - Spring Boot
- Ruby, including:
  - Ruby on Rails
- Deno
- Rust
- Elixir
- Gleam
- Shell scripts (from a `start.sh` file in the root directory)

For more information on each framework and how it is detected, see the [Railpack documentation](https://railpack.com/getting-started).
