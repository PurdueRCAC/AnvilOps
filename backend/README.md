# backend

When AnvilOps is built as a Docker image, this Node.js app serves the static files in the `frontend` directory.

## Running

**Note**: We're using Node.js's new TypeScript type stripping support, which requires Node.js version 23.6 or higher. When running the server manually, make sure to pass the `--experimental-strip-types` flag. If you can't update Node.js, use [`ts-node`](https://typestrong.org/ts-node/docs/usage).

First, install packages with `npm install`.

To work on the project locally, run `npm run dev`.
The app will restart whenever you make changes to `index.ts`.

In production, run `npm run start`.

The server runs on port 3000 by default.
