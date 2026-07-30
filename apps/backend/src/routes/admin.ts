import { Router } from "express";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";
import { assignCapitana, removeCapitana } from "../controllers/adminController.js";

const router = Router();
router.use(authMiddleware, isAdmin);
router.post("/cabildos/:cabildoId/capitanas/:usuarioId", assignCapitana);
router.delete("/cabildos/:cabildoId/capitanas/:usuarioId", removeCapitana);
export default router;