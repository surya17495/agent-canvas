// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SKILLS_CATALOG } from "@openhands/extensions/skills/index.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const EXACT_SKILLS_SUBPATH_IMPORT = /from ["']@openhands\/extensions\/skills["']/;
const SOURCE_ROOT = resolve(process.cwd(), "src");
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = resolve(directory, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    if (SOURCE_EXTENSIONS.some((extension) => entryPath.endsWith(extension))) {
      return [entryPath];
    }

    return [];
  });
}

describe("@openhands/extensions imports", () => {
  it("loads the public skills catalog through the wildcard-compatible index subpath", () => {
    expect(SKILLS_CATALOG.length).toBeGreaterThan(0);
  });

  it("does not import the fragile exact skills subpath from app code", () => {
    const offenders = listSourceFiles(SOURCE_ROOT)
      .filter((filePath) =>
        EXACT_SKILLS_SUBPATH_IMPORT.test(readFileSync(filePath, "utf8")),
      )
      .map((filePath) => relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
