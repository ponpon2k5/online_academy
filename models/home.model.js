import db from "../utils/db.js";

export default {
    getFeaturedCoursesThisWeek() {
        return db('enrollments as e')
            .join('courses as c', 'e.course_id', 'c.id')
            .whereRaw("e.purchased_at >= NOW() - INTERVAL '7 days'")
            .andWhereRaw("c.status = ?::course_status", ["published"])
            .select(
                'c.id',
                'c.title',
                'c.hero_image_url',
                'c.price',
                'c.students_count',
                'c.rating_avg',
                'c.short_desc',
                'c.students_count',
                db.raw('COUNT(e.id) AS weekly_purchases')
            )
            .groupBy('c.id', 'c.title', 'c.hero_image_url', 'c.price')
            .orderBy('weekly_purchases', 'desc')
            .limit(3);
    },
    getMostViewedCourses() {
        return db('courses as c')
            .where('c.status', 'published')
            .select(
                'c.id',
                'c.title',
                'c.hero_image_url',
                'c.price',
                'c.students_count',
                'c.rating_avg',
                'c.short_desc',
                'c.students_count',
            )
            .groupBy('c.id', 'c.title', 'c.hero_image_url')
            .orderBy('c.views', 'desc')
            .limit(10);
    },


    getNewestCourses() {
        return db("courses")
            .where("status", "published")
            .orderByRaw("COALESCE(last_published_at, updated_at, created_at) DESC NULLS LAST")
            .limit(10);
    },

    getHotCategories() {
        return db('enrollments as e')
            .join('courses as c', 'e.course_id', 'c.id')
            .join('categories as cat', 'cat.id', 'c.category_id')
            .whereRaw("e.purchased_at >= NOW() - INTERVAL '7 days'")
            .andWhereRaw("c.status = ?::course_status", ['published'])
            .select('cat.id', 'cat.name')
            .count({ weekly_enrollments: 'e.id' })
            .groupBy('cat.id', 'cat.name')
            .orderBy('weekly_enrollments', 'desc')
            .limit(5);
    },
    async getHomeCategories() {
  const sql = `
    SELECT 
      p.id, 
      p.name, 
      p.slug,
      COALESCE(
        json_agg(
          json_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug
          ) ORDER BY c.sort_order
        ) FILTER (WHERE c.id IS NOT NULL),
      '[]') AS children
    FROM public.categories p
    LEFT JOIN public.categories c 
         ON c.parent_id = p.id AND c.level = 2
    WHERE p.level = 1
    GROUP BY p.id, p.name, p.slug
    ORDER BY p.sort_order
    LIMIT 4;
  `;
  const result = await db.raw(sql);
  return result.rows;
},
};
