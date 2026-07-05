import React, { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import "@cc-switch/i18n";
import { queryClient as ccSwitchQueryClient } from "@cc-switch/lib/query/queryClient";
import { ThemeProvider } from "@cc-switch/components/theme-provider";
import { Toaster } from "@cc-switch/components/ui/sonner";
import { UpdateProvider } from "@cc-switch/contexts/UpdateContext";

// Lazy-load the cc-switch root component (1643 lines). Loading it
// lazily keeps the Settings drawer's initial JS payload tiny, and
// still preserves the full app surface once the user opens the
// "模型" tab — the bundle chunk is fetched on demand and mounted
// inside the settings drawer body.
const CCSwitchApp = lazy(() =>
  import("@cc-switch/App").then((m) => ({ default: m.default })),
);

function CCSwitchBootstrap() {
  return (
    <QueryClientProvider client={ccSwitchQueryClient}>
      <ThemeProvider defaultTheme="system" storageKey="intentloom-cc-switch-theme">
        <UpdateProvider>
          <Suspense fallback={<CCSplash />}>
            <CCSwitchApp />
          </Suspense>
          <Toaster />
        </UpdateProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function CCSplash() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 320,
        flexDirection: "column",
        gap: 12,
        color: "var(--fg-faint, #888)",
        fontSize: 13,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          border: "2px solid var(--accent, currentColor)",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "ccswitch-spin 0.9s linear infinite",
        }}
      />
      正在加载 cc-switch ...
      <style>{`@keyframes ccswitch-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Bridge component: replaces the legacy placeholder model picker with
 * the entire cc-switch app. Mounted as the body of IntentLoom's
 * Settings drawer "模型" tab. The cc-switch app lives in a self-contained
 * React subtree so its providers (QueryClient, Theme, i18n, Toaster,
 * Update) do not collide with IntentLoom's own state.
 *
 * Tauri commands invoked by the cc-switch UI are all prefixed with
 * `cc_switch_` (see `src-tauri/src/cc_switch/mod.rs`) and registered in
 * IntentLoom's `invoke_handler!` list, so the IPC bridge works
 * transparently — every `invoke("cc_switch_get_providers")` from the
 * cc-switch frontend hits the Rust module of the same name.
 */
export function ModelPanel(): React.ReactElement {
  return <CCSwitchBootstrap />;
}

export default ModelPanel;
