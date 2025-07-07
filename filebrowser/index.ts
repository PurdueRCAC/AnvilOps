import { formidable } from "formidable";
import mime from "mime-types";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, unlink } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { basename, extname, join } from "node:path";

const port = 8080;
const rootDir = "/files";
const authToken = process.env.AUTH_TOKEN;

const server = createServer(async (req, res) => {
  try {
    return await handle(req, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.write("Internal server error");
    res.end();
  }
});

async function handle(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) {
  if (req.headers["authorization"]?.toString() !== authToken) {
    res.writeHead(403);
    res.write("Forbidden");
    res.end();
  }

  const url = URL.parse(req.url, `http://${req.headers.host}`);
  const search = url.searchParams;

  switch (url.pathname) {
    case "/file":
    case "/file/download": {
      if (!search.has("volumeClaimName") || !search.has("path")) {
        res.writeHead(400);
        res.write("volumeClaimName or path not present");
        return res.end();
      }

      if (req.method === "GET") {
        try {
          const fileName = search.get("path");
          const filePath = join(rootDir, join("/", fileName));

          const mimeType =
            mime.lookup(extname(filePath)) || "application/octet-stream";

          const info = await stat(filePath);

          if (info.isDirectory()) {
            const entries = await readdir(filePath, { withFileTypes: true });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(
              JSON.stringify({
                type: "directory",
                files: entries.map((entry) => ({
                  name: entry.name,
                  isDirectory: entry.isDirectory(),
                  type:
                    mime.lookup(extname(entry.name)) ||
                    "application/octet-stream",
                })),
              }),
            );
            res.end();
          } else if (url.pathname.endsWith("/download")) {
            const info = await stat(filePath);
            const readStream = createReadStream(filePath);

            await new Promise((resolve, reject) => {
              readStream.on("data", async (chunk) => {
                if (!res.headersSent) {
                  res.writeHead(200, {
                    "Content-Type": mimeType,
                    "Content-Length": info.size,
                    "Content-Disposition": `attachment; filename="${
                      // Remove all characters that might cause the header to not be parsed correctly (https://httpwg.org/specs/rfc6266.html#header.field.definition)
                      basename(filePath).replaceAll(
                        /[^a-zA-Z0-9-_ ().\[\]#&]/g,
                        "-",
                      )
                    }"`,
                  });
                }
                const canWriteMoreNow = res.write(chunk);
                if (!canWriteMoreNow) {
                  readStream.pause();
                  await once(res, "drain");
                  readStream.resume();
                }
              });

              readStream.on("error", reject);
              readStream.on("end", () => resolve(undefined));
            });

            res.end();
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(
              JSON.stringify({
                type: "file",
                fileType: mimeType,
                name: basename(fileName),
                createdAt: info.ctime.toISOString(),
                modifiedAt: info.mtime.toISOString(),
                size: info.size,
              }),
            );
            res.end();
          }
        } catch (error) {
          console.error(error);
          if (!res.headersSent) {
            res.writeHead(404, { "Content-Type": "text/plain" });
          }
          res.write("Not found");
          res.end();
        }
      } else if (req.method === "POST") {
        const [fields, files] = await formidable({
          allowEmptyFiles: true,
          minFileSize: 0,
          uploadDir: join(rootDir, join("/", search.get("path")!.toString())),
          filename: (name, ext, part, form) => {
            return join("/", part.originalFilename);
          },
        }).parse(req);
        if (!fields["type"]) {
          return res.writeHead(400).end();
        }
        const parentDir = join(
          rootDir,
          join("/", search.get("path")!.toString()),
        );
        const isDirectory = fields["type"]?.toString() === "directory";

        if (isDirectory) {
          await mkdir(parentDir, { recursive: true });
        } else {
          // Formidable has already parsed the form and placed uploaded files in the persistent volume. See the `uploadDir` and `filename` options passed to `formidable` above.
        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write(JSON.stringify({ success: true }));
        res.end();
      } else if (req.method === "DELETE") {
        const file = join(rootDir, join("/", search.get("path")!.toString()));
        const info = await stat(file);

        if (info.isDirectory()) {
          await rm(file, { recursive: true });
        } else {
          await unlink(file);
        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write(JSON.stringify({ success: true }));
        res.end();
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.write("Method not allowed");
        res.end();
        return;
      }

      return;
    }
    default: {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.write("Not found");
      res.end();
      return;
    }
  }
}

server.on("error", console.error);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
