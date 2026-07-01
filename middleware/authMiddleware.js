import User from "../models/authModal.js";
import { verifyAccessToken } from "../utils/jwt.js";

const SESSION_REVOKED = {
  message: "Logged in on another device. Please sign in again.",
  code: "SESSION_REVOKED",
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("🔴 Auth Error: Token missing or malformed");
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.id).select("activeSessionId isBlocked");
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    if (!decoded.sessionId || !user.activeSessionId || decoded.sessionId !== user.activeSessionId) {
      return res.status(401).json(SESSION_REVOKED);
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    console.log("🔴 Auth Error: Invalid/Expired Token:", error.message);
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

export default authMiddleware;
