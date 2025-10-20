import { Router } from "express";
import { isAdmin } from "../middlewares/auth.js";
const r = Router();

r.get("/ping", isAdmin, (_req, res) => res.send("admin ok"));

export default r;
