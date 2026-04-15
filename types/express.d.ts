import { Request } from "express";

declare global {
    namespace Express {
        export interface Request {
            auth: () => {
                userId: string;
                has: (permission: any) => boolean;
                plan?: string;
                file: any;
            };
        }
    }
}