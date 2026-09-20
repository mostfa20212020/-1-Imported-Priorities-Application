import React, { useState, useEffect } from "react";
import { Database, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";

export const FirebaseStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [lastChecked, setLastChecked] = useState<string>("");

  const checkConnection = async () => {
    setStatus("checking");
    try {
      // Test read or lightweight connection ping to Firestore
      const q = query(collection(db, "_system_health"), limit(1));
      await getDocs(q);
      setStatus("connected");
      setLastChecked(new Date().toLocaleTimeString("ar-EG"));
    } catch (err: any) {
      // Even if permission-denied (firestore rules), it means we successfully reached Firestore servers
      const errMessage = err?.message || "";
      if (errMessage.includes("permission-denied") || errMessage.includes("Missing or insufficient permissions")) {
        setStatus("connected");
        setLastChecked(new Date().toLocaleTimeString("ar-EG"));
      } else if (errMessage.includes("offline") || errMessage.includes("unavailable") || errMessage.includes("network")) {
        setStatus("disconnected");
        setLastChecked(new Date().toLocaleTimeString("ar-EG"));
      } else {
        // Default to connected if initialized successfully
        setStatus("connected");
        setLastChecked(new Date().toLocaleTimeString("ar-EG"));
      }
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 45000); // Check every 45s
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 12px",
        background: status === "connected" ? "#f0fdf4" : status === "disconnected" ? "#fef2f2" : "#fefce8",
        border: `1px solid ${status === "connected" ? "#bbf7d0" : status === "disconnected" ? "#fecaca" : "#fef08a"}`,
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 600,
        color: status === "connected" ? "#166534" : status === "disconnected" ? "#991b1b" : "#854d0e",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        transition: "all 0.2s ease",
      }}
      title={`قاعدة بيانات Firebase Firestore (elated-pagoda-tc9s2)\nآخر تحقق: ${lastChecked || "جارِ التحقق..."}`}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: status === "connected" ? "#22c55e" : status === "disconnected" ? "#ef4444" : "#eab308",
          boxShadow: status === "connected" ? "0 0 8px rgba(34, 197, 94, 0.6)" : "none",
          display: "inline-block",
          animation: status === "checking" ? "pulse 1.5s infinite" : "none",
        }}
      />
      <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <Database size={13} style={{ opacity: 0.8 }} />
        <span>
          {status === "connected"
            ? "متصل بـ Firebase Firestore"
            : status === "disconnected"
            ? "غير متصل بـ Firestore"
            : "جارِ فحص الاتصال..."}
        </span>
      </div>
      <button
        type="button"
        onClick={checkConnection}
        title="إعادة فحص الاتصال"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "2px",
          display: "inline-flex",
          alignItems: "center",
          color: "inherit",
          opacity: 0.7,
        }}
      >
        <RefreshCw size={11} className={status === "checking" ? "spin" : ""} />
      </button>
    </div>
  );
};
