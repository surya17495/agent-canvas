/**
 * Resolve a {@link ExtensionSourceRef} to a concrete, immutable {@link ArtifactDescriptor}
 * and from there to a {@link BundleSource} the loader consumes.
 *
 * This is the single per-source seam in the install pipeline:
 *
 *   source string ──parse──▶ ExtensionSourceRef ──resolve──▶ ArtifactDescriptor ──acquire──▶ BundleSource ──▶ loadExtension
 *
 * `npm:`/`gh:` resolve a version via jsDelivr and point at a pinned CDN directory;
 * `url:` passes through unchanged. A future first-party registry (`registry:`) is just
 * another branch here that returns the same descriptor shape (likely `format: "zip"`
 * with an `integrity` hash) — the acquire/load stages do not change.
 */

import { createHttpBundleSource } from "../dev-bundle-source";
import type { BundleSource } from "../loader";
import {
  formatSourceRef,
  parseSourceRef,
  type ExtensionSourceRef,
} from "./ref";
import {
  githubBaseUrl,
  npmBaseUrl,
  resolveGithubVersion,
  resolveNpmVersion,
} from "./jsdelivr";

export interface ArtifactDescriptor {
  /** Canonical source ref string (persisted for re-install, updates, and display). */
  sourceRef: string;
  kind: ExtensionSourceRef["kind"];
  /** Resolved concrete version (npm/gh); `undefined` for raw `url` sources. */
  version?: string;
  /** Base URL of the bundle directory (no trailing slash). */
  baseUrl: string;
  /**
   * Physical packaging. Only `"dir"` (loose files, the existing HTTP source) exists
   * today; `"zip"` is reserved for a first-party registry that ships single archives.
   */
  format: "dir";
}

type FetchLike = typeof fetch;

/** Resolve a parsed ref to an immutable artifact descriptor. */
export async function resolveSourceRef(
  ref: ExtensionSourceRef,
  fetchImpl: FetchLike = fetch,
): Promise<ArtifactDescriptor> {
  const sourceRef = formatSourceRef(ref);
  switch (ref.kind) {
    case "npm": {
      const version = await resolveNpmVersion(ref.name, ref.range, fetchImpl);
      return {
        sourceRef,
        kind: "npm",
        version,
        baseUrl: npmBaseUrl(ref.name, version),
        format: "dir",
      };
    }
    case "gh": {
      const version = await resolveGithubVersion(
        ref.owner,
        ref.repo,
        ref.range,
        fetchImpl,
      );
      return {
        sourceRef,
        kind: "gh",
        version,
        baseUrl: githubBaseUrl(ref.owner, ref.repo, version, ref.subpath),
        format: "dir",
      };
    }
    case "url":
      return {
        sourceRef,
        kind: "url",
        baseUrl: ref.baseUrl,
        format: "dir",
      };
  }
}

/** Parse + resolve a source ref string in one step. */
export function resolveSource(
  input: string,
  fetchImpl: FetchLike = fetch,
): Promise<ArtifactDescriptor> {
  return resolveSourceRef(parseSourceRef(input), fetchImpl);
}

/** Turn a resolved descriptor into a {@link BundleSource} for the loader. */
export function toBundleSource(descriptor: ArtifactDescriptor): BundleSource {
  // Only the `dir` format exists today; a `zip` format would unpack + mint blob URLs.
  return createHttpBundleSource(descriptor.baseUrl);
}
