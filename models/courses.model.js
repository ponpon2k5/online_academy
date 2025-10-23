import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
export default {
    count_all_courses({ categorySlug = null } = {}) {
        const q = db('courses as c')
            .join('categories as cat', 'c.category_id', 'cat.id')
            .whereRaw("c.status = ?::course_status", ['published'])
            .count({ total: '*' });

        if (categorySlug) q.andWhere('cat.slug', categorySlug);
        return q.first();
    },
    view_all_courses(categorySlug = null, sort = null, limit = 8, offset = 0) {
        const q = db('courses as c')
            .join('profiles as p', 'c.instructor_id', 'p.id')
            // Join danh mục CẤP 1
            .join('categories as parent', 'c.category_id', 'parent.id')
            .where('c.status', 'published')
            .select(
                db.raw('LEFT(parent.id, 4) as cat_prefix'), // 4 ký tự đầu của ID cấp 1 (cat1, cat2,…)
                'c.id',
                'c.title',
                'c.price',
                'c.promo_price',
                db.raw('COALESCE(c.promo_price, c.price) AS effective_price'),
                'c.hero_image_url',
                'c.short_desc',
                'p.name as instructor_name',
                'parent.name as category_name',
                'parent.slug as category_slug',
                'c.rating_avg',
                'c.rating_count',
                'c.students_count',
                'c.created_at'
            );

        // Lọc theo slug: chấp nhận cả slug cấp 1 (parent) lẫn slug cấp 2 (leaf)
        if (categorySlug) {
            q.andWhere(function () {
                this.where('parent.slug', categorySlug)
                    .orWhereExists(function () {
                        this.select(db.raw('1'))
                            .from('categories as leaf')
                            .whereRaw('leaf.parent_id = parent.id')
                            .andWhere('leaf.slug', categorySlug);
                    });
            });
        }

        // Sắp xếp
        if (sort) {
            switch (sort) {
                case 'rating_desc':
                    q.orderBy('c.rating_avg', 'desc').orderBy('c.rating_count', 'desc');
                    break;
                case 'price_asc':
                    q.orderBy('effective_price', 'asc').orderBy('c.id', 'desc');
                    break;
            }
        } else {
            q.orderBy('c.created_at', 'desc').orderBy('c.id', 'desc');
        }

        return q.limit(limit).offset(offset);
    },


    view_detail_course(courseId) {
        return db('courses as c')
            .join('profiles as p', 'c.instructor_id', 'p.id')

            .select('c.id', 'c.title', 'c.long_desc', 'c.hero_image_url',
                'c.price', 'c.rating_avg', 'c.students_count', 'c.promo_price', 'c.students_count',
                'c.created_at', 'c.updated_at', 'c.short_desc', 'c.rating_count',
                'p.name as instructor_name', 'p.role', 'p.avatar_url', 'p.bio', 'p.id as instructor_id')
            .where('c.id', courseId).first();
    },
    getInstructorProfile(instructorId) {
        return db('profiles')
            .where('id', instructorId)
            .first();
    },
    view_courses_same_category(courseId) {
        return db('courses as c')
            .join('enrollments as e', 'c.id', 'e.course_id')
            .join('courses as target', 'c.category_id', 'target.category_id')
            .where('target.id', courseId)
            .andWhere('c.id', '!=', courseId)
            .andWhereRaw("c.status = ?::course_status", ['published'])
            .groupBy('c.id')
            .select(
                'c.id',
                'c.title',
                'c.hero_image_url',
                'c.price',
                'c.promo_price',
                'c.students_count',
                db.raw('COUNT(e.id) as total_enrollments')
            )
            .orderBy('total_enrollments', 'desc')
            .limit(5);
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
                is_completed: !!completed,
                update_time: db.fn.now(),
            })
            .onConflict(['user_id', 'lesson_id'])
            .merge({
                last_second: db.raw('GREATEST(??.??, ?)', [TABLE, 'last_second', Math.floor(seconds)]),
                is_completed: db.raw('(??.??) OR ?', [TABLE, 'is_completed', !!completed]),
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
                'vp.is_completed',
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
                'vp.is_completed',
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
    },
    filter(cat_course) {
        return db('categories as cat')
            .joinRaw('JOIN courses AS c ON LEFT(cat.id, 4) = c.category_id')
            .select('c.title', 'c.hero_image_url', 'short_desc', 'c.id')
            .where('cat.slug', cat_course);
    },
    async topCategoriesThisWeek(limit = 5) {
        return await db('enrollments as e')
            .join('courses as c', 'e.course_id', 'c.id')
            .join('categories as cat', 'c.category_id', 'cat.id')
            .select('cat.id', 'cat.name')
            .count('e.id as total_enroll')
            .where('e.date_enrolled', '>=', db.raw("CURRENT_DATE - INTERVAL '7 days'"))
            .groupBy('cat.id', 'cat.name')
            .orderBy('total_enroll', 'desc')
            .limit(limit);
    },
    getFeedback(course_id) {
        return db('course_reviews as c')
            .join('profiles as p', 'p.id', 'c.user_id')
            .where('course_id', course_id)
            .select('c.description as des', 'p.name as name', 'p.role as role');
    }
}