import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirnameResolved = typeof __dirname === "undefined"
  ? path.dirname(fileURLToPath(import.meta.url))
  : __dirname;

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirnameResolved, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
