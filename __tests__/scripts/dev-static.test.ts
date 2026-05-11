import { describe, expect, it } from "vitest";
import { parseArgs } from "../../scripts/dev-static.mjs";

describe("dev-static CLI", () => {
  it("can require browser session-key entry without changing bind mode", () => {
    expect(parseArgs(["--require-browser-session-key"])).toMatchObject({
      requireBrowserSessionKey: true,
    });
  });

  it("can require browser session-key entry through the environment", () => {
    expect(
      parseArgs([], { OH_REQUIRE_BROWSER_SESSION_KEY: "true" }),
    ).toMatchObject({
      requireBrowserSessionKey: true,
    });
  });
});
