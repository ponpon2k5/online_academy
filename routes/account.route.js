import express from 'express';
import bcrypt from 'bcryptjs'
import userModel from '../models/user.model.js'
const router = express.Router();
//function
async function verifyAccount(username, password_verify) {
    const user = await userModel.findByUsername(username);
    if (!user) return null;

    const ok = await bcrypt.compare(password_verify, user.password);
    if (!ok) return null;

    const { password, ...safeUser } = user;
    return safeUser;
}
//profile student
//login
router.get('/login', (req, res) => {
    res.render('vwAccount/login');
});
router.post('/login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const user = await verifyAccount(username, password);
    if (user) {
        req.session.isAuthenticated = true;
        req.session.authUser = user;
        console.log(req.session);
        const retUrl = req.session.retUrl || '/'
        delete req.session.retUrl;
        res.redirect(retUrl);
        //res.render('home');
    }
    else if (!user) {
        return res.status(401).json({ message: 'Sai thông tin đăng nhập' });
    }
});
//sign up
router.get('/signup', (req, res) => {
    res.render('vwAccount/signup');
});
router.post('/signup', async function (req, res) {
    const hashedPass = bcrypt.hashSync(req.body.password);
    let role = 'instructor';
    if (role === 'student') {
        role = 'student'
    }
    else {
        role = 'instructor'
    }
    const id_user = await userModel.totalUser() + 1;
    const id = "p" + id_user;
    const user = {
        id: id,
        full_name: req.body.fullname,
        username: req.body.username,
        password: hashedPass,
        email: req.body.email,
        role: role
    }
    //kiểm tra xem đăng ký có thành công không
    const ret = await userModel.add(user);
    if (ret === 0) {
        return res.render('vwAccount/signup', {
            error: 'Đăng ký không thành công'
        });
    }
    //đăng ký thành công

    res.render('vwStudents/std_favor_courses', { title: 'Hồ sơ cá nhân' });
});
//sign out
router.post('/signout', (req, res) => {
    req.session.isAuthenticated = false;
    req.session.authUser = null;
    res.redirect(req.headers.referer);
});
//change password
router.get('/change-password', (req, res) => {
    res.render('vwAccount/change_pass');
});
router.post('/change-password', async (req, res) => {
    const user = await userModel.findByUsername(req.session.authUser.username);
    if (!user) {
        return res.status(401).json({ message: 'Người dùng không tồn tại' });
    }
    const ok = await bcrypt.compare(req.body.oldPassword, user.password);
    if (!ok) {
        return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });
    }
    if (req.body.newPassword !== req.body.confirmPassword) {
        return res.status(401).json({ message: 'Xác nhận mật khẩu không đúng' });
    }
    const hashedPass = bcrypt.hashSync(req.body.newPassword);
    const updatedUser = {
        id: user.id,
        password: hashedPass
    };
    const ret = await userModel.editUser(updatedUser);
    if (ret === 0) {
        return res.status(500).json({ message: 'Cập nhật mật khẩu không thành công' });
    }
    console.log('User', user.id, 'changed password successfully');
    res.render('vwStudents/std_favor_courses');
});
export default router;