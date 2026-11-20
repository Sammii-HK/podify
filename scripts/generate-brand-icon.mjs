import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioLines } from "lucide-react";
import fs from "node:fs/promises";
const svg = renderToStaticMarkup(
  createElement(AudioLines, {
    width: 64,
    height: 64,
    color: "#c7b3f5",
    strokeWidth: 1.6,
  }),
);
if (process.argv.includes("--check")) {
  if ((await fs.readFile("app/icon.svg", "utf8")) !== svg + "\n")
    throw new Error("Podify Lucide brand icon is stale.");
} else {
  await fs.writeFile("app/icon.svg", svg + "\n");
  await fs.mkdir("public/licenses", { recursive: true });
  await fs.copyFile(
    "node_modules/lucide-react/LICENSE",
    "public/licenses/lucide.txt",
  );
}
