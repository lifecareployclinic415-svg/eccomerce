"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { productService } from "@/features/products/services/product.service";
import { parseTableSearch } from "@/lib/data-table/table-search";
import {
  productSchema,
  productUpdateSchema,
  productBulkEditSchema,
  bulkIdsSchema,
} from "@/features/products/schemas/product.schema";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

const ADMIN_PATH = "/admin/products";

/**
 * Every action re-authorizes. Middleware and layout guards are convenience;
 * a server action is a public HTTP endpoint and must defend itself.
 * RLS in Postgres is the third and final layer.
 */

export async function createProductAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const product = await productService.create(parsed.data);
    revalidatePath(ADMIN_PATH);
    revalidatePath("/shop");
    return { ok: true, data: { id: product.id } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateProductAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = productUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { id, ...rest } = parsed.data;
  try {
    await productService.update(id, rest);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`/product/${rest.slug ?? ""}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function bulkEditProductsAction(input: unknown): Promise<ActionResult<{ updated: number }>> {
  await requireAdmin();

  const parsed = productBulkEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid bulk edit request" };

  try {
    const updated = await productService.bulkEdit(parsed.data);
    revalidatePath(ADMIN_PATH);
    return { ok: true, data: { updated } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function bulkDeleteProductsAction(input: unknown): Promise<ActionResult<{ deleted: number }>> {
  await requireAdmin();

  const parsed = bulkIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nothing selected" };

  try {
    const deleted = await productService.bulkRemove(parsed.data.ids);
    revalidatePath(ADMIN_PATH);
    revalidatePath("/shop");
    return { ok: true, data: { deleted } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Export runs on the server so the browser never has to hold the full
 * dataset, and it honours the CURRENT filters — you export what you see.
 */
export async function exportProductsAction(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ActionResult<{ rows: Record<string, unknown>[] }>> {
  await requireAdmin();

  try {
    const rows = await productService.exportRows(parseTableSearch(searchParams));
    return { ok: true, data: { rows } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function message(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
