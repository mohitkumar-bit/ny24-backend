import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype?.startsWith("image/") ||
      file.mimetype?.startsWith("audio/") ||
      file.mimetype === "video/webm" ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/octet-stream"
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image, audio, or PDF files are allowed"));
  },
});

export const uploadChatMedia = upload.single("media");
