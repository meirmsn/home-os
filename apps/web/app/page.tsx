// What: Landing page placeholder. Replaced when the first feature ships.
// Why:  Anchor the dark-ground design state on day one so a deploy-preview
//       at this point already shows the brand voice (vs. the create-next-app
//       "Get started by editing app/page.tsx" page).
// Does NOT: Render any real data or auth state — first feature owns those.

/** Single-line landing — calm authority. */
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <p className="text-lg font-medium text-[var(--color-text-primary-inverse)]">
        Home OS — coming soon.
      </p>
    </main>
  );
}
