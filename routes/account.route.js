// routes/account.route.js
import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import passport from 'passport';
import userModel from '../models/user.model.js';
import { checkAuthenticated } from '../middlewares/auth.mdw.js';
import { customAlphabet } from 'nanoid';
import coursesModel from '../models/courses.model.js';
const router = express.Router();

/* =============== Helper: Auth verify (giữ nguyên logic cũ) =============== */
async function verifyAccount(username, password_verify) {
    const user = await userModel.findByUsername(username);
    if (!user) return null;
    const ok = await bcrypt.compare(password_verify, user.password);
    if (!ok) return null;
    const { password, ...safeUser } = user;
    return safeUser;
}

/* =============== Helper: Mailer chuẩn =============== */
function getEnv(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env ${name}`);
    return v;
}

function createTransporter() {
    // Log nhẹ để biết env đã nạp chưa (không lộ secret)
    const mask = s => (s ? s[0] + '***' + s.slice(-2) : 'EMPTY');
    console.log('SMTP_HOST =', process.env.SMTP_HOST || 'EMPTY');
    console.log('SMTP_PORT =', process.env.SMTP_PORT || 'EMPTY');
    console.log('SMTP_USER =', mask(process.env.SMTP_USER));
    console.log('SMTP_PASS =', process.env.SMTP_PASS ? '***SET***' : 'EMPTY');

    const host = getEnv('SMTP_HOST');
    const port = Number(getEnv('SMTP_PORT'));
    const user = getEnv('SMTP_USER');
    const pass = getEnv('SMTP_PASS');

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 465: SSL; 587: STARTTLS -> secure=false
        auth: { user, pass },
    });
}

function mailFromAddress() {
    const name = process.env.MAIL_FROM_NAME || 'Online Academy';
    const user = process.env.SMTP_USER || 'no-reply@example.com';
    return `"${name}" <${user}>`;
}

/* ====================== SIGNIN ====================== */
router.get('/signin', (req, res) => {
    res.render('vwAccount/signin', { error: false });
});

router.post('/signin', async (req, res) => {
    const user = await userModel.findByUsername(req.body.username);
    if (!user) return res.render('vwAccount/signin', { error: true });

    const ok = bcrypt.compareSync(req.body.password, user.password);
    if (!ok) return res.render('vwAccount/signin', { error: true });

    req.session.isAuthenticated = true;
    req.session.authUser = user;
    const retUrl = req.session.retUrl || '/';
    delete req.session.retUrl;
    res.redirect(retUrl);
});

/* ====================== SIGNUP PAGE ====================== */
router.get('/signup', (req, res) => {
    res.render('vwAccount/signup');
});


/* ====================== SIGNOUT ====================== */
router.post('/signout', (req, res) => {
    req.session.isAuthenticated = false;
    req.session.authUser = null;
    res.redirect('/');
});

/* ====================== SEND OTP ====================== */
router.post('/send-otp', async (req, res) => {
    try {
        let { username, password, name, email, dob, permission } = req.body || {};
        // Validate tối thiểu phía server
        if (!username || !password || !name || !email || !dob) {
            return res.json({ success: false, message: 'Thiếu dữ liệu bắt buộc' });
        }

        const normEmail = String(email).trim().toLowerCase();

        // Kiểm tra định dạng email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normEmail)) {
            return res.json({ success: false, message: 'Email không hợp lệ' });
        }

        // Kiểm tra trùng username
        const existedUsername = await userModel.findByUsername(username);
        if (existedUsername) {
            return res.json({ success: false, message: 'Tên người dùng đã tồn tại' });
        }

        // Kiểm tra trùng email (an toàn với model trả array hoặc object)
        const existedEmail = await userModel.findByEmail(normEmail);
        const emailExists = !!(existedEmail && (
            existedEmail.id || (Array.isArray(existedEmail) && existedEmail.length)
        ));
        if (emailExists) {
            return res.json({ success: false, message: 'Email đã tồn tại' });
        }

        // Tạo OTP & lưu session
        const otp = '' + Math.floor(100000 + Math.random() * 900000); // 6 số
        req.session.otp = { code: otp, expiresAt: Date.now() + 5 * 60 * 1000 };
        req.session.registerData = {
            username,
            // Hash ngay từ đây (saltRounds = 10)
            password: bcrypt.hashSync(password, 10),
            name,
            email: normEmail,
            dob,
            permission: parseInt(permission ?? '0', 10) || 0, // 0: student, 1: instructor
        };

        // Gửi mail
        const transporter = createTransporter();
        await transporter.verify(); // bắt lỗi config SMTP ngay tại đây

        await transporter.sendMail({
            from: mailFromAddress(),
            to: normEmail,
            subject: 'Xác thực OTP - Online Academy',
            text: `Mã OTP của bạn: ${otp} (hết hạn sau 5 phút)`,
            html: `<h2>Xác thực tài khoản</h2>
             <p>Mã OTP của bạn là: <b>${otp}</b></p>
             <p>Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ cho bất kỳ ai.</p>`,
        });

        return res.json({ success: true });
    } catch (e) {
        console.error('Lỗi gửi email:', e);
        return res.json({ success: false, message: e.message || 'Lỗi khi gửi OTP. Vui lòng thử lại.' });
    }
});

/* ====================== VERIFY OTP ====================== */
router.post('/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body || {};
        const s = req.session.otp;
        const reg = req.session.registerData;

        if (!otp) {
            return res.json({ success: false, message: 'Thiếu OTP' });
        }
        if (!s || !s.code) {
            return res.json({ success: false, message: 'OTP không tồn tại. Vui lòng gửi lại OTP.' });
        }
        if (Date.now() > s.expiresAt) {
            return res.json({ success: false, message: 'OTP đã hết hạn. Vui lòng gửi lại OTP.' });
        }
        if (String(otp).trim() !== String(s.code)) {
            return res.json({ success: false, message: 'Mã OTP không hợp lệ' });
        }
        if (!reg) {
            return res.json({ success: false, message: 'Thiếu dữ liệu đăng ký. Vui lòng thực hiện lại.' });
        }


        // Tạo user sau khi OTP hợp lệ
        const makeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);
        const id = 'p' + makeId();
        await userModel.add({
            id: id,
            username: reg.username,
            password: reg.password,         // đã hash ở bước send-otp
            name: reg.name,
            email: reg.email.toLowerCase(), // normalize
            dob: reg.dob,
            permission: Number(reg.permission) || 0,
        });

        // Xoá dữ liệu tạm trong session
        delete req.session.otp;
        delete req.session.registerData;

        return res.json({ success: true });
    } catch (e) {
        console.error('verify-otp error:', e);
        return res.json({ success: false, message: 'Xác thực OTP lỗi' });
    }
});

/* ====================== CHECK USERNAME/EMAIL ====================== */
router.get('/is-available', async (req, res) => {
    const username = (req.query.username || '').trim();
    if (!username) return res.json({ isAvailable: false, reason: 'missing-username' });
    const user = await userModel.findByUsername(username);
    return res.json({ isAvailable: !user });
});

router.get('/is-email-available', async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.json({ isAvailable: false, reason: 'missing-email' });

    const existed = await userModel.findByEmail(email);
    const exists = !!(existed && (
        existed.id || (Array.isArray(existed) && existed.length)
    ));
    return res.json({ isAvailable: !exists });
});

/* ====================== OAUTH (giữ nguyên) ====================== */
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/account/signin' }),
    (req, res) => {
        req.session.isAuthenticated = true;
        req.session.authUser = req.user;
        res.redirect(req.session.retUrl || '/');
    }
);

// router.get('/auth/facebook', passport.authenticate('facebook', { scope: ['public_profile', 'email'] }));
// router.get('/auth/facebook/callback',
//     passport.authenticate('facebook', { failureRedirect: '/account/signin' }),
//     (req, res) => {
//         req.session.isAuthenticated = true;
//         req.session.authUser = req.user;
//         res.redirect(req.session.retUrl || '/');
//     }
// );

router.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/account/signin' }),
    (req, res) => {
        // Đăng nhập thành công
        req.session.isAuthenticated = true;
        req.session.authUser = req.user;
        res.redirect(req.session.retUrl || '/');
    }
);
/* ====================== CHANGE PASSWORD/PROFILE (giữ nguyên) ====================== */
router.get('/change-password', (req, res) => {
    res.render('vwAccount/change_pass');
});

router.post('/change-password', async (req, res) => {
    const user = await userModel.findByUsername(req.session.authUser.username);
    if (!user) return res.status(401).json({ message: 'Người dùng không tồn tại' });

    const ok = await bcrypt.compare(req.body.oldPassword, user.password);
    if (!ok) return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });

    if (req.body.newPassword !== req.body.confirmPassword) {
        return res.status(401).json({ message: 'Xác nhận mật khẩu không đúng' });
    }

    const hashedPass = bcrypt.hashSync(req.body.newPassword, 10);
    const updatedUser = { id: user.id, password: hashedPass };
    const ret = await userModel.editUser(updatedUser);
    if (ret === 0) return res.status(500).json({ message: 'Cập nhật mật khẩu không thành công' });

    console.log('User', user.id, 'changed password successfully');
    res.render('vwStudents/std_favor_courses');
});

router.get('/profile', async (req, res) => {
    res.render('vwAccount/profile', { user: req.session.authUser });
});

router.post('/profile', checkAuthenticated, async (req, res) => {
    const id = req.body.id;
    const user = { name: req.body.name, email: req.body.email };
    await userModel.patch(id, user);
    req.session.authUser.name = req.body.name;
    req.session.authUser.email = req.body.email;
    res.render('vwAccount/profile', { user: req.session.authUser });
});

router.get('/change-pwd', checkAuthenticated, (req, res) => {
    res.render('vwAccount/change-pwd', { user: req.session.authUser });
});

router.post('/change-pwd', checkAuthenticated, async (req, res) => {
    const id = req.body.id;
    const curpwd = req.body.currentPassword;
    const newpwd = req.body.newPassword;

    const ret = bcrypt.compareSync(curpwd, req.session.authUser.password);
    if (!ret) return res.render('vwAccount/change-pwd', { user: req.session.authUser, error: true });

    const hash_password = bcrypt.hashSync(newpwd, 10);
    const user = { password: hash_password };
    await userModel.patch(id, user);
    req.session.authUser.password = hash_password;
    res.redirect('/account/profile');
});
// --- : HIỂN THỊ TRANG GIỎ HÀNG ---
router.get('/shopping-cart', async (req, res) => {
    // 1. Kiểm tra đăng nhập
    if (!req.session.authUser) {
        return res.redirect('/account/signin');
    }

    try {
        const userId = req.session.authUser.id;

        // 2. Gọi model để lấy các khóa học trong giỏ
        const coursesInCart = await coursesModel.getCartItems(userId);

        // 3. Kiểm tra giỏ hàng rỗng hay không
        const isEmpty = !coursesInCart || coursesInCart.length === 0;

        // 4. Render view 'shopping-cart.handlebars'
        // Truyền biến 'isEmpty' và 'coursesInCart' [cite: 24, 31, 38]
        res.render('vwAccount/shopping-cart', {
            title: 'Giỏ hàng',
            isEmpty: isEmpty,
            coursesInCart: coursesInCart
        });

    } catch (err) {
        console.error('Lỗi khi lấy giỏ hàng:', err);
        res.status(500).send('Lỗi máy chủ');
    }
});

// --- XỬ LÝ XÓA KHỎI GIỎ HÀNG ---
router.post('/shopping-cart/delete', async (req, res) => {
    // 1. Kiểm tra đăng nhập
    if (!req.session.authUser) {
        return res.status(401).send('Bạn cần đăng nhập');
    }

    try {
        const userId = req.session.authUser.id;
        const { courseId } = req.body; // Lấy courseId từ input hidden [cite: 49]

        if (!courseId) {
            return res.status(400).send('Thiếu ID khóa học');
        }

        // 2. Gọi model để xóa
        await coursesModel.removeCartItem(userId, courseId);

        // 3. Chuyển hướng người dùng TRỞ LẠI trang giỏ hàng
        res.redirect('/account/shopping-cart');

    } catch (err) {
        console.error('Lỗi khi xóa khỏi giỏ hàng:', err);
        res.status(500).send('Lỗi máy chủ');
    }
});

// ---  XỬ LÝ THANH TOÁN ---
router.post('/checkout', async (req, res) => {
    // 1. Kiểm tra đăng nhập
    if (!req.session.authUser) {
        return res.status(401).send('Bạn cần đăng nhập');
    }

    try {
        const userId = req.session.authUser.id;

        // 2. Lấy danh sách courseIds từ form (nhờ JS ở bước 1)
        let { courseIds } = req.body;

        // 3. Kiểm tra dữ liệu đầu vào
        if (!courseIds) {
            // Nếu không có JS hoặc user bỏ tick tất cả
            const msg = encodeURIComponent('Vui lòng chọn ít nhất một khóa học.');
            return res.redirect(`/account/shopping-cart?toast=error&msg=${msg}`);
        }

        // Nếu chỉ có 1 item, nó sẽ là string, cần chuyển thành array
        if (!Array.isArray(courseIds)) {
            courseIds = [courseIds];
        }

        // 4. Gọi model để xử lý transaction
        await coursesModel.checkout(userId, courseIds);

        // 5. Thông báo thành công và chuyển hướng
        // (Bạn có thể chuyển hướng đến trang "Khóa học của tôi")
        const msg = encodeURIComponent('Thanh toán thành công! Khóa học đã được thêm vào tài khoản của bạn.');
        return res.redirect(`/student/profile-purchased-courses?toast=success&msg=${msg}`); // (Hoặc /account/shopping-cart)

    } catch (err) {
        console.error('Lỗi khi thanh toán:', err);
        const msg = encodeURIComponent('Có lỗi xảy ra trong quá trình thanh toán, vui lòng thử lại.');
        return res.redirect(`/account/shopping-cart?toast=error&msg=${msg}`);
    }
});
    export default router;
