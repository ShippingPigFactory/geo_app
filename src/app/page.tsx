"use client";

import React, { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import { Upload, Download, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, PlayCircle } from "lucide-react";
import { NormalizedAddress } from "@/lib/normalizer";

interface RowData {
  [key: string]: any;
  _status?: "pending" | "processing" | "success" | "error";
  _result?: NormalizedAddress;
}

export default function Home() {
  const [data, setData] = useState<RowData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as RowData[];
        const cols = results.meta.fields || [];
        
        // Auto-detect address column
        const autoCol = cols.find(c => 
          c.includes("住所") || 
          c.toLowerCase().includes("address") || 
          c.toLowerCase().includes("location")
        );

        setData(rows.map(r => ({ ...r, _status: "pending" })));
        setHeaders(cols);
        if (autoCol) setSelectedColumn(autoCol);
      },
    });
  };

  const startProcessing = async () => {
    if (!selectedColumn || data.length === 0) return;
    
    setIsProcessing(true);
    const updatedData = [...data];
    let completed = 0;

    for (let i = 0; i < updatedData.length; i++) {
      updatedData[i]._status = "processing";
      setData([...updatedData]);

      try {
        const response = await fetch("/api/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: updatedData[i][selectedColumn] }),
        });

        const result = await response.json();
        updatedData[i]._result = result;
        updatedData[i]._status = result.error ? "error" : "success";
      } catch (e) {
        updatedData[i]._status = "error";
      }

      completed++;
      setProgress(Math.round((completed / updatedData.length) * 100));
      setData([...updatedData]);
    }

    setIsProcessing(false);
  };

  const downloadResults = () => {
    const exportData = data.map(row => {
      const { _status, _result, ...rest } = row;
      return {
        ...rest,
        normalized_address: _result?.normalized_address || "",
        postal_code: _result?.postal_code || "",
        prefecture: _result?.prefecture || "",
        city: _result?.city || "",
        town: _result?.town || "",
        address_line: _result?.address_line || "",
        building: _result?.building || "",
        latitude: _result?.latitude || "",
        longitude: _result?.longitude || "",
        error: _result?.error || ""
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "normalized_addresses.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="container">
      <header className="header">
        <h1 className="title">Geo Normalizer Pro</h1>
        <p className="subtitle">
          Google Maps APIを活用した、高精度な日本の住所正規化ツール
        </p>
      </header>

      <div className="glass-card">
        {data.length === 0 ? (
          <div 
            className={`upload-area ${isDragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onFileChange} 
              accept=".csv" 
              style={{ display: "none" }} 
            />
            <Upload size={48} className="text-primary mb-4" style={{ margin: "0 auto 1rem" }} />
            <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>CSVファイルをアップロード</h3>
            <p style={{ color: "#94a3b8" }}>ドラッグ＆ドロップまたはクリックしてファイルを選択</p>
          </div>
        ) : (
          <div className="controls">
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
                  住所カラムを選択
                </label>
                <select 
                  className="btn btn-secondary" 
                  style={{ width: "100%", textAlign: "left", appearance: "auto" }}
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                  disabled={isProcessing}
                >
                  <option value="">カラムを選択してください</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              
              <div style={{ display: "flex", gap: "1rem", paddingTop: "1.3rem" }}>
                {!isProcessing && progress < 100 && (
                  <button className="btn btn-primary" onClick={startProcessing} disabled={!selectedColumn}>
                    <PlayCircle size={20} />
                    処理を開始 ({data.length}件)
                  </button>
                )}
                {progress === 100 && (
                  <button className="btn btn-primary" onClick={downloadResults}>
                    <Download size={20} />
                    CSVをダウンロード
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => { setData([]); setProgress(0); }} disabled={isProcessing}>
                  別のファイルを選択
                </button>
              </div>
            </div>

            {isProcessing && (
              <div style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.9rem" }}>正規化を実行中...</span>
                  <span style={{ fontSize: "0.9rem", color: "var(--primary)" }}>{progress}%</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ステータス</th>
                    <th>元の住所</th>
                    <th>正規化済み住所</th>
                    <th>市区町村</th>
                    <th>町域/番地</th>
                    <th>エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i}>
                      <td>
                        {row._status === "pending" && <span className="status-badge status-pending">待機中</span>}
                        {row._status === "processing" && <Loader2 className="animate-spin" size={18} style={{ color: "var(--primary)" }} />}
                        {row._status === "success" && <CheckCircle2 size={18} style={{ color: "var(--success)" }} />}
                        {row._status === "error" && <AlertCircle size={18} style={{ color: "var(--error)" }} />}
                      </td>
                      <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row[selectedColumn]}
                      </td>
                      <td>{row._result?.normalized_address}</td>
                      <td>{row._result?.city}</td>
                      <td>{row._result?.town}{row._result?.address_line}</td>
                      <td style={{ color: "var(--error)", fontSize: "0.8rem" }}>{row._result?.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <footer style={{ marginTop: "4rem", textAlign: "center", color: "#475569", fontSize: "0.9rem" }}>
        © 2024 Geo Normalizer Pro | Built with Next.js & Google Maps API
      </footer>

      <style jsx global>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
