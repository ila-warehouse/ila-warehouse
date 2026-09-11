import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export const useScan = () => {
  // --- AUTH ---
  const { user } = useAuth();

  // --- SCAN SESSION STATE ---
  const [selectedWaybill, setSelectedWaybill] = useState(null);
  const [waybillID, setWaybillID] = useState("");
  const [confirmedScans, setConfirmedScans] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  // --- INPUT STATE ---
  const [scan1, setScan1] = useState("");
  const [scan2, setScan2] = useState("");
  const [showRescan, setShowRescan] = useState(false);

  // --- UI STATE ---
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [scanError, setScanError] = useState("");
  const [confirmQtyMismatch, setConfirmQtyMismatch] = useState(false);

  const scan1Ref = useRef(null);
  const scan2Ref = useRef(null);

  // --- HELPERS ---

  const focusNext = (nextRef) => {
    const element = nextRef.current;
    if (!element) return;
    element.focus();

    if (element.tagName === "SELECT" && "showPicker" in element) {
      try {
        element.showPicker();
      } catch (err) {
        console.warn("Auto-picker blocked or unsupported:", err);
      }
    } else if (element.tagName === "INPUT" && element.type === "file") {
      element.click();
    }
  };

  const resetPage = () => {
    setError("");
    setScanError("");
    setScan1("");
    setScan2("");
    setConfirmQtyMismatch(false);
    setShowRescan(false);
    setConfirmedScans([]);
    setShowModal(false);
    setSubmitted(false);
  };

  const finishScan = (referenceVIN, isNew) => {
    setConfirmedScans((prev) => [...prev, { value: referenceVIN, isNew }]);
    setScan1("");
    setScan2("");
    setShowRescan(false);
  };

  // --- SCAN LOGIC ---

  const refreshLoadingTimeout = async () => {
    try {
      await api.touchLoadingTimeout(waybillID);
      return true;
    } catch (err) {
      setScanError("Database connection error. Try again.");
      resetPage();
      setError("❌ SCAN ERROR. PLEASE TRY AGAIN");
      return false;
    }
  };

  // Step 2: Look up the scanned barcode in the database
  const lookupUnit = async (barcode) => {
    try {
      const unit = await api.findUnitByVIN(barcode);
      return { unit, engine: unit?.engine ?? null };
    } catch (err) {
      console.error("❌ ERROR SEARCHING SCAN:", err);
      setScanError("Database connection error. Try again.");
      focusNext(scan1Ref);
      return null; 
    }
  };

  const isDuplicate = (barcode, engine) => {
    const alreadyByBarcode = confirmedScans.some(
      (scan) => scan.value.toLowerCase() === barcode.toLowerCase()
    );
    const alreadyByEngine =
      engine &&
      confirmedScans.some(
        (scan) => scan.value.toLowerCase() === engine.toLowerCase()
      );
    return alreadyByBarcode || alreadyByEngine;
  };

  const handleRescanConfirmation = (currentScan) => {
    if (scan1 !== scan2) {
      setScanError("Mismatched scan values. Please try again.");
      setScan1("");
      setScan2("");
      setShowRescan(false);
    } else {
      finishScan(currentScan, true);
    }
    focusNext(scan1Ref);
  };

  const handleFoundUnit = (engine) => {
    focusNext(scan1Ref);
    finishScan(engine, false);
  };

  const handleNotFoundUnit = (currentScan) => {
    setScanError(
      `Entry ${currentScan} not found in database. Please rescan to confirm.`
    );
    setShowRescan(true);
  };

  // --- MAIN HANDLERS ---

  const handleWaybillSelect = (id, validWaybills) => {
    const selectedDetails = validWaybills.find((wb) => wb.id === id);
    if (selectedDetails) {
      setWaybillID(id);
      setSelectedWaybill(selectedDetails);
    }
  };

  const startScan = async () => {
    resetPage();
    try {
      await api.startScanning(waybillID);
      setShowModal(true);
      focusNext(scan1Ref);
    } catch (err) {
      console.error("❌ ERROR STARTING WAYBILL SCAN:", err);
      setError("❌ Failed to start scan session. Please try again.");
    }
  };

  const handleNext = async () => {
    setScanError("");
    setConfirmQtyMismatch(false);

    const currentScan = scan1.trim();

    const sessionOk = await refreshLoadingTimeout();
    if (!sessionOk) return;

    if (isDuplicate(currentScan, null)) {
      setScanError(`${currentScan} already scanned. Please try again.`);
      setScan1("");
      setScan2("");
      focusNext(scan1Ref);
      return;
    }

    const result = await lookupUnit(currentScan);
    if (result === null) return; 

    const { unit, engine } = result;

    if (isDuplicate(currentScan, engine)) {
      setScanError(
        `${currentScan} or its Engine/Frame already scanned. Please try again.`
      );
      setScan1("");
      setScan2("");
      focusNext(scan1Ref);
      return;
    }

    if (showRescan) {
      handleRescanConfirmation(currentScan);
    } else if (unit) {
      handleFoundUnit(engine);
    } else {
      handleNotFoundUnit(currentScan);
    }
  };

  const handleFinish = () => {
    const expected = selectedWaybill?.expected_qty;

    if (expected && confirmedScans.length !== expected && !confirmQtyMismatch) {
      setScanError(
        "Scanned entries do not match expected quantity. If this is correct, click Finish again."
      );
      setConfirmQtyMismatch(true);
      return;
    }

    setConfirmQtyMismatch(false);
    setShowModal(false);
    setSubmitted(true);
  };

  const handleEnd = async () => {
    try {
      const barcodes = confirmedScans.map((scan) => scan.value);
      await api.finalizeScan({
        waybillId: waybillID,
        barcodes,
      });
      resetPage();
      setWaybillID("");
      setSelectedWaybill(null);
    } catch (err) {
      console.error(err);
      resetPage();
      setError(
        err.response?.data?.error || "A network error occurred while saving."
      );
      setWaybillID("");
      setSelectedWaybill(null);
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelScanning(waybillID);
    } catch (err) {
      console.error("❌ ERROR CANCELLING WAYBILL SCAN:", err);
    } finally {
      resetPage();
      setWaybillID("");
      setSelectedWaybill(null);
    }
  };

  // --- EXPORTS ---
  return {
    // Session
    selectedWaybill,
    setSelectedWaybill,
    waybillID,
    confirmedScans,
    submitted,
    // Input
    scan1,
    setScan1,
    scan2,
    setScan2,
    showRescan,
    // UI
    showModal,
    scanError,
    error,
    // Handlers
    handleWaybillSelect,
    startScan,
    handleNext,
    handleFinish,
    handleEnd,
    handleCancel,
    // Refs
    focusNext,
    scan1Ref,
    scan2Ref,
  };
};
