import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
export default {
    view_all_courses() {
        return db('courses').select('id', 'title', 'price', 'hero_image_url', 'long_desc', 'short_desc');
    },
    view_detail_course(courseId) {
        return db('courses as c')
            .select('c.id', 'c.title', 'c.long_desc', 'c.hero_image_url',
                'c.price', 'c.rating_avg', 'c.students_count')
            .where('c.id', courseId).first();
    },
    view_lesson_in_detail(courseId) {
        return db('lessons as l')
            .join('courses as c', 'l.course_id', 'c.id')
            .select('l.lesson', 'l.duration_seconds')
            .where('c.id', courseId);
    },
    save_feedback(context) {
        return db('course_reviews').insert(context);
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
    findCourseByQuery(query) {
        return db('courses')
            .whereRaw('fts @@ to_tsquery(remove_accents(?))', [query]);
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
    },
    showProgress(user_id) {
        return db('video_progress as vp')
            .leftJoin('lessons as l', 'vp.lesson_id', 'l.id')
            .leftJoin('courses as c', 'l.course_id', 'c.id')
            .where('vp.user_id', user_id)            // user_id là TEXT (vd 'p6')
            .select(
                'vp.last_second',
                db.raw('vp."isCompleted" as "isCompleted"'),  // cột có chữ hoa -> cần quote
                'l.id as lesson_id',
                'l.lesson as lesson_title',
                'c.id as course_id',
                'c.title as course_title',
                'c.hero_image_url as course_img'
            );
    },
    countProgress(userId) {
        return db('video_progress as vp')
            .leftJoin('lessons as l', 'vp.lesson_id', 'l.id')
            .leftJoin('courses as c', 'l.course_id', 'c.id')
            .where('vp.user_id', userId)
            .count({ total: '*' })
            .first();
    },

    countProgress(userId) {
        const row = db('video_progress as vp')
            .leftJoin('lessons as l', 'vp.lesson_id', 'l.id')
            .leftJoin('courses as c', 'l.course_id', 'c.id')
            .where('vp.user_id', userId)
            .count({ total: '*' })
            .first();

        return Number(row?.total ?? 0);
    },
    showProgressPaged(userId, limit, offset) {
        return db('video_progress as vp')
            .leftJoin('lessons as l', 'vp.lesson_id', 'l.id')
            .leftJoin('courses as c', 'l.course_id', 'c.id')
            .where('vp.user_id', userId)
            .select(
                'vp.last_second',
                db.raw('vp."isCompleted" as "isCompleted"'),
                'vp.update_time',

                'l.id as lesson_id',
                'l.lesson as lesson_title',
                'l.video_url',
                'l.duration_seconds',
                'l.course_id',

                'c.title as course_title',
                'c.hero_image_url as course_img',
                'c.price as course_price'
            )
            .orderBy('c.title', 'asc')
            .limit(limit)
            .offset(offset);
    }

}