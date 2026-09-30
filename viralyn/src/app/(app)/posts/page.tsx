import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { PostsList } from "@/components/PostsList";

export default async function PostsPage() {
  const user = await requireUser();
  return <Suspense><PostsList authorName={user.name} /></Suspense>;
}
