// app.js
import express from "express";
import { engine } from "express-handlebars";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import hbs_sections from "express-handlebars-sections";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import userModel from "./models/user.model.js";
import fs from 'fs';
// Routes
import adminCategories from "./routes/admin.categories.js";
import studentRouter from "./routes/student.route.js";
import accountRouter from "./routes/account.route.js";
import coursesRouter from "./routes/courses.route.js";
import homeRoute from "./routes/home.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.static(path.join(process.cwd(), 'statics')));
// Route xử lý ảnh động
app.get('/images/:name', (req, res) => {
  const imageDir = path.join(process.cwd(), 'statics', 'img');
  const baseName = req.params.name;

  const extensions = ['.jpg', '.jpeg', '.png', '.webp'];

  for (let ext of extensions) {
    const filePath = path.join(imageDir, baseName + ext);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  res.sendFile(path.join(imageDir, 'logo.jpg'));
});

// ---------- SESSION CONFIG ----------
app.set("trust proxy", 1);
app.use(session({
  secret: "lotusalone",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
}));

// ---------- VIEW ENGINE CONFIG ----------
app.engine("handlebars", engine({
  extname: ".handlebars",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
    section: hbs_sections(),
    eq: (a, b) => a === b
  },
}));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

// ---------- STATIC FILES ----------
app.use("/images", express.static(path.join(__dirname, "statics", "img")));
app.use("/static", express.static(path.join(__dirname, "statics")));

// ---------- BODY PARSER ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------- PASSPORT CONFIG ----------
app.use(passport.initialize());
app.use(passport.session());

// Gắn biến session vào view
app.use((req, res, next) => {
  if (req.session.isAuthenticated) {
    res.locals.isAuthenticated = true;
    res.locals.authUser = req.session.authUser;
  }
  next();
});

// Serialize / Deserialize
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await userModel.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ---------- GOOGLE STRATEGY ----------
passport.use(new GoogleStrategy({
  clientID: "YOUR_GOOGLE_CLIENT_ID",
  clientSecret: "YOUR_GOOGLE_CLIENT_SECRET",
  callbackURL: "/account/auth/google/callback",
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await userModel.findByEmail(profile.emails[0].value);
    if (!user) {
      user = {
        username: profile.id,
        email: profile.emails[0].value,
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
}));

// ---------- FACEBOOK STRATEGY ----------
passport.use(new FacebookStrategy({
  clientID: "YOUR_FACEBOOK_APP_ID",
  clientSecret: "YOUR_FACEBOOK_APP_SECRET",
  callbackURL: "/account/auth/facebook/callback",
  profileFields: ["id", "emails", "displayName"],
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await userModel.findByEmail(profile.emails[0].value);
    if (!user) {
      user = {
        username: profile.id,
        email: profile.emails[0].value,
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
}));

// ---------- ROUTES ----------
app.use("/", homeRoute); // ✅ Trang chủ
app.use("/student", studentRouter);
app.use("/account", accountRouter);
app.use("/courses", coursesRouter);
app.use("/admin/categories", adminCategories);

// ---------- 404 PAGE ----------
app.use((req, res) => {
  res.status(404).render("404", { layout: "main" });
});

// ---------- START SERVER ----------
app.listen(3000, () => {
  console.log("✅ Server is running at http://localhost:3000");
});
