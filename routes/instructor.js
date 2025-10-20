import { Router } from "express";
import { isInstructor } from "../middlewares/auth.js";
import db from "../utils/db.js";

const r = Router();

r.get("/ping", isInstructor, (_req, res) => res.send("instructor ok"));

r.get("/courses", isInstructor, async (req, res) => {
  const me = req.session.user;
  const rows = await db("courses as c")
    .leftJoin("categories as cat", "c.category_id", "cat.id")
    .select(
      "c.id",
      "c.title",
      "c.slug",
      "c.status",
      "c.created_at",
      "c.students_count",
      "c.rating_avg",
      db.raw("COALESCE(cat.name,'N/A') as category_name")
    )
    .where("c.instructor_id", me.id)
    .orderBy("c.created_at", "desc");

  res.render("instrutor/courses_index", {
    layout: "admin",
    title: "My Courses",
    courses: rows,
  });
});

export default r;
