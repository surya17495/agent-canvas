import React from "react";
import { useQueries } from "@tanstack/react-query";

import type { Backend } from "#/api/backend-registry/types";
import { createServerClient } from "#/api/typescript-client";

interface BackendServerInfoState {
  version: string | null;
  isLoading: boolean;
  isError: boolean;
}

export type BackendServerInfoById = Record<string, BackendServerInfoState>;

export function useBackendServerInfo(
  backends: Backend[],
): BackendServerInfoById {
  const queries = useQueries({
    queries: backends.map((backend) => ({
      queryKey: ["backend-server-info", backend.host, backend.apiKey],
      queryFn: async () => {
        const info = await createServerClient({
          host: backend.host,
          sessionApiKey: backend.apiKey || null,
          timeout: 5000,
        }).getServerInfo();
        return { version: info.version ?? null };
      },
      retry: false,
      staleTime: 60_000,
      enabled: backend.kind === "local",
    })),
  });

  return React.useMemo(
    () =>
      Object.fromEntries(
        backends.map((backend, index) => [
          backend.id,
          {
            version: queries[index]?.data?.version ?? null,
            isLoading: queries[index]?.isLoading ?? false,
            isError: queries[index]?.isError ?? false,
          },
        ]),
      ),
    [backends, queries],
  );
}
