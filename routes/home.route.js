// routes/home.route.js
import express from "express";
import * as db from "../utils/fakeData.js"; // nơi chứa dữ liệu giả
const router = express.Router();

// Trang chủ
router.get("/", async (req, res) => {
  const featuredCourses = await db.getFeaturedCourses();
  const popularCourses = await db.getPopularCourses();
  const newestCourses = await db.getNewestCourses();
  const hotCategories = await db.getHotCategories();

  res.render("home", {
    layout: "main",
    featuredCourses,
    popularCourses,
    newestCourses,
    hotCategories
  });
});

export default router;
