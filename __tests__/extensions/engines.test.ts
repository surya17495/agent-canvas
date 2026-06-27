import { describe, it, expect } from "vitest";
import {
  AGENT_CANVAS_HOST_VERSION,
  assertHostCompatible,
  satisfiesHostRange,
} from "#/extensions/engines";

describe("satisfiesHostRange", () => {
  it("treats wildcards and empty ranges as compatible", () => {
    expect(satisfiesHostRange("*", "1.2.3")).toBe(true);
    expect(satisfiesHostRange("", "1.2.3")).toBe(true);
    expect(satisfiesHostRange("x", "1.2.3")).toBe(true);
  });

  it("matches exact versions", () => {
    expect(satisfiesHostRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesHostRange("=1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesHostRange("1.2.3", "1.2.4")).toBe(false);
  });

  it("handles caret ranges (^)", () => {
    expect(satisfiesHostRange("^1.0.0", "1.0.0")).toBe(true);
    expect(satisfiesHostRange("^1.0.0", "1.9.9")).toBe(true);
    expect(satisfiesHostRange("^1.2.0", "1.1.0")).toBe(false);
    expect(satisfiesHostRange("^1.0.0", "2.0.0")).toBe(false);
    // 0.x caret is minor-locked
    expect(satisfiesHostRange("^0.2.0", "0.2.5")).toBe(true);
    expect(satisfiesHostRange("^0.2.0", "0.3.0")).toBe(false);
  });

  it("handles tilde ranges (~)", () => {
    expect(satisfiesHostRange("~1.2.3", "1.2.9")).toBe(true);
    expect(satisfiesHostRange("~1.2.3", "1.3.0")).toBe(false);
    expect(satisfiesHostRange("~1.2", "1.2.0")).toBe(true);
  });

  it("handles comparators", () => {
    expect(satisfiesHostRange(">=1.2.0", "1.5.0")).toBe(true);
    expect(satisfiesHostRange(">1.2.0", "1.2.0")).toBe(false);
    expect(satisfiesHostRange("<2.0.0", "1.9.0")).toBe(true);
    expect(satisfiesHostRange("<=1.2.0", "1.2.0")).toBe(true);
  });

  it("ANDs whitespace-joined comparators", () => {
    expect(satisfiesHostRange(">=1.2.0 <2.0.0", "1.5.0")).toBe(true);
    expect(satisfiesHostRange(">=1.2.0 <2.0.0", "2.0.0")).toBe(false);
  });

  it("handles x-ranges", () => {
    expect(satisfiesHostRange("1.x", "1.9.0")).toBe(true);
    expect(satisfiesHostRange("1.x", "2.0.0")).toBe(false);
    expect(satisfiesHostRange("1.2.x", "1.2.9")).toBe(true);
    expect(satisfiesHostRange("1.2.x", "1.3.0")).toBe(false);
  });

  it("fails closed on unparseable ranges", () => {
    expect(satisfiesHostRange("not-a-range", "1.0.0")).toBe(false);
  });

  it("defaults to the host version constant", () => {
    expect(satisfiesHostRange("^1.0.0")).toBe(
      satisfiesHostRange("^1.0.0", AGENT_CANVAS_HOST_VERSION),
    );
    expect(satisfiesHostRange("^1.0.0")).toBe(true);
  });
});

describe("assertHostCompatible", () => {
  it("passes for a satisfied range", () => {
    expect(() => assertHostCompatible("^1.0.0", "1.2.0")).not.toThrow();
  });

  it("throws a descriptive error for an unsatisfied range", () => {
    expect(() => assertHostCompatible("^2.0.0", "1.2.0")).toThrow(
      /requires Agent Canvas "\^2\.0\.0".*1\.2\.0/,
    );
  });
});
