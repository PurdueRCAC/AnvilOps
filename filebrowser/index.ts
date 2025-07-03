import mime from "mime-types";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";

const port = 8080;
const rootDir = "/files";

const server = createServer(async (req, res) => {
  try {
    return handle(req, res);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.write("Internal server error");
    res.end();
  }
});

async function handle(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) {
  const url = URL.parse(req.url, `http://${req.headers.host}`);
  const search = url.searchParams;

  switch (url.pathname) {
    case "/file":
    case "/file/download": {
      if (req.method === "GET") {
        try {
          const fileName = search.get("path");
          if (!fileName) {
            return res.writeHead(400).end();
          }
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
              readStream.on("data", (chunk) => {
                if (!res.headersSent) {
                  res.writeHead(200, {
                    "Content-Type": mimeType,
                    "Content-Length": info.size,
                    "Content-Disposition": `attachment; filename="${
                      // Remove all characters that might cause the header to not be parsed correctly (https://httpwg.org/specs/rfc6266.html#header.field.definition)
                      basename(filePath).replaceAll(
                        /[^a-zA-Z0-9-_ ().\[\]#&]/,
                        "-",
                      )
                    }"`,
                  });
                }
                res.write(chunk);
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
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.write("Not found");
          res.end();
        }
      } else if (req.method === "POST") {
        const fileName = search.get("path");
        if (!fileName) {
          return res.writeHead(400).end();
        }
        const filePath = join(rootDir, join("/", fileName));
        const isDirectory = search.get("type") === "directory";

        if (isDirectory) {
          await mkdir(filePath, { recursive: true });
        } else {
          const writeStream = createWriteStream(filePath);
          await pipeline(req, writeStream);
        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("Success");
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
