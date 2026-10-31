const jwt = require("jsonwebtoken");

function createAuthMiddleware(config) {
  return (req, res, next) => {
    const header = req.header("Authorization");
    if (!header) {
      return res
        .status(401)
        .json({ error: "Access Denied: No Token Provided" });
    }

    const token = header.startsWith("Bearer ")
      ? header.slice(7).trim()
      : header.trim();

    if (!token) {
      return res
        .status(401)
        .json({ error: "Access Denied: Invalid Token Format" });
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

module.exports = {
  createAuthMiddleware
};
