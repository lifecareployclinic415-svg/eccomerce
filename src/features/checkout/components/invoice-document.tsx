// src/features/checkout/components/invoice-document.tsx

export function InvoiceDocument({ order }: { order: Record<string, any> }) {
  const address = order.addresses;

  return (
    <article className="mx-auto max-w-3xl bg-white p-10 text-black print:p-0">
      <style>{`
        @media print {
          @page { margin: 16mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      <header className="flex items-start justify-between border-b border-neutral-300 pb-6">
        <div>
          <h1 className="text-2xl font-semibold">Tax invoice</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {order.invoice_number ?? "Draft — issued on payment"}
          </p>
        </div>
        <div className="text-right text-sm text-neutral-600">
          <p>Order {order.order_number}</p>
          <p>{new Date(order.invoiced_at ?? order.placed_at).toLocaleDateString("en-IN")}</p>
        </div>
      </header>

      {address && (
        <section className="mt-6 text-sm">
          <p className="mb-1 text-neutral-500">Billed to</p>
          <p className="font-medium">{address.full_name}</p>
          <p className="text-neutral-700">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            <br />
            {address.city}, {address.state} {address.postal_code}
          </p>
        </section>
      )}

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="pb-2 font-normal">Item</th>
            <th className="pb-2 text-right font-normal">Qty</th>
            <th className="pb-2 text-right font-normal">Unit</th>
            <th className="pb-2 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(order.order_items ?? []).map((item: Record<string, any>) => (
            <tr key={item.id} className="border-b border-neutral-200">
              <td className="py-2.5">
                {item.product_name}
                {item.variant_label && (
                  <span className="block text-xs text-neutral-500">{item.variant_label}</span>
                )}
              </td>
              <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
              <td className="py-2.5 text-right tabular-nums">
                {inr.format(Number(item.unit_price))}
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {inr.format(Number(item.line_total))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-6 ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <Line label="Subtotal" value={inr.format(Number(order.subtotal))} />
        {Number(order.discount_total) > 0 && (
          <Line label="Discount" value={`−${inr.format(Number(order.discount_total))}`} />
        )}
        <Line label="Tax" value={inr.format(Number(order.tax_total))} />
        <Line
          label="Delivery"
          value={Number(order.shipping_total) === 0 ? "Free" : inr.format(Number(order.shipping_total))}
        />
        <div className="flex justify-between border-t border-neutral-300 pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{inr.format(Number(order.grand_total))}</span>
        </div>
      </section>

      <button
        onClick={() => window.print()}
        className="no-print mt-10 rounded-lg border border-neutral-300 px-4 py-2 text-sm"
      >
        Print or save as PDF
      </button>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-neutral-700">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
