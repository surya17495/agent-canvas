import { useCallback, useEffect, useRef } from "react";
import {
  createHostMethods,
  type HostApiDeps,
} from "#/extensions/host/host-api";
import { RpcEndpoint } from "#/extensions/host/rpc";
import { createWebviewTransport } from "#/extensions/host/webview-transport";
import type { Capability } from "#/extensions/manifest";

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
 * `sdk/webview-client.ts`) to talk to the host.
 */
export function ExtensionWebview({
  extensionId,
  capabilities,
  deps,
  src,
  title,
}: ExtensionWebviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const endpointRef = useRef<RpcEndpoint | null>(null);

  // Latest host inputs, read at (re)connect time so reconnecting on load never forces
  // the iframe to reload. These are stable in practice (memoized deps, registry-owned
  // capabilities), so the iframe only reloads when `src`/`extensionId` change.
  const capabilitiesRef = useRef(capabilities);
  const depsRef = useRef(deps);
  capabilitiesRef.current = capabilities;
  depsRef.current = deps;

  // Establish the RPC endpoint against the *loaded* document's window. A sandboxed
  // iframe (no allow-same-origin) gets a fresh window once it navigates to `src`, so
  // binding on `load` — not on mount — is required for `event.source` to match.
  const connect = useCallback(() => {
    const contentWindow = frameRef.current?.contentWindow;
    if (!contentWindow) return;
    endpointRef.current?.dispose();
    const transport = createWebviewTransport(contentWindow, {
      source: contentWindow,
    });
    endpointRef.current = new RpcEndpoint(
      transport,
      createHostMethods(extensionId, capabilitiesRef.current, depsRef.current),
    );
  }, [extensionId]);

  useEffect(
    () => () => {
      endpointRef.current?.dispose();
      endpointRef.current = null;
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
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="h-full w-full border-0"
    />
  );
}
