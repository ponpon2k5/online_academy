import express from 'express';
import coursesModel from '../models/courses.model.js'
import userModel from '../models/user.model.js'
import db from '../utils/db.js'

//const player = new Plyr('#player');
const router = express.Router();
//function
async function totalEnrollment() {
    const row = await db('enrollments').count('* as cnt').first();
    // row.cnt có thể là string => ép về number
    return Number(row?.cnt ?? 0);
}

//view courses
router.get('/view-courses', async (req, res) => {
    try {
        let cat_course = req.query.category || null;

        //if (cat_course && cat_course.length > 4) {
        //    cat_course = cat_course.slice(0, -2); // bỏ 2 ký tự cuối
        //}
        console.log(cat_course)
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const offset = (page - 1) * limit;

        let courses = [];
        let totalCount = 0;

        if (cat_course) {
            // Nếu có filter category
            const filteredCourses = await coursesModel.filter(cat_course);
            totalCount = filteredCourses.length;
            courses = filteredCourses.slice(offset, offset + limit);
        } else {
            // Lấy tất cả khóa học
            const allCourses = await coursesModel.view_all_courses();
            totalCount = allCourses.length;
            courses = allCourses.slice(offset, offset + limit);
        }

        const totalPages = Math.ceil(totalCount / limit);

        // Tạo danh sách trang để render
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            pages.push({
                number: i,
                active: i === page
            });
        }

        res.render('vwCourses/dis_courses', {
            courses,
            currentPage: page,
            totalPages,
            pages,
            selectedCategory: cat_course
        });
    } catch (err) {
        console.error('Lỗi khi hiển thị khóa học:', err);
        res.status(500).send('Lỗi máy chủ');
    }
});


//enroll course
router.post('/enroll-course', async (req, res) => {
    if (!req.session.authUser) {
        // Redirect to login or show an error
        return res.redirect('/account/login'); // or your login route
    }
    const userId = req.session.authUser.id;
    const courseId = req.body.course_id;

    await coursesModel.enrollCourse(userId, courseId);
    res.redirect('/courses/view-courses'); // Redirect to the purchased courses page after enrollment
});

//course detail
router.get('/course-detail/:id', async (req, res) => {
    const courseId = req.params.id;
    const course = await coursesModel.view_detail_course(courseId);
    const lessons = await coursesModel.view_lesson_in_detail(courseId)
    if (course) {
        console.log('Xuất thông tin thành công');
        console.log('Course detail:', course);
    }
    res.render('vwCourses/dis_detailCourse', {
        course: course,
        lessons: lessons
    });
});
router.post('/course-detail/:id', async (req, res) => {

    const courseId = req.params.id;
    const userId = req.session.authUser.id;
    const comment = req.body.comment;                   // ✅ lấy cả rating & comment

    const payload = {
        course_id: String(courseId),
        user_id: String(userId),
        description: comment.trim(),
    };
    try {
        const result = await coursesModel.save_feedback(payload);
        console.log('Kết quả insert:', result);
    } catch (e) {
        console.error('Lỗi khi insert:', e.message, e.detail, e.code);
    }
    return res.redirect(`/courses/course-detail/${courseId}#feedback`); // ✅ courseId tồn tại

});
//purchase course
router.get('/purchase-courses/:id', async (req, res) => {
    const courseId = req.params.id;
    const course = await coursesModel.view_detail_course(courseId);
    const lessons = await coursesModel.view_lessons_by_course_id(courseId);
    res.render('vwCourses/purchase_courses', {
        course: course,
        lessons: lessons
    });
});

router.post('/purchase-courses-process/:id', async (req, res) => {
    const courseId = req.params.id;
    const userId = req.session.authUser.id;
    const enrollID = await totalEnrollment();
    const enrollID_new = "e" + (enrollID + 1);

    const course = await userModel.findCourseByID(courseId);
    const result = await userModel.enrollCourse(userId, courseId, enrollID_new, course);

    if (result === 0) {
        return res.redirect(`/courses/view-courses?toast=error&msg=${encodeURIComponent('Mua khóa học không thành công')}`);
    }
    return res.redirect(`/courses/view-courses?toast=success&msg=${encodeURIComponent('Mua khóa học thành công!')}`);
});

//video courses
router.get('/preview-lessons/:id', async (req, res) => {
    const courseId = req.params.id;
    const userId = req.session.authUser.id;
    //const lessonId = req.query.lesson;

    const course = await coursesModel.findCourseById(courseId);
    const courseTitle = course.title

    const listLessons = await coursesModel.getLessonsByCourse(courseId);
    const currentLessonId = req.query.lesson || (listLessons[0]?.id ?? null); //truy cập id của phần tử đầu tiên, nếu không có gì cả (mảng rỗng), gán null
    const currentIndex = listLessons.findIndex(l => l.id === currentLessonId);
    const current_lesson = listLessons[currentIndex];
    console.log(`[Preview] User ${userId} đang mở bài học: ${current_lesson?.lesson} (ID: ${currentLessonId})`);

    //tiến độ học tập
    const prog = await coursesModel.getProgress(userId, currentLessonId);
    const resume_seconds = prog?.last_second || 0;
    console.log(`[Progress] Tiến độ trước đó của user ${userId} cho bài ${currentLessonId}: ${resume_seconds}s`);

    const embed_id = (() => {
        const url = current_lesson.video_url || '';
        const m1 = url.match(/youtu\.be\/([^?]+)/);
        const m2 = url.match(/[?&]v=([^&]+)/);
        const m3 = url.match(/embed\/([^?]+)/);
        return (m1?.[1] || m2?.[1] || m3?.[1] || url); // nếu đã lưu sẵn ID thì trả luôn url
    })();

    //nhấn nút next/ prev video
    const prev_lesson_id = currentIndex > 0 ? listLessons[currentIndex - 1].id : null;
    const next_lesson_id = currentIndex < listLessons.length - 1 ? listLessons[currentIndex + 1].id : null;

    const des_current_lesson = current_lesson.description;

    res.render('vwCourses/dis_videoCourses', {
        courseTitle,
        courseId,
        lessons: listLessons,
        current_lesson,
        prev_lesson_id,
        next_lesson_id,
        des_current_lesson,
        resume_seconds
    });
});
router.post('/save-progress', express.json(), async (req, res) => {
    const user_id = req.session.authUser.id;
    const { lesson_id, seconds, completed } = req.body || {};
    console.log(`[POST /progress] Nhận từ user ${user_id}: bài ${lesson_id}, giây ${seconds}, completed=${completed}`);

    if (!lesson_id || typeof seconds !== 'number' || seconds < 0) {
        return res.status(400).json({ message: 'Bad payload' });
    }
    await coursesModel.saveProgess(user_id, lesson_id, seconds, completed, new Date());
    console.log(`[DB] Đã lưu tiến độ: user=${user_id}, lesson=${lesson_id}, seconds=${seconds}`);

    res.json({ ok: true });
});
//search courses
router.get('/search', async (req, res) => {
    const query = req.query.q || '';
    const terms = query.trim().split(/\s+/).map(t => `${t}:*`).join(' & ');
    const courses = await coursesModel.findCourseByQuery(terms);
    if (query.length === 0) {
        console.log("Không có khóa học nào");
        res.render("vwCourses/search_courses", {
            q: query,
            empty: true
        })
    }
    else {
        console.log("Đã tìm thấy khóa học nào");
        res.render("vwCourses/search_courses", {
            q: query,
            empty: false,
            courses: courses
        })
    }
});
router.get('/', async (req, res) => {
    const featuredCourses = await coursesModel.getFeaturedCourses(); // 3-4 khóa học nổi bật trong tuần
    const mostViewed = await coursesModel.getMostViewedCourses(); // top 10
    const newest = await coursesModel.getNewestCourses(); // top 10
    const popularCategories = await coursesModel.getPopularCategories(); // lĩnh vực có nhiều người học nhất

    res.render('vwHome/index', {
        featuredCourses,
        mostViewed,
        newest,
        popularCategories
    });
});

// THÊM KHÓA HỌC VÀO GIỎ HÀNG
router.post('/add-to-cart', async (req, res) => {
    if (!req.session.authUser) {
    return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
  }

  try {
    const userId = req.session.authUser.id;
    const courseId = req.body.course_id;
    await coursesModel.addToCart(userId, courseId);
    return res.json({ success: true, message: 'Đã thêm vào giỏ hàng thành công!' });
  } catch (err) {
    console.error('Lỗi khi thêm vào giỏ hàng:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi thêm vào giỏ hàng' });
  }
});

// --- ROUTE MỚI: MUA NGAY (Thêm vào giỏ và chuyển hướng) ---
router.post('/buy-now', async (req, res) => {
    // 1. Kiểm tra đã đăng nhập chưa
    if (!req.session.authUser) {
        return res.redirect('/account/signin');
    }

    try {
        const userId = req.session.authUser.id;
        const courseId = req.body.course_id;

        // 2. Thêm vào giỏ hàng (để đảm bảo nó có trong giỏ)
        await coursesModel.addToCart(userId, courseId);
        
        // 3. Chuyển hướng thẳng đến trang giỏ hàng
        return res.redirect('/account/shopping-cart');

    } catch (err) {
        console.error('Lỗi khi xử lý Mua ngay:', err);
        const msg = encodeURIComponent('Có lỗi xảy ra, vui lòng thử lại.');
        // Redirect lại trang chi tiết với thông báo lỗi
        return res.redirect(`/courses/course-detail/${req.body.course_id}?toast=error&msg=${msg}`);
    }
});

export default router;
