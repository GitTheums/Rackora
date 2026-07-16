import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, completeSetup, formatDevError, getSetupStatus } from "../lib/api";

export function SetupPage() {
  const navigate = useNavigate();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSetupStatus()
      .then((status) => {
        if (!status.setupRequired) {
          navigate("/login", { replace: true });
          return;
        }
        setCsrfToken(status.csrfToken);
      })
      .catch((loadError) => {
        setError(
          formatDevError(loadError, "Could not load setup status."),
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await completeSetup({ username, password, csrfToken });
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Setup failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading && !csrfToken) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <p className="text-ink-muted">Loading setup…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="font-display text-4xl text-ink">Rackora</p>
      <h1 className="mt-3 text-xl font-medium text-ink">Create admin account</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Set up the first administrator for this Rackora instance.
      </p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-ink">Username</span>
          <input
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-accent"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            minLength={3}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-accent"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Complete setup
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        Already configured?{" "}
        <Link className="text-accent underline" to="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
