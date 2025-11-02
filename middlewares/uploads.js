// middlewares/uploads.js
import multer from "multer";
import path from "path";
import fs from "fs";

// Video upload middleware - lưu vào storage/videos
const videosDir = path.join(process.cwd(), "storage", "videos");
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

// Image upload middleware - lưu vào statics/img
const imagesDir = path.join(process.cwd(), "statics", "img");
fs.mkdirSync(imagesDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imagesDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname || ".jpg");
    // Lưu tên file với timestamp để tránh trùng
    cb(null, `course_${ts}${ext}`);
  },
});

export const uploadImage = multer({
  storage: imageStorage,
  fileFilter: (_req, file, cb) => {
    const ok = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported image type"), ok);
  },
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
});

// Instructor avatar upload middleware - lưu vào statics/img/instructor
const instructorAvatarDir = path.join(
  process.cwd(),
  "statics",
  "img",
  "instructor"
);
fs.mkdirSync(instructorAvatarDir, { recursive: true });

const instructorAvatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, instructorAvatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    // Lưu tên file là instructor_id để dễ dàng truy cập
    const instructorId =
      req.session?.user?.id || req.body.instructor_id || Date.now();
    cb(null, `${instructorId}${ext}`);
  },
});

export const uploadInstructorAvatar = multer({
  storage: instructorAvatarStorage,
  fileFilter: (_req, file, cb) => {
    const ok = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported image type"), ok);
  },
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
});
