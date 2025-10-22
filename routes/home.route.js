import express from "express";
import homeModel from "../models/home.model.js";
const router = express.Router();

router.get("/", async (req, res) => {
  const featuredCourses = await homeModel.getFeaturedCourses();

  const popularCourses = await homeModel.getPopularCourses();

  const newestCourses = await homeModel.getNewestCourses();

  const hotCategories = await homeModel.getHotCategories();

  res.render("home", {
    layout: "main",
    featuredCourses,
    popularCourses,
    newestCourses,
    hotCategories,
    title: "Online Academy - Học mọi lúc mọi nơi"
  });

});

export default router;
