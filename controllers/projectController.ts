import {Request, Response} from 'express';
import * as Sentry from "@sentry/node";
import { prisma } from '../configs/prisma.js';
import { v2 as cloudinary } from 'cloudinary';
import { GenerateContentConfig, HarmBlockThreshold, HarmCategory } from '@google/genai';
import fs from 'fs';
import path from 'path';
import ai from '../configs/ai.js';
import axios from 'axios';

const loadImage = (path: string, mimeType: string) => {
    return {
        inlineData: {
            data: fs.readFileSync(path).toString('base64'),
            mimeType
        }
    }
}

export const createProject = async (req: Request, res: Response) => {
    console.log("Create project request received");
    let tempProjectId: string;
    const { userId } = req.auth();
    let isCreditDeducted = false;
    const { name = "New Project", aspectRatio, userPrompt,productName, productDescription, targetLength= 5} = req.body;
    const images: any = req.files;
    if(images.length < 2 || !productName){
        return res.status(400).json({ message: "Please provide at least 2 images and a product name" });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId }
    }); 
     

    if(!user || user.credits < 5){
        return res.status(401).json({ message: "Insufficient Credits" });
    }else{
        await prisma.user.update({
            where: {id: userId},
            data: {credits: { decrement: 5}}
        }).then(() => isCreditDeducted = true).catch(err => {
            console.error("Error deducting credits: ", err);
            return res.status(500).json({ message: "Internal Server Error" });
        });
    }
    try{
        let uploadedImages = await Promise.all(images.map(async (image: any) => {
            let result = await cloudinary.uploader.upload(image.path, { resource_type: 'image', folder: 'banaaoAI' });
            return result.secure_url;
        }));
        const project = await prisma.project.create({
            data: {
                name,
                aspectRatio,
                userPrompt,
                productName,
                productDescription,
                targetLength: parseInt(targetLength),
                uploadedImages,
                userId,
                isGenerating: true
            }
        });
        tempProjectId = project.id;
        const model = 'gemini-3-pro-image-preview';
        const generationConfig: GenerateContentConfig =  {
            maxOutputTokens: 32768,
            temperature:1,
            topP: 0.95,
            responseModalities: ['IMAGE'],
            imageConfig: {
                aspectRatio: aspectRatio || '16:9',
                imageSize: '1K',
            },
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.OFF,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.OFF,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.OFF,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.OFF,
                }
            ]
        }
        const imgBase64 = loadImage(images[0].path, images[0].mimetype);
        const img2Base64 = loadImage(images[0].path, images[0].mimetype);
        const prompt = {
            text: `Combine the person and product into a realistic photo.
            make the person naturally hold or use the product.
            Match lighting,shadows, scale and perspective.
            Make the person stand in professional studio lighting.
            Output ecommerce-quality photo realisitc imagery.
            ${userPrompt}`
        }

        const response: any = await ai.models.generateContent({
            model,
            contents: [imgBase64,img2Base64, prompt],
            config: generationConfig
        })

        if(!response?.candidates?.[0]?.content?.parts){
            throw new Error("Unexpected Response")
        }
        const parts = response.candidates[0].content.parts;
        let finalBuffer : Buffer | null = null;
        for (const part of parts){
            if(part.inlineData){
                finalBuffer = Buffer.from(part.inlineData.data, 'base64')
            }
        }

        if(!finalBuffer){
            throw new Error('Failed to generate image');
        }

        const base64Image = `data:image/png;base64,${finalBuffer.toString('base64')}`;
        const uploadResult = await cloudinary.uploader.upload(base64Image, { resource_type: 'image'})
        await prisma.project.update({
            where: {id: project.id},
            data: { generatedImage: uploadResult.secure_url, isGenerating: false}
        })
        return res.status(201).json({ projectId: project.id });
    }catch(error: any){
        if(tempProjectId!){
            await prisma.project.update({ where: { id: tempProjectId }, data: { isGenerating: false, error: error.message } });
        }
        if(isCreditDeducted){
            await prisma.user.update({
                where: {id: userId},
                data: {credits: { increment: 5}}
            })
        }
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const createVideo = async (req: Request, res: Response) => {
    const { userId } = req.auth();
    const { projectId } = req.body;
    let isCreditDeducted = false;
    const user = await prisma.user.findUnique({
        where: { id: userId }
    }); 
    if(!user || user.credits < 10){
        return res.status(401).json({ message: "Insufficient Credits" });
    }
    await prisma.user.update({
        where: {id: userId},
        data: {credits: { decrement: 10}}
    }).then(() => isCreditDeducted = true);
    try{
        const project = await prisma.project.findUnique({ where: { id: projectId, userId }, include: {user: true} });
        if(!project || project.isGenerating){
            return res.status(404).json({ message: "Generation in progress or project not found" });
        }
        if(project.generatedVideo){
            return res.status(404).json({ message: "Video already generated for this project" });
        }
        await prisma.project.update({
            where: {id: projectId},
            data: {
                 isGenerating: true
            }
        });

        //Video generation logic here using project.generatedImage and other details
        const prompt = `make the person showcase the product which is ${project.productName} - ${project.productDescription} && \`and product description: ${project.productDescription} \``;
        const model = 'veo-3.1-generate-preview';
        if(!project.generatedImage){
            throw new Error("No generated image found for video creation");
        }
        const image = await axios.get(project.generatedImage, { responseType: 'arraybuffer' });
        const imageBytes: any = Buffer.from(image.data);
        let operation: any = await ai.models.generateVideos({
            model,
            prompt,
            image:{
                imageBytes: imageBytes.toString('base64'),
                mimeType: 'image/png'
             },
             config: {
                aspectRatio: project.aspectRatio || '16:9',
                numberOfVideos: 1,
                resolution: '720p'
             }
         })

         while(!operation.done){
            console.log("Video generation in progress...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
         }

         const fileName = `${userId}-${Date.now()}.mp4`;
         const filePath = path.join('videos', fileName);
         fs.mkdirSync('videos', { recursive: true });
         if(!operation.response?.generatedVideos){
            throw new Error(operation.response.raiMediaFilteredReasons[0]);
         }

         await ai.files.download({ 
            file: operation.response.generatedVideos[0].video, 
            downloadPath: filePath});

        const uploadResult = await cloudinary.uploader.upload(filePath, { resource_type: 'video', folder: 'banaaoAI' });        
        //Once video is generated, update the project with the video URL and set isGenerating to false
         await prisma.project.update({
            where: {id: projectId},
            data: {
                generatedVideo: uploadResult.secure_url,
                 isGenerating: false
            }
        });
        fs.unlinkSync(filePath);
        return res.status(200).json({ message: "Video generation started", videoUrl: uploadResult.secure_url });
    }catch(error: any){
            await prisma.project.update({ where: { id: projectId }, data: { isGenerating: false, error: error.message } });
        if(isCreditDeducted){
            await prisma.user.update({
                where: {id: userId},
                data: {credits: { increment: 10}}
            })
        }
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const getAllPublishedProjects = async (req: Request, res: Response) => {
    try{
        const projects = await prisma.project.findMany({
            where: { isPublished: true },
        });
        return res.status(200).json({ projects });
    }catch(error){
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const deleteProject = async (req: Request, res: Response) => {
    try{
        const { userId} = req.auth();
        const { projectId } = req.params;
        const project = await prisma.project.findUnique({ where: { id: projectId.toString(), userId } });
        if(!project){
            return res.status(404).json({ message: "Project not found" });
        }
        await prisma.project.delete({ where: { id: projectId.toString() } });
        return res.status(200).json({ message: "Project deleted successfully" });
    }catch(error){
        Sentry.captureException(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

