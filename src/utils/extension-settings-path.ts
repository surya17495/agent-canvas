/**
 * Single source of truth for the catch-all extension settings route
 * (`/settings/x/:extensionId`, see `routes.ts` + `routes/extension-settings.tsx`),
 * so the Settings nav merge (`use-settings-nav-items.ts`) and the route can never
 * drift apart.
 */
export function extensionSettingsPath(extensionId: string): string {
  return `/settings/x/${extensionId}`;
}
