import express from "express";
import homeModel from "../models/home.model.js";
import { mapCourseList } from "../utils/course.helper.js";

const router = express.Router();

router.get('/', async (req, res) => {
    const featuredRaw = await homeModel.getFeaturedCoursesThisWeek();
    const featuredCourses = mapCourseList(featuredRaw); // 3-4 khóa học nổi bật trong tuần
    const mostViewedRaw = await homeModel.getMostViewedCourses();
    const mostViewed = mapCourseList(mostViewedRaw); // 
    const newestRaw = await homeModel.getNewestCourses();
    const newest = mapCourseList(newestRaw); // 
    const popularCategories = await homeModel.getHotCategories();
        const homeCategories = await homeModel.getHomeCategories(); // lĩnh vực có nhiều người học nhất
    console.log(popularCategories);
    res.render('home', {
        featuredCourses, // khóa học nổi bật nhất tuần qua
        newest, // khóa học mới
        mostViewed, // khóa học được xem nhiều nhất 
        popularCategories,
        homeCategories,
    });
});

export default router;
