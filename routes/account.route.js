// routes/account.route.js
import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import passport from "passport";
import userModel from "../models/user.model.js";
import { checkAuthenticated } from "../middlewares/auth.mdw.js";
import { customAlphabet } from "nanoid";
import coursesModel from "../models/courses.model.js";
import rateLimit from "express-rate-limit";
import { z } from "zod";
const router = express.Router();


const signinSchema = z.object({
  username: z.string().min(1).transform(s => s.trim()),
  password: z.string().min(1), // có thể nâng lên min(8)
});

const sendOtpSchema = z.object({
  username: z.string().min(1).trim(),
  password: z.string().min(1),
  name: z.string().min(1).trim(),
  email: z.string().email().transform(s => s.toLowerCase()),
  dob: z.string().min(1),
  permission: z
    .optional(z.union([z.string(), z.number()]))
    .transform(v => Number(v ?? 0))
    .refine(n => Number.isInteger(n) && n >= 0, { message: "Invalid permission" }),
});

const verifyOtpSchema = z.object({
  otp: z.string().min(4).max(8).regex(/^\d+$/, "OTP must be numeric"),
});
// rate limiters
const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    // trả UI giống nhau / generic message
    res.status(429).render("vwAccount/signin", {
      title: "Đăng nhập",
      error: true,
      message: "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.",
    }),
});

const sendOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Quá nhiều yêu cầu OTP. Vui lòng thử lại sau một giờ.",
    }),
});

const verifyOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Quá nhiều lần thử OTP. Vui lòng gửi lại OTP.",
    }),
});

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.errors.map(e => e.message).join("; ");
      return res.status(400).json({ success: false, message: msg });
    }
    req.body = parsed.data;
    next();
  };
}

async function verifyAccount(username, password_verify) {
  const user = await userModel.findByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password_verify, user.password);
  if (!ok) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function createTransporter() {
  // Log nhẹ để biết env đã nạp chưa (không lộ secret)
  const mask = (s) => (s ? s[0] + "***" + s.slice(-2) : "EMPTY");
  console.log("SMTP_HOST =", process.env.SMTP_HOST || "EMPTY");
  console.log("SMTP_PORT =", process.env.SMTP_PORT || "EMPTY");
  console.log("SMTP_USER =", mask(process.env.SMTP_USER));
  console.log("SMTP_PASS =", process.env.SMTP_PASS ? "***SET***" : "EMPTY");

  const host = getEnv("SMTP_HOST");
  const port = Number(getEnv("SMTP_PORT"));
  const user = getEnv("SMTP_USER");
  const pass = getEnv("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465: SSL; 587: STARTTLS -> secure=false
    auth: { user, pass },
  });
}

function mailFromAddress() {
  const name = process.env.MAIL_FROM_NAME || "Online Academy";
  const user = process.env.SMTP_USER || "no-reply@example.com";
  return `"${name}" <${user}>`;
}

router.get("/signin", (req, res) => {
  const error = req.query.error === "locked";
  res.render("vwAccount/signin", {
    title: "Đăng nhập",
    error: error,
    message: error
      ? "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên."
      : null,
  });
});

router.post("/signin", signinLimiter, validate(signinSchema), async (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;

    const user = await userModel.findByUsername(username);
    // dùng generic message để tránh leak info
    const genericSigninRender = () =>
      res.render("vwAccount/signin", { title: "Đăng nhập", error: true });

    if (!user) return genericSigninRender();

    // async compare để không block event loop
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return genericSigninRender();

    // kiểm tra tài khoản active
    if (user.is_active === false) {
      return res.render("vwAccount/signin", {
        title: "Đăng nhập",
        error: true,
        message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
      });
    }

    // regenerate session để chống session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate error:", err);
        return res.status(500).send("Lỗi phiên đăng nhập");
      }

      // KHÔNG lưu password hash trong session: chỉ lưu user an toàn
      const { password: _pwd, ...safeUser } = user;
      req.session.isAuthenticated = true;
      req.session.authUser = safeUser;

      const retUrl = req.session.retUrl || "/";
      delete req.session.retUrl;
      res.redirect(retUrl);
    });
  } catch (e) {
    console.error("signin error:", e);
    return res.status(500).render("vwAccount/signin", { title: "Đăng nhập", error: true });
  }
});

router.get("/signup", (req, res) => {
  res.render("vwAccount/signup", { title: "Đăng ký" });
});

router.post("/signout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

router.post("/send-otp", sendOtpLimiter, validate(sendOtpSchema), async (req, res) => {
  try {
    let { username, password, name, email, dob, permission } = req.body || {};
    // (validation đã xong bởi validate middleware)

    const normEmail = String(email).trim().toLowerCase();

    // Kiểm tra trùng username/email giống trước...

    // Giới hạn gửi OTP per-session (quick mitigation). Better: per-email counter in Redis/DB.
    req.session._otpSendCount = (req.session._otpSendCount || 0) + 1;
    if (req.session._otpSendCount > 5) {
      return res.json({ success: false, message: "Quá nhiều yêu cầu OTP từ phiên này. Vui lòng thử lại sau." });
    }

    const otp = "" + Math.floor(100000 + Math.random() * 900000); // 6 số

    // Hash OTP trước khi lưu (để không lưu mã thẳng trong session)
    const otpHash = bcrypt.hashSync(otp, 10);

    req.session.otp = {
      hash: otpHash,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0, // số lần verify đã thử
      email: normEmail, // optional để xác minh
    };

    req.session.registerData = {
      username,
      // password đã hash từ trước ở code gốc — giữ nguyên (an toàn)
      password: bcrypt.hashSync(password, 10),
      name,
      email: normEmail,
      dob,
      permission: parseInt(permission ?? "0", 10) || 0,
    };

    // gửi mail như cũ
    const transporter = createTransporter();
    await transporter.verify();
    await transporter.sendMail({
      from: mailFromAddress(),
      to: normEmail,
      subject: "Xác thực OTP - Online Academy",
      text: `Mã OTP của bạn: ${otp} (hết hạn sau 5 phút)`,
      html: `<h2>Xác thực tài khoản</h2>
             <p>Mã OTP của bạn là: <b>${otp}</b></p>
             <p>Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ cho bất kỳ ai.</p>`,
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("Lỗi gửi email:", e);
    return res.json({
      success: false,
      message: "Lỗi khi gửi OTP. Vui lòng thử lại.",
    });
  }
});

router.post("/verify-otp", verifyOtpLimiter, validate(verifyOtpSchema), async (req, res) => {
  try {
    const { otp } = req.body || {};
    const s = req.session.otp;
    const reg = req.session.registerData;

    if (!otp) {
      return res.json({ success: false, message: "Thiếu OTP" });
    }
    if (!s || !s.hash) {
      return res.json({ success: false, message: "OTP không tồn tại. Vui lòng gửi lại OTP." });
    }
    if (Date.now() > s.expiresAt) {
      delete req.session.otp;
      return res.json({ success: false, message: "OTP đã hết hạn. Vui lòng gửi lại OTP." });
    }

    // tăng attempts và chặn sau N lần sai
    s.attempts = (s.attempts || 0);

    const ok = await bcrypt.compare(String(otp).trim(), s.hash);
    if (!ok) {
      s.attempts++;
      // block nếu quá nhiều lần thử
      if (s.attempts >= 5) {
        delete req.session.otp;
        return res.json({ success: false, message: "Quá nhiều lần thử OTP. Vui lòng gửi lại OTP." });
      }
      // giữ session.otp với attempts tăng
      req.session.otp = s;
      return res.json({ success: false, message: "Mã OTP không hợp lệ" });
    }

    if (!reg) {
      return res.json({
        success: false,
        message: "Thiếu dữ liệu đăng ký. Vui lòng thực hiện lại.",
      });
    }

    // Tạo user sau khi OTP hợp lệ
    const makeId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
    const id = "p" + makeId();
    await userModel.add({
      id: id,
      username: reg.username,
      password: reg.password,
      name: reg.name,
      email: reg.email.toLowerCase(),
      dob: reg.dob,
      permission: Number(reg.permission) || 0,
    });

    delete req.session.otp;
    delete req.session.registerData;

    return res.json({ success: true });
  } catch (e) {
    console.error("verify-otp error:", e);
    return res.json({ success: false, message: "Xác thực OTP lỗi" });
  }
});

router.get("/is-available", async (req, res) => {
  const username = (req.query.username || "").trim();
  if (!username)
    return res.json({ isAvailable: false, reason: "missing-username" });
  const user = await userModel.findByUsername(username);
  return res.json({ isAvailable: !user });
});

router.get("/is-email-available", async (req, res) => {
  const email = String(req.query.email || "")
    .trim()
    .toLowerCase();
  if (!email) return res.json({ isAvailable: false, reason: "missing-email" });

  const existed = await userModel.findByEmail(email);
  const exists = !!(
    existed &&
    (existed.id || (Array.isArray(existed) && existed.length))
  );
  return res.json({ isAvailable: !exists });
});

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/account/signin" }),
  async (req, res) => {
    // Kiểm tra tài khoản có bị khóa không
    if (req.user && req.user.is_active === false) {
      req.logout((err) => {
        if (err) console.error("Logout error:", err);
      });
      return res.redirect("/account/signin?error=locked");
    }
    req.session.isAuthenticated = true;
    req.session.authUser = req.user;
    res.redirect(req.session.retUrl || "/");
  }
);

router.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email"] })
);
router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/account/signin" }),
  async (req, res) => {
    // Kiểm tra tài khoản có bị khóa không
    if (req.user && req.user.is_active === false) {
      req.logout((err) => {
        if (err) console.error("Logout error:", err);
      });
      return res.redirect("/account/signin?error=locked");
    }
    // Đăng nhập thành công
    req.session.isAuthenticated = true;
    req.session.authUser = req.user;
    res.redirect(req.session.retUrl || "/");
  }
);
router.get("/change-password", (req, res) => {
  res.render("vwAccount/change_pass", { title: "Đổi mật khẩu" });
});

router.post("/change-password", async (req, res) => {
  const user = await userModel.findByUsername(req.session.authUser.username);
  if (!user)
    return res.status(401).json({ message: "Người dùng không tồn tại" });

  const ok = await bcrypt.compare(req.body.oldPassword, user.password);
  if (!ok)
    return res.status(401).json({ message: "Mật khẩu hiện tại không đúng" });

  if (req.body.newPassword !== req.body.confirmPassword) {
    return res.status(401).json({ message: "Xác nhận mật khẩu không đúng" });
  }

  const hashedPass = bcrypt.hashSync(req.body.newPassword, 10);
  const updatedUser = { id: user.id, password: hashedPass };
  const ret = await userModel.editUser(updatedUser);
  if (ret === 0)
    return res
      .status(500)
      .json({ message: "Cập nhật mật khẩu không thành công" });

  console.log("User", user.id, "changed password successfully");
  res.redirect("/student/profile-favor-courses");
});

router.get("/profile", async (req, res) => {
  res.render("vwAccount/profile", {
    title: "Hồ sơ",
    user: req.session.authUser,
  });
});

router.post("/profile", checkAuthenticated, async (req, res) => {
  // Luôn lấy ID từ session 
  const id = req.session.authUser.id;
  const user = { name: req.body.name, email: req.body.email };
  await userModel.patch(id, user);
  req.session.authUser.name = req.body.name;
  req.session.authUser.email = req.body.email;
  res.render("vwAccount/profile", {
    title: "Hồ sơ",
    user: req.session.authUser,
  });
});

router.get("/change-pwd", checkAuthenticated, (req, res) => {
  res.render("vwAccount/change-pwd", {
    title: "Đổi mật khẩu",
    user: req.session.authUser,
  });
});

router.post("/change-pwd", checkAuthenticated, async (req, res) => {
  // Luôn lấy ID từ session 
  const id = req.session.authUser.id;
  const curpwd = req.body.currentPassword;
  const newpwd = req.body.newPassword;

  const ret = bcrypt.compareSync(curpwd, req.session.authUser.password);
  if (!ret)
    return res.render("vwAccount/change-pwd", {
      title: "Đổi mật khẩu",
      user: req.session.authUser,
      error: true,
    });

  const hash_password = bcrypt.hashSync(newpwd, 10);
  const user = { password: hash_password };
  await userModel.patch(id, user);
  req.session.authUser.password = hash_password;
  res.redirect("/account/profile");
});
router.get("/shopping-cart", async (req, res) => {
  // Kiểm tra đăng nhập
  if (!req.session.authUser) {
    return res.redirect("/account/signin");
  }

  try {
    const userId = req.session.authUser.id;

    // Gọi model để lấy các khóa học trong giỏ
    const coursesInCart = await coursesModel.getCartItems(userId);

    // Kiểm tra giỏ hàng rỗng hay không
    const isEmpty = !coursesInCart || coursesInCart.length === 0;

    // Render view 'shopping-cart.handlebars'
    // Truyền biến 'isEmpty' và 'coursesInCart' [cite: 24, 31, 38]
    res.render("vwAccount/shopping-cart", {
      title: "Giỏ hàng",
      isEmpty: isEmpty,
      coursesInCart: coursesInCart,
    });
  } catch (err) {
    console.error("Lỗi khi lấy giỏ hàng:", err);
    res.status(500).send("Lỗi máy chủ");
  }
});

router.post("/shopping-cart/delete", async (req, res) => {
  // Kiểm tra đăng nhập
  if (!req.session.authUser) {
    return res.status(401).send("Bạn cần đăng nhập");
  }

  try {
    const userId = req.session.authUser.id;
    const { courseId } = req.body; // Lấy courseId từ input hidden [cite: 49]

    if (!courseId) {
      return res.status(400).send("Thiếu ID khóa học");
    }

    // Gọi model để xóa
    await coursesModel.removeCartItem(userId, courseId);

    // Chuyển hướng người dùng TRỞ LẠI trang giỏ hàng
    res.redirect("/account/shopping-cart");
  } catch (err) {
    console.error("Lỗi khi xóa khỏi giỏ hàng:", err);
    res.status(500).send("Lỗi máy chủ");
  }
});

router.post("/checkout", async (req, res) => {
  // Kiểm tra đăng nhập
  if (!req.session.authUser) {
    return res.status(401).send("Bạn cần đăng nhập");
  }

  try {
    const userId = req.session.authUser.id;

    // Lấy danh sách courseIds từ form (nhờ JS ở bước 1)
    let { courseIds } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!courseIds) {
      // Nếu không có JS hoặc user bỏ tick tất cả
      const msg = encodeURIComponent("Vui lòng chọn ít nhất một khóa học.");
      return res.redirect(`/account/shopping-cart?toast=error&msg=${msg}`);
    }

    // Nếu chỉ có 1 item, nó sẽ là string, cần chuyển thành array
    if (!Array.isArray(courseIds)) {
      courseIds = [courseIds];
    }

    // Gọi model để xử lý transaction
    await coursesModel.checkout(userId, courseIds);

    // Thông báo thành công và chuyển hướng
    // (Bạn có thể chuyển hướng đến trang "Khóa học của tôi")
    const msg = encodeURIComponent(
      "Thanh toán thành công! Khóa học đã được thêm vào tài khoản của bạn."
    );
    return res.redirect(
      `/student/profile-purchased-courses?toast=success&msg=${msg}`
    ); // (Hoặc /account/shopping-cart)
  } catch (err) {
    console.error("Lỗi khi thanh toán:", err);
    const msg = encodeURIComponent(
      "Có lỗi xảy ra trong quá trình thanh toán, vui lòng thử lại."
    );
    return res.redirect(`/account/shopping-cart?toast=error&msg=${msg}`);
  }
});
export default router;
