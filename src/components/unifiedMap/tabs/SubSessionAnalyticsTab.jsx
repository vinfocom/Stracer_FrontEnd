import React, { useMemo } from "react";

const formatNumber = (value, digits = 2) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
};

const formatDuration = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  const totalSeconds = Math.floor(Number(value) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatBytes = (value) => {
  if (value == null || Number.isNaN(value)) return "N/A";
  const bytes = Number(value);

  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${bytes.toFixed(0)} B`;
};

const formatCoordinate = (point) => {
  if (!point) return "N/A";
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
};

export default function SubSessionAnalyticsTab({
  subSessionData = [],
  subSessionSummary = null,
  requestedSessionIds = [],
  loading = false,
}) {
  const safeSummary = useMemo(() => subSessionSummary || {}, [subSessionSummary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-300">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mr-2" />
        Loading sub-session analytics...
      </div>
    );
  }

  if (!Array.isArray(subSessionData) || subSessionData.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-sm text-slate-300">
        No sub-session analytics data found for the selected sessions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3 text-xs text-slate-300">
        <span className="text-slate-400">Requested Sessions: </span>
        <span className="font-semibold text-cyan-300">
          {requestedSessionIds.length > 0 ? requestedSessionIds.join(", ") : "N/A"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total Duration</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatDuration(safeSummary.total_duration)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Average Duration</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatDuration(safeSummary.avg_duration)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total Speed</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatNumber(safeSummary.total_speed)} Mbps
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Average Speed</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatNumber(safeSummary.avg_speed)} Mbps
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total File Size</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatBytes(safeSummary.total_file_size)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Average File Size</div>
          <div className="text-sm font-semibold text-white mt-1">
            {formatBytes(safeSummary.avg_file_size)}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {subSessionData.map((session) => (
          <div
            key={`sub-session-${session.sessionId}`}
            className="bg-slate-900/60 border border-slate-700 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-cyan-300">
                Session {session.sessionId}
              </h4>
              <span className="text-xs text-slate-300 bg-slate-800 px-2 py-1 rounded">
                {session.subSessionCount ?? session.subSessions?.length ?? 0} Sub Sessions
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-slate-800/70 rounded p-2">
                <div className="text-slate-400">Start Coordinate</div>
                <div className="text-slate-100 mt-1">{formatCoordinate(session.start)}</div>
              </div>
              <div className="bg-slate-800/70 rounded p-2">
                <div className="text-slate-400">End Coordinate</div>
                <div className="text-slate-100 mt-1">{formatCoordinate(session.end)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-400">Total Duration</div>
                <div className="text-slate-100 mt-1">
                  {formatDuration(session.metrics?.total_duration)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-400">Avg Speed</div>
                <div className="text-slate-100 mt-1">
                  {formatNumber(session.metrics?.avg_speed)} Mbps
                </div>
              </div>
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-400">Avg File Size</div>
                <div className="text-slate-100 mt-1">
                  {formatBytes(session.metrics?.avg_file_size)}
                </div>
              </div>
            </div>

            <div className="border border-slate-700 rounded-md overflow-hidden">
              <div className="grid grid-cols-3 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-300">
                <span>Sub Session ID</span>
                <span>Start</span>
                <span>End</span>
              </div>
              {(session.subSessions || []).map((sub) => (
                <div
                  key={`sub-row-${session.sessionId}-${sub.subSessionId}`}
                  className="grid grid-cols-3 px-2 py-1.5 text-xs border-t border-slate-700 text-slate-200"
                >
                  <span>{sub.subSessionId ?? "N/A"}</span>
                  <span>{formatCoordinate(sub.start)}</span>
                  <span>{formatCoordinate(sub.end)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
