const adminMiddleware = (req, res, next) => {
  const secret = req.headers["x-admin-secret"];
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: "Admin access denied" });
  }
  next();
};

export default adminMiddleware;
