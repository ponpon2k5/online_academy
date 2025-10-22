// models/home.model.js
import db from "../utils/db.js";

export default {
    // Các khoá học nổi bật (xếp theo rating cao nhất)
    async getFeaturedCourses() {
        return db("courses")
            .where("status", "published")
            .orderBy("rating_avg", "desc")
            .limit(6);
    },

    // Các khoá học phổ biến (xếp theo số lượng học viên)
    async getPopularCourses() {
        return db("courses")
            .where("status", "published")
            .orderBy("students_count", "desc")
            .limit(6);
    },

    // Các khoá học mới nhất
    async getNewestCourses() {
        return db("courses")
            .where("status", "published")
            .orderBy("created_at", "desc")
            .limit(6);
    },

    // Các danh mục hot (dựa vào tổng học viên)
    async getHotCategories() {
        return db("courses")
            .select("category_id")
            .sum("students_count as total_students")
            .groupBy("category_id")
            .orderBy("total_students", "desc")
            .limit(4);
    }
};
