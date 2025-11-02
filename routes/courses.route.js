import express from "express";
import coursesModel from "../models/courses.model.js";
import userModel from "../models/user.model.js";
import homeModel from "../models/home.model.js";
import db from "../utils/db.js";
import { mapCourseList } from "../utils/course.helper.js";

//const player = new Plyr('#player');
const router = express.Router();
//function
async function totalEnrollment() {
  const row = await db("enrollments").count("* as cnt").first();
  // row.cnt có thể là string => ép về number
  return Number(row?.cnt ?? 0);
}
async function isEnrolled(userId, courseId) {
  const row = await db("enrollments")
    .where({ user_id: userId, course_id: courseId })
    .first();
  return !!row;
}
function buildPages(currentPage, totalPages) {
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push({ number: i, active: i === currentPage });
  }
  return pages;
}
//view courses
router.get("/view-courses", async (req, res) => {
  try {
    const categoriesTree = await coursesModel.getCategoriesTree();
    const categorySlug = req.query.category || null;
    const sort = req.query.sort || null;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 9; // Hiển thị 9 khóa học mỗi trang (3x3 grid)
    const offset = (page - 1) * limit;

    // Đếm tổng số khóa học (đồng bộ tiêu chí với list)
    const countResult = await coursesModel.count_all_courses({ categorySlug });
    const totalCount = Number(countResult?.total || 0);
    const totalPages = Math.max(Math.ceil(totalCount / limit), 1);

    // Lấy danh sách khóa học trang hiện tại
    const coursesRaw = await coursesModel.view_all_courses(
      categorySlug,
      sort,
      limit,
      offset
    );

    // Áp dụng mapCourseFlags để thêm isFeatured, isNew, isOnSale
    const courses = mapCourseList(coursesRaw);

    // Tạo mảng trang
    const pages = Array.from({ length: totalPages }, (_, i) => ({
      number: i + 1,
      active: i + 1 === page,
    }));

    // Render duy nhất 1 lần
    return res.render("vwCourses/dis_courses", {
      title: "Khóa học",
      courses,
      pages,
      currentPage: page,
      totalPages,
      totalCount,
      selectedCategory: categorySlug,
      selectedSort: sort,
      categoryTree: categoriesTree,
    });
  } catch (err) {
    console.error("Lỗi khi hiển thị khóa học:", err);
    return res.status(500).send("Lỗi máy chủ");
  }
});

//enroll course
router.post("/enroll-course", async (req, res) => {
  if (!req.session.authUser) {
    // Redirect to login or show an error
    return res.redirect("/account/login"); // or your login route
  }
  const userId = req.session.authUser.id;
  const courseId = req.body.course_id;

  await coursesModel.enrollCourse(userId, courseId);
  res.redirect("/courses/view-courses"); // Redirect to the purchased courses page after enrollment
});

//course detail
router.get("/course-detail/:id", async (req, res) => {
  const courseId = req.params.id;

  const userId = req.session?.authUser?.id || null;
  await coursesModel.increaseViews(courseId);
  const course = await coursesModel.view_detail_course(courseId);
  const lessons = await coursesModel.view_lesson_in_detail(courseId);
  const feedback = await coursesModel.getFeedback(courseId);
  const sameCourseCategoryRaw = await coursesModel.view_courses_same_category(
    courseId
  );
  // Áp dụng mapCourseFlags cho related courses
  const relatedCourses = mapCourseList(sameCourseCategoryRaw);
  const existed = await isEnrolled(userId, courseId);
  const instructor_id = course.instructor_id;
  const instructor = await coursesModel.getInstructorProfile(instructor_id);
  res.render("vwCourses/dis_detailCourse", {
    title: course.title || "Chi tiết khóa học",
    course: course,
    lessons: lessons,
    feedbacks: feedback,
    relatedCourses: relatedCourses,
    instructor: instructor,
    instructor_id,
    existed,
  });
});
router.post("/course-detail/:id", async (req, res) => {
  if (!req.session.authUser) {
    return res.redirect(
      `/account/signin?redirect=/courses/course-detail/${req.params.id}`
    );
  }

  const courseId = req.params.id;
  const userId = req.session.authUser.id;
  const comment = (req.body.comment || "").trim();
  const ratingRaw = req.body.rating;
  const rating = Number.parseInt(ratingRaw, 10);

  // Validate đơn giản
  if (!comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    // Có thể trả toast / flash message, ở đây redirect gọn
    return res.redirect(`/courses/course-detail/${courseId}#composeBox`);
  }

  const payload = {
    course_id: String(courseId),
    user_id: String(userId),
    description: comment,
    rating,
  };

  try {
    await coursesModel.save_feedback(payload);
  } catch (e) {
    console.error("Lỗi khi insert/merge review:", e.message, e.detail, e.code);
  }
  return res.redirect(`/courses/course-detail/${courseId}#feedback`);
});

//purchase course
router.get("/purchase-courses/:id", async (req, res) => {
  const courseId = req.params.id;
  const course = await coursesModel.view_detail_course(courseId);
  const lessons = await coursesModel.view_lessons_by_course_id(courseId);
  res.render("vwCourses/purchase_courses", {
    title: course.title || "Mua khóa học",
    course: course,
    lessons: lessons,
  });
});

router.post("/purchase-courses-process/:id", async (req, res) => {
  try {
    // Kiểm tra xem user đã đăng nhập chưa
    if (!req.session.authUser) {
      return res.redirect(
        `/account/signin?redirect=/courses/purchase-courses/${req.params.id}`
      );
    }

    const courseId = req.params.id;
    const userId = req.session.authUser.id;

    // 1) Chặn mua lại
    const existed = await isEnrolled(userId, courseId);
    if (existed) {
      return res.redirect(
        `/courses/view-courses?toast=warning&msg=${encodeURIComponent(
          "Bạn đã sở hữu khóa học này rồi."
        )}`
      );
    }

    // 2) (Tuỳ) sinh enrollID — khuyên dùng DEFAULT/UUID thay vì đếm thủ công
    const enrollID = await totalEnrollment(); // nếu bạn vẫn cần
    const enrollID_new = "e" + (enrollID + 1); // tránh race condition bằng sequence/uuid

    // 3) Lấy giá tại thời điểm mua
    const course = await userModel.findCourseByID(courseId);

    // 4) Ghi hồ sơ enroll
    await userModel.enrollCourse(userId, courseId, enrollID_new, course);

    return res.redirect(
      `/courses/view-courses?toast=success&msg=${encodeURIComponent(
        "Mua khóa học thành công!"
      )}`
    );
  } catch (err) {
    console.error("purchase error:", err);
    return res.redirect(
      `/courses/view-courses?toast=error&msg=${encodeURIComponent(
        "Mua khóa học không thành công"
      )}`
    );
  }
});

//buy now route (alias cho purchase-courses-process)
router.post("/buy-now", async (req, res) => {
  try {
    const courseId = req.body.course_id;
    console.log(
      "buy-now received course_id:",
      courseId,
      "type:",
      typeof courseId
    );

    if (!courseId) {
      console.error("buy-now error: Missing course_id");
      return res.status(400).send("Thiếu course_id");
    }

    // Kiểm tra đăng nhập
    if (!req.session.authUser) {
      return res.redirect(
        `/account/signin?redirect=/courses/purchase-courses/${courseId}`
      );
    }

    const userId = req.session.authUser.id;
    console.log("buy-now processing for user:", userId, "course:", courseId);

    // 1) Chặn mua lại
    const existed = await isEnrolled(userId, courseId);
    if (existed) {
      return res.redirect(
        `/courses/view-courses?toast=warning&msg=${encodeURIComponent(
          "Bạn đã sở hữu khóa học này rồi."
        )}`
      );
    }

    // 2) Sinh enrollID
    const enrollID = await totalEnrollment();
    const enrollID_new = "e" + (enrollID + 1);

    // 3) Lấy giá tại thời điểm mua
    const course = await userModel.findCourseByID(courseId);
    if (!course) {
      console.error(`Course not found: ${courseId}`);
      return res.redirect(
        `/courses/view-courses?toast=error&msg=${encodeURIComponent(
          "Khóa học không tồn tại"
        )}`
      );
    }

    // 4) Ghi hồ sơ enroll
    await userModel.enrollCourse(userId, courseId, enrollID_new, course);

    return res.redirect(
      `/courses/view-courses?toast=success&msg=${encodeURIComponent(
        "Mua khóa học thành công!"
      )}`
    );
  } catch (err) {
    console.error("buy-now error:", err);
    console.error("Error stack:", err.stack);
    return res.redirect(
      `/courses/view-courses?toast=error&msg=${encodeURIComponent(
        `Mua khóa học không thành công: ${err.message || "Lỗi không xác định"}`
      )}`
    );
  }
});

//video courses
router.get("/preview-lessons/:id", async (req, res) => {
  // Kiểm tra xem user đã đăng nhập chưa
  if (!req.session.authUser) {
    return res.redirect(
      `/account/signin?redirect=/courses/preview-lessons/${req.params.id}`
    );
  }

  const courseId = req.params.id;
  const userId = req.session.authUser.id;
  //const lessonId = req.query.lesson;

  const course = await coursesModel.findCourseById(courseId);
  const courseTitle = course.title;

  const listLessons = await coursesModel.getLessonsByCourse(courseId);

  let currentLessonId = req.query.lesson || null;
  if (!currentLessonId) {
    const last = await coursesModel.getLastLessonProgress(userId, courseId);
    currentLessonId = last?.lesson_id || (listLessons[0]?.id ?? null);
  }
  currentLessonId = String(currentLessonId);

  // Chọn bài hiện tại
  const currentIndex = listLessons.findIndex(
    (l) => String(l.id) === currentLessonId
  );
  const current_lesson = listLessons[currentIndex];
  if (!current_lesson) return res.sendStatus(404);

  const prog = await coursesModel.getProgress(userId, currentLessonId);
  const resume_seconds = Number(prog?.last_second || 0);

  const isYouTube = false;
  const embed_id = null;

  const localVideoUrl = `/media/lessons/${currentLessonId}/stream`;

  // prev/next
  const prev_lesson_id =
    currentIndex > 0 ? listLessons[currentIndex - 1].id : null;
  const next_lesson_id =
    currentIndex < listLessons.length - 1
      ? listLessons[currentIndex + 1].id
      : null;
  const des_current_lesson = current_lesson.description;

  res.render("vwCourses/dis_videoCourses", {
    title: courseTitle || "Khóa học",
    courseTitle,
    courseId,
    lessons: listLessons,
    current_lesson,
    prev_lesson_id,
    next_lesson_id,
    des_current_lesson,
    resume_seconds,
    embed_id,
    isYouTube,
    localVideoUrl,
  });
});
router.post("/save-progress", express.json(), async (req, res) => {
  // Kiểm tra xem user đã đăng nhập chưa
  if (!req.session.authUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user_id = req.session.authUser.id;
  const { lesson_id, seconds, completed } = req.body || {};
  console.log(
    `[POST /progress] Nhận từ user ${user_id}: bài ${lesson_id}, giây ${seconds}, completed=${completed}`
  );

  if (!lesson_id || typeof seconds !== "number" || seconds < 0) {
    return res.status(400).json({ message: "Bad payload" });
  }
  const result = await coursesModel.saveProgess(
    user_id,
    lesson_id,
    seconds,
    completed,
    new Date()
  );
  console.log("[DB RESULT]", result);

  res.json({ ok: true });
});
//search courses
router.get("/search", async (req, res) => {
  const rawQ = (req.query.q || "").trim();
  if (rawQ) req.session.lastSearchQuery = rawQ;
  const q = (req.session.lastSearchQuery || "").trim();

  if (!q) {
    return res.render("vwCourses/dis_courses", {
      title: "Tìm kiếm khóa học",
      q: "",
      empty: true,
      // KHÔNG truyền pages để template ẩn phân trang
    });
  }

  const terms = q
    .split(/\s+/)
    .map((t) => `${t}:*`)
    .join(" & ");

  const pageSize = 9;
  const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  const [{ total }, coursesRaw] = await Promise.all([
    coursesModel.countByQuery(terms),
    coursesModel.findCourseByQuery(terms, pageSize, offset),
  ]);

  // Áp dụng mapCourseFlags để thêm isFeatured, isNew, isOnSale
  const courses = mapCourseList(coursesRaw);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  // Log nhanh để bạn tự kiểm tra
  console.log("[SEARCH]", { q, total, page, totalPages });

  const pages = total > 0 ? buildPages(page, totalPages) : [];

  return res.render("vwCourses/dis_courses", {
    title: `Tìm kiếm: ${q}`,
    q,
    empty: total === 0,
    courses,
    pages, // <<— QUAN TRỌNG: truyền đúng tên biến `pages`
    // KHÔNG truyền selectedCategory để giữ link "?page=N" y như template
  });
});
router.get("/", async (req, res) => {
  // Kiểm tra nếu có parameter category, redirect đến view-courses

  const featuredCourses = await homeModel.getFeaturedCoursesThisWeek(); // 3-4 khóa học nổi bật trong tuần
  const mostViewed = await homeModel.getMostViewedCourses(); //
  const newest = await homeModel.getNewestCourses(); //
  if (newest) {
    console.log("có dữ liệu");
  } else {
    console.log("ko có dữ liệu");
  }
  const popularCategories = await homeModel.getHotCategories(); // lĩnh vực có nhiều người học nhất
  const popularCourses = await homeModel.getPopularCourses();
  res.render("home", {
    featuredCourses,
    mostViewed,
    newest,
    popularCategories,
    popularCourses,
  });

  //feedback
});
// THÊM KHÓA HỌC VÀO GIỎ HÀNG
router.post("/add-to-cart", async (req, res) => {
  if (!req.session.authUser) {
    return res
      .status(401)
      .json({ success: false, message: "Bạn cần đăng nhập" });
  }

  try {
    const userId = req.session.authUser.id;
    const courseId = req.body.course_id;
    await coursesModel.addToCart(userId, courseId);
    return res.json({
      success: true,
      message: "Đã thêm vào giỏ hàng thành công!",
    });
  } catch (err) {
    console.error("Lỗi khi thêm vào giỏ hàng:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi khi thêm vào giỏ hàng" });
  }
});
export default router;
