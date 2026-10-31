import axios from "axios";

const API_BASE_URL = `${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/canvas`;

const getAuthHeaders = () => {
  const token = localStorage.getItem("whiteboard_user_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchInitialCanvasElements = async (canvasId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/load/${canvasId}`, {
      headers: getAuthHeaders()
    });
    return response.data.elements || [];
  } catch (error) {
    console.error("Error loading canvas elements:", error.message);
    throw error;
  }
};

export const listCanvases = async () => {
  const response = await axios.get(`${API_BASE_URL}/list`, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const createNewCanvas = async (title = "Untitled Canvas") => {
  const response = await axios.post(
    `${API_BASE_URL}/create`,
    { title },
    { headers: getAuthHeaders() }
  );
  return response.data;
};

export const deleteCanvasById = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/delete/${id}`, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const shareCanvasWithEmail = async (canvasId, email) => {
  const response = await axios.put(
    `${API_BASE_URL}/share/${canvasId}`,
    { email },
    { headers: getAuthHeaders() }
  );
  return response.data;
};
