import { Router } from "express";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";
import { assignCapitana, removeCapitana } from "../controllers/adminController.js";

const router = Router();
router.use(authMiddleware, isAdmin);
router.post("/cabildos/:cabildoId/captains/:usuarioId", assignCapitana);
router.delete("/cabildos/:cabildoId/captains/:usuarioId", removeCapitana);
export default router;