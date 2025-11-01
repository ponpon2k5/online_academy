// routes/media.route.js
import express from "express";
import fs from "fs";
import path from "path";
import mime from "mime";
import { ensureCanWatchLesson } from "../middlewares/lessonAccess.js";

const router = express.Router();
const VIDEO_ROOT = path.resolve(process.cwd(), "storage/videos");

router.get("/lessons/:lessonId/stream", ensureCanWatchLesson, (req, res) => {
  let videoUrl = (req.lesson?.video_url || "").trim();

  // Nếu là YouTube URL, không thể stream file local
  if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
    return res
      .status(400)
      .json({ error: "YouTube videos cannot be streamed from local storage" });
  }

  if (!videoUrl) {
    console.error(
      "[STREAM] No video_url found for lesson:",
      req.params.lessonId
    );
    return res.sendStatus(404);
  }

  // Loại bỏ các prefix cũ nếu có (để tương thích với dữ liệu cũ)
  let filename = videoUrl
    .replace(/^\/videos\//, "")
    .replace(/^\/storage\/videos\//, "")
    .replace(/^storage\/videos\//, "")
    .trim();

  // Đảm bảo có extension .mp4 nếu video_url là UUID không có extension
  if (filename && !path.extname(filename)) {
    filename = filename + ".mp4";
  }

  if (!filename) {
    console.error("[STREAM] Invalid filename after processing:", videoUrl);
    return res.sendStatus(404);
  }

  const filePath = path.join(VIDEO_ROOT, filename);

  console.log("[STREAM]", {
    lessonId: req.params.lessonId,
    videoUrl,
    filename,
    filePath,
    exists: fs.existsSync(filePath),
  });

  if (!fs.existsSync(filePath)) {
    console.error("[STREAM] File not found:", filePath);
    return res.sendStatus(404);
  }

  const stat = fs.statSync(filePath);
  const type = mime.getType(filePath) || "video/mp4";
  const range = req.headers.range;

  // Set CORS headers để cho phép browser stream video
  const headers = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range",
  };

  if (!range) {
    res.writeHead(200, {
      ...headers,
      "Content-Length": stat.size,
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  const [startStr, endStr] = range.replace("bytes=", "").split("-");
  const start = parseInt(startStr, 10);
  const end = Math.min(
    endStr ? parseInt(endStr, 10) : start + 1024 * 1024 - 1,
    stat.size - 1
  );

  res.writeHead(206, {
    ...headers,
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Content-Length": end - start + 1,
  });

  fs.createReadStream(filePath, { start, end }).pipe(res);
});

export default router;
