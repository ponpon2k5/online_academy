import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { engine } from "express-handlebars";
import session from 'express-session';
import hbs_sections from 'express-handlebars-sections';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

//session
app.set('trust proxy', 1) // trust first proxy
app.use(session({
    secret: 'duybodoi',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // secure = true chỉ dùng khi https
}))
app.use(express.urlencoded({ extended: true })); //Giúp Express đọc dữ liệu trong form POST

app.use(async function (req, res, next) {
    if(req.session.isAuthenticated){
        res.locals.isAuthenticated = true;
        res.locals.authUser = req.session.authUser;
    }
    next();
});

//view engine
app.engine("handlebars", engine({
  extname: ".handlebars",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
        section: hbs_sections()
    }
}));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

//static files
app.use("/images", express.static(path.join(__dirname, "statics", "img")));

//router
//student routes
import studentRouter from "./routes/student.route.js";
app.use("/student", studentRouter);
import accountRouter from "./routes/account.route.js";
app.use("/account", accountRouter);
import coursesRouter from "./routes/courses.route.js";
app.use("/courses", coursesRouter);


//test homepage
app.get("/", (req, res) => {
  res.render("home", { title: "Trang chủ" });
});

//start server
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
