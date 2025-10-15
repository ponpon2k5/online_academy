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
    const list = await coursesModel.view_all_courses();
    res.render('vwCourses/dis_courses', {
        list: list
    });
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
    if (course) {
        console.log('Xuất thông tin thành công');
        console.log('Course detail:', course);
    }
    res.render('vwCourses/dis_detailCourse', {
        course: course
    });
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
        return res.render('vwCourses/dis_courses', {
            error: 'Mua khóa học không thành công'
        });
    }
    res.redirect('/courses/view-courses');
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
    console.log(`[DB] ✅ Đã lưu tiến độ: user=${user_id}, lesson=${lesson_id}, seconds=${seconds}`);

    res.json({ ok: true });
});

export default router;
