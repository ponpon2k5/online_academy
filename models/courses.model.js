import db from "../utils/db.js";
import bcrypt from "bcryptjs";
export default {
  get_category() {
    return db("categories").whereIn("id", [
      "cat1",
      "cat2",
      "cat3",
      "cat4",
      "cat5",
    ]);
  },
  increaseViews(courseId) {
    return db("courses").where("id", courseId).increment("views", 1);
  },
  count_all_courses({ categorySlug = null } = {}) {
    const q = db("courses as c")
      .join("categories as cat", "c.category_id", "cat.id")
      .whereRaw("c.status = ?::course_status", ["published"])
      .count({ total: "*" });

    if (categorySlug) q.andWhere("cat.slug", categorySlug);
    return q.first();
  },

  view_detail_course(courseId) {
    return db("courses as c")
      .join("profiles as p", "c.instructor_id", "p.id")

      .select(
        "c.id",
        "c.title",
        "c.long_desc",
        "c.hero_image_url",
        "c.price",
        "c.rating_avg",
        "c.students_count",
        "c.promo_price",
        "c.students_count",
        "c.created_at",
        "c.updated_at",
        "c.short_desc",
        "c.rating_count",
        "p.name as instructor_name",
        "p.role",
        "p.avatar_url",
        "p.bio",
        "p.id as instructor_id"
      )
      .where("c.id", courseId)
      .first();
  },
  getInstructorProfile(instructorId) {
    return db("profiles")
      .where("id", instructorId)
      .first()
      .then(async (profile) => {
        if (!profile) return null;

        // Lấy thông tin từ bảng instructors (liên kết với profiles qua id)
        // Bảng instructors sử dụng trường "id" làm primary key
        try {
          const instructorInfo = await db("instructors")
            .where("id", instructorId)
            .first();

          if (instructorInfo) {
            profile.specialization = instructorInfo.specialization;
            profile.experience_years = instructorInfo.experience_years;
          }
        } catch (error) {
          // Bảng instructors có thể không tồn tại, bỏ qua
          console.log("Could not load from instructors table:", error.message);
        }

        return profile;
      });
  },
  view_courses_same_category(courseId, sort = "") {
    const q = db("courses as c")
      .join("enrollments as e", "c.id", "e.course_id")
      .join("courses as target", "c.category_id", "target.category_id")
      .leftJoin(
        db.raw(
          "(SELECT course_id, COUNT(*) as weekly_purchases " +
          " FROM enrollments WHERE purchased_at >= NOW() - INTERVAL '7 days' " +
          " GROUP BY course_id) as weekly"
        ),
        "c.id",
        "weekly.course_id"
      )
      .where("target.id", courseId)
      .andWhere("c.id", "!=", courseId)
      .andWhereRaw("c.status = ?::course_status", ["published"])
      .groupBy("c.id", "weekly.weekly_purchases")
      .select(
        "c.id",
        "c.title",
        "c.hero_image_url",
        "c.price",
        "c.promo_price",
        "c.students_count",
        "c.rating_avg",
        "c.rating_count",
        "c.created_at",
        "c.updated_at",
        "c.last_published_at",
        db.raw("COUNT(e.id) as total_enrollments"),
        db.raw("COALESCE(weekly.weekly_purchases, 0) as weekly_purchases")
      );


    switch (sort) {
      case "rating_desc":
        q.orderBy([{ column: "c.rating_avg", order: "desc" }, { column: "c.rating_count", order: "desc" }]);
        break;
      case "rating_asc":
        q.orderBy([{ column: "c.rating_avg", order: "asc" }, { column: "c.rating_count", order: "asc" }]);
        break;
      case "price_asc":
        // ưu tiên promo_price
        q.orderBy([
          db.raw("COALESCE(c.promo_price, c.price) asc"),
          { column: "c.price", order: "asc" },
        ]);
        break;
      case "price_desc":
        q.orderBy([
          db.raw("COALESCE(c.promo_price, c.price) desc"),
          { column: "c.price", order: "desc" },
        ]);
        break;

      default:
        // mặc định giữ logic cũ 
        q.orderBy([
          { column: "weekly_purchases", order: "desc" },
          { column: "total_enrollments", order: "desc" },
        ]);
    }

    return q.limit(5);
  },
  view_lesson_in_detail(courseId) {
    return db("lessons as l")
      .join("courses as c", "l.course_id", "c.id")
      .select("l.lesson", "l.duration_seconds")
      .where("c.id", courseId);
  },
  save_feedback(context) {
    const { course_id } = context;
    return db.transaction(async (trx) => {
      // Nếu muốn cho 1 user sửa review của chính họ, dùng upsert:
      await trx("course_reviews")
        .insert({
          course_id: context.course_id,
          user_id: context.user_id,
          description: context.description,
          rating: Number(context.rating),
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .onConflict(["course_id", "user_id"])
        .merge({
          description: context.description,
          rating: Number(context.rating),
          updated_at: trx.fn.now(),
        });

      // Recompute aggregate (an toàn & đúng tuyệt đối)
      const agg = await trx("course_reviews")
        .where("course_id", course_id)
        .avg({ avg: "rating" })
        .count({ cnt: "*" })
        .first();

      const rating_avg = Number(agg?.avg ?? 0);
      const rating_count = Number(agg?.cnt ?? 0);

      await trx("courses")
        .where("id", course_id)
        .update({
          rating_avg: trx.raw("ROUND(?, 2)", [rating_avg]),
          rating_count,
          updated_at: trx.fn.now(),
        });

      return { ok: true, rating_avg, rating_count };
    });
  },
  getFeedback(course_id) {
    return db("course_reviews as c")
      .join("profiles as p", "p.id", "c.user_id")
      .where("c.course_id", course_id)
      .select(
        "c.description as des",
        "c.rating",
        "c.created_at",
        "p.name as name",
        "p.role as role",
        "p.avatar_url"
      )
      .orderBy("c.created_at", "desc");
  },
  count_all_courses({ categorySlug = null } = {}) {
    const q = db("courses as c")
      .join("categories as parent", "c.category_id", "parent.id")
      .leftJoin("categories as leaf", "c.sub_category_id", "leaf.id")
      .whereRaw("c.status = ?::course_status", ["published"])
      .count({ total: "*" });

    if (categorySlug) {
      q.andWhere(function () {
        this.where("parent.slug", categorySlug).orWhere(
          "leaf.slug",
          categorySlug
        );
      });
    }
    return q.first();
  },
  getCategoriesTree() {
    // Lấy parent (level 1) + gộp con (level 2) vào mảng children
    return db("categories as p")
      .leftJoin("categories as c", "c.parent_id", "p.id")
      .where("p.level", 1)
      .select(
        "p.id",
        "p.name",
        "p.slug",
        db.raw(`
        COALESCE(
          json_agg(
            json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
            ORDER BY c.sort_order NULLS LAST
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS children
      `)
      )
      .groupBy("p.id", "p.name", "p.slug")
      .orderBy("p.sort_order", "asc"); // hoặc p.name
  },
  view_all_courses(categorySlug = null, sort = null, limit = 8, offset = 0) {
    const q = db("courses as c")
      .join("profiles as p", "c.instructor_id", "p.id")
      .join("categories as parent", "c.category_id", "parent.id")
      .leftJoin("categories as leaf", "c.sub_category_id", "leaf.id")
      .where("c.status", "published")
      .select(
        "c.id",
        "c.title",
        "c.price",
        "c.promo_price",
        db.raw("COALESCE(c.promo_price, c.price) AS effective_price"),
        "c.hero_image_url",
        "c.short_desc",
        "p.name as instructor_name",
        "parent.name as category_name",
        "parent.slug as category_slug",
        "leaf.name as sub_category_name",
        "leaf.slug as sub_category_slug",
        "c.rating_avg",
        "c.rating_count",
        "c.students_count",
        "c.created_at"
      );

    if (categorySlug) {
      q.andWhere(function () {
        this.where("parent.slug", categorySlug).orWhere("leaf.slug", categorySlug);
      });
    }

    switch (sort) {
      case "rating_desc":
        q.orderBy([{ column: "c.rating_avg", order: "desc" }, { column: "c.rating_count", order: "desc" }]);
        break;
      case "rating_asc":
        q.orderBy([{ column: "c.rating_avg", order: "asc" }, { column: "c.rating_count", order: "asc" }]);
        break;
      case "price_asc":
        // ưu tiên giá khuyến mãi nếu có
        q.orderByRaw("COALESCE(c.promo_price, c.price) ASC NULLS LAST")
          .orderBy("c.price", "asc");
        break;
      case "price_desc":
        q.orderByRaw("COALESCE(c.promo_price, c.price) DESC NULLS LAST")
          .orderBy("c.price", "desc");
        break;
      default:
        // mặc định: khóa học mới/cập nhật gần đây trước
        q.orderByRaw("COALESCE(c.last_published_at, c.updated_at, c.created_at) DESC NULLS LAST");
    }

    return q.limit(limit).offset(offset);
  },
  view_lessons_by_course_id(courseId) {
    return db("lessons")
      .where("course_id", courseId)
      .select("lesson", "video_url", "duration_seconds", "section_id");
  },
  view_detail_course_video(courseId) {
    return db("lessons")
      .join("courses", "lessons.course_id", "courses.id")
      .select(
        "courses.title as course_title",
        "lessons.lesson as lesson_title",
        "lessons.video_url"
      )
      .where("course_id", courseId)
      .first();
  },

  findCourseByQuery(terms, limit, offset) {
    return db("courses as c")
      .leftJoin(
        db.raw(
          "(SELECT course_id, COUNT(*) as weekly_purchases FROM enrollments WHERE purchased_at >= NOW() - INTERVAL '7 days' GROUP BY course_id) as weekly"
        ),
        "c.id",
        "weekly.course_id"
      )
      .join("profiles as p", "c.instructor_id", "p.id")
      .join("categories as parent", "c.category_id", "parent.id")
      .whereRaw("c.fts @@ to_tsquery(remove_accents(?))", [terms])
      .where("c.status", "published")
      .select(
        "c.id",
        "c.title",
        "c.price",
        "c.promo_price",
        db.raw("COALESCE(c.promo_price, c.price) AS effective_price"),
        "c.hero_image_url",
        "c.short_desc",
        "p.name as instructor_name",
        "parent.name as category_name",
        "parent.slug as category_slug",
        "c.rating_avg",
        "c.rating_count",
        "c.students_count",
        "c.created_at",
        "c.updated_at",
        "c.last_published_at",
        db.raw("COALESCE(weekly.weekly_purchases, 0) as weekly_purchases")
      )
      .orderByRaw(
        "COALESCE(c.last_published_at, c.updated_at, c.created_at) DESC NULLS LAST"
      )
      .limit(limit)
      .offset(offset);
  },

  // ÉP KIỂU INT ngay trong SQL để chắc chắn nhận số nguyên
  async countByQuery(terms) {
    const row = await db("courses")
      .whereRaw("fts @@ to_tsquery(remove_accents(?))", [terms])
      .count(db.raw("1")) // count(*)
      .first();

    // Nhiều bản PG + Knex trả về { count: '12' } hoặc { 'count': '12' }
    const total = Number(row?.count ?? 0);
    return { total };
  },
  findCourseById(courseId) {
    return db("courses").where("id", courseId).first();
  },

  getLessonsByCourse(courseId) {
    return db("lessons")
      .select(
        "id",
        "course_id",
        "lesson",
        "description",
        "video_url",
        "duration_seconds",
        "is_preview"
      )
      .where("course_id", courseId)
      .orderBy("id", "asc"); // nếu có cột "order" riêng thì order theo cột đó
  },

  getLessonById(courseId, lessonId) {
    return db("lessons").where({ course_id: courseId, id: lessonId }).first();
  },
  getLastLessonProgress(userId, courseId) {
    return db("video_progress as vp")
      .join("lessons as l", "l.id", "vp.lesson_id")
      .where("vp.user_id", userId)
      .andWhere("l.course_id", courseId)
      .orderBy("vp.update_time", "desc") // mới nhất theo thời gian cập nhật
      .orderBy("vp.last_second", "desc") // (phòng khi update_time trùng)
      .select("vp.lesson_id", "vp.last_second")
      .first();
  },
  getProgress(userId, currentLessonId) {
    return db("video_progress")
      .where({ user_id: userId, lesson_id: currentLessonId })
      .orderBy("last_second", "desc")
      .orderBy("update_time", "desc")
      .first();
  },
  saveProgess(user_id, lesson_id, seconds, completed) {
    const TABLE = "video_progress";
    return db(TABLE)
      .insert({
        user_id,
        lesson_id,
        last_second: Math.floor(seconds),
        is_completed: !!completed,
        update_time: db.fn.now(),
      })
      .onConflict(["user_id", "lesson_id"])
      .merge({
        last_second: Math.floor(seconds),
        is_completed: db.raw("(??.??) OR ?", [
          TABLE,
          "is_completed",
          !!completed,
        ]),
        update_time: db.fn.now(),
      })
      .returning([
        "user_id",
        "lesson_id",
        "last_second",
        "is_completed",
        "update_time",
      ]);
  },
  showProgress(user_id) {
    return db("video_progress as vp")
      .leftJoin("lessons as l", "vp.lesson_id", "l.id")
      .leftJoin("courses as c", "l.course_id", "c.id")
      .where("vp.user_id", user_id) // user_id là TEXT (vd 'p6')
      .select(
        "vp.last_second",
        "vp.is_completed",
        "l.id as lesson_id",
        "l.lesson as lesson_title",
        "c.id as course_id",
        "c.title as course_title",
        "c.hero_image_url as course_img"
      );
  },
  countProgress(userId) {
    return db("video_progress as vp")
      .leftJoin("lessons as l", "vp.lesson_id", "l.id")
      .leftJoin("courses as c", "l.course_id", "c.id")
      .where("vp.user_id", userId)
      .count({ total: "*" })
      .first();
  },

  countProgress(userId) {
    const row = db("video_progress as vp")
      .leftJoin("lessons as l", "vp.lesson_id", "l.id")
      .leftJoin("courses as c", "l.course_id", "c.id")
      .where("vp.user_id", userId)
      .count({ total: "*" })
      .first();

    return Number(row?.total ?? 0);
  },
  showProgressPaged(userId, limit, offset) {
    return db("video_progress as vp")
      .leftJoin("lessons as l", "vp.lesson_id", "l.id")
      .leftJoin("courses as c", "l.course_id", "c.id")
      .where("vp.user_id", userId)
      .select(
        "vp.last_second",
        "vp.is_completed",
        "vp.update_time",

        "l.id as lesson_id",
        "l.lesson as lesson_title",
        "l.video_url",
        "l.duration_seconds",
        "l.course_id",

        "c.title as course_title",
        "c.hero_image_url as course_img",
        "c.price as course_price"
      )
      .orderBy("c.title", "asc")
      .limit(limit)
      .offset(offset);
  },
  filter(cat_course) {
    return db("categories as cat")
      .joinRaw("JOIN courses AS c ON LEFT(cat.id, 4) = c.category_id")
      .select("c.title", "c.hero_image_url", "short_desc", "c.id")
      .where("cat.slug", cat_course);
  },
  async topCategoriesThisWeek(limit = 5) {
    return await db("enrollments as e")
      .join("courses as c", "e.course_id", "c.id")
      .join("categories as cat", "c.category_id", "cat.id")
      .select("cat.id", "cat.name")
      .count("e.id as total_enroll")
      .where(
        "e.date_enrolled",
        ">=",
        db.raw("CURRENT_DATE - INTERVAL '7 days'")
      )
      .groupBy("cat.id", "cat.name")
      .orderBy("total_enroll", "desc")
      .limit(limit);
  },
  getFeedback(course_id) {
    return db("course_reviews as c")
      .join("profiles as p", "p.id", "c.user_id")
      .where("course_id", course_id)
      .select("c.description as des", "p.name as name", "p.role as role");
  },
  // THÊM KHOÁ HỌC VÀO GIỎ HÀNG
  addToCart(userId, courseId) {
    return db("shopping_cart_items")
      .insert({
        user_id: userId,
        course_id: courseId,
      })
      .onConflict(["user_id", "course_id"])
      .ignore();
  },
  // --- LẤY TẤT CẢ KHÓA HỌC TRONG GIỎ CỦA USER ---
  // (Query này join 3 bảng để lấy đủ thông tin cho template)

  // --- XÓA 1 KHÓA HỌC KHỎI GIỎ HÀNG ---
  removeCartItem(userId, courseId) {
    return db("shopping_cart_items")
      .where("user_id", userId)
      .andWhere("course_id", courseId)
      .del();
  },
  // ---XỬ LÝ THANH TOÁN (CHECKOUT) ---
  checkout(userId, courseIds) {
    // Bắt đầu một transaction
    return db.transaction(async (trx) => {
      try {
        // 1. Lấy thông tin (đặc biệt là giá) của các khóa học
        const courses = await trx("courses")
          .whereIn("id", courseIds)
          .select("id", "price");

        // 2. Chuẩn bị dữ liệu để insert vào 'enrollments'
        const enrollmentsData = courses.map((course) => ({
          user_id: userId,
          course_id: course.id,
          price_paid: course.price, // Lấy giá từ bảng 'courses'
          // id, purchased_at, refunded sẽ dùng giá trị default
        }));

        // 3. Insert vào bảng enrollments
        // Dùng onConflict...ignore để bỏ qua nếu user đã lỡ mua rồi
        await trx("enrollments")
          .insert(enrollmentsData)
          .onConflict(["user_id", "course_id"])
          .ignore();

        // 4. Xóa các khóa học đó khỏi giỏ hàng
        await trx("shopping_cart_items")
          .where("user_id", userId)
          .whereIn("course_id", courseIds)
          .del();

        // (Transaction sẽ tự động commit nếu không có lỗi)
      } catch (error) {
        // Nếu có lỗi, transaction sẽ tự động rollback
        console.error("Lỗi trong quá trình transaction checkout:", error);
        throw error; // Ném lỗi để route có thể bắt được
      }
    });
  },
  getCartItems(userId) {
    return db("shopping_cart_items as sci")
      .join("courses as c", "sci.course_id", "c.id")
      .join("profiles as p", "c.instructor_id", "p.id") // Join để lấy tên giảng viên
      .where("sci.user_id", userId)
      .select(
        "c.id",
        "c.title as name", // Đổi tên 'title' thành 'name'
        "c.price",
        "c.hero_image_url as image_url", // Đổi tên 'hero_image_url' thành 'image_url'
        "p.name as instructor_name" // Lấy tên giảng viên
      );
    // Các tên 'name', 'image_url', 'instructor_name'
    [cite_start]; // khớp với template shopping-cart.handlebars [cite: 42, 43, 44]
  },
  getCartCount(userId) {
    return db("shopping_cart_items")
      .where("user_id", userId)
      .count({ n: "*" })
      .first()
      .then((r) => Number(r?.n || 0));
  },
};
