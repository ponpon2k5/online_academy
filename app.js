import express from "express";
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import courseRoute from "./routes/course.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "statics")));
app.use("/css", express.static(path.join(__dirname, "statics", "css")));


app.get("/", (req, res) => {
  res.render("home", { layout: "main" });
});

app.get("/courses", (req, res) => {
  res.render("courses", { layout: "main" });
});

app.get("/course/:id", (req, res) => {
  res.render("courseDetail", { layout: "main" });
});

app.get("/search", (req, res) => {
  res.render("search", { layout: "main" });
});


app.use("/course", courseRoute);

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
