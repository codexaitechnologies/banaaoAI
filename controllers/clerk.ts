import { verifyWebhook } from "@clerk/express/webhooks";
import { Request, Response } from "express";
import { prisma } from "../configs/prisma.js";
import * as Sentry from "@sentry/node";

const clerkWebhooks = async (req: Request, res: Response) => {
    try{
        const evt = await verifyWebhook(req);
        const { data, type } = evt;
        console.log('Recevied Webook request: '+ data);
        switch (type) {
            case "user.created":
                console.log("User created:", data);
                await prisma.user.create({
                    data: {
                        id: data.id,
                        email: data.email_addresses?.[0]?.email_address || "",
                        name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
                        image: data.image_url || "",
                    },
                }); 
                break;
            case "user.updated":
                console.log("User updated:", data);
                await prisma.user.update({
                    where: { id: data.id },
                    data: {
                        email: data?.email_addresses[0]?.email_address,
                        name: data.first_name+" "+data.last_name,
                        image: data.image_url,
                    },
                });
                break;
            case "user.deleted":
                console.log("User deleted:", data);
                await prisma.user.delete({
                    where: { id: data.id },
                }); 
                break;
            case "subscription.created":
            case "subscription.updated":
                console.log("Payment attempt updated:", data);
                if (data.status !== "active") {
                    return res.status(200).json({ message: "Not active" });
                }

                if (!data.active_at) {
                    return res.status(200).json({ message: "No activation time" });
                }
                const now = Date.now();

                // ✅ prevent duplicate credits
                if (now - data.active_at > 10000) {
                    return res.status(200).json({ message: "Duplicate event ignored" });
                }
                const clerkUserId = data.payer?.user_id;
                const activeItem = data.items?.find(
                    (item: any) => item.status === "active"
                );
                const rawPlan = activeItem?.plan?.slug;

                type Plan = "pro" | "premium" | "ultra_pro";

                const credits: Record<Plan, number> = {
                    pro: 80,
                    premium: 240,
                    ultra_pro: 500
                };

                if (!rawPlan || !(rawPlan in credits)) {
                    return res.status(200).json({ message: "Ignored" });
                }

                let user = await prisma.user.findUnique({
                    where: { id: clerkUserId }
                });

                if (!user) {
                    user = await prisma.user.create({
                        data: {
                            id: clerkUserId || '12345',
                            email: data.payer?.email || "",
                            name: "",
                            image: "",
                        },
                    });
                }

                const planKey = rawPlan as Plan;

                await prisma.user.update({
                    where: { id: clerkUserId },
                    data: {
                        credits: { increment: credits[planKey] }
                    },
                });
                break; 
            default:
                console.log(`Unhandled event type: ${type}`);
        }
        res.status(200).json({ message: "Webhook received" });
    }catch(error: any){
        Sentry.captureException(error);
        console.error("Webhook error:", error);
    return res.status(200).json({ received: true }); 
    }   
}      

export default clerkWebhooks;