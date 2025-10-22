import db from "../utils/db.js";
import { isAdmin, requireRole, ensureAuth } from "../middlewares/auth.js";
import { Router } from "express";
import bcrypt from "bcryptjs";
const r = Router();

r.use(ensureAuth);
r.use(requireRole("admin"));
r.get("/dashboard", isAdmin, async (req, res) => {
  console.log("Admin dashboard - Session user:", req.session.user);
  try {
    // Thống kê cơ bản
    const [c, u, e, instructors] = await Promise.all([
      db("courses").count({ n: "*" }).first(),
      db("profiles").count({ n: "*" }).first(),
      db("enrollments").count({ n: "*" }).first(),
      db("profiles").where("role", "instructor").count({ n: "*" }).first(),
    ]);

    // Thống kê chi tiết
    const [
      published_courses,
      draft_courses,
      removed_courses,
      student_count,
      admin_count,
    ] = await Promise.all([
      db("courses").where("status", "published").count({ n: "*" }).first(),
      db("courses").where("status", "draft").count({ n: "*" }).first(),
      db("courses").where("status", "removed").count({ n: "*" }).first(),
      db("profiles").where("role", "student").count({ n: "*" }).first(),
      db("profiles").where("role", "admin").count({ n: "*" }).first(),
    ]);

    res.render("admin/dashboard", {
      layout: "admin",
      title: "Admin Dashboard",
      authUser: req.session.user,
      currentPage: "dashboard",
      total_courses: c?.n || 0,
      total_users: u?.n || 0,
      total_enrolls: e?.n || 0,
      total_instructors: instructors?.n || 0,
      published_courses: published_courses?.n || 0,
      draft_courses: draft_courses?.n || 0,
      removed_courses: removed_courses?.n || 0,
      student_count: student_count?.n || 0,
      instructor_count: instructors?.n || 0,
      admin_count: admin_count?.n || 0,
      recent_activities: [], // Có thể thêm log hoạt động sau
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.render("admin/dashboard", {
      layout: "admin",
      title: "Admin Dashboard",
      total_courses: 0,
      total_users: 0,
      total_enrolls: 0,
      total_instructors: 0,
      published_courses: 0,
      draft_courses: 0,
      removed_courses: 0,
      student_count: 0,
      instructor_count: 0,
      admin_count: 0,
      recent_activities: [],
    });
  }
});

r.get("/courses", isAdmin, async (req, res) => {
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
    authUser: req.session.user,
    currentPage: "courses",
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

r.get("/users", isAdmin, async (req, res) => {
  const rows = await db("profiles")
    .select("id", "name", "role", "email", "created_at")
    .orderBy("created_at", "desc");
  res.render("admin/users_index", {
    layout: "admin",
    title: "Users",
    authUser: req.session.user,
    currentPage: "users",
    users: rows,
  });
});

r.get("/users/new-instructor", isAdmin, (req, res) => {
  res.render("admin/instructor_new", {
    layout: "admin",
    title: "Create Instructor",
    authUser: req.session.user,
    currentPage: "instructor-new",
  });
});

r.post("/users/new-instructor", isAdmin, async (req, res) => {
  const { id, name, email, username, password, password_confirm, bio } =
    req.body;

  // Validation
  if (!id || !name || !email) {
    return res.status(400).send("ID, tên và email là bắt buộc");
  }

  // Check if ID already exists
  const existingUser = await db("profiles").where("id", id).first();
  if (existingUser) {
    return res.status(400).send("ID đã tồn tại");
  }

  // Check if email already exists
  const existingEmail = await db("profiles").where("email", email).first();
  if (existingEmail) {
    return res.status(400).send("Email đã được sử dụng");
  }

  // Validate password if provided
  if (password && password !== password_confirm) {
    return res.status(400).send("Mật khẩu xác nhận không khớp");
  }

  if (password && password.length < 6) {
    return res.status(400).send("Mật khẩu phải có ít nhất 6 ký tự");
  }

  let passwordHash = null;
  if (password) {
    const salt = await bcrypt.genSalt(10);
    passwordHash = await bcrypt.hash(password, salt);
  }

  try {
    await db("profiles").insert({
      id,
      name,
      role: "instructor",
      email: email,
      username: username || id,
      password: passwordHash,
      bio: bio || null,
      created_at: db.fn.now(),
    });

    // TODO: Send welcome email to instructor
    console.log(`Instructor created: ${name} (${email})`);

    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error creating instructor:", error);
    res.status(500).send("Lỗi khi tạo tài khoản giảng viên");
  }
});

export default r;
