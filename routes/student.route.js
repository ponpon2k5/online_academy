import express from 'express';
import bcrypt from 'bcryptjs'
import path from 'path';
const router = express.Router();

//profile student
router.get('/profile-favor-courses', (req, res) => {
    res.render('vwStudents/std_favor_courses', { layout: 'main', title: 'Hồ sơ cá nhân' });
});
router.get('/profile-edit', (req, res) => {
    res.render('vwStudents/std_edit_profile', { layout: 'main', title: 'Hồ sơ cá nhân' });
});
router.get('/profile-process-course', (req, res) => {
    res.render('vwStudents/std_process_courses', { layout: 'main', title: 'Hồ sơ cá nhân' });
});
router.get('/profile-purcharsed-courses', (req, res) => {
    res.render('vwStudents/std_purchased_courses', { layout: 'main', title: 'Hồ sơ cá nhân' });
});

export default router;
