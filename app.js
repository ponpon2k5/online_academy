// app.js (clean)
import express from "express";
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import csurf from "csurf";
import hbs_sections from "express-handlebars-sections";
import sanitizeHtml from "sanitize-html";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import GitHubStrategy from "passport-github2";

import "dotenv/config";
import fs from "fs";
import moment from "moment";
import userModel from "./models/user.model.js";

// Routes
// app.js
import mediaRoute from "./routes/media.route.js";
import adminCategories from "./routes/admin.categories.js";
import adminRouter from "./routes/admin.js";
import instructorRouter from "./routes/instructor.js";
import studentRouter from "./routes/student.route.js";
import accountRouter from "./routes/account.route.js";
import coursesRouter from "./routes/courses.route.js";
import homeRoute from "./routes/home.route.js"; // nếu có dùng thì mở

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------- Static & Body Parsers ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "statics", "img")));
// Videos được stream qua /media/lessons/:lessonId/stream, không serve static
app.use(express.static(path.join(__dirname, "public")));
// --------- Xử lý tự động đuôi ảnh ----------,
app.get("/images/:name", (req, res) => {
  const imageDir = path.join(__dirname, "statics", "img");
  const baseName = req.params.name;
  const extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

  for (const ext of extensions) {
    const fullPath = path.join(imageDir, baseName + ext);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  // Nếu không tìm thấy ảnh nào
  return res.status(404).sendFile(path.join(imageDir, "logo.jpg"));
});

// ---------- Sessions ----------
app.set("trust proxy", 1);
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      (() => {
        throw new Error("SESSION_SECRET is not set");
      })(),
    resave: false,
    saveUninitialized: false, // Không lưu session rỗng, giảm nguy cơ fixation
    cookie: {
      httpOnly: true, // Chặn JS phía client truy cập cookie
      secure: process.env.SESSION_SECURE === "true",
      sameSite: "lax", // Giảm nguy cơ CSRF nhưng vẫn tiện cho redirect
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 ngày
    },
  })
);

// ---------- CSRF Protection ----------
app.use(csurf());
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// Đồng bộ thông tin đăng nhập ra locals
app.use(async (req, res, next) => {
  if (req.session.isAuthenticated && req.session.authUser) {
    res.locals.isAuthenticated = true;
    res.locals.authUser = req.session.authUser;
    // đồng bộ để tương thích
    req.session.user = {
      id: req.session.authUser.id,
      full_name: req.session.authUser.name || req.session.authUser.full_name,
      role: req.session.authUser.role,
      email: req.session.authUser.email,
    };

    // Lấy số lượng sản phẩm trong giỏ hàng
    try {
      const coursesModel = (await import("./models/courses.model.js")).default;
      res.locals.cartCount = await coursesModel.getCartCount(
        req.session.authUser.id
      );
    } catch (error) {
      console.error("Error getting cart count:", error);
      res.locals.cartCount = 0;
    }
  } else {
    res.locals.cartCount = 0;
  }
  next();
});

// ---------- View Engine ----------
app.engine(
  "handlebars",
  engine({
    extname: ".handlebars",
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views", "layouts"),
    partialsDir: path.join(__dirname, "views", "partials"),
    helpers: {
      section: hbs_sections(),
      eq: (a, b) => String(a) === String(b),
      ne: (a, b) => String(a) !== String(b),
      and: (a, b) => a && b,
      substring: (str, start, end) => (str ? str.substring(start, end) : ""),
      formatDate: (date) => {
        if (!date) return "";
        const d = new Date(date);
        return d.toLocaleDateString("vi-VN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      },
      formatCurrency: (amount) =>
        new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
        }).format(amount || 0),
      divide: (a, b) => (!b ? 0 : a / b),
      multiply: (a, b) => a * b,
      round: (num) => Math.round(num),
      add: (a, b) => Number(a) + Number(b),
      subtract: (a, b) => Number(a) - Number(b),
      formatDateForCheckCourse: (date) => moment(date).format("DD/MM/YYYY"),
      isRecentCourse: (date) => {
        if (!date) return false;
        const createdAt = moment(date);
        const now = moment();
        return now.diff(createdAt, "days") <= 3; // ✅ 3 ngày gần nhất
      },
      isBestSeller: (students) => students >= 1000,
      formatDuration: (seconds) => {
        if (!seconds) return "0:00";
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`;
        } else {
          return `${minutes}:${secs.toString().padStart(2, "0")}`;
        }
      },
      getImageUrl: (url) => {
        // Nếu không có URL, trả về ảnh mặc định
        if (!url) return "/images/logo.jpg";

        // Nếu URL bắt đầu với / hoặc http/https, dùng trực tiếp (external URL)
        if (
          url.startsWith("/") ||
          url.startsWith("http://") ||
          url.startsWith("https://")
        ) {
          return url;
        }

        // Nếu là tên file (không có / hoặc http), kiểm tra đã có extension chưa
        const hasExtension = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
        if (hasExtension) {
          // Đã có extension, dùng trực tiếp
          return `/images/${url}`;
        } else {
          // Chưa có extension, thêm .jpg (format cũ)
          return `/images/${url}.jpg`;
        }
      },
      sanitize: (html) =>
        sanitizeHtml(html || "", {
          allowedTags: [
            "b",
            "i",
            "em",
            "strong",
            "a",
            "p",
            "ul",
            "ol",
            "li",
            "br",
            "span",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
          ],
          allowedAttributes: {
            a: ["href", "title", "target", "rel"],
            span: ["class"],
            p: ["class"],
          },
          allowedSchemes: ["http", "https", "mailto"],
        }),
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

// ---------- Passport ----------
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await userModel.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Cấu hình Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/account/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await userModel.findByEmail(profile.emails[0].value);
        if (!user) {
          let total = await userModel.totalUser();
          const id = "p" + (Number(total) + 1);

          user = {
            id,
            username: profile.id,
            email: profile.emails?.[0]?.value || "",
            name: profile.displayName || "Unknown",
            password: "",
            permission: 0,
          };
          await userModel.add(user);
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// Cấu hình Facebook Strategy
// passport.use(new FacebookStrategy({
//     clientID: process.env.FACEBOOK_CLIENT_ID,
//     clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
//     callbackURL: '/account/auth/facebook/callback',
//     profileFields: ['id', 'emails', 'displayName']
// }, async (accessToken, refreshToken, profile, done) => {
//     try {
//         const email = profile.emails && profile.emails.length > 0
//             ? profile.emails[0].value
//             : `${profile.id}@facebook.com`;
//         let user = await userModel.findByEmail(email);
//         if (!user) {
//             let total = await userModel.totalUser();
//             const id = "p" + (Number(total) + 1);

//             user = {
//                 id,
//                 username: profile.id,
//                 email: profile.emails?.[0]?.value || '',
//                 name: profile.displayName || 'Unknown',
//                 password: '',
//                 permission: 0
//             };
//             await userModel.add(user);
//         }
//         done(null, user);
//     } catch (err) {
//         done(err, null);
//     }
// }));
// Cấu hình Github Strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "/account/auth/github/callback",
      scope: ["user:email"], // Yêu cầu quyền truy cập email
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // GitHub có thể trả về email trong nhiều trường
        let email = null;
        if (profile.emails && profile.emails.length > 0) {
          // Tìm email chính (nếu có)
          const primaryEmail = profile.emails.find((e) => e.primary);
          email = (primaryEmail || profile.emails[0]).value;
        }

        // Fallback nếu không có email (ví dụ: email để private)
        // Chúng ta sẽ dùng một email placeholder dựa trên username
        if (!email) {
          email = `${profile.username}@github.com`;
        }

        let user = await userModel.findByEmail(email);
        if (!user) {
          let total = await userModel.totalUser();
          const id = "p" + (Number(total) + 1);

          user = {
            id,
            username: profile.id, // Dùng profile.id giống Google/Facebook
            email: email,
            name: profile.displayName || profile.username || "Unknown", // Lấy tên hiển thị hoặc username
            password: "", // Không có mật khẩu cho OAuth
            permission: 0,
          };
          await userModel.add(user);
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// ---------- Routes ----------
app.use("/", homeRoute);
app.use("/student", studentRouter);
app.use("/account", accountRouter);
app.use("/courses", coursesRouter);
app.use("/admin/categories", adminCategories);
app.use("/admin", adminRouter);
app.use("/instructor", instructorRouter);
app.use("/media", mediaRoute);

// ---------- CSRF error handler ----------
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Invalid CSRF token");
  }
  next(err);
});

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render("404", { layout: "main" });
});

// ---------- Start server ----------
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
