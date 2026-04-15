import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../i18n";
import { useSkillsStore } from "../../stores/skillsStore";
import { normalizeSkillName } from "../../composables/utils";
import type { MarketSortMode, DownloadTask } from "../../composables/types";

// Toast Component
function ToastContainer() {
  const toasts = useSkillsStore((s) => s.toasts);
  const removeToast = useSkillsStore((s) => s.removeToast);

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      zIndex: 1000,
      pointerEvents: "none",
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            pointerEvents: "auto",
            padding: "10px 16px",
            borderRadius: "999px",
            fontSize: "14px",
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            cursor: "pointer",
            minWidth: "200px",
            textAlign: "center",
            background: toast.type === "success" ? "var(--color-success-bg)" :
                       toast.type === "error" ? "var(--color-error-bg)" :
                       "var(--color-panel-bg)",
            color: toast.type === "success" ? "var(--color-success-text)" :
                   toast.type === "error" ? "var(--color-error-text)" :
                   "var(--color-text)",
            border: `1px solid ${toast.type === "success" ? "var(--color-success-border)" :
                                   toast.type === "error" ? "var(--color-error-border)" :
                                   "var(--color-panel-border)"}`,
          }}
        >
          {toast.content}
        </div>
      ))}
    </div>
  );
}

// Download Queue Component
function DownloadQueue({ tasks }: { tasks: DownloadTask[] }) {
  const retryDownload = useSkillsStore((s) => s.retryDownload);
  const removeFromQueue = useSkillsStore((s) => s.removeFromQueue);
  const { t } = useI18n();

  if (tasks.length === 0) return null;

  return (
    <div style={{
      marginBottom: "16px",
      padding: "12px",
      background: "var(--surface-1)",
      borderRadius: "8px",
      border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: "0.9em", fontWeight: 600, marginBottom: "8px" }}>
        {t("download.title")}
      </div>
      {tasks.map((task) => (
        <div key={task.id} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: "var(--surface-2)",
          borderRadius: "6px",
          marginTop: "8px",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontWeight: 500, fontSize: "0.9em" }}>{task.name}</span>
            <span style={{
              fontSize: "0.8em",
              color: task.status === "done" ? "var(--success, #22c55e)" :
                     task.status === "error" ? "var(--error, #ef4444)" :
                     task.status === "downloading" ? "var(--primary)" :
                     "var(--text-2)"
            }}>
              {task.status === "pending" && t("download.pending")}
              {task.status === "downloading" && t("download.downloading")}
              {task.status === "done" && t("download.done")}
              {task.status === "error" && (task.error || t("download.error"))}
            </span>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {task.status === "error" && (
              <button
                onClick={() => retryDownload(task.id)}
                style={{
                  padding: "4px 8px",
                  fontSize: "0.8em",
                  background: "transparent",
                  border: "1px solid var(--color-ghost-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {t("download.retry")}
              </button>
            )}
            {(task.status === "error" || task.status === "pending") && (
              <button
                onClick={() => removeFromQueue(task.id)}
                style={{
                  padding: "4px 8px",
                  fontSize: "0.8em",
                  background: "transparent",
                  border: "1px solid var(--color-ghost-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Local Panel Component
function LocalPanel() {
  const localSkills = useSkillsStore((s) => s.localSkills);
  const localLoading = useSkillsStore((s) => s.localLoading);
  const downloadQueue = useSkillsStore((s) => s.downloadQueue);
  const ideOptions = useSkillsStore((s) => s.ideOptions);
  const scanLocalSkills = useSkillsStore((s) => s.scanLocalSkills);
  const importLocalSkill = useSkillsStore((s) => s.importLocalSkill);
  const openInstallModal = useSkillsStore((s) => s.openInstallModal);
  const updateLocalSkills = useSkillsStore((s) => s.updateLocalSkills);
  const exportLocalSkills = useSkillsStore((s) => s.exportLocalSkills);
  const openDeleteLocalModal = useSkillsStore((s) => s.openDeleteLocalModal);
  const openSkillDirectory = useSkillsStore((s) => s.openSkillDirectory);
  const { t } = useI18n();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return localSkills;
    const keyword = searchQuery.trim().toLowerCase();
    const normalizedKeyword = normalizeSkillName(keyword);
    return localSkills.filter((skill) => {
      const haystacks = [skill.name, skill.description, skill.path];
      return haystacks.some((value) => {
        const lowered = value.toLowerCase();
        return lowered.includes(keyword) || normalizeSkillName(value).includes(normalizedKeyword);
      });
    });
  }, [localSkills, searchQuery]);

  const selectedSkills = useMemo(() =>
    filteredSkills.filter((s) => selectedIds.includes(s.id)),
    [filteredSkills, selectedIds]
  );

  const selectedUpdatable = useMemo(() =>
    selectedSkills.filter((s) => !!s.sourceUrl?.trim()),
    [selectedSkills]
  );

  const allSelected = filteredSkills.length > 0 &&
    filteredSkills.every((s) => selectedIds.includes(s.id));

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds([...new Set([...selectedIds, ...filteredSkills.map((s) => s.id)])]);
    } else {
      setSelectedIds(selectedIds.filter((id) => !filteredSkills.some((s) => s.id === id)));
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  return (
    <section className="panel">
      <div className="panel-title">{t("local.title")}</div>
      <div className="hint">{t("local.hint")}</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "13px", color: "var(--color-muted)" }}>
        <span>{t("local.total", { count: localSkills.length })}</span>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={allSelected}
            disabled={filteredSkills.length === 0}
            onChange={(e) => toggleAll(e.target.checked)}
          />
          {t("local.selectAll")}
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginTop: "12px" }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input"
          placeholder={t("local.searchPlaceholder")}
          style={{ flex: "1 1 280px" }}
        />
        <span style={{ fontSize: "13px", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
          {t("local.filteredTotal", { shown: filteredSkills.length, total: localSkills.length })}
        </span>
      </div>

      <div className="buttons" style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px" }}>
        <button className="ghost" disabled={localLoading} onClick={scanLocalSkills}>
          {localLoading ? t("local.scanning") : t("market.refresh")}
        </button>
        <button className="primary" disabled={localLoading} onClick={importLocalSkill}>
          {t("local.import")}
        </button>
        <button
          className="ghost"
          disabled={selectedSkills.length === 0 || localLoading}
          onClick={() => selectedSkills.forEach((s) => openInstallModal(s))}
        >
          {t("local.installSelected", { count: selectedSkills.length })}
        </button>
        <button
          className="ghost"
          disabled={selectedUpdatable.length === 0 || localLoading}
          onClick={() => updateLocalSkills(selectedUpdatable)}
        >
          {t("local.updateSelected", { count: selectedUpdatable.length })}
        </button>
        <button
          className="ghost"
          disabled={selectedSkills.length === 0 || localLoading}
          onClick={() => exportLocalSkills(selectedSkills)}
        >
          {t("local.exportSelected", { count: selectedSkills.length })}
        </button>
        <button
          className="ghost danger"
          disabled={selectedSkills.length === 0 || localLoading}
          onClick={() => openDeleteLocalModal(selectedSkills)}
        >
          {t("local.deleteSelected", { count: selectedSkills.length })}
        </button>
        <button
          className="ghost danger"
          disabled={localSkills.length === 0 || localLoading}
          onClick={() => openDeleteLocalModal(localSkills)}
        >
          {t("local.deleteAll")}
        </button>
      </div>

      <DownloadQueue tasks={downloadQueue} />

      {localLoading && <div className="hint">{t("local.scanning")}</div>}
      {!localLoading && localSkills.length === 0 && <div className="hint">{t("local.emptyHint")}</div>}
      {!localLoading && filteredSkills.length === 0 && localSkills.length > 0 && (
        <div className="hint">{t("local.searchEmptyHint")}</div>
      )}

      {filteredSkills.length > 0 && (
        <div className="cards">
          {filteredSkills.map((skill, index) => (
            <article
              key={skill.id}
              className={`card local-card ${skill.usedBy.length > 0 ? "linked" : ""}`}
            >
              <div className="card-header">
                <div className="card-title-row">
                  <label style={{ paddingTop: "2px" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(skill.id)}
                      onChange={(e) => toggleOne(skill.id, e.target.checked)}
                    />
                  </label>
                  <div>
                    <div className="card-title">{index + 1}. {skill.name}</div>
                    <div className="card-meta">
                      {skill.usedBy.length > 0 ? t("local.linked") : t("local.unused")}
                    </div>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className="primary"
                    disabled={false}
                    onClick={() => openInstallModal(skill)}
                  >
                    {t("local.install")}
                  </button>
                  {skill.sourceUrl?.trim() && (
                    <button className="ghost" onClick={() => updateLocalSkills([skill])}>
                      {t("local.updateOne")}
                    </button>
                  )}
                  <button className="ghost" onClick={() => openSkillDirectory(skill.path)}>
                    {t("local.openDir")}
                  </button>
                  <button className="ghost" onClick={() => exportLocalSkills([skill])}>
                    {t("local.exportOne")}
                  </button>
                  <button className="ghost danger" onClick={() => openDeleteLocalModal([skill])}>
                    {t("local.deleteOne")}
                  </button>
                </div>
              </div>
              <p className="card-desc">{skill.description}</p>
              <div className="card-link">{skill.path}</div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "6px", marginTop: "12px" }}>
                {ideOptions.map((option) => (
                  <span
                    key={option.label}
                    className={`ide-badge ${skill.usedBy.includes(option.label) ? "active" : ""}`}
                  >
                    {option.label}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// Market Panel Component
function MarketPanel() {
  const query = useSkillsStore((s) => s.query);
  const loading = useSkillsStore((s) => s.loading);
  const results = useSkillsStore((s) => s.results);
  const hasMore = useSkillsStore((s) => s.hasMore);
  const marketSortMode = useSkillsStore((s) => s.marketSortMode);
  const localSkillNameSet = useSkillsStore((s) => s.localSkillNameSet);
  const marketStatuses = useSkillsStore((s) => s.marketStatuses);
  const enabledMarkets = useSkillsStore((s) => s.enabledMarkets);
  const downloadQueue = useSkillsStore((s) => s.downloadQueue);
  const recentTaskStatus = useSkillsStore((s) => s.recentTaskStatus);
  const setQuery = useSkillsStore((s) => s.setQuery);
  const setMarketSortMode = useSkillsStore((s) => s.setMarketSortMode);
  const searchMarketplace = useSkillsStore((s) => s.searchMarketplace);
  const downloadSkill = useSkillsStore((s) => s.downloadSkill);
  const updateSkill = useSkillsStore((s) => s.updateSkill);
  const saveMarketConfigs = useSkillsStore((s) => s.saveMarketConfigs);
  const addManualSkill = useSkillsStore((s) => s.addManualSkill);
  const { t } = useI18n();

  const [showSettings, setShowSettings] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [manualName, setManualName] = useState("");

  const downloadingIds = useMemo(() =>
    new Set(downloadQueue.map((task) => task.id)),
    [downloadQueue]
  );

  const sortedResults = useMemo(() => {
    if (marketSortMode === "stars_desc") {
      return [...results].sort((a, b) => b.stars - a.stars);
    }
    if (marketSortMode === "installs_desc") {
      return [...results].sort((a, b) => b.installs - a.installs);
    }
    return results;
  }, [results, marketSortMode]);

  const handleManualAdd = () => {
    if (!manualUrl.trim()) return;
    addManualSkill(manualUrl, manualName || "Manual Skill");
    setManualUrl("");
    setManualName("");
    setShowManualAdd(false);
  };

  return (
    <>
      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div className="panel-title">{t("market.title")}</div>
          <button className="ghost" onClick={() => setShowSettings(true)} style={{ padding: "6px" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input"
            placeholder={t("market.searchPlaceholder")}
            disabled={loading}
            onKeyDown={(e) => e.key === "Enter" && searchMarketplace(true)}
            style={{ flex: "1 1 280px" }}
          />
          <button className="primary" disabled={loading} onClick={() => searchMarketplace(true)}>
            {loading ? t("market.searching") : t("market.search")}
          </button>
          <button className="ghost" disabled={loading} onClick={() => searchMarketplace(true, true)}>
            {loading ? t("market.refreshing") : t("market.refresh")}
          </button>
          <button className="ghost" disabled={loading} onClick={() => setShowManualAdd(true)}>
            {t("market.manualAdd")}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-muted)", fontSize: "13px" }}>
            {t("market.sortLabel")}
            <select
              className="input"
              value={marketSortMode}
              onChange={(e) => setMarketSortMode(e.target.value as MarketSortMode)}
              style={{ minWidth: "180px" }}
            >
              <option value="default">{t("market.sortDefault")}</option>
              <option value="stars_desc">{t("market.sortStars")}</option>
              <option value="installs_desc">{t("market.sortInstalls")}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel" style={{ marginTop: "16px" }}>
        <div className="panel-title">{t("market.resultsTitle")}</div>
        {loading && results.length === 0 && <div className="hint">{t("market.loadingHint")}</div>}
        {results.length === 0 && !loading && <div className="hint">{t("market.emptyHint")}</div>}

        <div className="cards market-cards">
          {sortedResults.map((skill) => {
            const isInstalled = localSkillNameSet.has(normalizeSkillName(skill.name));
            const isDownloading = downloadingIds.has(skill.id);
            const actionState = recentTaskStatus[skill.id];

            return (
              <article key={skill.id} className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">{skill.name}</div>
                    <div className="card-meta">
                      {t("market.meta", { author: skill.author, stars: skill.stars, installs: skill.installs })}
                    </div>
                  </div>
                  {isInstalled ? (
                    <button
                      className="ghost"
                      disabled={isDownloading || actionState === "update" || !skill.sourceUrl?.trim()}
                      onClick={() => updateSkill(skill)}
                    >
                      {!skill.sourceUrl?.trim() ? t("market.unavailable") :
                       isDownloading ? t("market.queued") :
                       actionState === "update" ? t("market.updated") :
                       t("market.update")}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={isDownloading || actionState === "download" || !skill.sourceUrl?.trim()}
                      onClick={() => downloadSkill(skill)}
                    >
                      {!skill.sourceUrl?.trim() ? t("market.unavailable") :
                       isDownloading ? t("market.queued") :
                       actionState === "download" ? t("market.downloaded") :
                       t("market.download")}
                    </button>
                  )}
                </div>
                <p className="card-desc">{skill.description}</p>
                <div className="card-source">{t("market.source", { source: skill.marketLabel })}</div>
                <div className="card-link">{skill.sourceUrl}</div>
                <div className="card-actions market-card-actions">
                  <button
                    className="ghost"
                    disabled={!skill.sourceUrl?.trim()}
                    onClick={() => skill.sourceUrl && openUrl(skill.sourceUrl)}
                  >
                    {t("market.viewSource")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {hasMore && (
          <div style={{ marginTop: "16px", textAlign: "center" }}>
            <button className="ghost" disabled={loading} onClick={() => searchMarketplace(false)}>
              {t("market.loadMore")}
            </button>
          </div>
        )}
      </section>

      {/* Manual Add Modal */}
      {showManualAdd && (
        <div className="modal-backdrop" onClick={() => setShowManualAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t("market.manualAddTitle")}</div>
            <label className="field-label">{t("market.manualUrlLabel")}</label>
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              className="input"
              placeholder={t("market.manualUrlPlaceholder")}
            />
            <div className="hint">{t("market.manualUrlHint")}</div>
            <label className="field-label">{t("market.manualNameLabel")}</label>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="input"
              placeholder={t("market.manualNamePlaceholder")}
            />
            <div className="hint">{t("market.manualNameHint")}</div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setShowManualAdd(false)}>{t("market.manualCancel")}</button>
              <button className="primary" onClick={handleManualAdd}>{t("market.manualSubmit")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t("marketSettings.title")}</div>
            <div style={{ maxHeight: "400px", overflowY: "auto", margin: "16px 0" }}>
              {marketStatuses.map((market) => (
                <div
                  key={market.id}
                  style={{
                    border: "1px solid var(--color-panel-border)",
                    borderRadius: "8px",
                    padding: "12px",
                    background: "var(--color-card-bg)",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={enabledMarkets[market.id] ?? true}
                        onChange={(e) => {
                          const newEnabled = { ...enabledMarkets, [market.id]: e.target.checked };
                          saveMarketConfigs({}, newEnabled);
                        }}
                      />
                      <span style={{ fontWeight: 600, fontSize: "14px" }}>{market.name}</span>
                    </label>
                    <span className={`status-badge ${market.status}`}>
                      {market.status === "online" ? t("marketSettings.online") :
                       market.status === "needs_key" ? t("marketSettings.needsKey") :
                       t("marketSettings.unavailable")}
                    </span>
                  </div>
                  {market.error && (
                    <div style={{ fontSize: "12px", color: "var(--color-error-text)", marginTop: "8px" }}>
                      {market.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setShowSettings(false)}>{t("marketSettings.cancel")}</button>
              <button className="primary" onClick={() => setShowSettings(false)}>{t("marketSettings.save")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// IDE Panel Component
function IdePanel() {
  const ideOptions = useSkillsStore((s) => s.ideOptions);
  const filteredIdeSkills = useSkillsStore((s) => s.filteredIdeSkills);
  const localLoading = useSkillsStore((s) => s.localLoading);
  const addCustomIde = useSkillsStore((s) => s.addCustomIde);
  const openSkillDirectory = useSkillsStore((s) => s.openSkillDirectory);
  const adoptManyIdeSkills = useSkillsStore((s) => s.adoptManyIdeSkills);
  const openUninstallModal = useSkillsStore((s) => s.openUninstallModal);
  const addToast = useSkillsStore((s) => s.addToast);
  const { t } = useI18n();

  const [selectedIdeFilter, setSelectedIdeFilter] = useState("");
  const [customIdeName, setCustomIdeName] = useState("");
  const [customIdeDir, setCustomIdeDir] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIdeOptions = useMemo(() => {
    const defaultOptions = ideOptions.filter((o) => !o.label.startsWith("Custom:"));
    const customOptions = ideOptions.filter((o) => o.label.startsWith("Custom:")).map((o) => ({
      ...o,
      label: o.label.replace("Custom:", ""),
    }));
    return [...defaultOptions, ...customOptions];
  }, [ideOptions]);

  const filteredSkills = useMemo(() => {
    if (!selectedIdeFilter) return filteredIdeSkills;
    return filteredIdeSkills.filter((s) => s.ide === selectedIdeFilter);
  }, [filteredIdeSkills, selectedIdeFilter]);

  const selectedUnmanaged = useMemo(() =>
    filteredSkills.filter((s) => selectedIds.includes(s.id) && !s.managed),
    [filteredSkills, selectedIds]
  );

  const handleAddCustomIde = () => {
    if (!customIdeName.trim() || !customIdeDir.trim()) {
      addToast("error", t("errors.fillIde"));
      return;
    }
    addCustomIde();
  };

  return (
    <section className="panel">
      <div className="panel-title">{t("ide.title")}</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "13px", color: "var(--color-muted)" }}>
        <span>{t("ide.total", { count: filteredSkills.length })}</span>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filteredSkills.length > 0 && filteredSkills.every((s) => selectedIds.includes(s.id))}
            disabled={filteredSkills.length === 0}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedIds([...new Set([...selectedIds, ...filteredSkills.map((s) => s.id)])]);
              } else {
                setSelectedIds(selectedIds.filter((id) => !filteredSkills.some((s) => s.id === id)));
              }
            }}
          />
          {t("ide.selectAll")}
        </label>
      </div>

      <div className="hint">{t("ide.switchHint")}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        {allIdeOptions.map((option) => (
          <button
            key={option.id}
            className={`ghost ${selectedIdeFilter === option.label ? "active" : ""}`}
            onClick={() => setSelectedIdeFilter(option.label === selectedIdeFilter ? "" : option.label)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="hint">{t("ide.addHint")}</div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          value={customIdeName}
          onChange={(e) => setCustomIdeName(e.target.value)}
          className="input small"
          placeholder={t("ide.namePlaceholder")}
          style={{ width: "auto", flex: "1 1 120px" }}
        />
        <input
          value={customIdeDir}
          onChange={(e) => setCustomIdeDir(e.target.value)}
          className="input small"
          placeholder={t("ide.dirPlaceholder")}
          style={{ width: "auto", flex: "1 1 180px" }}
        />
        <button className="primary" onClick={handleAddCustomIde}>{t("ide.addButton")}</button>
      </div>

      <div className="buttons" style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px" }}>
        <button
          className="primary"
          disabled={selectedUnmanaged.length === 0 || localLoading}
          onClick={() => adoptManyIdeSkills(selectedUnmanaged)}
        >
          {t("ide.adoptSelected", { count: selectedUnmanaged.length })}
        </button>
        <button
          className="ghost danger"
          disabled={selectedIds.length === 0 || localLoading}
          onClick={() => {
            const paths = filteredSkills.filter((s) => selectedIds.includes(s.id)).map((s) => s.path);
            openUninstallModal(paths.join(", "), "ide", paths.join("|"));
          }}
        >
          {t("ide.uninstallSelected", { count: selectedIds.length })}
        </button>
      </div>

      {localLoading && <div className="hint">{t("ide.loading")}</div>}
      {!localLoading && filteredSkills.length === 0 && <div className="hint">{t("ide.emptyHint")}</div>}

      {filteredSkills.length > 0 && (
        <div className="cards">
          {filteredSkills.map((skill, index) => (
            <article key={skill.id} className={`card ${!skill.managed ? "unmanaged" : ""}`}>
              <div className="card-header">
                <div className="card-title-row">
                  <label style={{ paddingTop: "2px" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(skill.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...selectedIds, skill.id]);
                        } else {
                          setSelectedIds(selectedIds.filter((i) => i !== skill.id));
                        }
                      }}
                    />
                  </label>
                  <div>
                    <div className="card-title">{index + 1}. {skill.name}</div>
                    <div className="card-meta">
                      {skill.ide} · {skill.source === "link" ? t("ide.sourceLink") : t("ide.sourceLocal")}
                      {!skill.managed && ` · ${t("ide.unmanaged")}`}
                    </div>
                  </div>
                </div>
                <div className="card-actions">
                  <button className="ghost" onClick={() => openSkillDirectory(skill.path)}>{t("ide.openDir")}</button>
                  {!skill.managed && (
                    <button className="ghost" onClick={() => adoptManyIdeSkills([skill])}>{t("ide.adopt")}</button>
                  )}
                  <button className="ghost" onClick={() => openUninstallModal(skill.name, "ide", skill.path)}>
                    {t("ide.uninstall")}
                  </button>
                </div>
              </div>
              <div className="card-link">{skill.path}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// Install Modal Component
function InstallModal() {
  const showInstallModal = useSkillsStore((s) => s.showInstallModal);
  const pendingInstallSkill = useSkillsStore((s) => s.pendingInstallSkill);
  const ideOptions = useSkillsStore((s) => s.ideOptions);
  const projects = useSkillsStore((s) => s.projects);
  const closeInstallModal = useSkillsStore((s) => s.closeInstallModal);
  const confirmInstallToIde = useSkillsStore((s) => s.confirmInstallToIde);
  const { t } = useI18n();

  const [selectedIdeTargets, setSelectedIdeTargets] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  if (!showInstallModal || !pendingInstallSkill) return null;

  const handleConfirmIde = () => {
    if (selectedIdeTargets.length === 0) return;
    confirmInstallToIde("ide", selectedIdeTargets, projects);
    setSelectedIdeTargets([]);
  };

  const handleConfirmProject = () => {
    if (selectedProjectIds.length === 0) return;
    confirmInstallToIde("project", selectedProjectIds, projects);
    setSelectedProjectIds([]);
  };

  return (
    <div className="modal-backdrop" onClick={closeInstallModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "900px" }}>
        <div className="modal-header">
          <h2 className="modal-title">{t("installModal.selectTargetTitle")}</h2>
          <button className="modal-close" onClick={closeInstallModal}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* IDE Column */}
            <div style={{ border: "1px solid var(--color-card-border)", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--color-tabs-bg)", borderBottom: "1px solid var(--color-card-border)" }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: 600, margin: 0 }}>
                  <span>IDE</span>
                  {t("installModal.globalIde")}
                </h3>
                <span style={{ fontSize: "13px", color: "var(--color-muted)" }}>
                  {selectedIdeTargets.length} / {ideOptions.length}
                </span>
              </div>
              <div style={{ padding: "8px", maxHeight: "50vh", overflowY: "auto" }}>
                {ideOptions.map((ide) => (
                  <label
                    key={ide.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", borderRadius: "6px", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-tabs-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIdeTargets.includes(ide.label)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIdeTargets([...selectedIdeTargets, ide.label]);
                        } else {
                          setSelectedIdeTargets(selectedIdeTargets.filter((t) => t !== ide.label));
                        }
                      }}
                      style={{ marginTop: "2px" }}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 500 }}>{ide.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Project Column */}
            <div style={{ border: "1px solid var(--color-card-border)", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--color-tabs-bg)", borderBottom: "1px solid var(--color-card-border)" }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: 600, margin: 0 }}>
                  <span>Project</span>
                  {t("installModal.project")}
                </h3>
                <span style={{ fontSize: "13px", color: "var(--color-muted)" }}>
                  {selectedProjectIds.length} / {projects.length}
                </span>
              </div>
              <div style={{ padding: "8px", maxHeight: "50vh", overflowY: "auto" }}>
                {projects.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-muted)" }}>
                    {t("installModal.noProjects")}
                  </div>
                ) : (
                  projects.map((project) => (
                    <label
                      key={project.id}
                      style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "12px", borderRadius: "6px", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-tabs-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.includes(project.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjectIds([...selectedProjectIds, project.id]);
                            } else {
                              setSelectedProjectIds(selectedProjectIds.filter((id) => id !== project.id));
                            }
                          }}
                          style={{ marginTop: "2px" }}
                        />
                        <span style={{ fontSize: "14px", fontWeight: 500 }}>{project.name}</span>
                      </div>
                      <span style={{ fontSize: "12px", opacity: 0.7, wordBreak: "break-all", marginLeft: "24px" }}>
                        {project.path}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="primary" disabled={selectedIdeTargets.length === 0} onClick={handleConfirmIde}>
            {t("installModal.installToIde")}
          </button>
          <button
            className="primary"
            disabled={selectedProjectIds.length === 0 || projects.length === 0}
            onClick={handleConfirmProject}
          >
            {t("installModal.installToProject")}
          </button>
          <button className="ghost" onClick={closeInstallModal}>{t("installModal.cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// Uninstall Modal Component
function UninstallModal() {
  const showUninstallModal = useSkillsStore((s) => s.showUninstallModal);
  const uninstallTargetName = useSkillsStore((s) => s.uninstallTargetName);
  const uninstallMode = useSkillsStore((s) => s.uninstallMode);
  const confirmUninstall = useSkillsStore((s) => s.confirmUninstall);
  const cancelUninstall = useSkillsStore((s) => s.cancelUninstall);
  const { t } = useI18n();

  if (!showUninstallModal) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">
          {uninstallMode === "local" ? t("uninstallModal.deleteTitle") : t("uninstallModal.title")}
        </div>
        <div className="hint">
          {uninstallMode === "local" ? t("uninstallModal.deleteHint") : t("uninstallModal.hint")}
        </div>
        <div className="card-link">{uninstallTargetName}</div>
        <div className="modal-actions">
          <button className="ghost" onClick={cancelUninstall}>{t("uninstallModal.cancel")}</button>
          <button className="primary" onClick={confirmUninstall}>
            {uninstallMode === "local" ? t("uninstallModal.deleteConfirm") : t("uninstallModal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Loading Overlay Component
function LoadingOverlay() {
  const busy = useSkillsStore((s) => s.busy);
  const busyText = useSkillsStore((s) => s.busyText);
  const { t } = useI18n();

  if (!busy) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">{t("loading.title")}</div>
        <div className="progress">
          <span className="progress-bar" />
        </div>
        <div className="hint">{busyText}</div>
      </div>
    </div>
  );
}

// Projects Panel Component
function ProjectsPanel() {
  const projects = useSkillsStore((s) => s.projects);
  const localLoading = useSkillsStore((s) => s.localLoading);
  const removeProject = useSkillsStore((s) => s.removeProject);
  const addProject = useSkillsStore((s) => s.addProject);
  const updateDetectedIdeDirs = useSkillsStore((s) => s.updateDetectedIdeDirs);
  const addToast = useSkillsStore((s) => s.addToast);
  const setActiveTab = useSkillsStore((s) => s.setActiveTab);
  const { t } = useI18n();

  const [showAddModal, setShowAddModal] = useState(false);

  const handleLinkSkills = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.ideTargets.length === 0) {
      addToast("error", t("errors.projectNoIdeTargets"));
      return;
    }
    setActiveTab("local");
    addToast("info", t("messages.selectSkillsForProject", { name: project.name }));
  };

  const handleAddProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("projects.selectFolder"),
      });

      if (selected && typeof selected === "string") {
        const parts = selected.split(/[\\/]/).filter(Boolean);
        const name = parts[parts.length - 1] || t("projects.untitled");

        const scanResult = await invoke<{ detectedIdeDirs: Array<{ label: string; relativeDir: string; absolutePath: string }> }>(
          "scan_project_ide_dirs",
          { request: { projectDir: selected } }
        );

        const newProject = addProject(selected, name, []);
        if (newProject) {
          updateDetectedIdeDirs(newProject.id, scanResult.detectedIdeDirs);
        }
      }
    } catch (err) {
      console.error("Failed to add project:", err);
    }
    setShowAddModal(false);
  };

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div className="panel-title">{t("projects.title")}</div>
        <button className="primary" onClick={() => setShowAddModal(true)}>{t("projects.add")}</button>
      </div>
      <div className="hint">{t("projects.hint")}</div>

      {projects.length === 0 && <div className="hint">{t("projects.emptyHint")}</div>}

      <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {projects.map((project) => (
          <div
            key={project.id}
            className="project-item"
          >
            <div className="project-header">
              <div className="project-info">
                <div className="project-name">{project.name}</div>
                <div className="project-path">{project.path}</div>
              </div>
              <div className="project-actions">
                <button
                  className="ghost small"
                  onClick={() => removeProject(project.id)}
                >
                  {t("projects.remove")}
                </button>
                <button
                  className="primary small"
                  disabled={localLoading || project.ideTargets.length === 0}
                  onClick={() => handleLinkSkills(project.id)}
                >
                  {t("projects.linkSkills")}
                </button>
              </div>
            </div>
            <div className="project-meta">
              <span className="meta-item">
                {t("projects.ideTargets", { count: project.ideTargets.length })}
              </span>
              {project.detectedIdeDirs.length > 0 && (
                <span className="meta-item">
                  {t("projects.detected", { count: project.detectedIdeDirs.length })}
                </span>
              )}
            </div>
            <div className="ide-badges">
              {project.ideTargets.map((label) => (
                <span key={label} className="ide-badge active">{label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t("projects.addTitle")}</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "8px" }}>
                  {t("projects.projectPath")}
                </label>
                <button className="primary" onClick={handleAddProject}>
                  {t("projects.selectFolderButton")}
                </button>
              </div>
              <div className="hint">{t("projects.addHint")}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Settings Panel Component
function SettingsPanel() {
  const appName = useSkillsStore((s) => s.appName);
  const currentVersion = useSkillsStore((s) => s.currentVersion);
  const update = useSkillsStore((s) => s.update);
  const checkUpdate = useSkillsStore((s) => s.checkUpdate);
  const downloadUpdate = useSkillsStore((s) => s.downloadUpdate);
  const installAndRestart = useSkillsStore((s) => s.installAndRestart);
  const { t } = useI18n();

  return (
    <div className="settings-panel">
      <section className="settings-section">
        <h2 className="section-title">{t("settings.about.title")}</h2>
        <div className="about-content">
          <div className="app-info">
            <span className="app-name">{appName}</span>
            <span className="version-badge">v{currentVersion}</span>
          </div>

          {update.updateAvailable && !update.downloaded && (
            <div className="update-available">
              <span className="update-message">
                {t("settings.update.newVersionAvailable", { version: update.latestVersion })}
              </span>
              {!update.downloading && (
                <button className="primary" onClick={downloadUpdate}>
                  {t("settings.update.downloadAndInstall")}
                </button>
              )}
            </div>
          )}

          {update.downloading && (
            <div className="downloading">
              <span className="download-status">{t("settings.update.downloading")}</span>
              <div className="progress">
                <div className="progress-bar" style={{ width: `${update.downloadProgress}%` }} />
              </div>
              <span className="progress-text">{update.downloadProgress}%</span>
            </div>
          )}

          {update.downloaded && (
            <div className="download-complete">
              <span className="complete-message">{t("settings.update.installAndRestart")}</span>
              <button className="primary" onClick={installAndRestart}>
                {t("settings.update.installAndRestart")}
              </button>
            </div>
          )}

          {update.upToDate && (
            <div className="up-to-date">
              <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>{t("settings.update.upToDate")}</span>
            </div>
          )}

          <div className="about-actions">
            <button
              className="ghost"
              disabled={update.checking || update.downloading}
              onClick={checkUpdate}
            >
              {update.checking ? t("settings.update.checking") : t("settings.about.checkUpdate")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Main SkillsView Component
export function SkillsView() {
  const activeTab = useSkillsStore((s) => s.activeTab);
  const setActiveTab = useSkillsStore((s) => s.setActiveTab);
  const update = useSkillsStore((s) => s.update);
  const scanLocalSkills = useSkillsStore((s) => s.scanLocalSkills);
  const checkUpdate = useSkillsStore((s) => s.checkUpdate);
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    scanLocalSkills();
    checkUpdate();
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-spacer" />
        <div className="tabs">
          {(["local", "market", "ide", "projects", "settings"] as const).map((tab) => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(`app.tabs.${tab}`)}
              {tab === "settings" && update.updateAvailable && <span className="tab-badge" />}
            </button>
          ))}
        </div>
        <div className="header-controls">
          <div className="control">
            <button
              className="icon-toggle"
              onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
              title={locale === "zh-CN" ? "中文" : "English"}
            >
              <span className="lang-badge">{locale === "zh-CN" ? "EN" : "中"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        {activeTab === "local" && <LocalPanel />}
        {activeTab === "market" && <MarketPanel />}
        {activeTab === "ide" && <IdePanel />}
        {activeTab === "projects" && <ProjectsPanel />}
        {activeTab === "settings" && <SettingsPanel />}
      </main>

      <ToastContainer />
      <InstallModal />
      <UninstallModal />
      <LoadingOverlay />
    </div>
  );
}

export default SkillsView;
