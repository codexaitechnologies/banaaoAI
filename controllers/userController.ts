import { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { prisma } from "../configs/prisma.js";

export const getUserCredits = async (req: Request, res: Response) => {
    try{
        const { userId} = req.auth();
        if(!userId){
            return res.status(401).json({ message: "Unauthorized" });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { credits: true }
        });
        if(!user){
            return res.status(404).json({ message: "User not found" });
        }
        // Fetch user credits from database using userId
        const credits = user.credits; // Use the actual database value
        return res.json({ credits });
    }catch(error){
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const getAllProjects = async (req: Request, res: Response) => {
    try{

        const { userId} = req.auth();
        if(!userId){
            return res.status(401).json({ message: "Unauthorized" });
        }
        const projects = await prisma.project.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ projects });  
    }catch(error){
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const getProjectById = async (req: Request, res: Response) => {
    try{
        const { userId} = req.auth();
        const { projectId} = req.params;
        if(!userId || !projectId){
            return res.status(401).json({ message: "Unauthorized" });
        }
        else{
        const project = await prisma.project.findUnique({
            where: { id: projectId.toString(), userId },
            });
            if(!project) return res.status(404).json({ message: "Project not found" });
        return res.json({ project });
        }
    }catch(error){
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const toggleProjectPublic = async (req: Request, res: Response) => {
    try{
        const { userId} = req.auth();
        const { projectId} = req.params;
        if(!userId || !projectId){
            return res.status(401).json({ message: "Unauthorized" });
        }
        const project = await prisma.project.findUnique({
            where: { id: projectId.toString(), userId },
            });
            if(!project) return res.status(404).json({ message: "Project not found" });
        
            if(!project.generatedImage && !project?.generatedVideo){
                return res.status(400).json({ message: "Project cannot be published without generated image or video" });
            }

            await prisma.project.update({
                where: { id: projectId.toString(), userId },
                data: { isPublished: !project.isPublished },
            });
        return res.json({ message: `Project is now ${!project.isPublished ? "public" : "private"}`, isPublished: !project.isPublished });
    }catch(error){
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}