// middlewares/uploads.js
import multer from "multer";
import path from "path";
import fs from "fs";

const videosDir = path.join(process.cwd(), "public", "uploads", "videos");
fs.mkdirSync(videosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, videosDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname || ".mp4");
    cb(null, `video_${ts}${ext}`);
  },
});

export const uploadVideo = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = ["video/mp4", "video/webm", "video/ogg"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported video type"), ok);
  },
  limits: { fileSize: 1024 * 1024 * 200 }, // 200MB
});
