import { io } from "socket.io-client";

const token = localStorage.getItem("whiteboard_user_token");

const socket = io((process.env.REACT_APP_SOCKET_URL || "http://localhost:5000"), {
  extraHeaders: token ? { Authorization: `Bearer ${token}` } : {}, // Only send if token exists
});

export default socket;
