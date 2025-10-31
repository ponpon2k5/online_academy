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
  const { q, status, category_id, instructor_id } = req.query || {};

  // Base query
  const query = db("courses as c")
    .leftJoin("profiles as p", "c.instructor_id", "p.id")
    .leftJoin("categories as cat", "c.category_id", "cat.id")
    .select(
      "c.id",
      "c.title",
      "c.status",
      "c.created_at",
      "p.name as instructor",
      "p.id as instructor_id",
      "cat.name as category_name",
      "cat.id as category_id"
    );

  // Filters
  if (status && ["published", "draft", "removed"].includes(status)) {
    query.where("c.status", status);
  }

  if (category_id) {
    const cid = String(category_id);
    const prefix = cid.slice(0, 4);
    // Chấp nhận cả khớp chính xác (leaf) và khớp prefix (parent)
    query.andWhere(function () {
      this.where("c.category_id", cid).orWhereRaw(
        "LEFT(c.category_id, 4) = ?",
        [prefix]
      );
    });
  }

  if (instructor_id) {
    query.where("c.instructor_id", instructor_id);
  }

  if (q && String(q).trim()) {
    const kw = `%${String(q).trim()}%`;
    query.where(function () {
      this.whereILike("c.title", kw)
        .orWhereILike("p.name", kw)
        .orWhereILike("cat.name", kw);
    });
  }

  query.orderBy("c.created_at", "desc");

  // Fetch filters data
  const [rows, categories, instructors] = await Promise.all([
    query,
    db("categories").select("id", "name").orderBy("name"),
    db("profiles")
      .where("role", "instructor")
      .select("id", "name")
      .orderBy("name"),
  ]);

  res.render("admin/courses_index", {
    layout: "admin",
    title: "All Courses",
    authUser: req.session.user,
    currentPage: "courses",
    courses: rows,
    filters: {
      q: q || "",
      status: status || "",
      category_id: category_id || "",
      instructor_id: instructor_id || "",
    },
    categories,
    instructors,
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

r.post("/courses/:courseId/draft", isAdmin, async (req, res) => {
  const { courseId } = req.params;
  await db("courses")
    .where("id", courseId)
    .update({ status: "draft", updated_at: db.fn.now() });
  res.redirect("/admin/courses");
});

r.post("/courses/:courseId/publish", isAdmin, async (req, res) => {
  const { courseId } = req.params;
  await db("courses")
    .where("id", courseId)
    .update({ status: "published", updated_at: db.fn.now() });
  res.redirect("/admin/courses");
});

r.get("/users", isAdmin, async (req, res) => {
  const rows = await db("profiles")
    .select("id", "name", "role", "email", "created_at")
    .orderBy("created_at", "desc");

  // Thêm is_active = true mặc định cho tất cả user (giả sử tất cả đều active)
  const usersWithActiveStatus = rows.map((user) => ({
    ...user,
    is_active: true, // Mặc định tất cả user đều active
  }));

  res.render("admin/users_index", {
    layout: "admin",
    title: "Users",
    authUser: req.session.user,
    currentPage: "users",
    users: usersWithActiveStatus,
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

// Khóa tài khoản user (tạm thời comment vì chưa có cột is_active)
r.post("/users/:userId/deactivate", isAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    // TODO: Cần thêm cột is_active vào bảng profiles
    // await db("profiles")
    //   .where("id", userId)
    //   .where("role", "!=", "admin") // Không cho phép khóa admin
    //   .update({ is_active: false, updated_at: db.fn.now() });

    console.log(
      `User ${userId} deactivation requested (feature not implemented yet)`
    );
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error deactivating user:", error);
    res.status(500).send("Lỗi khi khóa tài khoản");
  }
});

// Mở khóa tài khoản user (tạm thời comment vì chưa có cột is_active)
r.post("/users/:userId/activate", isAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    // TODO: Cần thêm cột is_active vào bảng profiles
    // await db("profiles")
    //   .where("id", userId)
    //   .update({ is_active: true, updated_at: db.fn.now() });

    console.log(
      `User ${userId} activation requested (feature not implemented yet)`
    );
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error activating user:", error);
    res.status(500).send("Lỗi khi mở khóa tài khoản");
  }
});

// Đã bỏ route xóa user theo yêu cầu

// Xem hồ sơ student (dành cho admin)
r.get("/users/:userId/profile", isAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    // Lấy thông tin user
    const user = await db("profiles").where("id", userId).first();
    if (!user) {
      return res.status(404).send("Không tìm thấy người dùng");
    }

    if (user.role !== "student") {
      return res.status(400).send("Chỉ có thể xem hồ sơ học viên");
    }

    // Lấy thông tin khóa học yêu thích (từ bảng watchlist)
    let favoriteCourses = [];
    try {
      favoriteCourses = await db("watchlist as w")
        .join("courses as c", "w.course_id", "c.id")
        .select(
          "c.id",
          "c.title",
          "c.hero_image_url",
          "c.price",
          "c.rating_avg"
        )
        .where("w.user_id", userId)
        .limit(10);
    } catch (error) {
      console.log("Không thể lấy khóa học yêu thích:", error.message);
      favoriteCourses = [];
    }

    // Lấy thông tin khóa học đã mua (từ bảng enrollments)
    let purchasedCourses = [];
    try {
      purchasedCourses = await db("enrollments as e")
        .join("courses as c", "e.course_id", "c.id")
        .select(
          "c.id",
          "c.title",
          "c.hero_image_url",
          "c.price",
          "e.purchased_at"
        )
        .where("e.user_id", userId)
        .limit(10);
    } catch (error) {
      console.log("Không thể lấy khóa học đã mua:", error.message);
      purchasedCourses = [];
    }

    // Lấy thông tin tiến độ học tập (từ bảng enrollments)
    let progressCourses = [];
    try {
      progressCourses = await db("enrollments as e")
        .join("courses as c", "e.course_id", "c.id")
        .select(
          "c.id",
          "c.title",
          "e.progress_percentage",
          "e.is_completed",
          "e.purchased_at"
        )
        .where("e.user_id", userId)
        .orderBy("e.purchased_at", "desc")
        .limit(10);
    } catch (error) {
      console.log("Không thể lấy tiến độ học tập:", error.message);
      progressCourses = [];
    }

    res.render("admin/student_profile", {
      layout: "admin",
      title: `Hồ sơ học viên - ${user.name}`,
      authUser: req.session.user,
      currentPage: "users",
      student: user,
      favoriteCourses,
      purchasedCourses,
      progressCourses,
    });
  } catch (error) {
    console.error("Error viewing student profile:", error);
    res.status(500).send("Lỗi khi tải hồ sơ học viên");
  }
});

// Xem khóa học của instructor (dành cho admin)
r.get("/users/:userId/courses", isAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    // Lấy thông tin user
    const user = await db("profiles").where("id", userId).first();
    if (!user) {
      return res.status(404).send("Không tìm thấy người dùng");
    }

    if (user.role !== "instructor") {
      return res.status(400).send("Chỉ có thể xem khóa học của giảng viên");
    }

    // Lấy danh sách khóa học của instructor
    const courses = await db("courses as c")
      .leftJoin("categories as cat", "c.category_id", "cat.id")
      .select(
        "c.id",
        "c.title",
        "c.slug",
        "c.status",
        "c.created_at",
        "c.updated_at",
        "c.students_count",
        "c.rating_avg",
        "c.price",
        "c.promo_price",
        "c.hero_image_url",
        "c.short_desc",
        db.raw("COALESCE(cat.name,'N/A') as category_name")
      )
      .where("c.instructor_id", userId)
      .orderBy("c.created_at", "desc");

    // Thống kê khóa học
    const stats = await db("courses")
      .where("instructor_id", userId)
      .select(
        db.raw("COUNT(*) as total_courses"),
        db.raw(
          "COUNT(CASE WHEN status = 'published' THEN 1 END) as published_courses"
        ),
        db.raw("COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_courses"),
        db.raw(
          "COUNT(CASE WHEN status = 'removed' THEN 1 END) as removed_courses"
        ),
        db.raw("SUM(students_count) as total_students"),
        db.raw("AVG(rating_avg) as avg_rating")
      )
      .first();

    res.render("admin/instructor_courses", {
      layout: "admin",
      title: `Khóa học của giảng viên - ${user.name}`,
      authUser: req.session.user,
      currentPage: "users",
      instructor: user,
      courses,
      stats,
    });
  } catch (error) {
    console.error("Error viewing instructor courses:", error);
    res.status(500).send("Lỗi khi tải khóa học của giảng viên");
  }
});

export default r;
