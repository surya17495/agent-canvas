import { create } from "zustand";

/**
 * Host-side state for the currently open extension panel (webview). The rail/command
 * selection flow opens a view here, and `ExtensionPanel` renders whatever is active.
 *
 * Kept as a tiny zustand store (primitive fields) so it bridges the framework-agnostic
 * `ExtensionHost` to the React tree without selector-identity churn.
 */
interface ExtensionPanelState {
  activeExtensionId: string | null;
  activeViewId: string | null;
  openView: (extensionId: string, viewId: string) => void;
  close: () => void;
}

export const useExtensionPanelStore = create<ExtensionPanelState>((set) => ({
  activeExtensionId: null,
  activeViewId: null,
  openView: (extensionId, viewId) =>
    set({ activeExtensionId: extensionId, activeViewId: viewId }),
  close: () => set({ activeExtensionId: null, activeViewId: null }),
}));
