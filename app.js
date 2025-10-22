// app.js (clean)
import express from "express";
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import hbs_sections from "express-handlebars-sections";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import "dotenv/config";

import userModel from "./models/user.model.js";

// Routes
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
app.use(express.static(path.join(process.cwd(), "statics")));

// (Nếu bạn cần route động cho ảnh, nhớ đóng ngoặc đầy đủ)
// app.get("/images/:name", (req, res) => {
//   const imageDir = path.join(process.cwd(), "statics", "img");
//   const baseName = req.params.name;
//   res.sendFile(path.join(imageDir, baseName)); // hoặc xử lý theo ý bạn
// });

// ---------- Sessions ----------
app.set("trust proxy", 1);
app.use(
  session({
    secret: "duybodoi",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

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

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID",
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || "YOUR_GOOGLE_CLIENT_SECRET",
      callbackURL: "/account/auth/google/callback",
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        let user = email ? await userModel.findByEmail(email) : null;
        if (!user) {
          user = {
            username: profile.id,
            email,
            name: profile.displayName,
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

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID || "YOUR_FACEBOOK_APP_ID",
      clientSecret:
        process.env.FACEBOOK_APP_SECRET || "YOUR_FACEBOOK_APP_SECRET",
      callbackURL: "/account/auth/facebook/callback",
      profileFields: ["id", "emails", "displayName"],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        let user = email ? await userModel.findByEmail(email) : null;
        if (!user) {
          user = {
            username: profile.id,
            email,
            name: profile.displayName,
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

// ---------- Routes ----------
app.use("/", homeRoute);
app.use("/student", studentRouter);
app.use("/account", accountRouter);
app.use("/courses", coursesRouter);
app.use("/admin/categories", adminCategories);
app.use("/admin", adminRouter);
app.use("/instructor", instructorRouter);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render("404", { layout: "main" });
});

// ---------- Start server ----------
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
