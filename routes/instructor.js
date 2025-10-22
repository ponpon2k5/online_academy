import { Router } from "express";
import { isInstructor, requireRole, ensureAuth } from "../middlewares/auth.js";
import db from "../utils/db.js";

const r = Router();

r.use(ensureAuth);
r.use(requireRole("instructor", "admin"));
r.get("/dashboard", isInstructor, async (req, res) => {
  const me = req.session.user;

  try {
    // Lấy thống kê tổng quan
    const [totalCourses, totalStudents, totalLessons, avgRating] =
      await Promise.all([
        db("courses").where("instructor_id", me.id).count("* as count").first(),
        db("enrollments as e")
          .join("courses as c", "e.course_id", "c.id")
          .where("c.instructor_id", me.id)
          .countDistinct("e.user_id as count")
          .first(),
        db("lessons as l")
          .join("courses as c", "l.course_id", "c.id")
          .where("c.instructor_id", me.id)
          .count("* as count")
          .first(),
        db("courses")
          .where("instructor_id", me.id)
          .avg("rating_avg as avg")
          .first(),
      ]);

    // Lấy khóa học gần đây
    const recentCourses = await db("courses as c")
      .leftJoin("categories as cat", "c.category_id", "cat.id")
      .select(
        "c.id",
        "c.title",
        "c.status",
        "c.created_at",
        "cat.name as category_name"
      )
      .where("c.instructor_id", me.id)
      .orderBy("c.created_at", "desc")
      .limit(5);

    // Thống kê chi tiết
    const [publishedCourses, draftCourses, totalRevenue] = await Promise.all([
      db("courses")
        .where({ instructor_id: me.id, status: "published" })
        .count("* as count")
        .first(),
      db("courses")
        .where({ instructor_id: me.id, status: "draft" })
        .count("* as count")
        .first(),
      db("enrollments as e")
        .join("courses as c", "e.course_id", "c.id")
        .where("c.instructor_id", me.id)
        .sum("e.price_paid as total")
        .first(),
    ]);

    res.render("instructor/dashboard", {
      layout: "admin",
      title: "Dashboard",
      authUser: req.session.user,
      currentPage: "dashboard",
      totalCourses: totalCourses.count || 0,
      totalStudents: totalStudents.count || 0,
      totalLessons: totalLessons.count || 0,
      avgRating: avgRating.avg ? Number(avgRating.avg).toFixed(1) : "0.0",
      recentCourses,
      publishedCourses: publishedCourses.count || 0,
      draftCourses: draftCourses.count || 0,
      totalRevenue: totalRevenue.total || 0,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.render("instructor/dashboard", {
      layout: "admin",
      title: "Dashboard",
      totalCourses: 0,
      totalStudents: 0,
      totalLessons: 0,
      avgRating: "0.0",
      recentCourses: [],
      publishedCourses: 0,
      draftCourses: 0,
      totalRevenue: 0,
    });
  }
});

r.get("/ping", isInstructor, (_req, res) => res.send("instructor ok"));

r.get("/courses", isInstructor, async (req, res) => {
  const me = req.session.user;
  console.log("Courses page - instructor ID:", me.id);

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

  console.log("Found courses:", rows.length);
  console.log("Courses data:", rows);

  res.render("instructor/courses_index", {
    layout: "admin",
    title: "My Courses",
    authUser: req.session.user,
    currentPage: "courses",
    courses: rows,
  });
});

r.get("/courses/new", isInstructor, async (req, res) => {
  const cats = await db("categories")
    .select("id", "name")
    .orderBy("sort_order", "asc");
  res.render("instructor/courses_new", {
    layout: "admin",
    title: "Create Course",
    authUser: req.session.user,
    currentPage: "courses-new",
    categories: cats,
    _editor_head: ``,
    _editor_foot: ``,
  });
});

// Profile settings route
r.get("/profile", isInstructor, async (req, res) => {
  const me = req.session.user;
  res.render("instructor/profile", {
    layout: "admin",
    title: "Cài đặt hồ sơ",
    authUser: req.session.user,
    currentPage: "profile",
    user: me,
  });
});

// Analytics/Reports route
r.get("/analytics", isInstructor, async (req, res) => {
  const me = req.session.user;

  // Get detailed analytics data
  const [courseStats, revenueStats, studentStats] = await Promise.all([
    // Course statistics
    db("courses")
      .where("instructor_id", me.id)
      .select(
        db.raw("COUNT(*) as total"),
        db.raw("COUNT(CASE WHEN status = 'published' THEN 1 END) as published"),
        db.raw("COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft")
      )
      .first(),

    // Revenue statistics
    db("enrollments as e")
      .join("courses as c", "e.course_id", "c.id")
      .where("c.instructor_id", me.id)
      .select(
        db.raw("SUM(e.price_paid) as total_revenue"),
        db.raw("COUNT(*) as total_enrollments")
      )
      .first(),

    // Student statistics
    db("enrollments as e")
      .join("courses as c", "e.course_id", "c.id")
      .where("c.instructor_id", me.id)
      .countDistinct("e.user_id as unique_students")
      .first(),
  ]);

  res.render("instructor/analytics", {
    layout: "admin",
    title: "Báo cáo chi tiết",
    authUser: req.session.user,
    currentPage: "analytics",
    courseStats,
    revenueStats,
    studentStats,
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

  try {
    const courseData = {
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
    };

    const result = await db("courses").insert(courseData).returning("id");

    res.redirect("/instructor/courses");
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).send("Error creating course: " + error.message);
  }
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
    authUser: req.session.user,
    currentPage: "courses",
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
    authUser: req.session.user,
    currentPage: "courses",
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
    authUser: req.session.user,
    currentPage: "courses",
    course,
    categories: cats,
    _editor_head: ``,
    _editor_foot: ``,
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
