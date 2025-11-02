import { Router } from "express";
import { isInstructor, requireRole, ensureAuth } from "../middlewares/auth.js";
import {
  uploadVideo,
  uploadImage,
  uploadInstructorAvatar,
} from "../middlewares/uploads.js";
import db from "../utils/db.js";
import path from "path";
import userModel from "../models/user.model.js";

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

// Profile settings route - GET
r.get("/profile", isInstructor, async (req, res) => {
  try {
    const me = req.session.user;
    // Lấy thông tin từ bảng profiles
    const userProfile = await userModel.findById(me.id);

    if (!userProfile) {
      return res.status(404).send("Không tìm thấy hồ sơ");
    }

    // Lấy thông tin từ bảng instructors (liên kết với profiles qua id)
    // Bảng instructors sử dụng trường "id" làm primary key (giống với profiles.id)
    try {
      const instructorInfo = await db("instructors").where("id", me.id).first();

      if (instructorInfo) {
        userProfile.specialization =
          instructorInfo.specialization || userProfile.specialization;
        userProfile.experience_years =
          instructorInfo.experience_years !== null &&
          instructorInfo.experience_years !== undefined
            ? instructorInfo.experience_years
            : userProfile.experience_years;
      }
    } catch (instructorError) {
      // Bảng instructors có thể không tồn tại hoặc có lỗi
      console.log(
        "Could not load from instructors table:",
        instructorError.message
      );
      // Giữ nguyên giá trị từ profiles nếu có
    }

    res.render("instructor/profile", {
      layout: "admin",
      title: "Cài đặt hồ sơ",
      authUser: req.session.user,
      currentPage: "profile",
      user: userProfile,
      success: req.query.success || null,
      error: null,
    });
  } catch (error) {
    console.error("Error loading profile:", error);
    res.render("instructor/profile", {
      layout: "admin",
      title: "Cài đặt hồ sơ",
      authUser: req.session.user,
      currentPage: "profile",
      user: req.session.user,
      error: "Lỗi khi tải thông tin hồ sơ",
    });
  }
});

// Profile settings route - POST (Cập nhật hồ sơ)
r.post("/profile", isInstructor, async (req, res) => {
  try {
    const me = req.session.user;

    // Kiểm tra req.body tồn tại
    if (!req.body) {
      const userProfile = await userModel.findById(me.id).catch(() => me);
      return res.render("instructor/profile", {
        layout: "admin",
        title: "Cài đặt hồ sơ",
        authUser: req.session.user,
        currentPage: "profile",
        user: userProfile || me,
        error: "Lỗi: Không nhận được dữ liệu từ form",
      });
    }

    const { name, email, phone, specialization, experience_years, bio } =
      req.body || {};

    // Tạo object update
    const updateData = {};
    if (name !== undefined && name !== null && name.trim() !== "") {
      updateData.name = name.trim();
    }
    if (email !== undefined && email !== null && email.trim() !== "") {
      // Kiểm tra format email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        const userProfile = await userModel.findById(me.id).catch(() => me);
        return res.render("instructor/profile", {
          layout: "admin",
          title: "Cài đặt hồ sơ",
          authUser: req.session.user,
          currentPage: "profile",
          user: userProfile || me,
          error: "Email không hợp lệ",
        });
      }
      updateData.email = email.trim().toLowerCase();
    }
    if (phone !== undefined && phone !== null) {
      updateData.phone = phone.trim() || null;
    }
    if (bio !== undefined && bio !== null) updateData.bio = bio;

    // Tách dữ liệu cho 2 bảng: profiles và instructors
    const profileUpdate = {
      name: updateData.name,
      email: updateData.email,
      phone: updateData.phone,
      bio: updateData.bio,
    };

    // Xóa các trường undefined/null
    Object.keys(profileUpdate).forEach(
      (key) =>
        (profileUpdate[key] === undefined || profileUpdate[key] === null) &&
        delete profileUpdate[key]
    );

    // Cập nhật vào bảng profiles
    const result = await userModel.editUser({
      id: me.id,
      ...profileUpdate,
    });

    // Xử lý cập nhật vào bảng instructors (specialization và experience_years)
    const instructorUpdate = {};
    if (specialization !== undefined && specialization !== null) {
      instructorUpdate.specialization = specialization.trim() || null;
    }
    if (experience_years !== undefined && experience_years !== "") {
      instructorUpdate.experience_years = parseInt(experience_years) || 0;
    }

    // Xử lý cập nhật vào bảng instructors (specialization và experience_years)
    // Bảng instructors liên kết với profiles qua id (instructor_id hoặc id)
    if (Object.keys(instructorUpdate).length > 0) {
      try {
        // Tìm record với id (bảng instructors dùng id làm primary key, không có instructor_id)
        const existingInstructor = await db("instructors")
          .where("id", me.id)
          .first();

        if (existingInstructor) {
          // Cập nhật nếu đã có record
          await db("instructors").where("id", me.id).update(instructorUpdate);
        } else {
          // Tạo mới nếu chưa có
          await db("instructors").insert({
            id: me.id,
            ...instructorUpdate,
          });
        }
      } catch (instructorError) {
        // Bảng instructors có thể không tồn tại hoặc có lỗi
        console.error(
          "Error updating instructors table:",
          instructorError.message
        );
        // Vẫn tiếp tục vì đã cập nhật profiles thành công
      }
    }

    if (result === 0) {
      const userProfile = await userModel.findById(me.id);
      return res.render("instructor/profile", {
        layout: "admin",
        title: "Cài đặt hồ sơ",
        authUser: req.session.user,
        currentPage: "profile",
        user: userProfile,
        error: "Cập nhật không thành công",
      });
    }

    // Cập nhật session với thông tin mới
    const updatedProfile = await userModel.findById(me.id);

    // Lấy thông tin từ bảng instructors để cập nhật session (dùng trường id)
    try {
      const instructorInfo = await db("instructors").where("id", me.id).first();

      if (instructorInfo) {
        updatedProfile.specialization = instructorInfo.specialization;
        updatedProfile.experience_years = instructorInfo.experience_years;
      }
    } catch (instructorError) {
      console.log("Could not load instructor info:", instructorError.message);
    }

    Object.assign(req.session.user, {
      name: updatedProfile.name,
      full_name: updatedProfile.name,
      email: updatedProfile.email,
      phone: updatedProfile.phone,
      specialization: updatedProfile.specialization,
      experience_years: updatedProfile.experience_years,
      bio: updatedProfile.bio,
    });

    // Cũng cập nhật authUser nếu có
    if (req.session.authUser) {
      req.session.authUser.name = updatedProfile.name;
      req.session.authUser.email = updatedProfile.email;
    }

    res.redirect("/instructor/profile?success=Cập nhật hồ sơ thành công");
  } catch (error) {
    console.error("Error updating profile:", error);
    const me = req.session.user;
    const userProfile = await userModel.findById(me.id).catch(() => me);

    res.render("instructor/profile", {
      layout: "admin",
      title: "Cài đặt hồ sơ",
      authUser: req.session.user,
      currentPage: "profile",
      user: userProfile || me,
      error: "Lỗi khi cập nhật hồ sơ: " + error.message,
    });
  }
});

// Upload avatar route
r.post(
  "/profile/avatar",
  isInstructor,
  uploadInstructorAvatar.single("avatar"),
  async (req, res) => {
    try {
      const me = req.session.user;

      if (!req.file) {
        return res.redirect(
          "/instructor/profile?error=Không có file được chọn"
        );
      }

      // File đã được lưu bởi middleware, tên file là instructor_id.jpg
      // Không cần cập nhật database vì ảnh được lưu với tên file là ID

      res.redirect(
        "/instructor/profile?success=Cập nhật ảnh đại diện thành công"
      );
    } catch (error) {
      console.error("Error uploading avatar:", error);
      res.redirect("/instructor/profile?error=Lỗi khi cập nhật ảnh đại diện");
    }
  }
);

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

r.post(
  "/courses",
  isInstructor,
  uploadImage.single("hero_image"),
  async (req, res) => {
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
      // Nếu có file đã upload nhưng validation fail, xóa file
      if (req.file) {
        const fs = (await import("fs")).default;
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error("Error deleting uploaded file:", unlinkError);
        }
      }
      return res.status(400).send("Missing required fields");
    }

    try {
      // Xử lý ảnh đại diện: upload file hoặc dùng URL
      let heroImageUrl = null;
      if (req.file) {
        // Nếu có upload file, lưu tên file có extension (ví dụ: course_1234567890.jpg)
        // File được lưu trong statics/img và được serve qua /images/
        heroImageUrl = req.file.filename;
      } else if (hero_image_url && hero_image_url.trim()) {
        // Nếu không có file nhưng có URL, dùng URL
        heroImageUrl = hero_image_url.trim();
      }

      const courseData = {
        instructor_id: me.id,
        category_id,
        title,
        slug,
        short_desc,
        long_desc,
        hero_image_url: heroImageUrl,
        price: price ? Number(price) : 0,
        promo_price: promo_price ? Number(promo_price) : null,
        status: "draft",
      };

      const result = await db("courses").insert(courseData).returning("id");

      res.redirect("/instructor/courses");
    } catch (error) {
      console.error("Error creating course:", error);
      // Nếu có lỗi và đã upload file, xóa file đã upload
      if (req.file) {
        const fs = (await import("fs")).default;
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error("Error deleting uploaded file:", unlinkError);
        }
      }
      res.status(500).send("Error creating course: " + error.message);
    }
  }
);

r.get("/courses/:courseId/sections", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const course = await db("courses").where("id", courseId).first();
  if (!course) return res.status(404).send("Course not found");

  const sections = await db("course_sections")
    .where("course_id", courseId)
    .orderBy("sort_order", "asc");

  // Lấy tất cả bài học trong khóa học (bao gồm cả bài học không thuộc section nào)
  const allLessons = await db("lessons")
    .where("course_id", courseId)
    .orderBy("sort_order", "asc");

  // Lấy bài học không thuộc section nào
  const lessonsWithoutSection = allLessons.filter(
    (lesson) => !lesson.section_id
  );

  // Thêm số lượng bài học cho mỗi section
  const sectionsWithLessonCount = sections.map((section) => {
    const lessonCount = allLessons.filter(
      (lesson) => lesson.section_id === section.id
    ).length;
    return {
      ...section,
      lessonCount,
    };
  });

  res.render("instructor/sections_index", {
    layout: "admin",
    title: `Sections - ${course.title}`,
    authUser: req.session.user,
    currentPage: "instructor-courses",
    fromAdmin: req.query.from === "admin",
    course,
    sections: sectionsWithLessonCount,
    allLessons,
    lessonsWithoutSection,
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

r.get("/courses/:courseId/lessons/new", isInstructor, async (req, res) => {
  const { courseId } = req.params;
  const secs = await db("course_sections")
    .where("course_id", courseId)
    .orderBy("sort_order", "asc");
  res.render("instructor/lesson_new", {
    layout: "admin",
    title: "Add Lesson",
    authUser: req.session.user,
    currentPage: "instructor-courses",
    fromAdmin: req.query.from === "admin",
    courseId,
    sections: secs,
  });
});

r.get(
  "/courses/:courseId/sections/:sectionId/lessons",
  isInstructor,
  async (req, res) => {
    const { courseId, sectionId } = req.params;

    // Lấy thông tin course và section
    const course = await db("courses").where("id", courseId).first();
    const section = await db("course_sections").where("id", sectionId).first();

    if (!course || !section) {
      return res.status(404).send("Course or section not found");
    }

    // Lấy danh sách bài học trong section
    const lessons = await db("lessons")
      .where("course_id", courseId)
      .where("section_id", sectionId)
      .orderBy("sort_order", "asc");

    res.render("instructor/lessons_index", {
      layout: "admin",
      title: "Lessons in Section",
      authUser: req.session.user,
      currentPage: "instructor-courses",
      fromAdmin: req.query.from === "admin",
      course,
      section,
      lessons,
    });
  }
);

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
      youtube_url,
      video_source,
    } = req.body;

    if (!lesson) return res.status(400).send("Lesson title required");

    // Xử lý nguồn video: YouTube URL hoặc uploaded file
    let videoUrl = "";

    if (video_source === "upload") {
      // Nếu upload file video
      if (!req.file) {
        return res.status(400).send("Video file is required when uploading");
      }
      // Lưu chỉ tên file (không có prefix) - file được stream qua /media/lessons/:lessonId/stream
      videoUrl = req.file.filename;
    } else {
      // Nếu dùng YouTube URL (mặc định hoặc khi không có file)
      if (!youtube_url) {
        return res
          .status(400)
          .send("YouTube URL required when not uploading file");
      }

      // Validate YouTube URL
      const youtubeRegex =
        /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
      if (!youtubeRegex.test(youtube_url)) {
        return res.status(400).send("Invalid YouTube URL");
      }
      videoUrl = youtube_url;
    }

    // Tự động tính sort_order nếu không được cung cấp
    let finalSortOrder = 0;
    if (sort_order && Number(sort_order) > 0) {
      finalSortOrder = Number(sort_order);
    } else {
      // Lấy sort_order cao nhất trong section (hoặc course nếu không có section)
      const maxSortOrder = await db("lessons")
        .where("course_id", courseId)
        .where("section_id", section_id || null)
        .max("sort_order as max")
        .first();
      finalSortOrder = (maxSortOrder?.max || 0) + 1;
    }

    try {
      await db("lessons").insert({
        course_id: courseId,
        section_id: section_id || null,
        lesson,
        video_url: videoUrl,
        duration_seconds: duration_seconds ? Number(duration_seconds) : 0,
        is_preview: is_preview === "on",
        sort_order: finalSortOrder,
        description: description || null,
      });

      res.redirect(`/instructor/courses/${courseId}/sections`);
    } catch (error) {
      console.error("Error creating lesson:", error);
      // Nếu có lỗi và đã upload file, xóa file đã upload
      if (req.file) {
        const fs = (await import("fs")).default;
        const filePath = req.file.path;
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkError) {
          console.error("Error deleting uploaded file:", unlinkError);
        }
      }
      res.status(500).send("Error creating lesson: " + error.message);
    }
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
    currentPage: "instructor-courses",
    fromAdmin: req.query.from === "admin",
    course,
    categories: cats,
    _editor_head: ``,
    _editor_foot: ``,
  });
});

r.post(
  "/courses/:courseId/edit",
  isInstructor,
  uploadImage.single("hero_image"),
  async (req, res) => {
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

    try {
      // Xử lý ảnh đại diện: upload file mới hoặc giữ nguyên ảnh cũ
      let heroImageUrl = hero_image_url || null;
      if (req.file) {
        // Nếu có upload file mới, lưu tên file có extension
        const oldFilename = hero_image_url;
        heroImageUrl = req.file.filename;

        // Xóa ảnh cũ nếu có (tìm file trong statics/img)
        if (
          oldFilename &&
          !oldFilename.startsWith("/") &&
          !oldFilename.startsWith("http")
        ) {
          const fs = (await import("fs")).default;
          const imageDir = path.join(process.cwd(), "statics", "img");

          // Kiểm tra xem tên file cũ có extension không
          const hasExtension = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(
            oldFilename
          );

          if (hasExtension) {
            // Có extension, xóa trực tiếp
            const oldImagePath = path.join(imageDir, oldFilename);
            try {
              if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
              }
            } catch (unlinkError) {
              console.error("Error deleting old image:", unlinkError);
            }
          } else {
            // Không có extension, tìm với các extension khác nhau
            const extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
            for (const ext of extensions) {
              const oldImagePath = path.join(imageDir, oldFilename + ext);
              try {
                if (fs.existsSync(oldImagePath)) {
                  fs.unlinkSync(oldImagePath);
                  break; // Xóa file đầu tiên tìm thấy
                }
              } catch (unlinkError) {
                console.error("Error deleting old image:", unlinkError);
              }
            }
          }
        }
      }

      await db("courses")
        .where("id", courseId)
        .update({
          category_id,
          title,
          short_desc,
          long_desc,
          hero_image_url: heroImageUrl,
          price: price ? Number(price) : 0,
          promo_price: promo_price ? Number(promo_price) : null,
          updated_at: db.fn.now(),
        });

      res.redirect("/instructor/courses");
    } catch (error) {
      console.error("Error updating course:", error);
      // Nếu có lỗi và đã upload file, xóa file đã upload
      if (req.file) {
        const fs = (await import("fs")).default;
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error("Error deleting uploaded file:", unlinkError);
        }
      }
      res.status(500).send("Error updating course: " + error.message);
    }
  }
);

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
