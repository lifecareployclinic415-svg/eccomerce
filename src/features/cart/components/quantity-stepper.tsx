// src/features/cart/components/quantity-stepper.tsx

/**
 * Optimistic UI done honestly. The displayed number updates the instant the
 * shopper clicks, so the interface never feels laggy — but the SERVER is the
 * authority. If it clamps the quantity to available stock, we snap back to
 * the real value and explain why, rather than showing a number that is a lie.
 */
export function QuantityStepper({
  itemId,
  quantity,
  max,
}: {
  itemId: string;
  quantity: number;
  max: number;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(quantity);
  const [pending, startTransition] = useTransition();

  const commit = (next: number) => {
    const previous = optimistic;
    setOptimistic(next);

    startTransition(async () => {
      const result =
        next <= 0
          ? await removeCartItemAction(itemId)
          : await updateCartItemAction({ itemId, quantity: next });

      if (!result.ok) {
        setOptimistic(previous); // roll back
        return toast.error(result.error);
      }

      if ("data" in result && result.data && result.data.quantity !== next) {
        setOptimistic(result.data.quantity);
        toast.warning(`Only ${result.data.quantity} left in stock`);
      }

      router.refresh();
    });
  };

  return (
    <div className={cn("inline-flex items-center rounded-lg border border-line", pending && "opacity-70")}>
      <button
        type="button"
        onClick={() => commit(optimistic - 1)}
        disabled={pending}
        aria-label="Decrease quantity"
        className="grid size-9 place-items-center text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>

      <span className="numeric w-10 text-center text-sm" aria-live="polite">
        {optimistic}
      </span>

      <button
        type="button"
        onClick={() => commit(optimistic + 1)}
        disabled={pending || optimistic >= max}
        aria-label="Increase quantity"
        className="grid size-9 place-items-center text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
