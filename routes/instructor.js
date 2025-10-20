import { Router } from "express";
import { isInstructor } from "../middlewares/auth.js";
const r = Router();

r.get("/ping", isInstructor, (_req, res) => res.send("instructor ok"));

export default r;
