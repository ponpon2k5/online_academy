import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
export default {
    view_all_courses() {
        return db('courses as c')
            .join('profiles as p', 'c.instructor_id', 'p.id')
            .join('categories as cat', 'c.category_id', 'cat.id')
            .select(
                'c.id',
                'c.title',
                'c.price',
                'c.hero_image_url',
                'c.short_desc',
                'p.name as instructor_name',
                'cat.name as category_name',
                'c.rating_avg',
                'c.students_count'
            );
    },

    view_detail_course(courseId) {
        return db('courses as c')
            .join('profiles as p', 'c.instructor_id', 'p.id')
            .select('c.id', 'c.title', 'c.long_desc', 'c.hero_image_url',
                'c.price', 'c.rating_avg', 'c.students_count',
                'p.name', 'p.role', 'p.avatar_url', 'p.bio')
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
    // THÊM KHOÁ HỌC VÀO GIỎ HÀNG
    addToCart(userId, courseId) {
        return db('shopping_cart_items')
            .insert({
                user_id: userId,
                course_id: courseId
            })
            .onConflict(['user_id', 'course_id'])
            .ignore();
    },
    // --- LẤY TẤT CẢ KHÓA HỌC TRONG GIỎ CỦA USER ---
    // (Query này join 3 bảng để lấy đủ thông tin cho template)
    getCartItems(userId) {
        return db('shopping_cart_items as sci')
            .join('courses as c', 'sci.course_id', 'c.id')
            .join('profiles as p', 'c.instructor_id', 'p.id') // Join để lấy tên giảng viên
            .where('sci.user_id', userId)
            .select(
                'c.id',
                'c.title as name',                      // Đổi tên 'title' thành 'name'
                'c.price',
                'c.hero_image_url as image_url',    // Đổi tên 'hero_image_url' thành 'image_url'
                'p.name as instructor_name'         // Lấy tên giảng viên
            );
            // Các tên 'name', 'image_url', 'instructor_name'
            [cite_start]// khớp với template shopping-cart.handlebars [cite: 42, 43, 44]
    },

    // --- XÓA 1 KHÓA HỌC KHỎI GIỎ HÀNG ---
    removeCartItem(userId, courseId) {
        return db('shopping_cart_items')
            .where('user_id', userId)
            .andWhere('course_id', courseId)
            .del();
    },
    // ---XỬ LÝ THANH TOÁN (CHECKOUT) ---
    checkout(userId, courseIds) {
        // Bắt đầu một transaction
        return db.transaction(async (trx) => {
            try {
                // 1. Lấy thông tin (đặc biệt là giá) của các khóa học
                const courses = await trx('courses')
                    .whereIn('id', courseIds)
                    .select('id', 'price');

                // 2. Chuẩn bị dữ liệu để insert vào 'enrollments'
                const enrollmentsData = courses.map(course => ({
                    user_id: userId,
                    course_id: course.id,
                    price_paid: course.price, // Lấy giá từ bảng 'courses'
                    // id, purchased_at, refunded sẽ dùng giá trị default
                }));

                // 3. Insert vào bảng enrollments
                // Dùng onConflict...ignore để bỏ qua nếu user đã lỡ mua rồi
                await trx('enrollments')
                    .insert(enrollmentsData)
                    .onConflict(['user_id', 'course_id'])
                    .ignore();

                // 4. Xóa các khóa học đó khỏi giỏ hàng
                await trx('shopping_cart_items')
                    .where('user_id', userId)
                    .whereIn('course_id', courseIds)
                    .del();
                
                // (Transaction sẽ tự động commit nếu không có lỗi)
            } catch (error) {
                // Nếu có lỗi, transaction sẽ tự động rollback
                console.error('Lỗi trong quá trình transaction checkout:', error);
                throw error; // Ném lỗi để route có thể bắt được
            }
        });
    }
}