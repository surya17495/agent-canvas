# Sandboxes Extension - Implementation Plan

Status: Planning
Author: OpenHands
Branch: `jps/ui-extensions`

---

## 0. Reference Implementation

The **Dad Jokes extension** is the most complete example of the UI extensions system
and should be used as a reference for implementation patterns:

- **Repository:** [jpshackelford/oh-examples](https://github.com/jpshackelford/oh-examples)
- **PR:** [#14 - Add Agent Canvas UI extensions examples](https://github.com/jpshackelford/oh-examples/pull/14)
- **Path:** `agent-canvas-extensions/dad-jokes/`

Key patterns to follow from Dad Jokes:
- Theme integration via `agentCanvas:theme` postMessage (CSS variable injection)
- Auto-resize support for dynamic iframe height
- Button styling with `btn-primary` and `btn-secondary` classes
- Settings page with storage API persistence
- Transparent background handling for sandboxed iframes

**Destination:** This extension should be added to `OpenHands/extensions-private` in the
`canvas-extensions/` directory, separate from the existing plugin marketplace files.
```
extensions-private/
├── .plugin/marketplace.json     # Existing plugin registry (don't modify)
├── canvas-extensions/           # Agent Canvas UI extensions
│   └── sandboxes/
│       ├── extension.json
│       ├── panel.html
│       └── icon.svg
└── ...
```

---

## 1. Overview

A UI extension for managing cloud sandboxes in Agent Canvas. Sandboxes are the
compute environments that back cloud conversations - each sandbox can host multiple
conversations and has lifecycle states (running, paused, stopped).

This extension provides a dedicated page for:
- Viewing all sandboxes with metadata
- Naming sandboxes (stored locally since the API doesn't support names)
- Filtering and sorting the sandbox list
- Expanding sandboxes to see their conversations
- Managing sandbox lifecycle (pause, resume, wake)
- Creating new sandboxes/conversations

**Cloud-only**: This extension is only relevant when connected to a cloud backend
(SaaS at `app.all-hands.dev` or enterprise deployments).

---

## 2. Prerequisites

This extension depends on the `backend:cloud:read` and `backend:cloud:write`
capabilities added in commit `eab81c1a`. These allow extensions to make API calls
to the active cloud backend without hardcoding URLs.

---

## 3. Extension Manifest

```json
{
  "id": "openhands.sandboxes",
  "name": "Sandboxes",
  "version": "1.0.0",
  "publisher": "openhands",
  "engines": { "agentCanvas": "^1.0.0" },
  "activationEvents": ["onView:sandboxes.main"],
  "capabilities": [
    "backend:cloud:read",
    "backend:cloud:write", 
    "storage"
  ],
  "contributes": {
    "pages": [
      {
        "id": "main",
        "title": "Sandboxes",
        "icon": "icon.svg",
        "page": "panel.html",
        "when": "backend == cloud"
      }
    ]
  }
}
```

The `when: "backend == cloud"` clause ensures the sidebar nav item only appears
when connected to a cloud backend.

---

## 4. Cloud API Endpoints

All calls go through `agentCanvas.backend.cloudFetch({ path, method, body })`.
The host handles authentication automatically.

### 4.1 List Conversations (includes sandbox info)

```
GET /api/v1/app-conversations/search?limit=100&sort_order=UPDATED_AT_DESC
```

Response includes `sandbox_id` and `sandbox_status` per conversation:
```typescript
interface AppConversation {
  id: string;
  title: string | null;
  created_at: string;       // ISO timestamp
  updated_at: string;       // ISO timestamp
  sandbox_id: string;
  sandbox_status: "STARTING" | "RUNNING" | "PAUSED" | "ERROR" | "MISSING";
  execution_status: string;
  // ... other fields
}
```

### 4.2 Batch Get Sandboxes

```
GET /api/v1/sandboxes?id=abc&id=def&id=ghi
```

Response:
```typescript
interface V1SandboxInfo {
  id: string;
  created_by_user_id: string | null;
  sandbox_spec_id: string;
  status: "STARTING" | "RUNNING" | "PAUSED" | "ERROR" | "MISSING";
  session_api_key: string | null;
  exposed_urls: { name: string; url: string }[] | null;
  created_at: string;  // ISO timestamp
}
```

### 4.3 Pause Sandbox

```
POST /api/v1/sandboxes/{sandboxId}/pause
```

### 4.4 Resume Sandbox

```
POST /api/v1/sandboxes/{sandboxId}/resume
```

### 4.5 Create Conversation (creates sandbox if needed)

```
POST /api/v1/app-conversations
```

This is complex - it returns a task that must be polled. For MVP, link to
the main app's "new conversation" flow rather than implementing this.

---

## 5. UI Requirements

### 5.1 Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Sandboxes                              [+ New Sandbox]     │
├─────────────────────────────────────────────────────────────┤
│  Filter: [Running ▼] [Paused ▼] [Stopped ▼]    Sort: [▼]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▶ sandbox-abc-123        RUNNING    2 hours ago     │   │
│  │   (click ID to rename)              Created: May 1   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▼ My Dev Sandbox         PAUSED     Friday          │   │
│  │                                     Created: Apr 28  │   │
│  │   ┌─────────────────────────────────────────────┐   │   │
│  │   │ [+ New Conversation]              [Wake]    │   │   │
│  │   ├─────────────────────────────────────────────┤   │   │
│  │   │ Fix auth bug         3 hours ago            │   │   │
│  │   │ Refactor tests       Yesterday              │   │   │
│  │   └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Sandbox Table

**Columns:**
- **Name/ID**: Shows custom name if set, otherwise sandbox ID. Click to edit name.
- **Status**: Badge showing RUNNING (green), PAUSED (yellow), ERROR (red), etc.
- **Last Active**: Relative time ("2 hours ago", "Friday", "10 days ago")
- **Created**: Relative time

**Default Filter**: Show RUNNING and PAUSED sandboxes (not STOPPED/MISSING)

**Sort Options**:
- Status (default)
- Last Active (most recent first)
- Created (most recent first)

**Important**: Sort by actual date values, not alphabetically on the display strings.

### 5.3 Expanded Sandbox Row

When a sandbox row is expanded, show:
1. A "New Conversation" button at the top
2. For PAUSED sandboxes: a "Wake" button
3. List of conversations in that sandbox with:
   - Title (or "Untitled" if null)
   - Last active time
   - Created time

Clicking a conversation should navigate to it (if possible via extension API,
otherwise show a link).

### 5.4 Sandbox Naming

The cloud API doesn't support sandbox names, so we store them locally using
the extension's `storage` capability:

```js
// Storage key: "sandbox-names"
// Value: { [sandboxId]: name }

const names = await agentCanvas.storage.get("sandbox-names") || {};
names[sandboxId] = "My Dev Sandbox";
await agentCanvas.storage.set("sandbox-names", names);
```

### 5.5 Relative Time Display

Display times in human-friendly format:
- < 1 minute: "just now"
- < 60 minutes: "X minutes ago"
- < 24 hours: "X hours ago"
- < 7 days: Day name ("Friday", "Monday")
- >= 7 days: "X days ago"

Implementation (no external library needed):
```js
function relativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDays < 7) {
    return date.toLocaleDateString("en", { weekday: "long" });
  }
  return `${diffDays} days ago`;
}
```

---

## 6. Styling (Native Look)

The webview should match Agent Canvas's dark theme. Use these CSS custom properties
(the host injects them into the webview automatically):

```css
:root {
  /* Background layers */
  --oh-background: #0B0E14;      /* Page background */
  --oh-surface: #21252F;         /* Panel/card background */
  --oh-surface-raised: #2C313F;  /* Elevated elements */
  --oh-surface-deep: #05070A;    /* Deep inset areas */
  
  /* Text */
  --oh-foreground: #EEF2F7;      /* Primary text */
  --oh-text-secondary: #C3CDDC;  /* Secondary text */
  --oh-muted: #A3B0C4;           /* Muted/placeholder */
  --oh-text-dim: #7E8A9E;        /* Very muted */
  
  /* Borders */
  --oh-border: #4B5468;          /* Standard borders */
  --oh-border-subtle: #383F50;   /* Subtle dividers */
  
  /* Interactive */
  --oh-interactive-hover: #4B5468;
  --oh-interactive-hover-low: #2C313F;
  
  /* Accents */
  --oh-color-primary: #c9b974;   /* Gold accent */
  --oh-color-success: #a5e75e;   /* Green */
  --oh-color-danger: #e76a5e;    /* Red */
  
  /* Radius */
  --oh-radius: 8px;
}
```

### Table Styling Pattern

```css
.table-container {
  border: 1px solid var(--oh-border);
  border-radius: 6px;
  background: var(--oh-surface);
  overflow: hidden;
}

.table-row {
  height: 44px;
  border-top: 1px solid var(--oh-border);
  padding: 0 12px;
  display: flex;
  align-items: center;
  transition: background-color 150ms;
}

.table-row:first-child {
  border-top: none;
}

.table-row:hover {
  background: var(--oh-interactive-hover-low);
}

.table-row.expanded {
  background: var(--oh-surface-raised);
}
```

### Status Badge Styling

```css
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge-running {
  background: rgba(165, 231, 94, 0.15);
  color: #a5e75e;
}

.badge-paused {
  background: rgba(201, 185, 116, 0.15);
  color: #c9b974;
}

.badge-error {
  background: rgba(231, 106, 94, 0.15);
  color: #e76a5e;
}

.badge-stopped {
  background: rgba(126, 138, 158, 0.15);
  color: #7E8A9E;
}
```

### Button Styling

```css
.button-primary {
  background: var(--oh-color-primary);
  color: var(--oh-background);
  border: none;
  border-radius: var(--oh-radius);
  padding: 8px 16px;
  font-weight: 500;
  cursor: pointer;
}

.button-primary:hover {
  opacity: 0.9;
}

.button-secondary {
  background: transparent;
  color: var(--oh-foreground);
  border: 1px solid var(--oh-border);
  border-radius: var(--oh-radius);
  padding: 8px 16px;
  cursor: pointer;
}

.button-secondary:hover {
  background: var(--oh-interactive-hover-low);
}
```

---

## 7. Data Flow

### 7.1 Initial Load

1. Call `GET /api/v1/app-conversations/search?limit=100` to get all conversations
2. Extract unique `sandbox_id` values from conversations
3. Call `GET /api/v1/sandboxes?id=...` with all sandbox IDs
4. Load sandbox names from `storage.get("sandbox-names")`
5. Merge data and render table

### 7.2 Grouping

Group conversations by `sandbox_id`. Each sandbox row shows:
- Sandbox metadata from the `/sandboxes` response
- Count of conversations
- Most recent `updated_at` across all conversations (for "Last Active")

### 7.3 Refresh

Add a refresh button or auto-refresh on interval (e.g., every 30 seconds when
the page is visible).

---

## 8. File Structure

```
examples/extensions/sandboxes/
├── extension.json      # Manifest
├── package.json        # For npm publishing
├── icon.svg           # Sidebar icon
├── panel.html         # Main webview page
└── README.md          # Extension documentation
```

The entire implementation lives in `panel.html` as a self-contained webview
(HTML + CSS + inline JavaScript). This matches the hello-sidebar example pattern.

---

## 9. Implementation Notes

### 9.1 Webview API Access

The webview communicates with the host via postMessage RPC. The pattern:

```js
// Request helper (inline in the webview)
function request(method, params) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending[id] = { resolve, reject };
    window.parent.postMessage({ kind: "request", id, method, params }, "*");
  });
}

// API object
const agentCanvas = {
  backend: {
    cloudFetch: (params) => request("backend.cloudFetch", params)
  },
  storage: {
    get: (key) => request("storage.get", { key }),
    set: (key, value) => request("storage.set", { key, value })
  }
};
```

### 9.2 Error Handling

- If `backend.cloudFetch` returns `null`, the cloud backend is not active
  (show a "Connect to cloud backend" message)
- If a request fails (`response.ok === false`), show an error toast/message
- Handle network errors gracefully

### 9.3 Navigation Limitation

The extension API doesn't currently support navigating to conversations. Options:
- Show the conversation URL as a copyable link
- Add a `window.open` call (may be blocked by sandbox)
- Future: Add `navigation.goto` to the host API

For MVP, display conversation info and let users navigate manually.

---

## 10. Future Enhancements

- **Sandbox creation**: Implement the full conversation creation flow
- **Bulk actions**: Pause/resume multiple sandboxes at once
- **Search**: Filter sandboxes/conversations by name or ID
- **Metrics**: Show resource usage per sandbox if API supports it
- **Auto-cleanup**: Suggest deleting old stopped sandboxes

---

## 11. Testing

### Manual Testing Checklist

- [ ] Page only appears when cloud backend is active
- [ ] Sandbox list loads and displays correctly
- [ ] Status badges show correct colors
- [ ] Relative times display correctly
- [ ] Sorting works (by status, last active, created)
- [ ] Filtering works (running, paused, stopped toggle)
- [ ] Sandbox expansion shows conversations
- [ ] Naming a sandbox persists across page reloads
- [ ] Pause button works on running sandboxes
- [ ] Wake/Resume button works on paused sandboxes
- [ ] Refresh button reloads data

### Edge Cases

- No sandboxes (empty state)
- Sandbox with no conversations
- Very long sandbox names (truncation)
- Network errors during API calls
- Rapid pause/resume actions

---

## 12. References

**Reference Implementation:**
- Dad Jokes extension: [jpshackelford/oh-examples PR #14](https://github.com/jpshackelford/oh-examples/pull/14)
- Path: `agent-canvas-extensions/dad-jokes/`

**Agent Canvas Extension System:**
- Extension system docs: `src/extensions/README.md`
- Extension points: `docs/EXTENSION_POINTS.md`
- Simple example: `examples/extensions/hello-sidebar/`

**Cloud API Types:**
- Sandbox types: `src/api/cloud/sandbox-service.types.ts`
- Conversation types: `src/api/conversation-service/agent-server-conversation-service.types.ts`

**Related Commits:**
- Backend capabilities: `eab81c1a` - `feat(extensions): add backend:cloud:read and backend:cloud:write capabilities`
