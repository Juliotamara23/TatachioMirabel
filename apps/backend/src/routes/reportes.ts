import { Router } from "express";
import { generarCenso } from "../controllers/reporteController.js";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// El censo ministerial contiene datos censales sensibles (PII) de TODOS los
// cabildos — solo ADMINISTRADOR puede generarlo. (review-risk CRITICAL, issue #39)
router.get("/censo.xlsx", authMiddleware, isAdmin, generarCenso);

export default router;
