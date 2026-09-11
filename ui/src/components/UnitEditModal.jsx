import { useState, useEffect } from "react";
import { api } from "../services/api";

// ── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (val) =>
  val ? new Date(val).toLocaleString() : "—";

// Renders a before→after diff from metadata
const MetadataDiff = ({ metadata }) => {
  if (!metadata?.before || !metadata?.after) return null;

  const fields = Object.keys(metadata.after);
  return (
    <div className="space-y-1">
      {fields.map((field) => (
        <div key={field} className="flex items-center gap-2 text-xs">
          <span className="font-mono text-gray-500 w-28 shrink-0">{field}</span>
          <span className="text-red-500 line-through">{String(metadata.before[field] ?? "—")}</span>
          <span className="text-gray-400">→</span>
          <span className="text-green-600 font-medium">{String(metadata.after[field] ?? "—")}</span>
        </div>
      ))}
    </div>
  );
};

const ActivityLog = ({ logs }) => {
  if (logs.length === 0) {
    return <p className="text-sm text-gray-400 italic">No manual edits recorded for this unit.</p>;
  }

  return (
    <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
      {logs.map((log) => (
        <div key={log.id} className="border border-gray-100 rounded p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-700">{log.event_type}</span>
            <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{log.description}</p>
          <MetadataDiff metadata={log.metadata} />
        </div>
      ))}
    </div>
  );
};

// ── Main Modal ─────────────────────────────────────────────────────────────

/**
 * UnitEditModal
 * Props:
 *   unitId   {string}   - UUID of the unit to edit
 *   onClose  {function} - called when modal is dismissed
 *   onSaved  {function} - called after a successful save (to refresh parent)
 *   locations {array}   - [{ id, name }] for the location dropdown
 */
export default function UnitEditModal({ unitId, onClose, onSaved, locations = [] }) {
  const [unitData, setUnitData] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [form, setForm] = useState({
    engine: "",
    frame: "",
    model: "",
    color: "",
    da: "",
    status: "",
    last_location_id: "",
  });

  const UNIT_STATUSES = ["IN_STORAGE", "IN_TRANSIT", "CLOSED"];

  // ── Fetch unit data on open ──────────────────────────────────────────────
  useEffect(() => {
    const fetchUnit = async () => {
      try {
        setLoading(true);
        const data = await api.getUnit(unitId);
        setUnitData(data.unit);
        setActivityLog(data.activityLog);
        setForm({
          engine: data.unit.engine ?? "",
          frame: data.unit.frame ?? "",
          model: data.unit.model ?? "",
          color: data.unit.color ?? "",
          da: data.unit.da ?? "",
          status: data.unit.status ?? "",
          last_location_id: data.unit.last_location_id ?? "",
        });
      } catch (err) {
        setError("Failed to load unit data.");
      } finally {
        setLoading(false);
      }
    };
    fetchUnit();
  }, [unitId]);

  // ── Form handlers ──────────────────────────────────────────────────────
  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  // Get changed fields comparison
  const getChangedFields = () => {
    const current = unitData || {};
    const changes = {};

    for (const field of Object.keys(form)) {
      // Skip empty last_location_id (means "not set")
      if (field === "last_location_id" && form[field] === "") continue;

      // Normalize both values before comparing (handle undefined/null vs empty string)
      const currentVal = String(current[field] ?? "").trim();
      const formVal = String(form[field] ?? "").trim();

      // Only include actual changes (ignore if both are effectively empty)
      if (currentVal !== formVal && !(currentVal === "" && formVal === "")) {
        changes[field] = form[field];
      }
    }
    console.log("changes: ", changes);
    return Object.keys(changes).length > 0 ? changes : null;
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    
    // Check if there are any changes before saving
    const changedFields = getChangedFields();
    if (!changedFields || Object.keys(changedFields).length === 0) {
      window.alert("No changes to save. Unit data matches current values.");
      setSaving(false);
      return;
    }
    
    try {
      await api.updateUnit(unitId, form);
      // Refresh unit data to get the full diff from activity log
      const refreshed = await api.getUnit(unitId);
      
      // Extract what changed from the latest activity log entry
      if (refreshed.activityLog && refreshed.activityLog.length > 0) {
        const latestLog = refreshed.activityLog[refreshed.activityLog.length - 1];
        window.alert(
          `✓ Unit updated successfully.\n\n` +
          `Changes made: ${latestLog.description}`
        );
      } 
      
      onSaved?.();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  // ── Backdrop click to close ────────────────────────────────────────────
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">
            Edit Unit
            {unitData && (
              <span className="ml-2 text-sm font-normal text-gray-400 font-mono">
                {unitData.engine ?? unitData.id}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading unit data...</div>
        ) : (
          <>
            {/* Form */}
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Engine",  name: "engine" },
                  { label: "Frame",   name: "frame"  },
                  { label: "Model",   name: "model"  },
                  { label: "Color",   name: "color"  },
                  { label: "DA",      name: "da"     },
                ].map(({ label, name }) => (
                  <div key={name}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {label}
                    </label>
                    <input
                      type="text"
                      name={name}
                      value={form[name]}
                      onChange={handleChange}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}

                {/* Status dropdown */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {UNIT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Location dropdown */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Last Known Location
                  </label>
                  <select
                    name="last_location_id"
                    value={form.last_location_id}
                    onChange={handleChange}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Not set —</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Feedback */}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Activity log */}
            <div className="px-6 pb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Edit History
              </p>
              <ActivityLog logs={activityLog} />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
