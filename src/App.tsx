import React, { useEffect, useState } from "react";

type Owner = {
  type: string;
  id: string;
  name: string;
  extension_number?: number;
};

type Site = {
  id: string;
  name: string;
};

type Recording = {
  id: string;
  caller_number: string;
  caller_number_type: number;
  caller_name?: string;
  callee_number: string;
  callee_number_type: number;
  callee_name?: string;
  direction: "inbound" | "outbound" | string;
  duration: number;
  download_url?: string;
  date_time: string;
  recording_type: string;
  call_log_id?: string;
  call_history_id?: string;
  call_id?: string;
  owner?: Owner;
  site?: Site;
  call_element_id?: string;
  end_time?: string;
  disclaimer_status?: number;
};

type ApiResponse = {
  next_page_token?: string;
  page_size?: number;
  total_records?: number;
  from?: string;
  to?: string;
  recordings?: Recording[];
};

const todayStr = new Date().toISOString().slice(0, 10);

const App: React.FC = () => {
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [recordingType, setRecordingType] = useState<
    "Automatic" | "OnDemand" | "All"
  >("OnDemand");
  const [queryDateType, setQueryDateType] = useState<
    "start_time" | "created_time"
  >("start_time");
  const [pageSize, setPageSize] = useState(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [prevTokens, setPrevTokens] = useState<string[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  const fetchRecordings = async (tokenOverride: string | null = null) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      params.set("page_size", String(pageSize));

      if (recordingType !== "All") {
        params.set("recording_type", recordingType);
      }

      params.set("query_date_type", queryDateType);

      if (tokenOverride && tokenOverride.length > 0) {
        params.set("next_page_token", tokenOverride);
      }

      const res = await fetch(`/api/phone/recordings?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json: ApiResponse = await res.json();
      setData(json);
      setNextToken(json.next_page_token || "");

      console.debug("Recordings payload", json);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPrevTokens([]);
    setCurrentToken(null);
    fetchRecordings(null);
  };

  const handleNext = () => {
    if (!nextToken) return;
    setPrevTokens((prev) => [...prev, currentToken || ""]);
    setCurrentToken(nextToken);
    fetchRecordings(nextToken);
  };

  const handlePrev = () => {
    if (!prevTokens.length) return;
    const newPrev = [...prevTokens];
    const last = newPrev.pop() || null;
    setPrevTokens(newPrev);
    setCurrentToken(last);
    fetchRecordings(last);
  };

  useEffect(() => {
    fetchRecordings(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordings: Recording[] = data?.recordings ?? [];

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">Zoom Phone Recording Explorer</h1>
          <p className="app-subtitle">
            {data?.from} → {data?.to}
          </p>
        </div>
      </header>

      <main className="app-main">
        <div className="app-main-inner">
          {/* Filters card */}
          <section className="app-card">
            <div className="filters-row">
              <div className="filter-group">
                <label className="filter-label">From</label>
                <input
                  type="date"
                  className="form-control"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">To</label>
                <input
                  type="date"
                  className="form-control"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">Recording type</label>
                <select
                  className="form-control"
                  value={recordingType}
                  onChange={(e) =>
                    setRecordingType(e.target.value as typeof recordingType)
                  }
                >
                  <option value="All">All</option>
                  <option value="Automatic">Automatic</option>
                  <option value="OnDemand">OnDemand</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Query date type</label>
                <select
                  className="form-control"
                  value={queryDateType}
                  onChange={(e) =>
                    setQueryDateType(e.target.value as typeof queryDateType)
                  }
                >
                  <option value="start_time">Start time</option>
                  <option value="created_time">Created time</option>
                </select>
              </div>

              <div className="filter-group small">
                <label className="filter-label">Page size</label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  className="form-control"
                  value={pageSize}
                  onChange={(e) =>
                    setPageSize(Number(e.target.value) || 30)
                  }
                />
              </div>
            </div>

            <div className="filter-actions">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? "Loading…" : "Search"}
              </button>

              <div className="stats">
                <span>
                  Records:{" "}
                  {typeof data?.total_records === "number"
                    ? data.total_records
                    : recordings.length}
                </span>
                {currentToken && <span>Page token: {currentToken}</span>}
              </div>
            </div>

            {error && <div className="error-banner">Error: {error}</div>}
          </section>

          {/* Table card */}
          <section className="app-card">
            {loading && !recordings.length ? (
              <div className="rec-table-empty">Loading recordings…</div>
            ) : !recordings.length ? (
              <div className="rec-table-empty">
                No recordings found for this range.
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Direction</th>
                      <th>Caller</th>
                      <th>Callee</th>
                      <th>Owner</th>
                      <th>Site</th>
                      <th>Duration (s)</th>
                      <th>Type</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordings.map((rec, idx) => {
                      const dt = rec.date_time
                        ? new Date(rec.date_time)
                        : rec.end_time
                        ? new Date(rec.end_time)
                        : null;

                      const dateDisplay = dt
                        ? dt.toLocaleString(undefined, {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";

                      const callerDisplay =
                        rec.caller_name && rec.caller_number
                          ? `${rec.caller_name} (${rec.caller_number})`
                          : rec.caller_name || rec.caller_number || "—";

                      const calleeDisplay =
                        rec.callee_name && rec.callee_number
                          ? `${rec.callee_name} (${rec.callee_number})`
                          : rec.callee_name || rec.callee_number || "—";

                      const ownerDisplay =
                        rec.owner?.name && rec.owner?.extension_number
                          ? `${rec.owner.name} (${rec.owner.extension_number})`
                          : rec.owner?.name || "—";

                      return (
                        <tr
                          key={rec.id || rec.call_id || idx}
                          className="rec-row"
                        >
                          <td>{dateDisplay}</td>
                          <td style={{ textTransform: "capitalize" }}>
                            {rec.direction || "—"}
                          </td>
                          <td>{callerDisplay}</td>
                          <td>{calleeDisplay}</td>
                          <td>{ownerDisplay}</td>
                          <td>{rec.site?.name || "—"}</td>
                          <td>{rec.duration ?? "—"}</td>
                          <td>{rec.recording_type || "—"}</td>
                          <td>
                            {rec.download_url && (
                              <a
                                href={`/api/phone/recordings/download?url=${encodeURIComponent(
                                  rec.download_url
                                )}`}
                                className="text-sky-400 hover:underline mr-2"
                              >
                                Download
                              </a>
                            )}

                            {rec.call_history_id && (
                              <button
                                className="pager-btn"
                                onClick={() => {
                                  alert(
                                    "Details view coming soon for this recording."
                                  );
                                }}
                              >
                                Details
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pager">
              <div className="pager-buttons">
                <button
                  onClick={handlePrev}
                  disabled={!prevTokens.length || loading}
                  className="pager-btn"
                >
                  Previous
                </button>
                <button
                  onClick={handleNext}
                  disabled={!nextToken || !nextToken.length || loading}
                  className="pager-btn"
                >
                  Next
                </button>
              </div>
              <div>
                Next token:{" "}
                {nextToken && nextToken.length ? nextToken : "—"}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
