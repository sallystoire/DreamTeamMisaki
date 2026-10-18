import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dreamteamRouter from "./dreamteam";
import recruitmentRouter from "./recruitment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dreamteamRouter);
router.use(recruitmentRouter);

export default router;
