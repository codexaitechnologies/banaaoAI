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
            case "paymentAttempt.updated":
                console.log("Payment attempt updated:", JSON.stringify(data, null, 2));

                if (
                (data.charge_type === 'checkout' || data.charge_type === 'recurring') &&
                data.status === 'paid'
                ) {
                    const clerkUserId = data.payer?.user_id;

                    const rawPlan = (data.subscription_items?.[0] as any)?.plan?.slug;

                    type Plan = "pro" | "premium";

                    const credits: Record<Plan, number> = {
                        pro: 80,
                        premium: 240
                    };

                    if (!rawPlan || !(rawPlan in credits)) {
                        console.log("Invalid plan:", rawPlan);
                        return res.status(200).json({ message: "Ignored unknown plan" });
                    }

                    const planKey = rawPlan as Plan;

                    console.log("plan:", planKey, "user:", clerkUserId);

                    await prisma.user.update({
                        where: { id: clerkUserId },
                        data: {
                            credits: { increment: credits[planKey] },
                        },
                    });
                }

                break;  
            // case "subscription.created":
            // case "subscription.updated":
            //     console.log("Subscription event:", JSON.stringify(data, null, 2));
            //     const clerkUserId = data.payer?.user_id;
            //      const activeItem = data.items?.find(
            //         (item: any) => item.status === "active"
            //     );
            //     const rawPlan = activeItem?.plan?.slug;
            //     type Plan = "pro" | "premium" | "ultra_pro";
            //     const credits: Record<Plan, number> = {
            //         pro: 80,
            //         premium: 240,
            //         ultra_pro: 500
            //     };
            //     if (!rawPlan || !(rawPlan in credits)) {
            //         console.log("Unknown plan:", rawPlan);
            //         return res.status(200).json({ message: "Ignored" });
            //     }
            //     let user = await prisma.user.findUnique({
            //         where: { id: clerkUserId }
            //     });
            //     if (!user) {
            //         console.log("User not found, creating:", clerkUserId);

            //         user = await prisma.user.create({
            //             data: {
            //                 id: clerkUserId || '123',
            //                 email: data.payer?.email || "",
            //                 name: `${data.payer?.first_name || ""} ${data.payer?.last_name || ""}`.trim(),
            //                 image: data.payer?.image_url || "",
            //             },
            //         });
            //     }
            //     const planKey = rawPlan as Plan;
            //     await prisma.user.update({
            //         where: { id: clerkUserId },
            //         data: {
            //             credits: { increment: credits[planKey] },
            //         },
            //     });
            //     console.log("Credits updated for:", clerkUserId);
            //     break; 
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
