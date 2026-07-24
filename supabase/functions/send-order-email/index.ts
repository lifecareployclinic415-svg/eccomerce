// Deploy to: supabase/functions/send-order-email/index.ts
//
//   supabase secrets set RESEND_API_KEY=re_xxx ORDER_FROM="Store <orders@yourdomain.com>"
//   supabase functions deploy send-order-email
//
// WHY AN EDGE FUNCTION: Supabase's built-in email sender is rate limited to
// roughly 2 messages per hour — fine for auth in development, useless for
// order confirmations. Transactional mail needs a real provider. Running it
// at the edge also keeps the API key off the Next.js server and lets a
// Database Webhook trigger it directly when an order reaches 'confirmed'.

import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("ORDER_FROM") ?? "Store <orders@example.com>";

const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);

Deno.serve(async (req) => {
  try {
    const { orderId } = await req.json();
    if (!orderId) return json({ error: "orderId is required" }, 400);

    // Service-role client: this function is trusted server code.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*), addresses:shipping_address_id(*)")
      .eq("id", orderId)
      .single();

    if (error || !order) return json({ error: "Order not found" }, 404);

    const to = order.contact_email;
    if (!to) return json({ error: "Order has no contact email" }, 422);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `Order ${order.order_number} confirmed`,
        html: renderEmail(order),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("[send-order-email] provider rejected", detail);
      return json({ error: "Email provider rejected the message" }, 502);
    }

    return json({ sent: true });
  } catch (e) {
    console.error("[send-order-email]", e);
    return json({ error: "Unexpected failure" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Inline styles and a table layout on purpose: email clients strip <style>
 * blocks and have no flexbox or grid support worth relying on.
 */
function renderEmail(order: Record<string, any>): string {
  const items = (order.order_items ?? [])
    .map(
      (item: Record<string, any>) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <div style="font-size:14px;color:#111;">${escapeHtml(item.product_name)}</div>
          ${item.variant_label ? `<div style="font-size:12px;color:#666;">${escapeHtml(item.variant_label)}</div>` : ""}
          <div style="font-size:12px;color:#666;">Qty ${item.quantity}</div>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid #eee;font-size:14px;color:#111;">
          ${inr(Number(item.line_total))}
        </td>
      </tr>`,
    )
    .join("");

  const address = order.addresses;

  return `<!doctype html>
<html><body style="margin:0;background:#fafaf9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:22px;color:#111;">Thanks — your order is confirmed</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#666;">
            Order <strong style="color:#111;">${escapeHtml(order.order_number)}</strong>
            ${order.invoice_number ? ` · Invoice ${escapeHtml(order.invoice_number)}` : ""}
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>

          <table role="presentation" width="100%" style="margin-top:16px;font-size:14px;">
            ${row("Subtotal", inr(Number(order.subtotal)))}
            ${Number(order.discount_total) > 0 ? row("Discount", `−${inr(Number(order.discount_total))}`) : ""}
            ${row("Tax", inr(Number(order.tax_total)))}
            ${row("Delivery", Number(order.shipping_total) === 0 ? "Free" : inr(Number(order.shipping_total)))}
            <tr>
              <td style="padding-top:12px;font-weight:600;color:#111;">Total paid</td>
              <td align="right" style="padding-top:12px;font-weight:600;color:#111;">
                ${inr(Number(order.grand_total))}
              </td>
            </tr>
          </table>

          ${
            address
              ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eee;">
                   <div style="font-size:12px;color:#666;margin-bottom:6px;">Delivering to</div>
                   <div style="font-size:14px;color:#111;line-height:1.5;">
                     ${escapeHtml(address.full_name)}<br/>
                     ${escapeHtml(address.line1)}<br/>
                     ${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.postal_code)}
                   </div>
                 </div>`
              : ""
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:4px 0;color:#666;">${label}</td>
    <td align="right" style="padding:4px 0;color:#111;">${value}</td>
  </tr>`;
}

/** Order data is user-supplied; never interpolate it raw into HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
