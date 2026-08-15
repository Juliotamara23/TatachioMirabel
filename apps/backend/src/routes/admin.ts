import { Router } from "express";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";
import { assignCapitana, removeCapitana, listCaptains } from "../controllers/adminController.js";

const router = Router();
router.use(authMiddleware, isAdmin);
router.get("/captains", listCaptains);
router.post("/cabildos/:cabildoId/captains/:usuarioId", assignCapitana);
router.delete("/cabildos/:cabildoId/captains/:usuarioId", removeCapitana);
export default router;