// utils/course.helper.js
export function mapCourseFlags(course) {
  // Kiểm tra khóa học mới (trong 30 ngày gần đây)
  const now = new Date();
  const publishDate = course.last_published_at
    ? new Date(course.last_published_at)
    : course.updated_at
    ? new Date(course.updated_at)
    : course.created_at
    ? new Date(course.created_at)
    : null;

  const daysDiff = publishDate
    ? Math.floor((now - publishDate) / (1000 * 60 * 60 * 24))
    : 999;

  return {
    ...course,
    isFeatured: Number(course.weekly_purchases || 0) > 0,
    isNew: daysDiff <= 30, // Khóa học mới trong 30 ngày
    isOnSale: course.promo_price && course.promo_price < course.price,
  };
}

export function mapCourseList(list) {
  return list.map((c) => mapCourseFlags(c));
}
