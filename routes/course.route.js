// routes/course.route.js
import express from "express";
import * as db from "../utils/fakeData.js";

const router = express.Router();

// ✅ Danh sách khoá học có phân trang, tìm kiếm, lọc, sắp xếp
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 6;
  const search = req.query.q || "";
  const category = req.query.category || "";
  const sort = req.query.sort || "newest"; // newest | popular | price_asc | price_desc

  const { courses, total } = await db.getCourses({ page, limit, search, category, sort });

  res.render("courses", {
    layout: "main",
    courses,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    search,
    category,
    sort
  });
});

// ✅ Chi tiết khoá học
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const course = await db.getCourseById(id);

  if (!course) {
    return res.status(404).render("404", { layout: "main" });
  }

  res.render("courseDetail", {
    layout: "main",
    course
  });
});

export default router;
