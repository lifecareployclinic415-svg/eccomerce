import Link from "next/link";
import { Package, MapPin, Heart, User } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { signOutAction } from "@/features/auth/actions/auth.actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Your account", robots: { index: false } };

const LINKS = [
  { href: "/account/orders", label: "Orders", body: "Track and review past orders", Icon: Package },
  { href: "/account/addresses", label: "Addresses", body: "Manage delivery addresses", Icon: MapPin },
  { href: "/wishlist", label: "Saved items", body: "Things you've kept for later", Icon: Heart },
];

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Your account</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
            <User className="size-4" /> {user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">Sign out</Button>
        </form>
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {LINKS.map(({ href, label, body, Icon }) => (
          <li key={href}>
            <Link href={href} className="block rounded-2xl border border-line p-5 transition-colors hover:border-ink-soft">
              <Icon className="size-5 text-ink-soft" />
              <h2 className="mt-3 font-sans text-sm font-medium">{label}</h2>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
