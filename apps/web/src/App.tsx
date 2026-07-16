import { RACKORA_VERSION } from "@rackora/shared";

export function App() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-x-0 top-24 mx-auto h-[420px] w-[min(90vw,720px)] rounded-full bg-[radial-gradient(circle,rgba(31,107,79,0.14),transparent_70%)]"
      />

      <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-8">
        <p className="animate-rise font-display text-5xl tracking-tight text-ink sm:text-7xl">
          Rackora
        </p>
        <h1 className="animate-rise-delay mt-4 max-w-xl font-sans text-2xl font-medium leading-snug text-ink sm:text-3xl">
          Your homelab, at a glance.
        </h1>
        <p className="animate-rise-delay-2 mt-5 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">
          A self-hosted dashboard for monitoring Proxmox, Docker, storage, and
          host health — without a heavy observability stack.
        </p>
        <div className="animate-rise-delay-2 mt-10 flex flex-wrap items-center gap-4">
          <a
            href="/health"
            className="inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Check health
          </a>
          <span className="text-sm text-ink-muted">v{RACKORA_VERSION}</span>
        </div>
      </main>
    </div>
  );
}
