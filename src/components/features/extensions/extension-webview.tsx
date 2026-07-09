import { useCallback, useEffect, useRef } from "react";
import { getAssetLoader } from "#/extensions/asset-loader";
import {
  createHostMethods,
  type HostApiDeps,
} from "#/extensions/host/host-api";
import { RpcEndpoint } from "#/extensions/host/rpc";
import { createWebviewTransport } from "#/extensions/host/webview-transport";
import type { Capability } from "#/extensions/manifest";
import { WebviewBridge } from "#/extensions/webview-bridge";
import {
  WEBVIEW_OPAQUE_ORIGIN,
  WEBVIEW_SANDBOX,
} from "#/extensions/webview-security";

interface ExtensionWebviewProps {
  /** Owning extension id (namespaces storage / capability checks). */
  extensionId: string;
  /** Capabilities granted to the extension (gates the host API). */
  capabilities: Capability[];
  /** Host API dependencies (conversation, storage, messages, ...). */
  deps: HostApiDeps;
  /** Resolved URL of the webview document (typically a `blob:`/isolated-origin URL). */
  src: string;
  /** Accessible title for the iframe. */
  title: string;
  /**
   * Extension source ref (e.g., "gh:owner/repo@sha") for asset relay.
   * When provided, enables the webview to request additional assets via postMessage.
   */
  extensionSource?: string;
  /**
   * Allowed external origins for fetch relay (from extension manifest permissions).
   * Extensions must declare origins they need to access.
   */
  allowedOrigins?: string[];
}

/**
 * Renders an extension's webview UI inside a **sandboxed** `<iframe>` and connects it
 * to the host's capability-gated `agentCanvas` API over `postMessage` (reusing the
 * exact same {@link createHostMethods} surface the worker uses).
 *
 * Security:
 * - `sandbox="allow-scripts"` (deliberately *no* `allow-same-origin`) makes the frame
 *   origin "null", so it cannot read host cookies, storage, or the parent DOM.
 * - The host only accepts RPC messages whose `event.source` is this iframe's window.
 * - Capability checks are enforced host-side per call.
 *
 * The webview document is expected to use `acquireAgentCanvasApi()` (see
 * `sdk/webview-client.ts`) to talk to the host, and optionally `requestAsset()` /
 * `relayFetch()` (see `sdk/asset-relay.ts`) to load additional resources.
 */
export function ExtensionWebview({
  extensionId,
  capabilities,
  deps,
  src,
  title,
  extensionSource,
  allowedOrigins,
}: ExtensionWebviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const endpointRef = useRef<RpcEndpoint | null>(null);
  const bridgeRef = useRef<WebviewBridge | null>(null);

  // Latest host inputs, read at (re)connect time so reconnecting on load never forces
  // the iframe to reload. These are stable in practice (memoized deps, registry-owned
  // capabilities), so the iframe only reloads when `src`/`extensionId` change.
  const capabilitiesRef = useRef(capabilities);
  const depsRef = useRef(deps);
  const extensionSourceRef = useRef(extensionSource);
  const allowedOriginsRef = useRef(allowedOrigins);
  capabilitiesRef.current = capabilities;
  depsRef.current = deps;
  extensionSourceRef.current = extensionSource;
  allowedOriginsRef.current = allowedOrigins;

  // Establish the RPC endpoint and asset relay bridge against the *loaded* document's
  // window. A sandboxed iframe (no allow-same-origin) gets a fresh window once it
  // navigates to `src`, so binding on `load` — not on mount — is required for
  // `event.source` to match.
  const connect = useCallback(() => {
    const iframe = frameRef.current;
    const contentWindow = iframe?.contentWindow;
    if (!contentWindow || !iframe) return;

    // Dispose previous connections
    endpointRef.current?.dispose();
    bridgeRef.current?.dispose();

    // Set up RPC endpoint for agentCanvas API
    const transport = createWebviewTransport(contentWindow, {
      source: contentWindow,
      expectedOrigin: WEBVIEW_OPAQUE_ORIGIN,
    });
    endpointRef.current = new RpcEndpoint(
      transport,
      createHostMethods(extensionId, capabilitiesRef.current, depsRef.current),
    );

    // Set up asset relay bridge if extension source is provided
    const source = extensionSourceRef.current;
    if (source) {
      bridgeRef.current = new WebviewBridge({
        iframe,
        extensionSource: source,
        assetLoader: getAssetLoader(),
        allowedOrigins: allowedOriginsRef.current,
      });
    }
  }, [extensionId]);

  useEffect(
    () => () => {
      endpointRef.current?.dispose();
      endpointRef.current = null;
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
    },
    [],
  );

  return (
    <iframe
      ref={frameRef}
      data-testid={`extension-webview-${extensionId}`}
      title={title}
      src={src}
      onLoad={connect}
      sandbox={WEBVIEW_SANDBOX}
      referrerPolicy="no-referrer"
      className="h-full w-full border-0"
    />
  );
}
