

## Problem

The Pluggy Connect widget fails with "Widget não disponível" because the script loads from `https://cdn.pluggy.ai/pluggy-connect/v2.pluggy-connect.js` but `window.PluggyConnect` is not available when `launchWidget` is called. This is a race condition — the script is marked as existing (by ID) on second click, but the global may not have been set, or the CDN script URL/export name may have changed.

## Plan

### 1. Fix widget loading logic

**File: `src/pages/Connections.tsx`**

- Add a retry/wait mechanism: after script loads, wait briefly for `window.PluggyConnect` to be defined before giving up
- When the script already exists but `PluggyConnect` is undefined, remove the old script and reload it
- Update the CDN URL to the latest Pluggy Connect SDK (v2 may have changed their bundle path — check if `PluggyConnect` is the correct global name, as newer versions may use a different constructor or require `init()` differently)

### 2. Add fallback with iframe approach

If the CDN script continues to fail (e.g., blocked by CSP or changed API), add a fallback that opens the Pluggy Connect widget via iframe URL directly:
- `https://connect.pluggy.ai/?connect_token={accessToken}`
- This is more resilient than relying on a JS SDK global

### Technical Details

The root cause is likely one of:
1. **Race condition**: Script tag exists from prior attempt but `PluggyConnect` global wasn't set (script errored silently)
2. **CDN URL change**: The v2 SDK path may be outdated
3. **CSP blocking**: The sandbox preview may block external scripts

The fix will:
- Remove stale script tags before reloading
- Add a polling check (up to 3s) for `window.PluggyConnect` after script load
- Fall back to iframe-based widget if JS SDK fails

