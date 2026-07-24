// src/features/checkout/schemas/checkout.schema.ts

import { z } from "zod";

export const addressSchema = z.object({
  fullName: z.string().min(2, "Enter a name").max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  line1: z.string().min(4, "Enter a street address").max(160),
  line2: z.string().max(160).optional().or(z.literal("")),
  city: z.string().min(2, "Enter a city").max(80),
  state: z.string().min(2, "Choose a state").max(80),
  postalCode: z.string().regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
  country: z.string().default("IN"),
  isDefault: z.coerce.boolean().default(false),
});

export const checkoutSchema = z.object({
  shippingAddressId: z.string().uuid("Choose a delivery address"),
  billingAddressId: z.string().uuid().optional(),
  contactEmail: z.string().email("Enter a valid email"),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  paymentMethod: z.enum(["stripe", "razorpay", "cod"]),
  couponCode: z.string().max(40).optional(),
  /**
   * Generated once per checkout session in the browser. A double-click, a
   * flaky network retry, or a back-then-forward all reuse the same key, and
   * the unique index on orders turns the second attempt into a no-op.
   */
  idempotencyKey: z.string().uuid(),
});

export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
