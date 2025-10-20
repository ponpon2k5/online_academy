// routes/admin.categories.js
import express from "express";
import slugify from "slugify";

const router = express.Router();

// Guard all category routes to admin only
router.use(isAdmin);

//Danh sách category
router.get("/", async (req, res) => {
  try {
    const rows = await adminModel.getAllCategories();
    res.render("admin/categories/index", { categories: rows });
  } catch (e) {
    console.error("DB ERROR at GET /admin/categories:", e);
    res.status(500).send("Lỗi truy vấn DB: " + e.message);
  }
});

//Form tạo mới category
router.get("/new", async (req, res) => {
  try {
    const parents = await adminModel.getParentCategories();
    res.render("admin/categories/new", { parents });
  } catch (e) {
    res.status(500).send("Lỗi truy vấn DB: " + e.message);
  }
});

// Tạo mới category
router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const parentRaw = req.body.parent_id;
    const parent_id = parentRaw ? Number(parentRaw) : null;

    if (!name) return res.status(400).send('Name is required');

    const slug = slugify(name, { lower: true, strict: true });

    await adminModel.addCategory({ name, slug, parent_id });
    res.redirect('/admin/categories');
  } catch (e) {
    console.error(e);
    res.status(400).send('Create failed: ' + e.message);
  }
})

// Form sửa category
router.get('/:id/edit', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cat = await adminModel.getCategoryById(id);
    if (!cat) return res.status(404).send('Not found');

    const parents = await adminModel.getParentCategories(id);
    res.render('admin/categories/edit', { cat, parents });
  } catch (e) {
    res.status(500).send('DB error: ' + e.message);
  }
});

// Cập nhật category
router.post('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const parentRaw = req.body.parent_id;
    const parent_id = parentRaw ? Number(parentRaw) : null;

    if (!name) return res.status(400).send('Name is required');
    if (parent_id && parent_id === id) {
      return res.status(400).send('Parent cannot be itself');
    }

    const slug = slugify(name, { lower: true, strict: true });

    await adminModel.updateCategory(id, { name, slug, parent_id });
    res.redirect('/admin/categories');
  } catch (e) {
    res.status(400).send('Update failed: ' + e.message);
  }
});

// Xoá category
router.post('/:id/delete', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await adminModel.deleteCategory(id);
    res.redirect('/admin/categories');
  } catch (e) {
    res.status(400).send('Delete failed: ' + e.message);
  }
});

export default router;
