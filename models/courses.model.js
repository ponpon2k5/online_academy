import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
export default {
    view_all_courses() {
        return db('courses').select('id', 'title', 'price', 'hero_image_url', 'long_desc', 'short_desc');
    },
    view_detail_course(courseId) {
        return db('courses').where('id', courseId).first();
    },
    view_lessons_by_course_id(courseId) {
        return db('lessons').where('course_id', courseId).select('lesson', 'video_url', 'duration_seconds', 'section_id');
    },
    view_detail_course_video(courseId) {
        return db('lessons')
            .join('courses', 'lessons.course_id', 'courses.id')
            .select('courses.title as course_title', 'lessons.lesson as lesson_title', 'lessons.video_url')
            .where('course_id', courseId).first();
    },
    findCourseById(courseId) {
        return db('courses').where('id', courseId).first();
    },

    getLessonsByCourse(courseId) {
        return db('lessons')
            .select('id', 'course_id', 'lesson', 'description', 'video_url', 'duration_seconds', 'is_preview')
            .where('course_id', courseId)
            .orderBy('id', 'asc'); // nếu có cột "order" riêng thì order theo cột đó
    },

    getLessonById(courseId, lessonId) {
        return db('lessons')
            .where({ course_id: courseId, id: lessonId })
            .first();
    },
    getProgress(userId, currentLessonId) {
        return db('video_progress')
            .where({ user_id: userId, lesson_id: currentLessonId })
            .first();
    },
    saveProgess(user_id, lesson_id, seconds, completed) {
        const TABLE = 'video_progress'; 
        return db('video_progress')
            .insert({
                user_id,
                lesson_id,
                last_second: Math.floor(seconds),
                isCompleted: !!completed, // đổi thành 'isCompleted' nếu cột của bạn đặt như vậy
                update_time: db.fn.now(),
            })
            .onConflict(['user_id', 'lesson_id'])
            .merge({
                last_second: db.raw('GREATEST(??.??, ?)', [TABLE, 'last_second', Math.floor(seconds)]),
                isCompleted: db.raw('(??.??) OR ?', [TABLE, 'isCompleted', !!completed]),
                update_time: db.fn.now(),
            });
    }
}