import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useAuth } from "../auth-context";
import { getStoredDeviceId } from "../device-storage";
import { Button, TextField } from "../../components/primitives";
import { Logo } from "../../components/brand/Logo";
import styles from "./pages.module.css";

interface AuthMethods {
  internal: boolean;
  oidc: boolean;
  recovery: boolean;
  passwordReset?: boolean;
  oidcLabel?: string;
}

export function SetupPage() {
  const { t } = useTranslation("auth");
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<{ data: { user: NonNullable<unknown> } }>(
        "/auth/setup",
        {
          method: "POST",
          body: JSON.stringify({
            email: fd.get("email"),
            username: fd.get("username"),
            displayName: fd.get("displayName"),
            password: fd.get("password"),
          }),
        },
      );
      setUser(res.data.user as never);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.authBrand}>
        <Logo size="lg" />
      </div>
      <h1>{t("setupTitle")}</h1>
      <p className={styles.lead}>{t("setupSubtitle")}</p>
      <form className={styles.form} onSubmit={onSubmit}>
        <TextField
          label={t("email")}
          id="email"
          name="email"
          type="email"
          required
        />
        <TextField
          label={t("username")}
          id="username"
          name="username"
          required
        />
        <TextField
          label={t("displayName")}
          id="displayName"
          name="displayName"
          required
        />
        <TextField
          label={t("password")}
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
        />
        {error && <p role="alert">{error}</p>}
        <Button type="submit" variant="primary">
          {t("createAdmin")}
        </Button>
      </form>
    </div>
  );
}

function PasswordLoginForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const { t } = useTranslation("auth");
  const { setUser } = useAuth();
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const deviceId = getStoredDeviceId();
      const res = await api<{ data: { user: NonNullable<unknown> } }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: fd.get("email"),
            password: fd.get("password"),
            ...(deviceId ? { deviceId } : {}),
          }),
        },
      );
      setUser(res.data.user as never);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <TextField
        label={t("email")}
        id="email"
        name="email"
        type="email"
        required
      />
      <TextField
        label={t("password")}
        id="password"
        name="password"
        type="password"
        required
      />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" variant="primary">
        {t("login")}
      </Button>
    </form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation(["auth", "settings"]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      await api("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(
        t("settings:resetPasswordSent", {
          defaultValue:
            "If an account exists for that email, a reset link has been sent.",
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("settings:resetPasswordError", {
              defaultValue: "Could not reset password.",
            }),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.settingsSection}>
      <h2>{t("resetPasswordTitle", { defaultValue: "Reset password" })}</h2>
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
        <TextField
          label={t("email")}
          id="reset-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {message && (
          <p className={styles.lead} role="status">
            {message}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button type="submit" variant="primary" disabled={sending}>
            {t("settings:resetPasswordRequest", {
              defaultValue: "Send reset link",
            })}
          </Button>
          <Button type="button" onClick={onBack}>
            {t("backToLogin", { defaultValue: "Back to sign in" })}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation(["auth", "settings"]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError(t("settings:resetPasswordError", { defaultValue: "Could not reset password." }));
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setMessage(
        t("settings:resetPasswordSuccess", {
          defaultValue: "Password updated. You can sign in now.",
        }),
      );
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("settings:resetPasswordError", {
              defaultValue: "Could not reset password.",
            }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.page}>
        <p role="alert">
          {t("settings:resetPasswordError", { defaultValue: "Could not reset password." })}
        </p>
        <Link to="/login">{t("backToLogin", { defaultValue: "Back to sign in" })}</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.authBrand}>
        <Logo size="lg" />
      </div>
      <h1>{t("resetPasswordTitle", { defaultValue: "Reset password" })}</h1>
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
        <TextField
          label={t("password")}
          id="reset-new-password"
          name="newPassword"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        {message && (
          <p className={styles.lead} role="status">
            {message}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" variant="primary" disabled={saving}>
          {t("settings:resetPasswordConfirm", { defaultValue: "Set new password" })}
        </Button>
      </form>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const authError = searchParams.get("auth_error");

  useEffect(() => {
    void api<{ data: AuthMethods }>("/auth/methods")
      .then((res) => setMethods(res.data))
      .catch(() =>
        setMethods({ internal: true, oidc: false, recovery: false }),
      );
  }, []);

  if (!methods) {
    return (
      <div className={styles.page}>
        <p>{t("loading", { defaultValue: "Loading…" })}</p>
      </div>
    );
  }

  const oidcLabel = methods.oidcLabel ?? t("oidcDefaultLabel");

  return (
    <div className={styles.page}>
      <div className={styles.authBrand}>
        <Logo size="lg" />
      </div>
      <h1>{t("login")}</h1>

      {authError && (
        <p role="alert" className={styles.lead}>
          {authError}
        </p>
      )}

      {methods.oidc && (
        <div className={styles.settingsSection}>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              window.location.href = "/api/v1/auth/oidc/login";
            }}
          >
            {t("signInWith", { provider: oidcLabel })}
          </Button>
        </div>
      )}

      {methods.internal && !showForgotPassword && (
        <>
          <PasswordLoginForm onSuccess={() => navigate("/")} />
          {methods.passwordReset && (
            <p className={styles.lead}>
              <Button
                type="button"
                onClick={() => setShowForgotPassword(true)}
              >
                {t("forgotPassword", { defaultValue: "Forgot password?" })}
              </Button>
            </p>
          )}
        </>
      )}

      {methods.internal && showForgotPassword && (
        <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
      )}

      {!methods.internal && methods.recovery && (
        <div className={styles.settingsSection}>
          {!showRecovery ? (
            <Button
              type="button"
              onClick={() => setShowRecovery(true)}
            >
              {t("recoverySignIn")}
            </Button>
          ) : (
            <>
              <p className={styles.lead}>{t("recoveryHint")}</p>
              <PasswordLoginForm onSuccess={() => navigate("/")} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
