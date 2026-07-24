"use server";

import { z } from "zod";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import {
  sectionSchema,
  SETTINGS_SCHEMAS,
  CMS_TAGS,
  type SettingsKey,
} from "@/features/cms/schemas/cms.schemas";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

/**
 * INVALIDATION STRATEGY.
 *
 * Every write invalidates a TAG, never a path. Tags are precise: editing
 * the announcement bar refreshes the announcement everywhere it appears
 * without flushing the homepage, the shop and every product page.
 *
 * On Next 16 with Cache Components, swap revalidateTag for `updateTag`
 * here — it blocks until fresh data is available, so an editor who clicks
 * Save sees their change on the very next render (read-your-own-writes)
 * rather than a stale value refreshing in the background.
 */

/* ------------------------------------------------------------- settings */

export async function updateSettingAction(
  key: SettingsKey,
  value: unknown,
): Promise<ActionResult> {
  await requireAdmin();

  const schema = SETTINGS_SCHEMAS[key];
  if (!schema) return { ok: false, error: "Unknown setting" };

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("site_settings")
    .upsert({ key, value: parsed.data, updated_at: new Date().toISOString() });

  if (error) return { ok: false, error: "Could not save that setting" };

  revalidateTag(CMS_TAGS.settings);
  revalidateTag(`${CMS_TAGS.settings}:${key}`);
  return { ok: true };
}

/* ------------------------------------------------------------- sections */

const upsertSectionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  isActive: z.coerce.boolean().default(true),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
}); // `type` and `config` are validated separately by the union below.

export async function upsertSectionAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const meta = upsertSectionSchema.safeParse(input);
  if (!meta.success) return { ok: false, error: "Check the section details" };

  // Validate the typed config against its own schema in the union.
  const content = sectionSchema.safeParse(input);
  if (!content.success) {
    return {
      ok: false,
      error: "Check the section content",
      fieldErrors: content.error.flatten().fieldErrors,
    };
  }

  const db = createAdminClient();
  const row = {
    type: content.data.type,
    config: content.data.config,
    name: meta.data.name,
    is_active: meta.data.isActive,
    starts_at: meta.data.startsAt ?? null,
    ends_at: meta.data.endsAt ?? null,
  };

  const query = meta.data.id
    ? db.from("homepage_sections").update(row).eq("id", meta.data.id).select("id").single()
    : db.from("homepage_sections").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) return { ok: false, error: "Could not save that section" };

  revalidateTag(CMS_TAGS.sections);
  revalidatePath("/admin/homepage");
  return { ok: true, data: { id: data.id } };
}

export async function reorderSectionsAction(orderedIds: string[]): Promise<ActionResult> {
  await requireAdmin();

  const parsed = z.array(z.string().uuid()).min(1).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid order" };

  const db = createAdminClient();
  await Promise.all(
    parsed.data.map((id, index) =>
      db.from("homepage_sections").update({ sort_order: index }).eq("id", id),
    ),
  );

  revalidateTag(CMS_TAGS.sections);
  revalidatePath("/admin/homepage");
  return { ok: true };
}

export async function toggleSectionAction(id: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();

  const db = createAdminClient();
  const { error } = await db.from("homepage_sections").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: "Could not update that section" };

  revalidateTag(CMS_TAGS.sections);
  revalidatePath("/admin/homepage");
  return { ok: true };
}

export async function deleteSectionAction(id: string): Promise<ActionResult> {
  await requireAdmin();

  const db = createAdminClient();
  const { error } = await db.from("homepage_sections").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete that section" };

  revalidateTag(CMS_TAGS.sections);
  revalidatePath("/admin/homepage");
  return { ok: true };
}

/* ----------------------------------------------------------- navigation */

const navItemSchema = z.object({
  id: z.string().uuid().optional(),
  location: z.enum(["header", "footer", "legal", "mobile"]),
  parentId: z.string().uuid().nullish(),
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(200),
  groupLabel: z.string().max(60).nullish(),
  opensNewTab: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export async function upsertNavItemAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = navItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the link details", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { id, parentId, groupLabel, opensNewTab, isActive, ...rest } = parsed.data;
  const row = {
    ...rest,
    parent_id: parentId ?? null,
    group_label: groupLabel ?? null,
    opens_new_tab: opensNewTab,
    is_active: isActive,
  };

  const db = createAdminClient();
  const { error } = id
    ? await db.from("navigation_items").update(row).eq("id", id)
    : await db.from("navigation_items").insert(row);

  if (error) return { ok: false, error: "Could not save that link" };

  revalidateTag(CMS_TAGS.navigation);
  return { ok: true };
}

/* ---------------------------------------------------- pages, testimonials */

const cmsPageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  title: z.string().min(1).max(160),
  content: z.string().max(80_000),
  isPublished: z.coerce.boolean().default(false),
});

export async function upsertCmsPageAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = cmsPageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the page fields", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const db = createAdminClient();
  const { error } = await db.from("cms_pages").upsert(
    {
      slug: parsed.data.slug,
      title: parsed.data.title,
      content: parsed.data.content,
      is_published: parsed.data.isPublished,
    },
    { onConflict: "slug" },
  );

  if (error) return { ok: false, error: "Could not save that page" };

  revalidateTag(CMS_TAGS.pages);
  revalidatePath(`/${parsed.data.slug}`);
  return { ok: true };
}

const testimonialSchema = z.object({
  id: z.string().uuid().optional(),
  authorName: z.string().min(1).max(80),
  authorRole: z.string().max(80).nullish(),
  avatarUrl: z.string().nullish(),
  quote: z.string().min(1).max(600),
  rating: z.coerce.number().int().min(1).max(5).nullish(),
  isActive: z.coerce.boolean().default(true),
});

export async function upsertTestimonialAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the testimonial fields" };

  const { id, authorName, authorRole, avatarUrl, isActive, ...rest } = parsed.data;
  const row = {
    ...rest,
    author_name: authorName,
    author_role: authorRole ?? null,
    avatar_url: avatarUrl ?? null,
    is_active: isActive,
  };

  const db = createAdminClient();
  const { error } = id
    ? await db.from("testimonials").update(row).eq("id", id)
    : await db.from("testimonials").insert(row);

  if (error) return { ok: false, error: "Could not save that testimonial" };

  revalidateTag(CMS_TAGS.testimonials);
  return { ok: true };
}
