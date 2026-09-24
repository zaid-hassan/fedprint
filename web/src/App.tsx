import { useCallback, useEffect, useRef, useState } from "react";
import { cancelJob, getJobs, getPrinterStatus, printDocument } from "./api";
import { DropZone } from "./components/DropZone";
import { FileCard } from "./components/FileCard";
import { Header } from "./components/Header";
import { JobsList } from "./components/JobsList";
import { OptionsPanel } from "./components/OptionsPanel";
import { PrintButton } from "./components/PrintButton";
import type { PrintJob, PrintOptions, PrinterCapabilities, PrinterStatus } from "./types";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, countPdfPages, isAcceptedFile } from "./utils";

const DEFAULT_CAPABILITIES: PrinterCapabilities = {
  pageSizes: ["A4", "A5", "Letter"],
  colors: ["color", "grayscale"],
  duplex: false,
};

const DEFAULT_OPTIONS: PrintOptions = {
  copies: 1,
  pages: "",
  orientation: "portrait",
  media: "A4",
  color: "color",
  sides: "one-sided",
};

interface Notice {
  type: "success" | "error";
  text: string;
}

export default function App() {
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [pages, setPages] = useState<number | undefined>(undefined);
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_OPTIONS);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const capabilities = printer?.capabilities ?? DEFAULT_CAPABILITIES;

  const flash = useCallback((next: Notice) => {
    setNotice(next);
    window.clearTimeout(noticeTimer.current);
    if (next.type === "success") {
      noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
    }
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(noticeTimer.current);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getPrinterStatus();
      setPrinter(status);
      setStatusError(null);
    } catch (error) {
      setStatusError((error as Error).message);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await getJobs();
      setJobs(response.jobs);
    } catch {
      // Job history is non-critical; keep the last known list.
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshJobs();
    const statusTimer = window.setInterval(() => void refreshStatus(), 5000);
    const jobsTimer = window.setInterval(() => void refreshJobs(), 8000);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(jobsTimer);
    };
  }, [refreshStatus, refreshJobs]);

  useEffect(() => {
    if (printer && !printer.capabilities.pageSizes.includes(options.media)) {
      const fallback = printer.capabilities.pageSizes[0] ?? "A4";
      setOptions((current) => ({ ...current, media: fallback }));
    }
  }, [printer, options.media]);

  function handleFile(next: File): void {
    setNotice(null);
    if (!isAcceptedFile(next)) {
      flash({ type: "error", text: "This file type isn't supported. Please upload a PDF, JPG, PNG, or TXT file." });
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      flash({ type: "error", text: `File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.` });
      return;
    }
    setFile(next);
    setPages(undefined);
    void countPdfPages(next).then(setPages);
  }

  function handleRemove(): void {
    setFile(undefined);
    setPages(undefined);
    setNotice(null);
  }

  async function handlePrint(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await printDocument(file, options);
      flash({ type: "success", text: `Sent to printer · job ${response.jobId}` });
      setFile(undefined);
      setPages(undefined);
      void refreshJobs();
    } catch (error) {
      flash({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string): Promise<void> {
    try {
      await cancelJob(id);
      void refreshJobs();
    } catch (error) {
      flash({ type: "error", text: (error as Error).message });
    }
  }

  return (
    <div className="app">
      <Header printer={printer} error={statusError} />
      <main className="main">
        {file ? (
          <FileCard file={file} pages={pages} onRemove={handleRemove} />
        ) : (
          <DropZone onFile={handleFile} />
        )}

        {file ? (
          <OptionsPanel
            options={options}
            capabilities={capabilities}
            disabled={busy}
            onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
          />
        ) : null}

        <PrintButton disabled={!file} busy={busy} onClick={() => void handlePrint()} />

        {notice ? (
          <p className={`notice notice--${notice.type}`} role="alert">
            {notice.text}
          </p>
        ) : null}

        <JobsList jobs={jobs} onCancel={(id) => void handleCancel(id)} />
      </main>
    </div>
  );
}
