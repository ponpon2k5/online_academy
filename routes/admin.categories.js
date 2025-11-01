// routes/admin.categories.js
import express from "express";
import slugify from "slugify";
import adminModel from "../models/admin.model.js";
import { isAdmin } from "../middlewares/auth.js";

const router = express.Router();

// Guard all category routes to admin only
router.use(isAdmin);

//Danh sách category
router.get("/", async (req, res) => {
  try {
    const rows = await adminModel.getAllCategories();

    // Tạo map để tra cứu parent name nhanh
    const categoryMap = new Map();
    rows.forEach((cat) => categoryMap.set(cat.id, cat.name));

    // Thêm parent_name vào mỗi category
    const categoriesWithParent = rows.map((cat) => ({
      ...cat,
      parent_name: cat.parent_id
        ? categoryMap.get(cat.parent_id) || "N/A"
        : null,
    }));

    res.render("admin/categories/index", {
      layout: "admin",
      title: "Categories",
      authUser: req.session.user,
      currentPage: "categories",
      categories: categoriesWithParent,
    });
  } catch (e) {
    console.error("DB ERROR at GET /admin/categories:", e);
    res.status(500).send("Lỗi truy vấn DB: " + e.message);
  }
});

//Form tạo mới category - PHẢI ĐẶT TRƯỚC /:id/edit để tránh conflict
router.get("/new", async (req, res) => {
  try {
    const parents = await adminModel.getParentCategories();
    res.render("admin/categories/new", {
      layout: "admin",
      title: "New Category",
      authUser: req.session.user,
      currentPage: "categories",
      parents,
    });
  } catch (e) {
    res.status(500).send("Lỗi truy vấn DB: " + e.message);
  }
});

// Tạo mới category
router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const parentRaw = req.body.parent_id;
    const parent_id = parentRaw ? Number(parentRaw) : null;

    if (!name) return res.status(400).send("Name is required");

    const slug = slugify(name, { lower: true, strict: true });

    await adminModel.addCategory({ name, slug, parent_id });
    res.redirect("/admin/categories");
  } catch (e) {
    console.error(e);
    res.status(400).send("Create failed: " + e.message);
  }
});

// Form sửa category - PHẢI ĐẶT SAU /new
router.get("/:id/edit", async (req, res) => {
  try {
    // Lấy ID từ params
    const idParam = req.params.id;

    // Kiểm tra nếu là "new" thì không xử lý ở đây (đã xử lý ở route trên)
    if (idParam === "new") {
      return res.status(404).send("Not found");
    }

    // Convert sang số hoặc giữ nguyên string tùy theo kiểu ID trong DB
    const id = isNaN(idParam) ? idParam : Number(idParam);

    const cat = await adminModel.getCategoryById(id);
    if (!cat) {
      console.error(`Category not found: ID=${id}`);
      return res.status(404).send("Không tìm thấy danh mục với ID: " + id);
    }

    const parents = await adminModel.getParentCategories(id);
    res.render("admin/categories/edit", {
      layout: "admin",
      title: "Edit Category",
      authUser: req.session.user,
      currentPage: "categories",
      cat,
      parents,
    });
  } catch (e) {
    console.error("Error editing category:", e);
    res.status(500).send("DB error: " + e.message);
  }
});

// Cập nhật category
router.post("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const parentRaw = req.body.parent_id;
    const parent_id = parentRaw ? Number(parentRaw) : null;

    if (!name) return res.status(400).send("Name is required");
    if (parent_id && parent_id === id) {
      return res.status(400).send("Parent cannot be itself");
    }

    const slug = slugify(name, { lower: true, strict: true });

    await adminModel.updateCategory(id, { name, slug, parent_id });
    res.redirect("/admin/categories");
  } catch (e) {
    res.status(400).send("Update failed: " + e.message);
  }
});

// Xoá category
router.post("/:id/delete", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await adminModel.deleteCategory(id);
    res.redirect("/admin/categories");
  } catch (e) {
    res.status(400).send("Delete failed: " + e.message);
  }
});

export default router;
