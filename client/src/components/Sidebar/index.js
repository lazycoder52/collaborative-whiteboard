import React, { useState, useEffect, useContext, useCallback } from "react";
import "./index.min.css";
import { useNavigate, useParams } from "react-router-dom";
import boardContext from "../../store/board-context";
import { disconnectSocket } from "../../utils/socket";
import {
  listCanvases,
  createNewCanvas,
  deleteCanvasById,
  shareCanvasWithEmail
} from "../../utils/api";

const Sidebar = () => {
  const [canvases, setCanvases] = useState([]);
  const { canvasId, setCanvasId, isUserLoggedIn, setUserLoginStatus } = useContext(boardContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { id } = useParams();

  const handleCanvasClick = useCallback((selectedId) => {
    setCanvasId(selectedId);
    navigate(`/${selectedId}`);
  }, [navigate, setCanvasId]);

  const handleCreateCanvas = useCallback(async () => {
    try {
      const data = await createNewCanvas();
      const newId = data.canvasId || data._id;
      if (newId) {
        const updatedList = await listCanvases();
        setCanvases(updatedList);
        handleCanvasClick(newId);
        return data;
      }
    } catch (err) {
      console.error("Error creating canvas:", err.message);
      return null;
    }
  }, [handleCanvasClick]);

  const fetchCanvases = useCallback(async () => {
    try {
      const list = await listCanvases();
      setCanvases(list);

      if (list.length === 0) {
        await handleCreateCanvas();
      } else if (!id && list.length > 0) {
        handleCanvasClick(list[0]._id);
      }
    } catch (err) {
      console.error("Error fetching canvases:", err.message);
    }
  }, [id, handleCanvasClick, handleCreateCanvas]);

  useEffect(() => {
    if (isUserLoggedIn) {
      fetchCanvases();
    }
  }, [isUserLoggedIn, fetchCanvases]);

  const handleDeleteCanvas = async (deleteId) => {
    try {
      await deleteCanvasById(deleteId);
      const remaining = await listCanvases();
      setCanvases(remaining);
      if (remaining.length > 0) {
        handleCanvasClick(remaining[0]._id);
      } else {
        await handleCreateCanvas();
      }
    } catch (err) {
      console.error("Error deleting canvas:", err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("whiteboard_user_token");
    disconnectSocket();
    setCanvases([]);
    setUserLoginStatus(false);
    navigate("/login");
  };

  const handleLogin = () => {
    navigate("/login");
  };

  const handleShare = async () => {
    if (!email.trim()) {
      setError("Please enter an email.");
      return;
    }

    try {
      setError("");
      setSuccess("");

      const res = await shareCanvasWithEmail(canvasId || id, email.trim());
      setSuccess(res.message || "Canvas shared successfully");
      setEmail("");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to share canvas.");
      setTimeout(() => setError(""), 5000);
    }
  };

  return (
    <div className="sidebar">
      <button
        className="create-button"
        onClick={handleCreateCanvas}
        disabled={!isUserLoggedIn}
      >
        + Create New Canvas
      </button>

      <ul className="canvas-list">
        {canvases.map((canvas) => (
          <li
            key={canvas._id}
            className={`canvas-item ${canvas._id === (canvasId || id) ? "selected" : ""}`}
          >
            <span
              className="canvas-name"
              onClick={() => handleCanvasClick(canvas._id)}
            >
              {canvas.title || canvas._id}
            </span>
            <button
              className="delete-button"
              onClick={() => handleDeleteCanvas(canvas._id)}
            >
              del
            </button>
          </li>
        ))}
      </ul>

      <div className="share-container">
        <input
          type="email"
          placeholder="Collaborator email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="share-button"
          onClick={handleShare}
          disabled={!isUserLoggedIn}
        >
          Share
        </button>
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}
      </div>

      {isUserLoggedIn ? (
        <button className="auth-button logout-button" onClick={handleLogout}>
          Logout
        </button>
      ) : (
        <button className="auth-button login-button" onClick={handleLogin}>
          Login
        </button>
      )}
    </div>
  );
};

export default Sidebar;
