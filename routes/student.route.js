import express from 'express';
import bcrypt from 'bcryptjs'
import path from 'path';
import userModel from '../models/user.model.js'
const router = express.Router();

//profile student
router.get('/profile-favor-courses', async (req, res) => {
    if (!req.session.authUser) {
        // Redirect to login or show an error
        return res.redirect('/account/login'); // or your login route
    }
    const result = await userModel.findFavoriteCoursesByUserId(req.session.authUser.id);
    console.log('Favorite courses of user', req.session.authUser.id, ':');
    console.log(result);
    res.render('vwStudents/std_favor_courses', {
        favor_courses: result
    });
});
router.get('/profile-purchased-courses', async (req, res) => {
    if (!req.session.authUser) {
        // Redirect to login or show an error
        return res.redirect('/account/login'); // or your login route
    }
    const result = await userModel.findPurcharsedCoursesByUserId(req.session.authUser.id);
    console.log('Purchased courses of user', req.session.authUser.id, ':');
    console.log(result);
    res.render('vwStudents/std_purchased_courses', {
        enroll_courses: result
    });
});
//edit profile
router.get('/profile-edit', (req, res) => {
    res.render('vwStudents/std_edit_profile', { title: 'Hồ sơ cá nhân' });
});
router.post('/profile-edit', async (req, res) => {
    const user = {
        id: req.session.authUser.id,
        full_name: req.body.full_name,
        email: req.body.email,
        dob: req.body.dob,
        address: req.body.address,
        phone: req.body.phone,
        bio: req.body.bio
    }
    const result = await userModel.editUser(user);
    if (result === 0) {
        return res.render('vwStudents/std_edit_profile', {
            error: 'Cập nhật không thành công'
        });
    }
    console.log('Update user', user.id, 'successfully');
    console.log(user);
    res.render('vwStudents/std_favor_courses');
});

router.get('/profile-process-course', (req, res) => {
    res.render('vwStudents/std_process_courses', { title: 'Hồ sơ cá nhân' });
});
router.get('/profile-purcharsed-courses', (req, res) => {
    res.render('vwStudents/std_purchased_courses', { title: 'Hồ sơ cá nhân' });
});
//change password
router.get('/change-password', (req, res) => {
    res.render('vwStudents/std_change_pass');
});
//delete course
router.delete('/favor-courses/:id', async (req, res) => {
    if (!req.session.authUser) { // kiểm tra lại trạng thái đăng nhập
        return res.status(403).json({ success: false, message: 'Bạn cần đăng nhập.' });
    }

    try {
        const userId = req.session.authUser.id;
        const courseId = req.params.id;
        const affected = await userModel.delCourse(userId, courseId);

        if (affected > 0)
            res.json({ success: true });
        else
            res.json({ success: false, message: 'Khóa học không tồn tại trong danh sách yêu thích.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
});

export default router;
