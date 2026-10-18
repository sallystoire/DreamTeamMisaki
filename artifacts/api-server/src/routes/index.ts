import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dreamteamRouter from "./dreamteam";
import recruitmentRouter from "./recruitment";
import adminControlsRouter from "./admin-controls";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dreamteamRouter);
router.use(recruitmentRouter);
router.use(adminControlsRouter);

export default router;
