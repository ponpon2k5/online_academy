import express from 'express';
import bcrypt from 'bcryptjs';
import userModel from '../models/user.model.js';
import nodemailer from 'nodemailer';
import passport from 'passport';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

router.get('/signup', function (req, res) {
    res.render('vwAccount/signup');
});

router.post('/send-otp', async function (req, res) {
    const { username, password, name, email, dob, permission } = req.body;

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.json({ success: false, message: 'Email không hợp lệ' });
    }

    // Kiểm tra username và email trùng lặp
    const existingUser = await userModel.findByUsername(username);
    if (existingUser) {
        return res.json({ success: false, message: 'Tên người dùng đã tồn tại' });
    }
    const existingEmail = await userModel.findByEmail(email);
    if (existingEmail) {
        return res.json({ success: false, message: 'Email đã tồn tại' });
    }

    // Tạo OTP và thời gian hết hạn
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000; // OTP hết hạn sau 5 phút
    req.session.tempUser = {
        username,
        password: bcrypt.hashSync(password, 10),
        name,
        email,
        dob,
        permission: parseInt(permission) || 0 // 0: Student, 1: Instructor
    };

    // Gửi OTP qua email
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        transporter.verify((error) => {
            if (error) console.error('Lỗi:', error);
            else console.log('Kết nối email thành công');
        });
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Xác thực OTP - Online Academy',
            html: `
                <h2>Xác thực tài khoản</h2>
                <p>Mã OTP của bạn là: <strong>${otp}</strong></p>
                <p>Mã này có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (err) {
        console.error('Lỗi gửi email:', err);
        res.json({ success: false, message: 'Lỗi khi gửi OTP. Vui lòng thử lại.' });
    }
});

router.post('/verify-otp', async function (req, res) {
    const { otp } = req.body;

    // Kiểm tra OTP hết hạn
    if (!req.session.otp || !req.session.otpExpires || Date.now() > req.session.otpExpires) {
        return res.json({ success: false, message: 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.' });
    }

    if (otp === req.session.otp) {
        await userModel.add(req.session.tempUser);
        delete req.session.otp;
        delete req.session.otpExpires;
        delete req.session.tempUser;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Mã OTP không hợp lệ' });
    }
});

router.get('/is-available', async function (req, res) {
    const username = req.query.username;
    const user = await userModel.findByUsername(username);
    res.json({ isAvailable: !user });
});

router.get('/is-email-available', async function (req, res) {
    const email = req.query.email;
    const user = await userModel.findByEmail(email);
    res.json({ isAvailable: !user });
});

router.get('/signin', function (req, res) {
    res.render('vwAccount/signin', { error: false });
});

router.post('/signin', async function (req, res) {
    const user = await userModel.findByUsername(req.body.username);
    if (!user) {
        return res.render('vwAccount/signin', { error: true });
    }

    const password_match = bcrypt.compareSync(req.body.password, user.password);
    if (!password_match) {
        return res.render('vwAccount/signin', { error: true });
    }

    req.session.isAuthenticated = true;
    req.session.authUser = user;
    const retUrl = req.session.retUrl || '/';
    delete req.session.retUrl;
    res.redirect(retUrl);
});

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/account/signin' }), (req, res) => {
    req.session.isAuthenticated = true;
    req.session.authUser = req.user;
    res.redirect(req.session.retUrl || '/');
});

router.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/account/signin' }), (req, res) => {
    req.session.isAuthenticated = true;
    req.session.authUser = req.user;
    res.redirect(req.session.retUrl || '/');
});

router.post('/signout', function (req, res) {
    req.session.isAuthenticated = false;
    req.session.authUser = null;
    res.redirect(req.headers.referer);
});

router.get('/profile', async function (req, res) {
    res.render('vwAccount/profile', { user: req.session.authUser });
});

import { checkAuthenticated } from '../middlewares/auth.mdw.js';

router.post('/profile', checkAuthenticated, async function (req, res) {
    const id = req.body.id;
    const user = {
        name: req.body.name,
        email: req.body.email,
    };
    await userModel.patch(id, user);
    req.session.authUser.name = req.body.name;
    req.session.authUser.email = req.body.email;
    res.render('vwAccount/profile', { user: req.session.authUser });
});

router.get('/change-pwd', checkAuthenticated, function (req, res) {
    res.render('vwAccount/change-pwd', { user: req.session.authUser });
});

router.post('/change-pwd', checkAuthenticated, async function (req, res) {
    const id = req.body.id;
    const curpwd = req.body.currentPassword;
    const newpwd = req.body.newPassword;

    const ret = bcrypt.compareSync(curpwd, req.session.authUser.password);
    if (!ret) {
        return res.render('vwAccount/change-pwd', { user: req.session.authUser, error: true });
    }

    const hash_password = bcrypt.hashSync(newpwd, 10);
    const user = { password: hash_password };
    await userModel.patch(id, user);
    req.session.authUser.password = hash_password;
    res.redirect('/account/profile');
});

export default router;