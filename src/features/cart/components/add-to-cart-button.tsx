// src/features/cart/components/add-to-cart-button.tsx

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, Loader2, ShoppingBag, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { addToCartAction, updateCartItemAction, removeCartItemAction } from "@/features/cart/actions/cart.actions";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  variantId,
  disabled,
  quantity = 1,
}: {
  variantId: string | null;
  disabled?: boolean;
  quantity?: number;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [pending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    if (!variantId) return toast.error("Choose an option first");

    startTransition(async () => {
      const result = await addToCartAction({ variantId, quantity });

      if (!result.ok) return toast.error(result.error);

      // Honest feedback: if we could not add the full amount, say so.
      if (result.data?.clamped) {
        toast.warning("Added what we had left in stock");
      } else {
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1800);
      }

      // Refreshes the server-rendered header count and cart page.
      router.refresh();
    });
  };

  return (
    <Button
      onClick={handleAdd}
      disabled={disabled || pending || !variantId}
      size="lg"
      className="relative w-full overflow-hidden bg-brand text-on-brand hover:bg-brand-hover"
    >
      <AnimatePresence mode="wait" initial={false}>
        {pending ? (
          <motion.span key="pending" className="flex items-center gap-2"
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 className="size-4 animate-spin" /> Adding
          </motion.span>
        ) : justAdded ? (
          <motion.span key="added" className="flex items-center gap-2"
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Check className="size-4" /> Added to bag
          </motion.span>
        ) : (
          <motion.span key="idle" className="flex items-center gap-2"
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ShoppingBag className="size-4" /> Add to bag
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
