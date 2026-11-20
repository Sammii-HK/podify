import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import path from "node:path";
const output = path.resolve(".podify-review");
await fs.mkdir(output, { recursive: true });
const result = await build({
  entryPoints: ["tests/review/preview.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  outfile: path.join(output, "review.js"),
  alias: { "@": process.cwd() },
  metafile: true,
});
for (const name of Object.keys(result.metafile.inputs))
  if (
    /lib\/(?:feed|storage|jobs|pipeline|auth|generate-|device-keys|ffmpeg)/.test(
      name,
    )
  )
    throw new Error("Server service imported into offline review: " + name);
const css = await postcss([tailwind()]).process(
  await fs.readFile("app/globals.css", "utf8"),
  { from: path.resolve("app/globals.css") },
);
await fs.writeFile(path.join(output, "review.css"), css.css);
await fs.writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Podify: offline interface review</title><link rel="icon" href="/icon.svg"><link rel="stylesheet" href="/review.css"><div id="root"></div><script type="module" src="/review.js"></script></html>',
);
await fs.copyFile("app/icon.svg", path.join(output, "icon.svg"));
console.log(
  "Built actual client components and stylesheet; no server services included.",
);
