import db from "../utils/db.js";
import { isAdmin } from "../middlewares/auth.js";
import { Router } from "express";
const r = Router();

r.get("/dashboard", isAdmin, async (_req, res) => {
  const [c, u, e] = await Promise.all([
    db("courses").count({ n: "*" }).first(),
    db("profiles").count({ n: "*" }).first(),
    db("enrollments").count({ n: "*" }).first(),
  ]);
  res.render("admin/dashboard", {
    layout: "admin",
    title: "Admin Dashboard",
    total_courses: c?.n || 0,
    total_users: u?.n || 0,
    total_enrolls: e?.n || 0,
  });
});

r.get("/courses", isAdmin, async (_req, res) => {
  const rows = await db("courses as c")
    .leftJoin("profiles as p", "c.instructor_id", "p.id")
    .select(
      "c.id",
      "c.title",
      "c.status",
      "p.name as instructor",
      "c.created_at"
    )
    .orderBy("c.created_at", "desc");

  res.render("admin/courses_index", {
    layout: "admin",
    title: "All Courses",
    courses: rows,
  });
});

// NOTE: nếu enum course_status chưa có 'removed', bạn có thể dùng status='draft' + một cờ riêng.
// Ở đây tạm dùng 'removed'. Nếu enum không cho, đổi sang 'draft' và thêm cột is_removed (tuỳ bạn).
r.post("/courses/:courseId/remove", isAdmin, async (req, res) => {
  const { courseId } = req.params;
  await db("courses")
    .where("id", courseId)
    .update({ status: "removed", updated_at: db.fn.now() });
  res.redirect("/admin/courses");
});

r.get("/users", isAdmin, async (_req, res) => {
  const rows = await db("profiles")
    .select("id", "name", "role", "email", "created_at")
    .orderBy("created_at", "desc");
  res.render("admin/users_index", {
    layout: "admin",
    title: "Users",
    users: rows,
  });
});

r.get("/users/new-instructor", isAdmin, (_req, res) => {
  res.render("admin/instructor_new", {
    layout: "admin",
    title: "Create Instructor",
  });
});

r.post("/users/new-instructor", isAdmin, async (req, res) => {
  const { id, name, email, username, password, bio } = req.body;
  if (!id || !name) return res.status(400).send("id & name required");

  await db("profiles").insert({
    id,
    name,
    role: "instructor",
    email: email || null,
    username: username || null,
    password: password || null,
    bio: bio || null,
  });
  res.redirect("/admin/users");
});

export default r;
