import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { useNavigate } from "react-router-dom";
import ScanInput from "../components/Scan/ScanInput";
import PhotoUpload from "../components/Scan/PhotoUpload";
import GenericSelect from "../components/Scan/GenericSelect";
import "../styles/scan.css";
import WaybillResult from "../components/Scan/WaybillResult";
import { useScan } from "../utils/useScan";

export default function Scan() {
  const navigate = useNavigate();

  const {
    selectedWaybill,
    setSelectedWaybill,
    waybillID,
    confirmedScans,
    scan1,
    setScan1,
    scan2,
    setScan2,
    showRescan,
    showModal,
    scanError,
    error,
    submitted,
    handleWaybillSelect,
    startScan,
    handleNext,
    handleFinish,
    handleEnd,
    handleCancel,
    focusNext,
    scan1Ref,
    scan2Ref,
  } = useScan();

  const [preview, setPreview] = useState(null);

  const [waybillList, setWaybillList] = useState("");
  const [validWaybills, setValidWaybills] = useState("");

  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(null);

  useEffect(() => {
    const fetchPageData = async () => {
      if (authLoading) return;
      if (!user) return;
      try {
        setLoading(true);
        setNetworkError(null);

        const [waybillData, truckData, driverData, locationData] =
          await Promise.all([
            api.getWaybillsForScan(),
            api.getTrucks(),
            api.getDrivers(),
            api.getLocations(),
          ]);

        const idList = waybillData.map((item) => item.id);

        setValidWaybills(waybillData);
        setWaybillList(idList);
      } catch (err) {
        console.error(err);
        setNetworkError("Failed to load logistics form data. Please refresh.");
      } finally {
        setLoading(false);
      }
    };

    fetchPageData();
  }, [user, authLoading]);

  useEffect(() => {
    if (showRescan) {
      focusNext(scan2Ref);
    }
  }, [showRescan, focusNext]);

  useEffect(() => {
    if (!waybillID) return;
    if (authLoading) return;
    if (!user) return;

    setLoading(true);
    setNetworkError(null);
    api
      .getWaybillInfoById(waybillID)
      .then((data) => {
        setSelectedWaybill(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
        setNetworkError("Failed to load logistics form data. Please refresh.");
      });
  }, [waybillID]);

  if (authLoading || loading) return <div>Loading Page...</div>;
  if (networkError) return <div style={{ color: "red" }}>{networkError}</div>;
  if (!user) return null;

  return (
    <div className="page-centered page">
      {!submitted ? (
        <>
          <h1 className="page-title"> Stock In / Stock Out </h1>

          <GenericSelect
            selected={waybillID}
            setSelected={(val) => {
              handleWaybillSelect(val, validWaybills);
            }}
            title={"Select Waybill"}
            options={waybillList}
            placeholder={"Select Waybill"}
          />
          <div className="scan-field">
            <label>No Waybill?</label>
            <button
              type="button"
              className="toggle-btn active scan-field"
              onClick={() => navigate("/waybill_form")}
            >
              Generate New Waybill
            </button>
          </div>

          {selectedWaybill && (
            <div>
              <p>Waybill ID: {selectedWaybill.id}</p>
              <p>
                Driver:{" "}
                {selectedWaybill.driver
                  ? selectedWaybill.driver
                  : "Unknown Driver"}
              </p>
              <p>
                Truck:{" "}
                {selectedWaybill.truck
                  ? selectedWaybill.truck
                  : "Unknown Truck"}
              </p>
              <p>Origin: {selectedWaybill.origin}</p>
              <p style={{ paddingBottom: "1rem" }}>
                Destination: {selectedWaybill.destination}
              </p>

              <PhotoUpload
                title={"Photo"}
                preview={preview}
                setPreview={setPreview}
              />

              {/* Check and reset timeout before starting scan */}
              <button
                className="primary-btn"
                onClick={async () => {
                  try {
                    await api.touchLoadingTimeout(waybillID);
                  } catch (err) {
                    console.error("Failed to touch waybill timeout:", err);
                  }
                  startScan();
                }}
              >
                Proceed to Scanning
              </button>
            </div>
          )}

          {error && (
            <p className="error-text" style={{ color: "red" }}>
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          {selectedWaybill && (
            <WaybillResult
              waybill={selectedWaybill}
              quantity={confirmedScans.length}
              photo={preview}
            />
          )}
          <strong>Scanned Values:</strong>
          {confirmedScans.map((scan, index) => (
            <div key={index}>
              {scan.value} {scan.isNew ? "(New)" : ""}
            </div>
          ))}
          <div style={{ display: "flex", gap: "2rem" }}>
            <button className="primary-btn" onClick={handleEnd}>
              Confirm
            </button>
            <button className="primary-btn cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* The Popout Overlay */}
      {showModal && selectedWaybill && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h1 className="page-title">Scan Next Unit</h1>

            {scanError && (
              <p className="error-text" style={{ color: "red" }}>
                {scanError}
              </p>
            )}

            <ScanInput
              ref={scan1Ref}
              vin={scan1}
              setVin={setScan1}
              title={"Scan"}
              placeholder={"Scan Unit"}
            />

            {showRescan && (
              <ScanInput
                ref={scan2Ref}
                vin={scan2}
                setVin={setScan2}
                title={"ReScan"}
                placeholder={"ReScan to Confirm"}
                autoFocus
              />
            )}

            <h3 className="scan-counter">
              {" "}
              {confirmedScans.length}{" "}
              {selectedWaybill?.expected_quantity &&
                ` / ${selectedWaybill.expected_quantity}`}{" "}
            </h3>

            <div className="warehouse-row">
              <button
                className="primary-btn"
                onClick={handleNext}
                disabled={!scan1.trim()}
              >
                Next Unit
              </button>
              <button className="primary-btn cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="primary-btn"
                onClick={handleFinish}
                disabled={confirmedScans.length === 0}
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
