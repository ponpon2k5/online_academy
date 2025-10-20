import { Router } from "express";
import { isInstructor, requireRole } from "../middlewares/auth.js";
import db from "../utils/db.js";

const r = Router();

r.use(requireRole("instructor", "admin"));
r.get("/dashboard", (req, res) => res.render("instructor/dashboard"));

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

import { uploadVideo } from "../middlewares/uploads.js";

r.get("/courses/:courseId/lessons/new", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const secs = await db("course_sections")
    .where("course_id", courseId)
    .orderBy("sort_order", "asc");
  res.render("instructor/lesson_new", {
    layout: "admin",
    title: "Add Lesson",
    courseId,
    sections: secs,
  });
});

r.post(
  "/courses/:courseId/lessons",
  isInstructor,
  uploadVideo.single("video_file"),
  async (req, res) => {
    const { courseId } = req.params;
    const {
      section_id,
      lesson,
      description,
      is_preview,
      sort_order,
      duration_seconds,
    } = req.body;

    if (!lesson) return res.status(400).send("Lesson title required");

    let video_url = null;
    if (req.file) video_url = `/uploads/videos/${req.file.filename}`;

    await db("lessons").insert({
      course_id: courseId,
      section_id: section_id || null,
      lesson,
      video_url,
      duration_seconds: duration_seconds ? Number(duration_seconds) : 0,
      is_preview: is_preview === "on",
      sort_order: sort_order ? Number(sort_order) : 0,
      description: description || null,
    });

    res.redirect(`/instructor/courses/${courseId}/sections`);
  }
);

r.get("/courses/:courseId/edit", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const course = await db("courses").where("id", courseId).first();
  if (!course) return res.status(404).send("Course not found");
  const cats = await db("categories")
    .select("id", "name")
    .orderBy("sort_order", "asc");

  res.render("instructor/courses_edit", {
    layout: "admin",
    title: "Edit Course",
    course,
    categories: cats,
    _editor_head: `<script src="https://cdn.tiny.cloud/1/no-api-key/tinymce/7/tinymce.min.js" referrerpolicy="origin"></script>`,
    _editor_foot: `<script>tinymce.init({ selector:'#long_desc', height: 360 });</script>`,
  });
});

r.post("/courses/:courseId/edit", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const {
    category_id,
    title,
    short_desc,
    long_desc,
    hero_image_url,
    price,
    promo_price,
  } = req.body;

  await db("courses")
    .where("id", courseId)
    .update({
      category_id,
      title,
      short_desc,
      long_desc,
      hero_image_url: hero_image_url || null,
      price: price ? Number(price) : 0,
      promo_price: promo_price ? Number(promo_price) : null,
      updated_at: db.fn.now(),
    });
  res.redirect("/instructor/courses");
});

r.post("/courses/:courseId/publish", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  await db("courses").where("id", courseId).update({
    status: "published",
    last_published_at: db.fn.now(),
  });
  res.redirect("/instructor/courses");
});

r.post("/courses/:courseId/unpublish", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  await db("courses").where("id", courseId).update({ status: "draft" });
  res.redirect("/instructor/courses");
});

export default r;
