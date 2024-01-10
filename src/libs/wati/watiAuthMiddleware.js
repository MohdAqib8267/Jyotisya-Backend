const watiAuthMiddleware = (req, res, next) => {
  if (req.headers.authorization !== process.env.WATI_AUTH_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  return next();
}

export default watiAuthMiddleware;