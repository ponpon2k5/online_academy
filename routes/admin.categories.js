import db from "../utils/db.js";
import express from "express";
import slugify from "slugify";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db("categories").select("*").orderBy("id", "asc");
    res.render("admin/categories/index", { categories: rows });
  } catch (e) {
    console.error("DB ERROR at GET /admin/categories:", e);
    res.status(500).send("Lỗi truy vấn DB: " + e.message);
  }
});

router.get("/new", async (req, res) => {
  try {
    const parents = await db("categories").select("id", "name").orderBy("name");
    res.render("admin/categories/new", { parents });
  } catch (e) {
    res.status(500).send("Lỗi truy vấn DB: " + e.message);
  }
});

export default router;
