import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebviewBridge } from "#/extensions/webview-bridge";
import { AssetLoader } from "#/extensions/asset-loader";

describe("WebviewBridge", () => {
  let bridge: WebviewBridge;
  let mockIframe: HTMLIFrameElement;
  let mockAssetLoader: AssetLoader;
  let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;
  let messageHandler: ((event: MessageEvent) => void) | null = null;

  beforeEach(() => {
    // Create mock iframe
    const mockContentWindow = {
      postMessage: vi.fn(),
    };
    mockIframe = {
      contentWindow: mockContentWindow,
    } as unknown as HTMLIFrameElement;

    // Create mock fetch for asset loader
    mockFetch = vi.fn<typeof fetch>();
    mockAssetLoader = new AssetLoader({ fetch: mockFetch });

    // Capture the message handler
    const originalAddEventListener = window.addEventListener;
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          messageHandler = handler as (event: MessageEvent) => void;
        }
        return originalAddEventListener.call(window, type, handler);
      },
    );

    bridge = new WebviewBridge({
      iframe: mockIframe,
      extensionSource: "gh:owner/repo@abc1234",
      assetLoader: mockAssetLoader,
      allowedOrigins: ["https://api.example.com"],
    });
  });

  afterEach(() => {
    bridge.dispose();
    mockAssetLoader.dispose();
    messageHandler = null;
    vi.restoreAllMocks();
  });

  describe("asset:request handling", () => {
    it("relays asset requests to the loader", async () => {
      const content = new TextEncoder().encode("file content");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      // Simulate message from iframe
      const event = new MessageEvent("message", {
        data: { type: "asset:request", id: "req-1", file: "panel.html" },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event);

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/owner/repo/abc1234/panel.html",
        expect.any(Object),
      );

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "asset:response",
          id: "req-1",
          ok: true,
          mimeType: "text/html",
        }),
        "*",
      );
    });

    it("rejects path traversal attempts", async () => {
      const event = new MessageEvent("message", {
        data: { type: "asset:request", id: "req-1", file: "../../../etc/passwd" },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "asset:response",
          id: "req-1",
          ok: false,
          error: "Path traversal not allowed",
        }),
        "*",
      );
    });

    it("ignores messages from other sources", async () => {
      const otherWindow = { postMessage: vi.fn() } as unknown as Window;
      const event = new MessageEvent("message", {
        data: { type: "asset:request", id: "req-1", file: "file.js" },
        source: otherWindow as MessageEventSource, // Different window
      });

      await messageHandler?.(event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockIframe.contentWindow?.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("fetch:request handling", () => {
    it("relays fetch requests to allowed origins", async () => {
      const globalFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
      vi.stubGlobal("fetch", globalFetch);

      const event = new MessageEvent("message", {
        data: {
          type: "fetch:request",
          id: "req-1",
          url: "https://api.example.com/data",
        },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(globalFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        undefined,
      );

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "fetch:response",
          id: "req-1",
          ok: true,
          status: 200,
        }),
        "*",
      );

      vi.unstubAllGlobals();
    });

    it("always allows GitHub raw content origin", async () => {
      const globalFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
      vi.stubGlobal("fetch", globalFetch);

      const event = new MessageEvent("message", {
        data: {
          type: "fetch:request",
          id: "req-1",
          url: "https://raw.githubusercontent.com/owner/repo/main/file.txt",
        },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(globalFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it("rejects fetch requests to disallowed origins", async () => {
      const event = new MessageEvent("message", {
        data: {
          type: "fetch:request",
          id: "req-1",
          url: "https://evil.com/steal-data",
        },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "fetch:response",
          id: "req-1",
          ok: false,
          error: expect.stringContaining("Origin not allowed"),
        }),
        "*",
      );
    });
  });

  describe("setAllowedOrigins", () => {
    it("updates allowed origins", async () => {
      const globalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
      vi.stubGlobal("fetch", globalFetch);

      // Initially disallowed
      const event1 = new MessageEvent("message", {
        data: {
          type: "fetch:request",
          id: "req-1",
          url: "https://new-api.com/data",
        },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
        "*",
      );

      // Update allowed origins
      bridge.setAllowedOrigins(["https://new-api.com"]);

      // Now should be allowed
      const event2 = new MessageEvent("message", {
        data: {
          type: "fetch:request",
          id: "req-2",
          url: "https://new-api.com/data",
        },
        source: mockIframe.contentWindow as MessageEventSource,
      });

      await messageHandler?.(event2);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(globalFetch).toHaveBeenCalledWith(
        "https://new-api.com/data",
        undefined,
      );

      vi.unstubAllGlobals();
    });
  });
});
