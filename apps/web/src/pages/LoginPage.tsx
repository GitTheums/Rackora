import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, formatDevError, getCsrfToken, getCurrentUser, login } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(() => {
        navigate("/", { replace: true });
      })
      .catch(() => undefined);

    getCsrfToken()
      .then((response) => {
        setCsrfToken(response.csrfToken);
      })
      .catch((loadError) => {
        setError(formatDevError(loadError, "Could not load login form."));
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
      await login({ username, password, csrfToken });
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Login failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading && !csrfToken) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <p className="text-ink-muted">Loading login…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="font-display text-4xl text-ink">Rackora</p>
      <h1 className="mt-3 text-xl font-medium text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Access your homelab dashboard.
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
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-accent"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        Need to finish setup?{" "}
        <Link className="text-accent underline" to="/setup">
          Create admin
        </Link>
      </p>
    </main>
  );
}
