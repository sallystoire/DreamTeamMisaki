import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dreamteamRouter from "./dreamteam";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dreamteamRouter);

export default router;
