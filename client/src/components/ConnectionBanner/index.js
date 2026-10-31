import React, { useEffect, useState } from "react";
import { getSocket } from "../../utils/socket";

const bannerStyles = {
  position: "fixed",
  top: 10,
  right: 20,
  zIndex: 1000,
  padding: "6px 12px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: "600",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  transition: "all 0.3s ease",
  display: "flex",
  alignItems: "center",
  gap: "6px"
};

const ConnectionBanner = () => {
  const [status, setStatus] = useState("disconnected");

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => setStatus("connected");
    const handleDisconnect = () => setStatus("disconnected");
    const handleConnectError = () => setStatus("disconnected");
    const handleReconnecting = () => setStatus("reconnecting");

    if (socket.connected) {
      setStatus("connected");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io?.on("reconnect_attempt", handleReconnecting);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io?.off("reconnect_attempt", handleReconnecting);
    };
  }, []);

  if (status === "connected") {
    return (
      <div style={{ ...bannerStyles, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
        Live
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div style={{ ...bannerStyles, background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#eab308" }} />
        Reconnecting...
      </div>
    );
  }

  return (
    <div style={{ ...bannerStyles, background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
      Disconnected
    </div>
  );
};

export default ConnectionBanner;

