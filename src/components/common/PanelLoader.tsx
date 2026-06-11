// Tiny inline spinner shared by every lazy panel in the app. Lives in
// `common/` so both the legacy sidebar slide-in and the new Settings
// drawer can `React.lazy()` a panel and render the same fallback
// during chunk load.
export function PanelLoader() {
  return (
    <div className="panel-loader">
      <div className="panel-loader__spinner" />
    </div>
  );
}
