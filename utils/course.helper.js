// utils/course.helper.js
export function mapCourseFlags(course) {
    return {
        ...course,
        isFeatured: Number(course.weekly_purchases || 0) > 0,
        isNew: course.last_published_at || course.updated_at || course.created_at,
        isOnSale: course.promo_price && course.promo_price < course.price
    };
}

export function mapCourseList(list) {
    return list.map(c => mapCourseFlags(c));
}
