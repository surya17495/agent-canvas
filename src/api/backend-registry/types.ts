export type BackendKind = "local" | "remote" | "cloud";

export function isAgentServerBackend(
  backend: Pick<Backend, "kind">,
): backend is Pick<Backend, "kind"> & { kind: "local" | "remote" } {
  return backend.kind === "local" || backend.kind === "remote";
}

export interface Backend {
  id: string;
  name: string;
  host: string;
  apiKey: string;
  kind: BackendKind;
}

export interface BackendSelection {
  backendId: string;
  orgId?: string | null;
}

export interface ResolvedActiveBackend {
  backend: Backend;
  orgId: string | null;
}
