import express from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import userModel from "../models/user.model.js";
import { checkAuthenticated } from "../middlewares/auth.mdw.js";
import coursesModel from "../models/courses.model.js";
const router = express.Router();
//function
function getPagination(page, totalItems, limit) {
  const totalPages = Math.ceil(totalItems / limit);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pages = [];

  for (let i = 1; i <= totalPages; i++) {
    pages.push({
      number: i,
      active: i === currentPage,
    });
  }

  return {
    pages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    prevPage: currentPage - 1,
    nextPage: currentPage + 1,
    currentPage,
    totalPages,
  };
}
// cấu hình Multer
const uploadDir = path.join(process.cwd(), "statics", "img", "student");
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // đảm bảo thư mục tồn tại
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)?.toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext)
      ? ext
      : ".jpg";
    cb(null, `${req.session.authUser.id}${safeExt}`);
  },
});
const fileFilter = (req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("File ảnh không hợp lệ (chỉ JPG/PNG/WEBP)"), ok);
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
//profile student
router.get("/profile-favor-courses", checkAuthenticated, async (req, res) => {
  const limit = 4; //số khóa học trên mỗi trang (2 trên 2 dưới)
  const page = parseInt(req.query.page) || 1; // trang hiện tại, mặc định là 1
  const userId = req.session.authUser.id;

  if (!req.session.authUser) {
    return res.redirect("/account/login");
  }

  const total = await userModel.countFavoriteCourses(userId); // tổng số khóa học yêu thích
  const offset = (page - 1) * limit; // vị trí bắt đầu lấy dữ liệu

  const courses = await userModel.getFavoriteCourses(userId, limit, offset);

  const pagination = getPagination(page, total, limit);

  res.render("vwStudents/std_favor_courses", {
    title: "Khóa học yêu thích",
    courses,
    pagination,
    total,
  });
});
router.post("/add-favor-courses/:id", async (req, res) => {
  try {
    if (!req.session?.authUser?.id) return res.redirect("/auth/signin");

    const userId = req.session.authUser.id;
    const courseId = req.params.id || req.body.course_id || req.query.q;

    if (!courseId) return res.status(400).send("Thiếu course_id");

    await userModel.addFavoriteCourse(userId, courseId);

    const back = req.get("Referer") || `/courses/course-detail/${courseId}`;
    return res.redirect(back);
  } catch (err) {
    if (err.code === "23505") {
      // mã lỗi UNIQUE_violation của PostgreSQL
      console.warn("Khoá học đã tồn tại trong watchlist");
      return res
        .status(400)
        .send("❗ Khóa học này đã có trong danh sách yêu thích của bạn.");
    }

    console.error("Lỗi thêm vào watchlist:", err);
    return res
      .status(500)
      .send("Lỗi máy chủ, không thể thêm vào danh sách yêu thích.");
  }
});
//
router.get(
  "/profile-purchased-courses",
  checkAuthenticated,
  async (req, res) => {
    const limit = 4; //số khóa học trên mỗi trang (2 trên 2 dưới)
    const page = parseInt(req.query.page) || 1; // trang hiện tại, mặc định là 1
    const userId = req.session.authUser.id;

    if (!req.session.authUser) {
      // Redirect to login or show an error
      return res.redirect("/account/login"); // or your login route
    }
    const total = await userModel.countPurchasedCourses(userId); // tổng số khóa học yêu thích
    const offset = (page - 1) * limit; // vị trí bắt đầu lấy dữ liệu

    const courses = await userModel.getPurchasedCourses(userId, limit, offset);

    const pagination = getPagination(page, total, limit);

    res.render("vwStudents/std_purchased_courses", {
      title: "Khóa học đã mua",
      courses,
      pagination,
      total,
    });
  }
);
//edit profile
router.get("/profile-edit", checkAuthenticated, (req, res) => {
  res.render("vwStudents/std_edit_profile", { title: "Hồ sơ cá nhân" });
});
router.post(
  "/profile-edit",
  checkAuthenticated,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const userId = req.session.authUser.id;

      // đường dẫn public để lưu vào DB/hiển thị (bắt đầu bằng /uploads/…)
      let newAvatarUrl = null;
      if (req.file) {
        // lưu path tương đối để dùng khi render
        newAvatarUrl = `/images/student/${req.file.filename}`;
      }

      // payload update
      const user = {
        id: userId,
        name: req.body.full_name,
        email: req.body.email,
        dob: req.body.dob,
        address: req.body.address,
        phone: req.body.phone,
        bio: req.body.bio,
      };
      if (newAvatarUrl) {
        user.avatar_url = newAvatarUrl;
      }

      const result = await userModel.editUser(user);
      if (result === 0) {
        return res.render("vwStudents/std_edit_profile", {
          title: "Hồ sơ cá nhân",
          error: "Cập nhật không thành công",
          authUser: req.session.authUser,
        });
      }

      // cập nhật session để view hiển thị avatar mới ngay
      Object.assign(req.session.authUser, user);
      if (newAvatarUrl) req.session.authUser.avatar_url = newAvatarUrl;

      console.log("Update user", userId, "successfully");
      res.redirect("/student/profile-favor-courses");
    } catch (err) {
      console.error(err);
      res.status(400).render("vwStudents/std_edit_profile", {
        title: "Hồ sơ cá nhân",
        error: err.message,
        authUser: req.session.authUser,
      });
    }
  }
);

router.get("/profile-purcharsed-courses", (req, res) => {
  res.render("vwStudents/std_purchased_courses", { title: "Khóa học đã mua" });
});
//change password
router.get("/change-password", (req, res) => {
  res.render("vwStudents/std_change_pass", { title: "Đổi mật khẩu" });
});
//delete course
router.delete("/favor-courses/:id", checkAuthenticated, async (req, res) => {
  if (!req.session.authUser) {
    // kiểm tra lại trạng thái đăng nhập
    return res
      .status(403)
      .json({ success: false, message: "Bạn cần đăng nhập." });
  }

  try {
    const userId = req.session.authUser.id;
    const courseId = req.params.id;
    const affected = await userModel.delCourse(userId, courseId);

    if (affected > 0) res.json({ success: true });
    else
      res.json({
        success: false,
        message: "Khóa học không tồn tại trong danh sách yêu thích.",
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});
//show progress courses
router.get("/profile-process-course", async (req, res) => {
  const user_id = req.session?.authUser?.id;
  const limit = 4; //số khóa học trên mỗi trang (2 trên 2 dưới)
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    coursesModel.countProgress(user_id),
    coursesModel.showProgressPaged(user_id, limit, offset),
  ]);

  const progress = rows.map((r) => ({
    ...r,
    finish_text: r.is_completed
      ? "Hoàn thành khóa học"
      : "Chưa hoàn thành khóa học",
  }));

  const pagination = getPagination(page, total, limit);

  res.render("vwStudents/std_process_courses", {
    title: "Tiến độ học tập",
    progress,
    pagination,
    total,
    empty: progress.length === 0,
  });
});
export default router;
