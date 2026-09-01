import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
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
