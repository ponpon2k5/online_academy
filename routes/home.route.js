import express from "express";
import db from "../utils/db.js"; // file kết nối Supabase qua Knex

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const featuredCourses = await db("courses")
      .where("status", "published")
      .orderBy("rating_avg", "desc")
      .limit(6);

    const popularCourses = await db("courses")
      .where("status", "published")
      .orderBy("students_count", "desc")
      .limit(6);

    const newestCourses = await db("courses")
      .where("status", "published")
      .orderBy("created_at", "desc")
      .limit(6);

    const hotCategories = await db("courses")
      .select("category_id")
      .sum("students_count as total_students")
      .groupBy("category_id")
      .orderBy("total_students", "desc")
      .limit(4);

    res.render("home", {
      layout: "main",
      featuredCourses,
      popularCourses,
      newestCourses,
      hotCategories,
      title: "Online Academy - Học mọi lúc mọi nơi"
    });
  } catch (err) {
    console.error("Lỗi truy vấn dữ liệu:", err);
    res.status(500).send("Lỗi truy vấn dữ liệu");
  }
});

export default router;
