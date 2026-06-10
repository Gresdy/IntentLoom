import { useModelStore } from "../../stores/useModelStore";

// Provider + model picker. Lifted out of ReasonixApp so both the
// sidebar popup and the new Settings → Model tab can render it
// without duplicating the markup.
export function ModelPanel() {
  const { currentProviderId, providers, switchProvider } = useModelStore();
  const providerList = Object.values(providers);

  return (
    <div className="model-panel">
      <div className="model-panel__section">
        <h3 className="model-panel__heading"> 当前模型</h3>
        <select
          className="model-panel__select"
          value={currentProviderId}
          onChange={(e) => switchProvider(e.target.value)}
        >
          {providerList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{" "}
              {p.settingsConfig?.ANTHROPIC_MODEL
                ? "(" + p.settingsConfig.ANTHROPIC_MODEL + ")"
                : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <h3 className="model-panel__heading">可用模型</h3>
        {providerList.map((p) => (
          <div
            key={p.id}
            className={`model-card${currentProviderId === p.id ? " model-card--active" : ""}`}
            onClick={() => switchProvider(p.id)}
          >
            <div className="model-card__name">{p.name}</div>
            <div className="model-card__model">
              {p.settingsConfig?.ANTHROPIC_MODEL || p.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
