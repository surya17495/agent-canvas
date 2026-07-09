/**
 * Bridge that handles asset relay communication between parent and webview.
 * Receives asset requests from sandboxed webviews via postMessage and routes
 * them through the AssetLoader.
 *
 * This is separate from the existing RPC-based WebviewTransport (which handles
 * the agentCanvas API). The asset relay handles lower-level resource loading
 * that happens before/alongside the RPC layer.
 */

import { AssetLoader } from "./asset-loader";

/** Message types for the asset relay protocol. */
export interface AssetRequestMessage {
  type: "asset:request";
  id: string;
  file: string;
}

export interface FetchRequestMessage {
  type: "fetch:request";
  id: string;
  url: string;
  options?: RequestInit;
}

export interface AssetResponseMessage {
  type: "asset:response";
  id: string;
  ok: true;
  content: ArrayBuffer;
  mimeType: string;
}

export interface FetchResponseMessage {
  type: "fetch:response";
  id: string;
  ok: boolean;
  status?: number;
  headers?: Record<string, string>;
  content?: ArrayBuffer;
  error?: string;
}

export interface ErrorResponseMessage {
  type: "asset:response" | "fetch:response";
  id: string;
  ok: false;
  error: string;
}

export type RelayRequestMessage = AssetRequestMessage | FetchRequestMessage;
export type RelayResponseMessage =
  | AssetResponseMessage
  | FetchResponseMessage
  | ErrorResponseMessage;

export interface WebviewBridgeOptions {
  /** The webview's iframe element. */
  iframe: HTMLIFrameElement;
  /** The extension source this webview belongs to. */
  extensionSource: string;
  /** Asset loader instance. */
  assetLoader: AssetLoader;
  /**
   * Allowed external origins for fetch relay (from extension manifest permissions).
   * Extensions must declare origins they need to access.
   */
  allowedOrigins?: string[];
}

/**
 * Bridge that handles postMessage communication for asset loading between
 * parent and webview. Installed per webview instance.
 */
export class WebviewBridge {
  private iframe: HTMLIFrameElement;
  private source: string;
  private loader: AssetLoader;
  private allowedOrigins: Set<string>;
  private messageHandler: (event: MessageEvent) => void;
  private disposed = false;

  constructor(options: WebviewBridgeOptions) {
    this.iframe = options.iframe;
    this.source = options.extensionSource;
    this.loader = options.assetLoader;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);

    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener("message", this.messageHandler);
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    // Only handle messages from our iframe
    if (event.source !== this.iframe.contentWindow) return;

    // Validate message structure
    const data = event.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return;
    }

    const { type, id } = data;
    if (typeof id !== "string") return;

    try {
      switch (type) {
        case "asset:request":
          await this.handleAssetRequest(id, data as AssetRequestMessage);
          break;
        case "fetch:request":
          await this.handleFetchRequest(id, data as FetchRequestMessage);
          break;
        // Ignore other message types (they're for the RPC layer)
      }
    } catch (error) {
      // Errors are handled in the individual handlers
      console.error("[WebviewBridge] Unhandled error:", error);
    }
  }

  private async handleAssetRequest(
    id: string,
    message: AssetRequestMessage,
  ): Promise<void> {
    try {
      const { file } = message;
      if (typeof file !== "string") {
        this.sendErrorResponse("asset:response", id, "Invalid file parameter");
        return;
      }

      // Validate: only allow files from this extension's source
      // Prevent path traversal attacks
      const normalizedFile = this.normalizePath(file);
      if (normalizedFile.startsWith("..") || normalizedFile.includes("/../")) {
        this.sendErrorResponse(
          "asset:response",
          id,
          "Path traversal not allowed",
        );
        return;
      }

      const asset = await this.loader.loadAsset(this.source, normalizedFile);

      this.sendResponse({
        type: "asset:response",
        id,
        ok: true,
        content: asset.content,
        mimeType: asset.mimeType,
      });
    } catch (error) {
      this.sendErrorResponse(
        "asset:response",
        id,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  private async handleFetchRequest(
    id: string,
    message: FetchRequestMessage,
  ): Promise<void> {
    try {
      const { url, options } = message;
      if (typeof url !== "string") {
        this.sendErrorResponse("fetch:response", id, "Invalid URL parameter");
        return;
      }

      const parsedUrl = new URL(url);

      // Validate: check against allowed origins
      if (!this.isAllowedOrigin(parsedUrl.origin)) {
        this.sendErrorResponse(
          "fetch:response",
          id,
          `Origin not allowed: ${parsedUrl.origin}. ` +
            `Extension must declare required origins in manifest permissions.`,
        );
        return;
      }

      // Fetch on behalf of the webview
      const response = await fetch(url, options);
      const content = await response.arrayBuffer();

      this.sendResponse({
        type: "fetch:response",
        id,
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        content,
      });
    } catch (error) {
      this.sendErrorResponse(
        "fetch:response",
        id,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  private isAllowedOrigin(origin: string): boolean {
    // Always allow the extension's own source (GitHub raw content)
    if (origin === "https://raw.githubusercontent.com") return true;

    // Check against declared permissions
    return this.allowedOrigins.has(origin);
  }

  private normalizePath(path: string): string {
    // Remove leading slashes and normalize
    return path.replace(/^\/+/, "").replace(/\\/g, "/");
  }

  private sendResponse(response: RelayResponseMessage): void {
    if (this.disposed) return;
    this.iframe.contentWindow?.postMessage(
      response,
      "*", // Webview origin may be blob: or null
    );
  }

  private sendErrorResponse(
    type: "asset:response" | "fetch:response",
    id: string,
    error: string,
  ): void {
    this.sendResponse({ type, id, ok: false, error });
  }

  /**
   * Update the allowed origins (e.g., when extension permissions change).
   */
  setAllowedOrigins(origins: string[]): void {
    this.allowedOrigins = new Set(origins);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("message", this.messageHandler);
  }
}
