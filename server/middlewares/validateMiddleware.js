function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return res.status(400).json({
        error: "Invalid request payload",
        details
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return res.status(400).json({
        error: "Invalid request parameters",
        details
      });
    }
    req.validatedParams = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  validateParams
};
