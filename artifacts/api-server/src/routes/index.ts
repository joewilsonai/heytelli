import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bumbleRouter from "./bumble";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bumbleRouter);

export default router;
