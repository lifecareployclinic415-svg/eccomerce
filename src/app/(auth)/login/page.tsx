import { LoginForm } from "@/features/auth/components/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect } = await searchParams;
  return <LoginForm redirectTo={redirect} />;
}
