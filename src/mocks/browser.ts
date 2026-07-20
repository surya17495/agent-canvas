import { setupWorker } from "msw/browser";
import { http, passthrough } from "msw";
import { handlers } from "./handlers";
import { getCentridBaseUrl } from "#/api/centri/centri-config";

// `centrid` is a genuinely separate loopback service, not part of the mocked
// agent-server surface. Because the app-shell mocks register wildcard routes
// like `*/api/settings`, they would otherwise swallow the Centri panel's
// cross-origin calls to centrid (which shares those path names). Prepending a
// passthrough scoped to the centrid origin keeps the live Centri request path
// intact even while the rest of the app runs against MSW. This only ever runs
// in mock/dev mode; production never starts the worker.
const centridPassthrough = http.all(
  `${getCentridBaseUrl().replace(/\/$/, "")}/*`,
  () => passthrough(),
);

export const worker = setupWorker(centridPassthrough, ...handlers);
