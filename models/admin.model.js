// models/admin.model.js
import db from "../utils/db.js";

export default {
    // Lấy toàn bộ danh mục
    getAllCategories() {
        return db("categories").select("*").orderBy("id", "asc");
    },

    // Lấy toàn bộ danh mục cha (để chọn parent)
    getParentCategories(excludeId = null) {
        const query = db("categories").select("id", "name").orderBy("name");
        if (excludeId) query.whereNot("id", excludeId);
        return query;
    },

    // Lấy 1 danh mục theo ID
    getCategoryById(id) {
        return db("categories").where({ id }).first();
    },

    // Thêm danh mục mới
    addCategory(category) {
        return db("categories").insert(category);
    },

    // Cập nhật danh mục
    updateCategory(id, category) {
        return db("categories").where({ id }).update(category);
    },

    // Xoá danh mục
    deleteCategory(id) {
        return db("categories").where({ id }).del();
    },
};
