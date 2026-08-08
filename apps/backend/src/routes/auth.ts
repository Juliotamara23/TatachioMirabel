import { Router } from "express";
import { register, login } from "../controllers/authController.js";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// El registro de usuarios está restringido a ADMINISTRADOR (issue #38):
// el primer admin se crea por env (ADMIN_EMAIL/ADMIN_PASSWORD) al arrancar.
router.post("/register", authMiddleware, isAdmin, register);
router.post("/login", login);

export default router;
