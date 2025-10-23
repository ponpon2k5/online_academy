import express from 'express';
import coursesModel from '../models/courses.model.js'
import userModel from '../models/user.model.js'
import homeModel from '../models/home.model.js';
import db from '../utils/db.js'

//const player = new Plyr('#player');
const router = express.Router();
//function
async function totalEnrollment() {
    const row = await db("enrollments").count("* as cnt").first();
    // row.cnt có thể là string => ép về number
    return Number(row?.cnt ?? 0);
}
async function isEnrolled(userId, courseId) {
    const row = await db('enrollments')
        .where({ user_id: userId, course_id: courseId })
        .first();
    return !!row;
}
//view courses
router.get('/view-courses', async (req, res) => {
    try {
        const categorySlug = req.query.category || null;
        const sort = req.query.sort || null;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = 6;
        const offset = (page - 1) * limit;

        // Đếm tổng số khóa học (đồng bộ tiêu chí với list)
        const countResult = await coursesModel.count_all_courses({ categorySlug });
        const totalCount = Number(countResult?.total || 0);
        const totalPages = Math.max(Math.ceil(totalCount / limit), 1);

        // Lấy danh sách khóa học trang hiện tại
        const courses = await coursesModel.view_all_courses(
            categorySlug,
            sort,
            limit,
            offset
        );

        // Tạo mảng trang
        const pages = Array.from({ length: totalPages }, (_, i) => ({
            number: i + 1,
            active: i + 1 === page,
        }));

        // Render duy nhất 1 lần
        return res.render('vwCourses/dis_courses', {
            courses,
            pages,
            currentPage: page,
            totalPages,
            selectedCategory: categorySlug,
            selectedSort: sort,
        });
    } catch (err) {
        console.error('Lỗi khi hiển thị khóa học:', err);
        return res.status(500).send('Lỗi máy chủ');
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
router.get('/course-detail/:id', async (req, res) => {
    const courseId = req.params.id;
    const userId= req.session.authUser.id;
    console.log(courseId)
    console.log(userId)
    const course = await coursesModel.view_detail_course(courseId);
    const lessons = await coursesModel.view_lesson_in_detail(courseId);
    const feedback = await coursesModel.getFeedback(courseId);
    const sameCourseCategory = await coursesModel.view_courses_same_category(courseId);
    const existed = await isEnrolled(userId, courseId);
    console.log(existed)
    const instructor_id = course.instructor_id;
    const instructor = await coursesModel.getInstructorProfile(instructor_id);
    res.render('vwCourses/dis_detailCourse', {
        course: course,
        lessons: lessons,
        feedbacks: feedback,
        relatedCourses: sameCourseCategory,
        instructor: instructor,
        existed
    });
});
router.post("/course-detail/:id", async (req, res) => {
    const courseId = req.params.id;
    const userId = req.session.authUser.id;
    const comment = req.body.comment; // ✅ lấy cả rating & comment

    const payload = {
        course_id: String(courseId),
        user_id: String(userId),
        description: comment.trim(),
    };
    try {
        const result = await coursesModel.save_feedback(payload);
        console.log("Kết quả insert:", result);
    } catch (e) {
        console.error("Lỗi khi insert:", e.message, e.detail, e.code);
    }
    return res.redirect(`/courses/course-detail/${courseId}#feedback`); // ✅ courseId tồn tại
});
//purchase course
router.get("/purchase-courses/:id", async (req, res) => {
    const courseId = req.params.id;
    const course = await coursesModel.view_detail_course(courseId);
    const lessons = await coursesModel.view_lessons_by_course_id(courseId);
    res.render("vwCourses/purchase_courses", {
        course: course,
        lessons: lessons,
    });
});

router.post("/purchase-courses-process/:id", async (req, res) => {
    try {
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
        const enrollID = await totalEnrollment();           // nếu bạn vẫn cần
        const enrollID_new = "e" + (enrollID + 1);         // tránh race condition bằng sequence/uuid

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

//video courses
router.get("/preview-lessons/:id", async (req, res) => {
    const courseId = req.params.id;
    const userId = req.session.authUser.id;
    //const lessonId = req.query.lesson;

    const course = await coursesModel.findCourseById(courseId);
    const courseTitle = course.title;

    const listLessons = await coursesModel.getLessonsByCourse(courseId);
    const currentLessonId = req.query.lesson || (listLessons[0]?.id ?? null); //truy cập id của phần tử đầu tiên, nếu không có gì cả (mảng rỗng), gán null
    const currentIndex = listLessons.findIndex((l) => l.id === currentLessonId);
    const current_lesson = listLessons[currentIndex];
    console.log(
        `[Preview] User ${userId} đang mở bài học: ${current_lesson?.lesson} (ID: ${currentLessonId})`
    );

    //tiến độ học tập
    const prog = await coursesModel.getProgress(userId, currentLessonId);
    const resume_seconds = prog?.last_second || 0;
    console.log(
        `[Progress] Tiến độ trước đó của user ${userId} cho bài ${currentLessonId}: ${resume_seconds}s`
    );

    const embed_id = (() => {
        const url = current_lesson.video_url || "";
        const m1 = url.match(/youtu\.be\/([^?]+)/);
        const m2 = url.match(/[?&]v=([^&]+)/);
        const m3 = url.match(/embed\/([^?]+)/);
        return m1?.[1] || m2?.[1] || m3?.[1] || url; // nếu đã lưu sẵn ID thì trả luôn url
    })();

    //nhấn nút next/ prev video
    const prev_lesson_id =
        currentIndex > 0 ? listLessons[currentIndex - 1].id : null;
    const next_lesson_id =
        currentIndex < listLessons.length - 1
            ? listLessons[currentIndex + 1].id
            : null;

    const des_current_lesson = current_lesson.description;

    res.render("vwCourses/dis_videoCourses", {
        courseTitle,
        courseId,
        lessons: listLessons,
        current_lesson,
        prev_lesson_id,
        next_lesson_id,
        des_current_lesson,
        resume_seconds,
        embed_id,
    });
});
router.post("/save-progress", express.json(), async (req, res) => {
    const user_id = req.session.authUser.id;
    const { lesson_id, seconds, completed } = req.body || {};
    console.log(
        `[POST /progress] Nhận từ user ${user_id}: bài ${lesson_id}, giây ${seconds}, completed=${completed}`
    );

    if (!lesson_id || typeof seconds !== "number" || seconds < 0) {
        return res.status(400).json({ message: "Bad payload" });
    }
    await coursesModel.saveProgess(
        user_id,
        lesson_id,
        seconds,
        completed,
        new Date()
    );
    console.log(
        `[DB] Đã lưu tiến độ: user=${user_id}, lesson=${lesson_id}, seconds=${seconds}`
    );

    res.json({ ok: true });
});
//search courses
router.get('/search', async (req, res) => {
    const query = req.query.q || '';
    const terms = query.trim().split(/\s+/).map(t => `${t}:*`).join(' & ');
    const courses = await coursesModel.findCourseByQuery(terms);
    if (query.length === 0) {
        console.log("Không có khóa học nào");
        res.render("vwCourses/dis_courses", {
            q: query,
            empty: true
        })
    }
    else {
        console.log("Đã tìm thấy khóa học nào");
        res.render("vwCourses/dis_courses", {
            q: query,
            empty: false,
            courses: courses
        })
    }
});
router.get('/', async (req, res) => {
    const featuredCourses = await homeModel.getFeaturedCourses(); // 3-4 khóa học nổi bật trong tuần
    const mostViewed = await coursesModel.getMostViewedCourses(); // 
    const newest = await homeModel.getNewestCourses(); // 
    if (newest) {
        console.log("có dữ liệu")
    }
    else {
        console.log("ko có dữ liệu")
    }
    const popularCategories = await homeModel.getHotCategories(); // lĩnh vực có nhiều người học nhất
    const popularCourses = await homeModel.getPopularCourses();
    res.render('home', {
        featuredCourses,
        mostViewed,
        newest,
        popularCategories,
        popularCourses
    });

    //feedback

    res.render("vwHome/index", {
        featuredCourses,
        mostViewed,
        newest,
        popularCategories,
    });
});
export default router;
