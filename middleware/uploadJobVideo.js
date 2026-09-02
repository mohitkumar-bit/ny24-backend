import multer from "multer";
import {
  MAX_VIDEO_UPLOAD_BYTES,
  videoUploadSizeMessage,
} from "../utils/uploadLimits.js";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype?.startsWith("video/") ||
      file.mimetype === "application/octet-stream"
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Only video files are allowed"));
  },
});

export const uploadJobVideo = upload.single("video");
export { videoUploadSizeMessage };
