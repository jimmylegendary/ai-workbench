import { redirect } from "next/navigation";

/** Root → the instrument screen. Middleware bounces to /login if unauthenticated. */
export default function Home() {
  redirect("/simulation");
}
