/**
 * Asset relay client for webviews. Runs inside the sandboxed iframe to request
 * assets and make relayed fetch calls through the parent window.
 *
 * This code is imported by webview documents via the extension SDK. It provides
 * a way for webviews to load additional assets (images, scripts, data) that they
 * can't fetch directly due to CSP restrictions.
 *
 * Usage:
 * ```ts
 * import { requestAsset, relayFetch } from "@agent-canvas/extension-api/webview";
 *
 * // Load an asset from the extension bundle
 * const iconData = await requestAsset("icons/logo.png");
 * const iconUrl = URL.createObjectURL(new Blob([iconData.content], { type: iconData.mimeType }));
 *
 * // Fetch from an allowed external origin (must be declared in manifest)
 * const response = await relayFetch("https://api.example.com/data");
 * const json = await response.json();
 * ```
 */

let requestId = 0;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

const pendingRequests = new Map<string, PendingRequest>();

// Set up the message listener on module load
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    // Only accept messages from the parent window
    if (event.source !== window.parent) return;

    const data = event.data;
    if (!data || typeof data !== "object") return;

    const { type, id } = data;
    if (typeof id !== "string") return;

    // Handle asset and fetch responses
    if (type === "asset:response" || type === "fetch:response") {
      const pending = pendingRequests.get(id);
      if (pending) {
        pendingRequests.delete(id);
        if (data.ok) {
          pending.resolve(data);
        } else {
          pending.reject(new Error(data.error ?? "Request failed"));
        }
      }
    }
  });
}

export interface AssetContent {
  /** The raw content as ArrayBuffer. */
  content: ArrayBuffer;
  /** MIME type of the content. */
  mimeType: string;
}

/**
 * Request an asset from the extension bundle via the parent window relay.
 *
 * @param file - Path to the file within the extension (e.g., "icons/logo.png")
 * @returns The asset content and MIME type
 * @throws Error if the asset cannot be loaded or times out
 */
export async function requestAsset(file: string): Promise<AssetContent> {
  const id = `asset:${++requestId}`;

  return new Promise<AssetContent>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (data: unknown) => {
        const typed = data as { content: ArrayBuffer; mimeType: string };
        resolve({ content: typed.content, mimeType: typed.mimeType });
      },
      reject,
    });

    window.parent.postMessage({ type: "asset:request", id, file }, "*");

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Asset request timed out: ${file}`));
      }
    }, 30000);
  });
}

/**
 * Create a blob URL from asset content.
 * Remember to call URL.revokeObjectURL when done.
 */
export function createAssetUrl(asset: AssetContent): string {
  const blob = new Blob([asset.content], { type: asset.mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Convenience: load an asset and return a blob URL directly.
 * Remember to call URL.revokeObjectURL when done.
 */
export async function loadAssetUrl(file: string): Promise<string> {
  const asset = await requestAsset(file);
  return createAssetUrl(asset);
}

interface RelayFetchResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  content: ArrayBuffer;
}

/**
 * Fetch from an external URL via the parent window relay.
 * The URL's origin must be declared in the extension's manifest permissions.
 *
 * @param url - The URL to fetch
 * @param options - Standard RequestInit options (method, headers, body, etc.)
 * @returns A Response-like object
 * @throws Error if the origin is not allowed, the request fails, or times out
 */
export async function relayFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const id = `fetch:${++requestId}`;

  const result = await new Promise<RelayFetchResponse>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (data: unknown) => resolve(data as RelayFetchResponse),
      reject,
    });

    window.parent.postMessage({ type: "fetch:request", id, url, options }, "*");

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Fetch request timed out: ${url}`));
      }
    }, 30000);
  });

  // Reconstruct a Response object
  return new Response(result.content, {
    status: result.status,
    headers: new Headers(result.headers),
  });
}
