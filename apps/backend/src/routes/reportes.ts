import { Router } from "express";
import { generarCenso } from "../controllers/reporteController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/censo.xlsx", authMiddleware, generarCenso);

export default router;
