import express from "express";
import homeModel from "../models/home.model.js";

const router = express.Router();

router.get('/', async (req, res) => {
    const featuredCourses = await homeModel.getFeaturedCoursesThisWeek(); // 3-4 khóa học nổi bật trong tuần
    const mostViewed = await homeModel.getMostViewedCourses(); // 
    const newest = await homeModel.getNewestCourses(); // 
    const popularCategories = await homeModel.getHotCategories(); // lĩnh vực có nhiều người học nhất
    console.log(popularCategories);
    res.render('home', {
        featuredCourses, // khóa học nổi bật nhất tuần qua
        newest, // khóa học mới
        mostViewed, // khóa học được xem nhiều nhất 
        popularCategories,
    });
});

export default router;
