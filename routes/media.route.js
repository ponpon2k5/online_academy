// routes/media.route.js
import express from "express";
import fs from "fs";
import path from "path";
import mime from "mime";
import { ensureCanWatchLesson } from "../middlewares/lessonAccess.js";

const router = express.Router();
const VIDEO_ROOT = path.resolve(process.cwd(), "storage/videos");

router.get("/lessons/:lessonId/stream", ensureCanWatchLesson, (req, res) => {
    const filename = (req.lesson?.video_url || "").trim();
    const filePath = path.join(VIDEO_ROOT, filename);

    console.log("[STREAM]", { lessonId: req.params.lessonId, filePath, exists: fs.existsSync(filePath) });

    if (!filename || !fs.existsSync(filePath)) return res.sendStatus(404);

    const stat = fs.statSync(filePath);
    const type = mime.getType(filePath) || "video/mp4";
    const range = req.headers.range;

    if (!range) {
        res.writeHead(200, {
            "Content-Length": stat.size,
            "Content-Type": type,
        });
        return fs.createReadStream(filePath).pipe(res);
    }

    const [startStr, endStr] = range.replace("bytes=", "").split("-");
    const start = parseInt(startStr, 10);
    const end = Math.min(endStr ? parseInt(endStr, 10) : start + 1024 * 1024 - 1, stat.size - 1);

    res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": type,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
});

export default router;
