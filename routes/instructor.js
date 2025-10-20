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

  res.render("instructor/courses_index", {
    layout: "admin",
    title: "My Courses",
    courses: rows,
  });
});

r.get("/courses/new", isInstructor, async (_req, res) => {
  const cats = await db("categories")
    .select("id", "name")
    .orderBy("sort_order", "asc");
  res.render("instructor/courses_new", {
    layout: "admin",
    title: "Create Course",
    categories: cats,
    _editor_head: `<script src="https://cdn.tiny.cloud/1/no-api-key/tinymce/7/tinymce.min.js" referrerpolicy="origin"></script>`,
    _editor_foot: `<script>tinymce.init({ selector:'#long_desc', height: 360 });</script>`,
  });
});

r.post("/courses", isInstructor, async (req, res) => {
  const me = req.session.user;
  const {
    category_id,
    title,
    slug,
    short_desc,
    long_desc,
    hero_image_url,
    price,
    promo_price,
  } = req.body;

  if (!category_id || !title || !slug || !short_desc || !long_desc) {
    return res.status(400).send("Missing required fields");
  }
  await db("courses").insert({
    instructor_id: me.id,
    category_id,
    title,
    slug,
    short_desc,
    long_desc,
    hero_image_url: hero_image_url || null,
    price: price ? Number(price) : 0,
    promo_price: promo_price ? Number(promo_price) : null,
    status: "draft",
  });
  res.redirect("/instructor/courses");
});

r.get("/courses/:courseId/sections", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const course = await db("courses").where("id", courseId).first();
  if (!course) return res.status(404).send("Course not found");

  const sections = await db("course_sections")
    .where("course_id", courseId)
    .orderBy("sort_order", "asc");

  res.render("instructor/sections_index", {
    layout: "admin",
    title: `Sections - ${course.title}`,
    course,
    sections,
  });
});

r.post("/courses/:courseId/sections", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const { title, sort_order } = req.body;
  if (!title) return res.redirect(`/instructor/courses/${courseId}/sections`);

  await db("course_sections").insert({
    course_id: courseId,
    title,
    sort_order: sort_order ? Number(sort_order) : 0,
  });
  res.redirect(`/instructor/courses/${courseId}/sections`);
});

export default r;
