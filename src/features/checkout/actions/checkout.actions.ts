// src/features/checkout/actions/checkout.actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkoutService } from "@/features/checkout/services/checkout.service";
import { requireUser, getCurrentUser } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

export async function placeOrderAction(
  input: unknown,
): Promise<ActionResult<{ orderId: string; orderNumber: string; paymentMethod: string }>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await getCurrentUser();

  // Order placement is expensive and touches inventory locks — worth
  // limiting even for legitimate users.
  if (!(await rateLimit(`order:${user?.id ?? parsed.data.contactEmail}`, { limit: 8, windowSec: 600 }))) {
    return { ok: false, error: "Too many attempts. Please wait a moment." };
  }

  const result = await checkoutService.placeOrder(parsed.data);

  if (!result.ok) {
    // Stock and price failures send the shopper back to the bag, because
    // the bag is where the problem is fixable.
    return { ok: false, error: result.message };
  }

  revalidatePath("/cart");
  revalidatePath("/account/orders");

  return {
    ok: true,
    data: {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      paymentMethod: parsed.data.paymentMethod,
    },
  };
}

export async function saveAddressAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser("/checkout");

  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the address fields", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const db = createAdminClient();
  const { fullName, postalCode, isDefault, ...rest } = parsed.data;

  // Only one default per user.
  if (isDefault) {
    await db.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  }

  const { data, error } = await db
    .from("addresses")
    .insert({
      user_id: user.id,
      full_name: fullName,
      postal_code: postalCode,
      is_default: isDefault,
      ...rest,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: "Could not save that address" };

  revalidatePath("/checkout");
  revalidatePath("/account/addresses");
  return { ok: true, data: { id: data.id } };
}

/**
 * Order confirmation must be reachable by guests too, so it is keyed by the
 * order id AND validated against the session or contact email rather than
 * being world-readable by id.
 */
export async function getConfirmationAction(orderId: string) {
  const order = await checkoutService.getOrderForConfirmation(orderId);
  if (!order) redirect("/");

  const user = await getCurrentUser();
  if (order.user_id && order.user_id !== user?.id) redirect("/login");

  return order;
}
