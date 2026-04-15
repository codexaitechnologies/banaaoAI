import express from 'express';
import { protect} from "../middlewares/auth.js";
import { getUserCredits, getAllProjects, getProjectById, toggleProjectPublic } from '../controllers/userController.js';
const userRouter = express.Router();

userRouter.get('/credits',protect, getUserCredits);
userRouter.get('/projects',protect, getAllProjects);
userRouter.get('/projects/:projectId',protect, getProjectById);
userRouter.post('/publish/:projectId',protect, toggleProjectPublic);

export default userRouter;