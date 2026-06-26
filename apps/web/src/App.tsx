import {
  ArrowsClockwise,
  ArrowRight,
  ArrowUpRight,
  Broom,
  Check,
  Checks,
  CircleNotch,
  ClipboardText,
  CloudArrowUp,
  DesktopTower,
  Faders,
  Folder,
  GithubLogo,
  HardDrives,
  House,
  Key,
  Lightning,
  LockKey,
  Receipt,
  Robot,
  SealCheck,
  ShieldCheck,
  Terminal,
  TreeStructure,
  Users,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_RELAY = "/api/relay";

type Account = {
  id?: string;
  email?: string;
  name?: string;
  email_verified_at?: string | null;
  emailVerified?: boolean;
  updated_at?: string;
};

type Workspace = {
  id: string;
  account_id?: string | null;
  accountId?: string | null;
  team_id?: string | null;
  teamId?: string | null;
  team_name?: string | null;
  teamName?: string | null;
  team_role?: TeamRole | null;
  teamRole?: TeamRole | null;
  name: string;
  root_path?: string;
  rootPath?: string;
  updated_at?: string;
  updatedAt?: string;
  deleted_at?: string | null;
  deletedAt?: string | null;
};

type TeamRole = "owner" | "admin" | "member";

type TeamSummary = {
  id: string;
  accountId: string;
  name: string;
  slug: string;
  role: TeamRole;
  counts?: {
    members?: number;
    pendingInvites?: number;
    workspaces?: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

type TeamMember = {
  teamId: string;
  accountId: string;
  email?: string | null;
  name?: string | null;
  role: TeamRole;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

type TeamInvite = {
  id: string;
  teamId: string;
  teamName?: string;
  teamSlug?: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  status: string;
  expiresAt: string;
  createdAt?: string;
  acceptedAt?: string | null;
  token?: string;
  acceptEndpoint?: string;
  acceptUrl?: string;
  inviteDelivery?: "sent" | "failed" | "unconfigured";
  inviteDeliveryProviderId?: string;
};

type TeamDetails = {
  team?: TeamSummary | null;
  members?: TeamMember[];
  invites?: TeamInvite[];
  workspaces?: Workspace[];
};

type Device = {
  id: string;
  label: string;
  last_seen_at?: string;
  created_at?: string;
  revoked_at?: string | null;
};

const EMPTY_WORKSPACES: Workspace[] = [];
const EMPTY_DEVICES: Device[] = [];
const EMPTY_TEAMS: TeamSummary[] = [];
const EMPTY_TEAM_INVITES: TeamInvite[] = [];

type TokenRow = {
  id: string;
  name: string;
  created_at?: string;
  createdAt?: string;
  last_used_at?: string;
  expires_at?: string | null;
  expiresAt?: string | null;
  revoked_at?: string | null;
  scopes?: string[];
};

type TokenScope =
  | "full_access"
  | "account:read"
  | "account:write"
  | "workspace:read"
  | "workspace:write"
  | "secret:read"
  | "secret:write"
  | "device:read"
  | "device:write"
  | "token:manage"
  | "team:read"
  | "team:write"
  | "audit:read"
  | "billing:write";

type TokenScopePreset = {
  id: string;
  label: string;
  hint: string;
  scopes: TokenScope[];
};

type BrowserSession = {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  current?: boolean;
  status?: "active" | "expired" | "revoked";
};

type Subscription = {
  account_id?: string;
  plan: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
  updated_at?: string;
};

type ConfigurationStatus = {
  configured?: boolean;
  status?: string;
  provider?: string;
  missing?: string[];
  features?: string[];
  setupActions?: string[];
  webhookConfigured?: boolean;
  webhookMissing?: string[];
  portalReturnUrlConfigured?: boolean;
  plans?: Record<string, boolean>;
};

type RelayHealth = {
  ok?: boolean;
  service?: string;
  environment?: string;
  database?: string;
  configuration?: {
    email?: ConfigurationStatus;
    billing?: ConfigurationStatus;
  };
  at?: string;
};

type PlanEntitlements = {
  plan: "free" | "pro" | "team";
  devices: number | null;
  workspaces: number | null;
  secrets: number | null;
  storageBytes: number;
  maxBlobBytes: number;
  sharedVaultPolicies: boolean;
  auditLogExport: boolean;
};

type AccountUsage = {
  devices: number;
  secrets: number;
  workspaces: number;
  blobs: number;
  storageBytes: number;
};

type FileRecord = {
  path: string;
  size: number | null;
  sha256: string | null;
  extension: string | null;
  large: boolean;
  blobState: "blob-eligible" | "large-pointer" | "metadata-only";
};

type FileInventory = {
  workspaceId: string;
  workspaceName: string;
  rootPath: string;
  manifestVersion: number;
  manifestHash: string;
  manifestUpdatedAt: string;
  maxBlobBytes: number;
  totals: {
    files: number;
    largeFiles: number;
    bytes: number;
    largeBytes: number;
    blobEligibleFiles: number;
    unknownSizeFiles: number;
  };
  files: FileRecord[];
  largeFiles: FileRecord[];
};

type SecretRecord = {
  id: string;
  workspace_id?: string;
  name: string;
  key_id?: string;
  format?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

const EMPTY_SECRETS: SecretRecord[] = [];

type AuditEvent = {
  id: string;
  kind: string;
  actor?: {
    kind?: string;
    tokenId?: string | null;
  };
  target?: {
    type?: string | null;
    id?: string | null;
  };
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type MeResponse = {
  account?: Account;
  workspaces?: Workspace[];
  devices?: Device[];
  subscription?: Subscription;
  entitlements?: PlanEntitlements;
  usage?: AccountUsage;
  principal?: string;
};

type SignupResponse = {
  account: Account;
  verificationRequired: boolean;
  verificationDelivery: "sent" | "failed" | "unconfigured";
  verificationExpiresAt?: string;
  verificationUrl?: string;
};

type RelayErrorResponse = {
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  resource?: string;
  current?: number;
  maximum?: number | null;
};

type LoginResponse = {
  ok: boolean;
  account: Account;
  session: {
    id: string;
    expiresAt: string;
  };
};

const pricing = [
  {
    name: "Free",
    price: "$0",
    note: "Solo developer getting started.",
    items: ["Up to 3 workspaces", "Up to 3 devices", "5 GB sync storage", "25 encrypted secrets"],
  },
  {
    name: "Pro",
    price: "$8",
    note: "Move across machines every week.",
    items: ["Up to 25 workspaces", "Up to 10 devices", "100 GB sync storage", "500 encrypted secrets"],
    featured: true,
  },
  {
    name: "Team",
    price: "$16",
    note: "Shared workspace posture for teams.",
    items: ["Unlimited workspaces", "Unlimited devices", "Shared vault policies", "Audit log export"],
  },
];

const facts = [
  { icon: SealCheck, label: "npx-ready CLI" },
  { icon: LockKey, label: "Verified accounts" },
  { icon: Robot, label: "Scoped agent tokens" },
  { icon: ArrowsClockwise, label: "Git stays Git" },
];

const tokenScopeLabels: Record<TokenScope, string> = {
  full_access: "Full access",
  "account:read": "Account read",
  "account:write": "Account write",
  "workspace:read": "Workspace read",
  "workspace:write": "Workspace write",
  "secret:read": "Secret read",
  "secret:write": "Secret write",
  "device:read": "Device read",
  "device:write": "Device write",
  "token:manage": "Token manage",
  "team:read": "Team read",
  "team:write": "Team write",
  "audit:read": "Audit read",
  "billing:write": "Billing write",
};

const tokenScopePresets: TokenScopePreset[] = [
  {
    id: "cli-sync",
    label: "CLI sync",
    hint: "Push, hydrate, secrets, and device registration from a trusted workstation.",
    scopes: ["account:read", "workspace:read", "workspace:write", "secret:read", "secret:write", "device:read", "device:write"],
  },
  {
    id: "agent-read",
    label: "Agent read-only",
    hint: "Account, workspace, secret metadata, team context, and audit history without writes.",
    scopes: ["account:read", "workspace:read", "secret:read", "team:read", "audit:read"],
  },
  {
    id: "ci-publish",
    label: "CI publish",
    hint: "Read account state and update workspace manifests from CI.",
    scopes: ["account:read", "workspace:read", "workspace:write"],
  },
  {
    id: "full-access",
    label: "Full access",
    hint: "All account API capabilities, including future relay routes.",
    scopes: ["full_access"],
  },
];

export default function App() {
  const route = useRoutePath();
  const relay = DEFAULT_RELAY;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSetupToken, setPasswordSetupToken] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"ok" | "error" | "">("");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [publicRelayHealth, setPublicRelayHealth] = useState<RelayHealth | null>(null);
  const [, setPublicRelayHealthError] = useState("");

  const hasToken = Boolean(me?.account);
  const nextParam = route === "/login" ? new URLSearchParams(window.location.search).get("next") : null;
  const currentDashboardTarget = route.startsWith("/dashboard") ? `${route}${window.location.search}` : "/dashboard";
  const dashboardTarget = nextParam?.startsWith("/dashboard") ? nextParam : currentDashboardTarget;
  const workspaces = me?.workspaces ?? EMPTY_WORKSPACES;
  const devices = me?.devices ?? EMPTY_DEVICES;

  const installCommand = useMemo(() => "npx pathstash help", []);
  const signupEmailStatus = publicRelayHealth?.configuration?.email;
  const signupBlocked = signupEmailStatus?.configured === false;
  const signupReadinessMessage = signupBlocked ? signupEmailReadinessMessage(signupEmailStatus) : "";

  function report(text: string, tone: "ok" | "error") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, name, password, deviceLabel: navigator.platform || "browser" }),
      });
      const body = (await response.json()) as SignupResponse | RelayErrorResponse;
      if (!response.ok || !("verificationRequired" in body)) {
        throw new Error(relayErrorMessage(body as RelayErrorResponse, `signup failed (${response.status})`, response));
      }
      if (body.verificationDelivery === "sent") {
        report(`Account created for ${body.account.email}. Check your email to verify the address before logging in.`, "ok");
      } else if (body.verificationUrl) {
        report(`Account created. Email delivery is not configured, so use this local verification link: ${body.verificationUrl}`, "ok");
      } else {
        report("Account created, but email delivery is not configured yet. Add EMAIL_FROM and the selected provider secret on the relay before new accounts can verify.", "error");
      }
    } catch (error) {
      report(error instanceof Error ? error.message : "Signup failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function login(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as LoginResponse | RelayErrorResponse;
      if (!response.ok || "error" in body || !("session" in body)) {
        throw new Error(relayErrorMessage(body as RelayErrorResponse, `login failed (${response.status})`, response));
      }
      await loadAccount({ silent: true });
      report(`Logged in as ${body.account.email}.`, "ok");
      if (route === "/login" || route.startsWith("/dashboard")) {
        navigateTo(dashboardTarget);
      }
    } catch (error) {
      report(error instanceof Error ? error.message : "Login failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordSetup(targetEmail = email) {
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/request-password-setup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: targetEmail }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        verificationDelivery?: "sent" | "failed" | "unconfigured" | "not_sent";
        verificationUrl?: string;
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `password setup failed (${response.status})`, response));
      }
      if (body.verificationDelivery === "sent") {
        report("Password setup link sent. Check your email, then open the link to set a password.", "ok");
      } else if (body.verificationUrl) {
        report(`Email delivery is not configured, so use this local setup link: ${body.verificationUrl}`, "ok");
      } else if (body.verificationDelivery === "unconfigured") {
        report("Email delivery is not configured yet. Add EMAIL_FROM and the selected provider secret on the relay before password setup can send mail.", "error");
      } else {
        report("If that email has a PathStash account, a setup link will be sent.", "ok");
      }
    } catch (error) {
      report(error instanceof Error ? error.message : "Could not request password setup", "error");
    } finally {
      setBusy(false);
    }
  }

  async function requestVerificationEmail(targetEmail = email) {
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/resend-verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: targetEmail }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        verificationDelivery?: "sent" | "failed" | "unconfigured" | "not_sent";
        verificationUrl?: string;
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `verification resend failed (${response.status})`, response));
      }
      if (body.verificationDelivery === "sent") {
        report("Verification email sent. Check your inbox, then open the link before logging in.", "ok");
      } else if (body.verificationUrl) {
        report(`Email delivery is not configured, so use this local verification link: ${body.verificationUrl}`, "ok");
      } else if (body.verificationDelivery === "unconfigured") {
        report("Email delivery is not configured yet. Add EMAIL_FROM and the selected provider secret on the relay before verification email can be resent.", "error");
      } else {
        report("If that email has an unverified PathStash account, a verification link will be sent.", "ok");
      }
    } catch (error) {
      report(error instanceof Error ? error.message : "Could not send verification email", "error");
    } finally {
      setBusy(false);
    }
  }

  async function completePasswordSetup(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/complete-password-setup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: passwordSetupToken, password }),
      });
      const body = (await response.json()) as { ok?: boolean; email?: string } & RelayErrorResponse;
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `password setup failed (${response.status})`, response));
      }
      setEmail(body.email ?? email);
      setPasswordSetupToken("");
      report(`Password set for ${body.email}. You can log in now.`, "ok");
      const url = new URL(window.location.href);
      url.searchParams.delete("setup_email");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      report(error instanceof Error ? error.message : "Could not set password", "error");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailToken(verificationToken: string) {
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/verify-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: verificationToken }),
      });
      const body = (await response.json()) as { ok?: boolean; email?: string } & RelayErrorResponse;
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `verification failed (${response.status})`, response));
      }
      report(`Email verified for ${body.email}. You can log in now.`, "ok");
      const url = new URL(window.location.href);
      url.searchParams.delete("verify_email");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      report(error instanceof Error ? error.message : "Email verification failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function completeEmailChangeToken(emailChangeToken: string) {
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/complete-email-change`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: emailChangeToken }),
      });
      const body = (await response.json()) as { ok?: boolean; email?: string } & RelayErrorResponse;
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `email change failed (${response.status})`, response));
      }
      setEmail(body.email ?? email);
      report(`Email changed to ${body.email}. Log in with the new address.`, "ok");
      const url = new URL(window.location.href);
      url.searchParams.delete("change_email");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      report(error instanceof Error ? error.message : "Email change failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadAccount(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setBusy(true);
      setMessage("");
      setMessageTone("");
    }
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/me`, {
        credentials: "include",
      });
      const body = (await response.json()) as MeResponse | { error?: string };
      if (!response.ok || "error" in body) {
        if (options.silent && response.status === 401) {
          setMe(null);
          return;
        }
        throw new Error("error" in body && body.error ? body.error : `account load failed (${response.status})`);
      }
      setMe(body as MeResponse);
      if (!options.silent) {
        report("Dashboard connected.", "ok");
      }
    } catch (error) {
      if (!options.silent) {
        report(error instanceof Error ? error.message : "Could not load account", "error");
      }
    } finally {
      setAuthChecked(true);
      if (!options.silent) {
        setBusy(false);
      }
    }
  }

  async function logout() {
    setBusy(true);
    setMessage("");
    setMessageTone("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok && response.status !== 401) {
        throw new Error(body.error ?? `logout failed (${response.status})`);
      }
      setMe(null);
      localStorage.removeItem("pathstash:token");
      report("Logged out of this browser.", "ok");
      navigateTo("/login");
    } catch (error) {
      report(error instanceof Error ? error.message : "Logout failed", "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setupToken = params.get("setup_email");
    if (setupToken) {
      setPasswordSetupToken(setupToken);
      report("Enter a new password to finish account recovery.", "ok");
      return;
    }
    const verificationToken = params.get("verify_email");
    if (verificationToken) {
      void verifyEmailToken(verificationToken);
    }
    const emailChangeToken = params.get("change_email");
    if (emailChangeToken) {
      void completeEmailChangeToken(emailChangeToken);
    }
    // Token-at-load flows are intentionally one-shot so tokens are consumed once and removed from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAccount({ silent: true });
    localStorage.removeItem("pathstash:token");
    // Session bootstrap is intentionally one-shot; dashboard auth is cookie based.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPublicRelayHealth() {
      setPublicRelayHealthError("");
      try {
        const response = await fetch(`${relay.replace(/\/$/, "")}/health`, { signal: controller.signal });
        const body = (await response.json()) as RelayHealth & { error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `relay health failed (${response.status})`);
        }
        if (!controller.signal.aborted) {
          setPublicRelayHealth(body);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPublicRelayHealth(null);
          setPublicRelayHealthError(error instanceof Error ? error.message : "Could not load relay health");
        }
      }
    }
    void loadPublicRelayHealth();
    return () => controller.abort();
  }, [relay]);

  useEffect(() => {
    if (me?.account && (route === "/login" || route === "/signup")) {
      navigateTo("/dashboard");
    }
  }, [me, route]);

  const sharedProps = {
    relay,
    email,
    setEmail,
    name,
    setName,
    password,
    setPassword,
    passwordSetupToken,
    message,
    messageTone,
    busy,
    hasToken,
    me,
    workspaces,
    devices,
    signup,
    login,
    requestPasswordSetup,
    completePasswordSetup,
    logout,
    loadAccount,
  };

  if (route === "/login" || route === "/signup") {
    return (
      <AuthPage
        mode={route === "/signup" ? "signup" : "login"}
        email={email}
        setEmail={setEmail}
        name={name}
        setName={setName}
        password={password}
        setPassword={setPassword}
        passwordSetupToken={passwordSetupToken}
        busy={busy}
        message={message}
        messageTone={messageTone}
        signupBlocked={signupBlocked}
        signupReadinessMessage={signupReadinessMessage}
        signupEmailStatus={signupEmailStatus}
        onLogin={login}
        onSignup={signup}
        onPasswordSetupRequest={requestPasswordSetup}
        onVerificationEmailRequest={requestVerificationEmail}
        onPasswordSetupComplete={completePasswordSetup}
      />
    );
  }

  if (route.startsWith("/dashboard")) {
    if (!authChecked) {
      return <AuthLoadingPage />;
    }
    if (!me?.account) {
      return <AuthRedirect target={`/login?next=${encodeURIComponent(currentDashboardTarget)}`} />;
    }
    return <DashboardApp route={route} {...sharedProps} />;
  }

  return (
    <MarketingPage
      {...sharedProps}
      installCommand={installCommand}
      signupBlocked={signupBlocked}
      signupReadinessMessage={signupReadinessMessage}
      signupEmailStatus={signupEmailStatus}
    />
  );
}

function MarketingPage({
  email,
  setEmail,
  name,
  setName,
  password,
  setPassword,
  message,
  messageTone,
  busy,
  signup,
  installCommand,
  signupBlocked,
  signupReadinessMessage,
  signupEmailStatus,
}: {
  email: string;
  setEmail: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  message: string;
  messageTone: "ok" | "error" | "";
  busy: boolean;
  signup: (event: FormEvent<HTMLFormElement>) => void;
  installCommand: string;
  signupBlocked: boolean;
  signupReadinessMessage: string;
  signupEmailStatus?: ConfigurationStatus;
}) {
  return (
    <div className="grain relative min-h-dvh bg-paper text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-paper"
      >
        Skip to content
      </a>

      <Header />

      <main id="main">
        <Hero />
        <TrustStrip />
        <HowItWorks installCommand={installCommand} />
        <PositioningBand />
        <Features />
        <Pricing />
        <Signup
          email={email}
          setEmail={setEmail}
          name={name}
          setName={setName}
          password={password}
          setPassword={setPassword}
          busy={busy}
          message={message}
          messageTone={messageTone}
          signupBlocked={signupBlocked}
          signupReadinessMessage={signupReadinessMessage}
          signupEmailStatus={signupEmailStatus}
          onSubmit={signup}
        />
        <ConsoleTeaser />
      </main>

      <Footer />
    </div>
  );
}

function useRoutePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener("pathstash:navigate", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("pathstash:navigate", update);
    };
  }, []);
  return path;
}

function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("pathstash:navigate"));
  window.scrollTo({ top: 0 });
}

function clearDashboardInviteParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite_id");
  url.searchParams.delete("invite_token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function AuthLoadingPage() {
  return (
    <div className="grain grid min-h-dvh place-items-center bg-paper px-5 text-ink">
      <div className="flex items-center gap-3 rounded-xl2 border border-ink-line bg-white px-5 py-4 shadow-card">
        <CircleNotch size={18} weight="bold" className="motion-safe:animate-spin" />
        <span className="text-[14px] font-semibold">Checking your PathStash session</span>
      </div>
    </div>
  );
}

function AuthRedirect({ target }: { target: string }) {
  useEffect(() => {
    navigateTo(target);
  }, [target]);

  return <AuthLoadingPage />;
}

function AuthPage({
  mode,
  email,
  setEmail,
  name,
  setName,
  password,
  setPassword,
  passwordSetupToken,
  busy,
  message,
  messageTone,
  signupBlocked,
  signupReadinessMessage,
  signupEmailStatus,
  onLogin,
  onSignup,
  onPasswordSetupRequest,
  onVerificationEmailRequest,
  onPasswordSetupComplete,
}: {
  mode: "login" | "signup";
  email: string;
  setEmail: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  passwordSetupToken: string;
  busy: boolean;
  message: string;
  messageTone: "ok" | "error" | "";
  signupBlocked: boolean;
  signupReadinessMessage: string;
  signupEmailStatus?: ConfigurationStatus;
  onLogin: (event?: FormEvent<HTMLFormElement>) => void;
  onSignup: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordSetupRequest: () => Promise<void>;
  onVerificationEmailRequest: () => Promise<void>;
  onPasswordSetupComplete: (event?: FormEvent<HTMLFormElement>) => void;
}) {
  const isSignup = mode === "signup";
  const isPasswordSetup = Boolean(passwordSetupToken);
  const emailValid = /.+@.+\..+/.test(email.trim());
  const passwordValid = password.length >= 10;
  const canSubmit = isPasswordSetup
    ? passwordValid && !busy
    : isSignup
      ? emailValid && passwordValid && !busy && !signupBlocked
      : email.trim().length > 0 && password.length > 0 && !busy;
  const title = isPasswordSetup ? "Set your password" : isSignup ? "Create your PathStash account" : "Log in to PathStash";
  const body = isPasswordSetup
    ? "Finish account recovery before opening the dashboard."
    : isSignup
      ? "Use password login for the browser dashboard. API tokens are created later for CLI, CI, and agent surfaces."
      : "The dashboard is session protected. Sign in before opening workspaces, teams, secrets, billing, or tokens.";

  return (
    <div className="grain min-h-dvh bg-paper text-ink">
      <header className="border-b border-ink-line bg-paper/90">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-4 md:px-8">
          <a href="/" className="press focus-ring flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <Logo />
            PathStash
          </a>
          <a
            href="/"
            className="press focus-ring cursor-pointer rounded-lg border border-ink-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink hover:border-ink/20"
          >
            Marketing
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1120px] gap-8 px-5 py-12 md:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:py-20">
        <section className="max-w-md">
          <Eyebrow>Account access</Eyebrow>
          <h1 className="display mt-4 text-[clamp(2.15rem,4.5vw,3.7rem)] font-semibold leading-[1]">{title}</h1>
          <p className="mt-5 text-[15.5px] leading-7 text-ink-soft">{body}</p>
          <div className="mt-7 grid gap-3 text-[13.5px] text-ink-soft">
            {[
              "Dashboard access uses password sessions",
              "Email verification gates new accounts",
              "API tokens are managed after login",
            ].map((line) => (
              <div key={line} className="flex items-center gap-2.5">
                <Check size={15} weight="bold" className="text-forest-600" />
                {line}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl2 border border-ink-line bg-white p-6 shadow-card md:p-8">
          <form onSubmit={isPasswordSetup ? onPasswordSetupComplete : isSignup ? onSignup : onLogin} noValidate>
            {!isPasswordSetup ? (
              <Field label="Email" hint={email && !emailValid && isSignup ? "Enter a valid email" : ""}>
                <input
                  aria-label="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={`focus-ring w-full rounded-lg border bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition ${
                    email && !emailValid && isSignup ? "border-amber-400" : "border-ink-line focus:border-forest-500"
                  }`}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>
            ) : null}
            {isSignup ? (
              <Field label="Name" hint="" optional className="mt-4">
                <input
                  aria-label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
                  placeholder="Sam Okafor"
                  type="text"
                  autoComplete="name"
                />
              </Field>
            ) : null}
            <Field
              label={isPasswordSetup ? "New password" : "Password"}
              hint={password && !passwordValid && (isSignup || isPasswordSetup) ? "Use at least 10 characters" : ""}
              className={isPasswordSetup ? "" : "mt-4"}
            >
              <input
                aria-label="Password"
                title="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`focus-ring w-full rounded-lg border bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition ${
                  password && !passwordValid && (isSignup || isPasswordSetup)
                    ? "border-amber-400"
                    : "border-ink-line focus:border-forest-500"
                }`}
                placeholder={isSignup || isPasswordSetup ? "At least 10 characters" : "Password"}
                type="password"
                autoComplete={isSignup || isPasswordSetup ? "new-password" : "current-password"}
                required
              />
            </Field>

            {isSignup && signupReadinessMessage ? (
              <SignupReadinessNotice
                blocked={signupBlocked}
                message={signupReadinessMessage}
                status={signupEmailStatus}
              />
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="press focus-ring mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[14px] font-semibold text-paper shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_10px_24px_-14px_rgba(16,46,29,0.7)] hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
            >
              {busy ? <CircleNotch size={16} weight="bold" className="motion-safe:animate-spin" /> : <ShieldCheck size={16} weight="bold" />}
              {isPasswordSetup ? "Set password" : isSignup && signupBlocked ? "Signup unavailable" : isSignup ? "Create account" : "Log in"}
            </button>
          </form>

          {!isSignup && !isPasswordSetup ? (
            <div className="mt-4 grid gap-2 text-[12.5px] text-ink-mute sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2">
                <span>Lost your password?</span>
                <button
                  type="button"
                  onClick={onPasswordSetupRequest}
                  disabled={!email.trim() || busy}
                  className="focus-ring cursor-pointer rounded-md px-2 py-1 font-semibold text-forest-700 hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Send setup link
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Need verification?</span>
                <button
                  type="button"
                  onClick={onVerificationEmailRequest}
                  disabled={!email.trim() || busy}
                  className="focus-ring cursor-pointer rounded-md px-2 py-1 font-semibold text-forest-700 hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Resend email
                </button>
              </div>
            </div>
          ) : null}

          {message ? (
            <p
              role="status"
              className={`mt-4 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13px] leading-6 ${
                messageTone === "error" ? "bg-amber-50 text-amber-900" : "bg-forest-50 text-forest-800"
              }`}
            >
              {messageTone === "error" ? (
                <Lightning size={16} className="mt-0.5 shrink-0" />
              ) : (
                <Check size={16} weight="bold" className="mt-0.5 shrink-0" />
              )}
              {message}
            </p>
          ) : null}

          {!isPasswordSetup ? (
            <div className="mt-6 border-t border-ink-line pt-5 text-[13px] text-ink-mute">
              {isSignup ? "Already have an account?" : "New to PathStash?"}{" "}
              <a className="focus-ring cursor-pointer font-semibold text-forest-700 hover:text-forest-800" href={isSignup ? "/login" : "/signup"}>
                {isSignup ? "Log in" : "Create an account"}
              </a>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Primitives                                                         */
/* ------------------------------------------------------------------ */

function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: keyof JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Component>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow text-forest-600">{children}</div>;
}

function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`press focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-forest-700 px-5 py-3 text-sm font-semibold text-paper shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_10px_24px_-14px_rgba(16,46,29,0.7)] hover:bg-forest-600 ${className}`}
    >
      {children}
    </a>
  );
}

function GhostButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`press focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-ink/20 hover:bg-white ${className}`}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        scrolled ? "border-b border-ink-line bg-paper/85 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
        <a href="#top" className="press focus-ring flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <Logo />
          PathStash
        </a>
        <nav className="hidden items-center gap-1 text-[13px] font-medium text-ink-soft lg:flex">
          <a className="press focus-ring cursor-pointer rounded-md px-3 py-2 hover:text-ink" href="#how">
            How it works
          </a>
          <a className="press focus-ring cursor-pointer rounded-md px-3 py-2 hover:text-ink" href="#features">
            Features
          </a>
          <a className="press focus-ring cursor-pointer rounded-md px-3 py-2 hover:text-ink" href="#pricing">
            Pricing
          </a>
          <a className="press focus-ring cursor-pointer rounded-md px-3 py-2 hover:text-ink" href="/dashboard">
            Dashboard
          </a>
          <a className="press focus-ring cursor-pointer rounded-md px-3 py-2 hover:text-ink" href="https://github.com/ifBars/pathstash">
            Docs
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/ifBars/pathstash"
            className="press focus-ring hidden cursor-pointer rounded-lg border border-ink-line bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink hover:border-ink/20 sm:inline-flex"
          >
            <GithubLogo size={16} weight="bold" />
            <span className="ml-1.5">Star</span>
          </a>
          <PrimaryButton href="#signup" className="px-4 py-2.5">
            Start free
            <ArrowRight size={15} weight="bold" />
          </PrimaryButton>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6.5C4 5.12 5.12 4 6.5 4h6.4l2 2.4H17.5C18.88 6.4 20 7.52 20 8.9v8.6c0 1.38-1.12 2.5-2.5 2.5h-11C5.12 20 4 18.88 4 17.5v-11Z" fill="#eef4f0" opacity="0.18" />
        <path d="M8.5 12.4l2.6 2.6 4.4-4.7" stroke="#7ba988" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="grid-fade pointer-events-none absolute inset-0 -z-10" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60"
        style={{
          background:
            "radial-gradient(60% 80% at 18% 0%, rgba(123,169,136,0.22), transparent 60%), radial-gradient(50% 70% at 100% 10%, rgba(22,21,15,0.05), transparent 55%)",
        }}
      />
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-20 pt-14 md:px-8 md:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pb-28 lg:pt-24">
        <div className="relative max-w-[44rem]">
          <Reveal>
            <Eyebrow>Dropbox-like consistency for dev workspaces</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-5 text-[clamp(2.9rem,6.2vw,5rem)] font-semibold leading-[0.95]">
              Your dev workspace, recognizable on <span className="mark">every machine</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-8 text-ink-soft">
              PathStash keeps the layer around Git available across machines and agents: project paths, sidecar files,
              environment-secret records, team context, and agent-readable manifests. Git still owns the history.
              PathStash owns the map.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryButton href="#signup">
                Start free
                <ArrowRight size={16} weight="bold" />
              </PrimaryButton>
              <GhostButton href="#how">
                <Terminal size={16} />
                Run the CLI
              </GhostButton>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <dl className="nums mt-12 grid max-w-[34rem] grid-cols-3 gap-6 border-t border-ink-line pt-7">
              {[
                ["3", "machines, one structure"],
                ["64 MiB", "streamed blob chunks"],
                ["0", "secrets sent in plaintext"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-semibold tracking-tight text-ink">{value}</dt>
                  <dd className="mt-1 text-[13px] leading-5 text-ink-mute">{label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={200} className="relative lg:pt-2">
          <ManifestCard />
        </Reveal>
      </div>
    </section>
  );
}

function ManifestCard() {
  const activity = [
    { name: "src/auth.rs", size: "12.4 KiB", pct: 100, state: "Synced" },
    { name: "secrets/dev.env", size: "encrypted", pct: 100, state: "Sealed" },
    { name: "assets/demo.mp4", size: "84.0 MiB", pct: 68, state: "Transferring" },
  ] as const;

  return (
    <div className="relative">
      {/* Floating device chip */}
      <div
        className="floating absolute -left-4 top-24 z-20 hidden w-48 rotate-[-3deg] rounded-xl border border-ink-line bg-white p-3.5 shadow-cardLift md:block lg:-left-10"
        style={{ animationDelay: "0.4s" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-forest-50 text-forest-700">
            <DesktopTower size={18} weight="duotone" />
          </span>
          <div>
            <div className="text-[13px] font-semibold">MacBook Pro</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-forest-500 motion-safe:animate-pulseDot" />
              Online - 12s ago
            </div>
          </div>
        </div>
      </div>

      {/* Floating terminal chip */}
      <div
        className="floating absolute -right-3 bottom-10 z-20 hidden w-56 rotate-[2.5deg] rounded-xl border border-ink-line bg-ink p-3.5 text-paper shadow-cardLift md:block lg:-right-8"
        style={{ animationDelay: "1.6s" }}
      >
        <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e06c5a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#d9b441]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#5a9e6a]" />
          <span className="ml-2 font-mono">npx pathstash</span>
        </div>
        <div className="mt-2.5 font-mono text-[12px] leading-5">
          <span className="text-forest-200">$</span>{" "}
          <span className="text-paper">npx pathstash push --root .pathstash-context</span>
          <div className="mt-1 text-ink-mute">scanned 1,284 files - 7 secrets</div>
          <div className="text-forest-300">pushed manifest in 1.8s ok</div>
        </div>
      </div>

      {/* Main manifest card */}
      <article className="relative z-10 overflow-hidden rounded-xl2 border border-ink-line bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-ink-line bg-paper/60 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-forest-700 text-paper">
              <Folder size={15} weight="duotone" />
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">pathstash-workbench</div>
              <div className="font-mono text-[11px] text-ink-mute">~/projects/pathstash-workbench</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-semibold text-forest-700">
            <span className="h-1.5 w-1.5 rounded-full bg-forest-500 motion-safe:animate-pulseDot" />
            In sync
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-ink-line border-b border-ink-line">
          {[
            [DesktopTower, "Devices", "3"],
            [Key, "Secrets", "7"],
            [HardDrives, "Large files", "2"],
          ].map(([Icon, label, value]) => (
            <div key={label as string} className="px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
                <Icon size={13} weight="duotone" />
                {label as string}
              </div>
              <div className="nums mt-1 text-lg font-semibold">{value as string}</div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-soft">Sync activity</div>
            <div className="text-[11px] text-ink-mute">live</div>
          </div>
          <ul className="space-y-3">
            {activity.map((row) => (
              <li key={row.name}>
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="flex items-center gap-2 font-mono text-ink-soft">
                    <ClipboardText size={13} className="text-ink-mute" />
                    {row.name}
                  </span>
                  <span className="flex items-center gap-2 text-ink-mute">
                    <span className="nums">{row.size}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        row.state === "Synced"
                          ? "bg-forest-50 text-forest-700"
                          : row.state === "Sealed"
                            ? "bg-ink/[0.06] text-ink-soft"
                            : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {row.state}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div
                    className={`h-full origin-left rounded-full motion-safe:animate-barGrow ${
                      row.state === "Sealed" ? "bg-ink-soft" : "bg-forest-500"
                    }`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-ink-line bg-paper/50 px-5 py-3 text-[11px] text-ink-mute">
          <span className="font-mono">manifest v142</span>
          <span className="inline-flex items-center gap-1.5">
            <CloudArrowUp size={13} /> relay - 1.8s ago
          </span>
        </div>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trust strip                                                        */
/* ------------------------------------------------------------------ */

function TrustStrip() {
  return (
    <section aria-label="Key facts" className="border-y border-ink-line bg-white/60">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-px overflow-hidden px-5 md:px-8 lg:grid-cols-4">
        {facts.map(({ icon: Icon, label }, i) => (
          <Reveal
            key={label}
            delay={i * 70}
            className="flex items-center gap-3 py-5 lg:justify-center lg:py-6"
          >
            <Icon size={20} weight="duotone" className="text-forest-600" />
            <span className="text-[13.5px] font-medium text-ink-soft">{label}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How it works                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks({ installCommand }: { installCommand: string }) {
  const steps = [
    ["1", "Run the CLI", installCommand],
    ["2", "Connect a token", 'npx pathstash login --token "<dashboard-api-token>"'],
    ["3", "Create a sidecar", 'npx pathstash sidecar init --root . --name "Project Context"'],
    ["4", "Push context", "npx pathstash push --root .pathstash-context"],
  ] as const;

  const flow = [
    [Folder, "Select", "Choose roots or sidecars. .git, node_modules, target, and build output are skipped by default."],
    [LockKey, "Encrypt", "Secret values are encrypted locally before they ever reach the relay."],
    [CloudArrowUp, "Sync", "Manifests and bounded blobs move through the relay in streamed chunks."],
    [DesktopTower, "Resume", "Hydrate the workspace, list the sidecar, or hand scoped markdown to an agent."],
  ] as const;

  return (
    <section id="how" className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal className="max-w-2xl">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.02]">
          Proof first. Running in minutes.
        </h2>
        <p className="mt-4 text-[16px] leading-7 text-ink-soft">
          Run the npm CLI with npx, create a verified account in the dashboard, then issue scoped tokens for local
          machines, CI, and agents. No native install is required for the first run.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Reveal className="rounded-xl2 border border-ink-line bg-white p-6 shadow-card md:p-7">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Run the CLI</h3>
            <span className="font-mono text-[11px] text-ink-mute">4 steps - ~2 min</span>
          </div>
          <ol className="mt-5 space-y-4">
            {steps.map(([n, label, command]) => (
              <li key={n} className="grid grid-cols-[auto_1fr] gap-3.5">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-forest-50 font-mono text-[12px] font-semibold text-forest-700">
                  {n}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-ink">{label}</div>
                  <pre className="nums mt-1.5 overflow-x-auto rounded-lg bg-ink px-3.5 py-2.5 font-mono text-[12.5px] leading-6 text-paper">
                    <span className="text-forest-300">$</span> {command}
                  </pre>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={120} className="rounded-xl2 border border-ink-line bg-white p-6 shadow-card md:p-7">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Workspace sync flow</h3>
            <span className="font-mono text-[11px] text-ink-mute">sidecar -&gt; relay -&gt; agent</span>
          </div>
          <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
            {flow.map(([Icon, title, body]) => (
              <div
                key={title as string}
                className="rounded-lg bg-paper/50 p-4"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-forest-700 text-paper">
                  <Icon size={18} weight="duotone" />
                </span>
                <div className="mt-3.5 text-[13.5px] font-semibold">{title as string}</div>
                <p className="mt-1.5 text-[12.5px] leading-5 text-ink-mute">{body as string}</p>
              </div>
            ))}
          </div>
          <pre className="nums mt-5 overflow-x-auto rounded-lg border border-ink-line bg-paper/60 px-4 py-3.5 font-mono text-[12.5px] leading-7 text-ink-soft">
            <span className="text-ink-mute">Workspace</span> pathstash-workbench{"\n"}
            <span className="text-ink-mute">Status   </span> in sync{"\n"}
            <span className="text-ink-mute">Devices  </span> 3 online{"\n"}
            <span className="text-ink-mute">Secrets  </span> 7 items{"\n"}
            <span className="text-ink-mute">Blobs    </span> 2 transferring
          </pre>
        </Reveal>
      </div>

      <Reveal delay={120} className="mt-6">
        <div className="flex items-start gap-3 rounded-xl border border-forest-200 bg-forest-50/70 px-5 py-4 text-[13.5px] text-forest-800">
          <ShieldCheck size={18} weight="duotone" className="mt-0.5 shrink-0" />
          <p>
            PathStash does not replace Git. It keeps the workspace layer around it consistent - roots, devices, selected
            files, team sidecars, and encrypted secret records. Git stays the source of code history.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function PositioningBand() {
  const fitRows = [
    ["PathStash", "Sidecar context, manifests, encrypted secret inventory, agent handoff, and cross-machine setup state."],
    ["Git/GitHub", "Source code, review history, release tags, CI workflows, tests, and public project docs."],
    ["Box-style drives", "Broad company file sharing, office documents, e-signature, retention, and content workflows."],
  ] as const;

  return (
    <section className="relative overflow-hidden border-y border-forest-900/50 bg-ink text-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46% 60% at 12% 0%, rgba(123,169,136,0.16), transparent 62%), radial-gradient(40% 50% at 100% 100%, rgba(47,103,66,0.14), transparent 60%)",
        }}
      />
      <div className="relative mx-auto grid max-w-[1240px] gap-10 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <Reveal>
          <Eyebrow>Positioning</Eyebrow>
          <h2 className="display mt-4 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.04] text-paper">
            Dropbox-style structure, built for software projects.
          </h2>
          <p className="mt-4 max-w-[34rem] text-[15px] leading-7 text-paper/70">
            PathStash is for the working context around a repo: consistent project roots, ignored plans, secret records,
            setup notes, generated artifacts, team sidecars, and agent-readable project state. General content platforms
            still have their own job; they are not the system that understands a dev workspace.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="overflow-hidden rounded-xl2 border border-white/10 bg-white/[0.04]">
            {fitRows.map(([name, description], index) => (
              <div
                key={name}
                className={`grid gap-2 px-5 py-4 md:grid-cols-[9rem_1fr] md:px-6 ${
                  index === fitRows.length - 1 ? "" : "border-b border-white/10"
                }`}
              >
                <div className="flex items-center gap-2 text-[13px] font-semibold text-paper">
                  {name === "PathStash" ? (
                    <SealCheck size={16} weight="duotone" className="text-forest-300" />
                  ) : name === "Git/GitHub" ? (
                    <GithubLogo size={16} weight="bold" className="text-paper/70" />
                  ) : (
                    <Folder size={16} weight="duotone" className="text-paper/60" />
                  )}
                  {name}
                </div>
                <p className="text-[13.5px] leading-6 text-paper/68">{description}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features (bento)                                                   */
/* ------------------------------------------------------------------ */

function Features() {
  return (
    <section id="features" className="border-y border-ink-line bg-white/60">
      <div className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>What syncs</Eyebrow>
          <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.02]">
            The workspace layer, piece by piece.
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-ink-soft">
            Each surface below is something Git was never meant to carry. PathStash takes it off your machine and makes
            it available wherever work continues.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-6">
          <Reveal className="lg:col-span-3">
            <FeatureCard
              icon={Faders}
              title="Selective, bounded sync"
              body="Push roots with ignore rules. .git/, node_modules/, target/, and local token files are skipped by default. Files up to 64 MiB stream in chunks; large files are tracked as pointers backed by R2."
              tag="push - hydrate"
            />
          </Reveal>
          <Reveal delay={80} className="lg:col-span-3">
            <FeatureCard
              icon={LockKey}
              title="Encrypted secrets"
              body="Secret values are encrypted by the CLI before they reach the relay. The server stores ciphertext, never plaintext. Scope a secret to a workspace and pull it on the next machine."
              tag="client-side"
            />
          </Reveal>

          <Reveal delay={120} className="lg:col-span-2">
            <FeatureCard
              icon={HardDrives}
              title="Large file pointers"
              body="Track big assets without bloating the manifest. Pointers hydrate on demand, only where you need them."
              tag="R2 blobs"
            />
          </Reveal>
          <Reveal delay={160} className="lg:col-span-2">
            <FeatureCard
              icon={Robot}
              title="Agent-ready"
              body="Markdown manifests, llms.txt, bearer-token metadata, and MCP tools hand agents scoped context without scraping the dashboard."
              tag="MCP - llms.txt"
            />
          </Reveal>
          <Reveal delay={200} className="lg:col-span-2">
            <FeatureCard
              icon={TreeStructure}
              title="Accounts & scoped tokens"
              body="Password login and email verification protect the browser dashboard. CLI, CI, and agent surfaces use explicit scoped tokens."
              tag="auth - tokens"
            />
          </Reveal>

          <Reveal delay={240} className="lg:col-span-6">
            <div className="flex flex-col items-start justify-between gap-5 rounded-xl2 border border-ink-line bg-ink p-7 text-paper md:flex-row md:items-center">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-forest-200">
                  <Broom size={18} weight="duotone" />
                  <span className="eyebrow">Out of Git, by design</span>
                </div>
                <p className="mt-3 text-[15px] leading-7 text-paper/80">
                  Private plans, local runbooks, concept art, branding notes, and generated review artifacts stay out
                  of the repo. PathStash sidecars carry that project state across machines.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {[".git/", "node_modules/", "target/", "internal/", ".env"].map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[12px] text-paper/80"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  tag,
}: {
  icon: typeof Folder;
  title: string;
  body: string;
  tag: string;
}) {
  return (
    <article className="press focus-ring h-full rounded-xl2 border border-ink-line bg-white p-6 shadow-card hover:shadow-cardLift md:p-7">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700">
          <Icon size={20} weight="duotone" />
        </span>
        <span className="font-mono text-[11px] text-ink-mute">{tag}</span>
      </div>
      <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2.5 text-[13.5px] leading-6 text-ink-mute">{body}</p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing                                                            */
/* ------------------------------------------------------------------ */

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <Reveal className="max-w-2xl">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.02]">
          Start free. Scale with your machines.
        </h2>
        <p className="mt-4 text-[16px] leading-7 text-ink-soft">
          Start free. Upgrade when your machines outnumber your free tier. Cancel any time.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {pricing.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 90} className="h-full">
            <article
              className={`press focus-ring flex h-full flex-col rounded-xl2 border p-7 md:p-8 ${
                plan.featured
                  ? "border-forest-700 bg-ink text-paper shadow-cardLift lg:-translate-y-2"
                  : "border-ink-line bg-white text-ink shadow-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-[15px] font-semibold ${plan.featured ? "text-paper" : "text-ink"}`}>
                  {plan.name}
                </h3>
                {plan.featured ? (
                  <span className="rounded-md bg-forest-600 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-paper">
                    Most popular
                  </span>
                ) : (
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-mute">tier</span>
                )}
              </div>
              <p className={`mt-2 text-[13px] leading-5 ${plan.featured ? "text-paper/65" : "text-ink-mute"}`}>
                {plan.note}
              </p>

              <div className="nums mt-6 flex items-end gap-1.5">
                <span className="text-[3rem] font-semibold leading-none tracking-tight">{plan.price}</span>
                <span className={`pb-1 text-[13px] ${plan.featured ? "text-paper/55" : "text-ink-mute"}`}>/ month</span>
              </div>

              <ul className={`mt-6 space-y-3 border-t pt-6 text-[13.5px] ${plan.featured ? "border-white/10" : "border-ink-line"}`}>
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    {plan.featured ? (
                      <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-forest-300" />
                    ) : (
                      <Checks size={16} weight="bold" className="mt-0.5 shrink-0 text-forest-600" />
                    )}
                    <span className={plan.featured ? "text-paper/85" : "text-ink-soft"}>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 pt-1">
                {plan.featured ? (
                  <a
                    href="#signup"
                    className="press focus-ring inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-500 px-4 py-3 text-[13.5px] font-semibold text-paper hover:bg-forest-400"
                  >
                    Start Pro trial
                    <ArrowRight size={15} weight="bold" />
                  </a>
                ) : (
                  <a
                    href="#signup"
                    className="press focus-ring inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-3 text-[13.5px] font-semibold text-ink hover:border-ink/20"
                  >
                    Start {plan.name === "Free" ? "for free" : `${plan.name} trial`}
                  </a>
                )}
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120} className="mt-6 text-center text-[12.5px] text-ink-mute">
        All plans include the npx-ready CLI, encrypted secret storage, scoped tokens, and markdown endpoints for agents.
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Signup                                                             */
/* ------------------------------------------------------------------ */

function Signup({
  email,
  setEmail,
  name,
  setName,
  password,
  setPassword,
  busy,
  message,
  messageTone,
  signupBlocked,
  signupReadinessMessage,
  signupEmailStatus,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  message: string;
  messageTone: "ok" | "error" | "";
  signupBlocked: boolean;
  signupReadinessMessage: string;
  signupEmailStatus?: ConfigurationStatus;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const emailValid = /.+@.+\..+/.test(email.trim());
  const passwordValid = password.length >= 10;
  const canSubmit = emailValid && passwordValid && !busy && !signupBlocked;

  return (
    <section id="signup" className="border-y border-ink-line bg-white/60">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
        <Reveal>
          <Eyebrow>Get started</Eyebrow>
          <h2 className="display mt-4 text-[clamp(2.1rem,4.8vw,3.8rem)] font-semibold leading-[1]">
            Create the account. Let the CLI do the rest.
          </h2>
          <p className="mt-5 max-w-md text-[15.5px] leading-7 text-ink-soft">
            Self-serve signup uses a password and verifies your email before the dashboard opens. Create CLI and CI
            tokens from the dashboard after login.
          </p>
          <ul className="mt-7 space-y-3 text-[13.5px] text-ink-soft">
            {[
              "No credit card for the free tier",
              "Access tokens are created explicitly for agents and CI",
              "Hosted relay handled automatically",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <Check size={15} weight="bold" className="text-forest-600" />
                {line}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <form
            onSubmit={onSubmit}
            noValidate
            className="rounded-xl2 border border-ink-line bg-white p-6 shadow-card md:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" hint={email && !emailValid ? "Enter a valid email" : ""}>
                <input
                  aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`focus-ring w-full rounded-lg border bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition ${
                    email && !emailValid ? "border-amber-400" : "border-ink-line focus:border-forest-500"
                  }`}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Name" hint="" optional>
                <input
                  aria-label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
                  placeholder="Sam Okafor"
                  type="text"
                  autoComplete="name"
                />
              </Field>
            </div>
            <Field label="Password" hint={password && !passwordValid ? "Use at least 10 characters" : ""} className="mt-4">
              <input
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`focus-ring w-full rounded-lg border bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition ${
                  password && !passwordValid ? "border-amber-400" : "border-ink-line focus:border-forest-500"
                }`}
                placeholder="At least 10 characters"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>

            {signupReadinessMessage ? (
              <SignupReadinessNotice
                blocked={signupBlocked}
                message={signupReadinessMessage}
                status={signupEmailStatus}
              />
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="press focus-ring mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[14px] font-semibold text-paper shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_10px_24px_-14px_rgba(16,46,29,0.7)] hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
            >
              {busy ? (
                <>
                  <CircleNotch size={16} weight="bold" className="motion-safe:animate-spin" />
                  Working...
                </>
              ) : (
                <>
                  {signupBlocked ? "Signup unavailable" : "Create account"}
                  <ArrowRight size={15} weight="bold" />
                </>
              )}
            </button>

            {message ? (
              <p
                role="status"
                className={`mt-4 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13px] leading-6 ${
                  messageTone === "error"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-forest-50 text-forest-800"
                }`}
              >
                {messageTone === "error" ? (
                  <Lightning size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <Check size={16} weight="bold" className="mt-0.5 shrink-0" />
                )}
                {message}
              </p>
            ) : null}
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  optional,
  className = "",
  children,
}: {
  label: string;
  hint: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`grid gap-1.5 text-[13px] font-medium text-ink-soft ${className}`}>
      <span className="flex items-center justify-between">
        {label}
        {optional ? <span className="text-[11px] font-normal text-ink-mute">optional</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11.5px] font-normal text-amber-700">{hint}</span> : null}
    </label>
  );
}

function ConsoleTeaser() {
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <Reveal>
          <Eyebrow>Account console</Eyebrow>
          <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.02]">
            The dashboard has its own front door.
          </h2>
          <p className="mt-4 max-w-md text-[16px] leading-7 text-ink-soft">
            Signup lives here. Workspace operations live in the console: overview, workspace manifests, teams, devices,
            encrypted secrets, scoped tokens, security, audit, and billing.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <PrimaryButton href="/dashboard">
              Open dashboard
              <ArrowRight size={16} weight="bold" />
            </PrimaryButton>
            <GhostButton href="/dashboard/billing">
              <Receipt size={16} />
              Billing
            </GhostButton>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="overflow-hidden rounded-xl2 border border-ink-line bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-ink-line bg-paper/50 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Logo />
                <div>
                  <div className="text-[13px] font-semibold">PathStash dashboard</div>
                  <div className="font-mono text-[11px] text-ink-mute">/dashboard/overview</div>
                </div>
              </div>
              <span className="rounded-md bg-forest-50 px-2 py-1 font-mono text-[10.5px] font-semibold text-forest-700">
                live API
              </span>
            </div>
            <div className="grid gap-0 md:grid-cols-[12rem_1fr]">
              <div className="hidden border-r border-ink-line bg-ink p-4 text-paper md:block">
                {(
                  [
                    [House, "Overview"],
                    [Folder, "Workspaces"],
                    [Users, "Teams"],
                    [Key, "Tokens"],
                    [Receipt, "Billing"],
                  ] as const
                ).map(([Icon, item], index) => (
                  <div
                    key={item}
                    className={`mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-[12px] ${
                      index === 0 ? "bg-white/10 text-paper" : "text-paper/55"
                    }`}
                  >
                    <Icon size={14} weight={index === 0 ? "fill" : "regular"} />
                    {item}
                  </div>
                ))}
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {[
                  ["Workspace health", "3 machines in sync", "manifest v142"],
                  ["Encrypted secrets", "7 sealed values", "no plaintext relay"],
                  ["Billing", "Free plan", "upgrade-ready"],
                  ["Agent context", "/v1/me.md", "markdown-first"],
                ].map(([title, value, meta]) => (
                  <div key={title} className="rounded-xl border border-ink-line bg-paper/45 p-4">
                    <div className="text-[12px] font-semibold text-ink-mute">{title}</div>
                    <div className="mt-2 text-[17px] font-semibold text-ink">{value}</div>
                    <div className="nums mt-1 font-mono text-[11px] text-ink-mute">{meta}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard app                                                      */
/* ------------------------------------------------------------------ */

function DashboardApp({
  route,
  relay,
  message,
  messageTone,
  busy,
  hasToken,
  me,
  workspaces,
  devices,
  requestPasswordSetup,
  logout,
  loadAccount,
}: {
  route: string;
  relay: string;
  message: string;
  messageTone: "ok" | "error" | "";
  busy: boolean;
  hasToken: boolean;
  me: MeResponse | null;
  workspaces: Workspace[];
  devices: Device[];
  requestPasswordSetup: (targetEmail?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadAccount: (options?: { silent?: boolean }) => Promise<void>;
}) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [newTokenName, setNewTokenName] = useState("CLI token");
  const [newTokenExpiresInDays, setNewTokenExpiresInDays] = useState("30");
  const [newTokenScopePreset, setNewTokenScopePreset] = useState(tokenScopePresets[0]?.id ?? "cli-sync");
  const [newWorkspaceName, setNewWorkspaceName] = useState("New workspace");
  const [newWorkspaceRoot, setNewWorkspaceRoot] = useState("~/Code/new-workspace");
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<Workspace[]>(EMPTY_WORKSPACES);
  const [newDeviceLabel, setNewDeviceLabel] = useState("Workstation");
  const [newDevicePublicKey, setNewDevicePublicKey] = useState("");
  const [createdToken, setCreatedToken] = useState("");
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [dashboardTone, setDashboardTone] = useState<"ok" | "error" | "">("");
  const [relayHealth, setRelayHealth] = useState<RelayHealth | null>(null);
  const [relayHealthError, setRelayHealthError] = useState("");
  const [selectedFilesWorkspaceId, setSelectedFilesWorkspaceId] = useState("");
  const [fileInventory, setFileInventory] = useState<FileInventory | null>(null);
  const [fileInventoryBusy, setFileInventoryBusy] = useState(false);
  const [fileInventoryError, setFileInventoryError] = useState("");
  const [selectedSecretsWorkspaceId, setSelectedSecretsWorkspaceId] = useState("");
  const [secrets, setSecrets] = useState<SecretRecord[]>([]);
  const [secretsBusy, setSecretsBusy] = useState(false);
  const [secretsError, setSecretsError] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditExportBusy, setAuditExportBusy] = useState(false);
  const [accountExportBusy, setAccountExportBusy] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [teams, setTeams] = useState<TeamSummary[]>(EMPTY_TEAMS);
  const [pendingTeamInvites, setPendingTeamInvites] = useState<TeamInvite[]>(EMPTY_TEAM_INVITES);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<TeamDetails | null>(null);
  const [teamsBusy, setTeamsBusy] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [newTeamName, setNewTeamName] = useState("Movie Wizard crew");
  const [teamInviteEmail, setTeamInviteEmail] = useState("");
  const [teamInviteRole, setTeamInviteRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [createdTeamInvite, setCreatedTeamInvite] = useState<TeamInvite | null>(null);
  const [acceptInviteId, setAcceptInviteId] = useState(() => new URLSearchParams(window.location.search).get("invite_id") ?? "");
  const [acceptInviteToken, setAcceptInviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite_token") ?? "");
  const [teamWorkspaceName, setTeamWorkspaceName] = useState("Movie Wizard sidecar");
  const [teamWorkspaceRoot, setTeamWorkspaceRoot] = useState("movie-wizard/.pathstash-context");
  const handledCheckoutReturnRef = useRef("");
  const section = dashboardSectionFromRoute(route);
  const relayBase = relay.replace(/\/$/, "");
  const firstWorkspaceId = workspaces[0]?.id ?? "";
  const filesWorkspaceId = workspaces.some((workspace) => workspace.id === selectedFilesWorkspaceId)
    ? selectedFilesWorkspaceId
    : firstWorkspaceId;
  const secretsWorkspaceId = workspaces.some((workspace) => workspace.id === selectedSecretsWorkspaceId)
    ? selectedSecretsWorkspaceId
    : firstWorkspaceId;
  const currentFileInventory = fileInventory?.workspaceId === filesWorkspaceId ? fileInventory : null;
  const currentSecrets = secretsWorkspaceId ? secrets : EMPTY_SECRETS;
  const teamFeatureEnabled = Boolean(me?.entitlements?.sharedVaultPolicies);

  function dashboardReport(text: string, tone: "ok" | "error") {
    setDashboardMessage(text);
    setDashboardTone(tone);
  }

  const authHeaders = useCallback(
    (extra?: HeadersInit): HeadersInit => ({
      ...(extra ?? {}),
    }),
    [],
  );

  const loadArchivedWorkspaces = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasToken) {
        setArchivedWorkspaces([]);
        return;
      }

      try {
        const response = await fetch(`${relayBase}/v1/workspaces?status=archived`, {
          headers: authHeaders(),
          signal,
        });
        const body = (await response.json()) as { workspaces?: Workspace[]; error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `archived workspace load failed (${response.status})`);
        }
        if (!signal?.aborted) {
          setArchivedWorkspaces(body.workspaces ?? []);
        }
      } catch (error) {
        if (!signal?.aborted) {
          setArchivedWorkspaces([]);
          setDashboardMessage(error instanceof Error ? error.message : "Could not load archived workspaces");
          setDashboardTone("error");
        }
      }
    },
    [authHeaders, hasToken, relayBase],
  );

  const loadFileInventory = useCallback(
    async (workspaceId = filesWorkspaceId) => {
      if (!workspaceId || !hasToken) {
        setFileInventory(null);
        return;
      }

      setFileInventoryBusy(true);
      setFileInventoryError("");
      setFileInventory(null);
      try {
        const response = await fetch(`${relayBase}/v1/workspaces/${encodeURIComponent(workspaceId)}/files`, {
          headers: authHeaders(),
        });
        const body = (await response.json()) as FileInventory & { error?: string };
        if (!response.ok || body.error) {
          if (body.error === "manifest_not_found") {
            setFileInventory(null);
            setFileInventoryError("No manifest has been pushed for this workspace yet.");
            return;
          }
          throw new Error(body.error ?? `file inventory failed (${response.status})`);
        }
        setFileInventory(body);
      } catch (error) {
        setFileInventory(null);
        setFileInventoryError(error instanceof Error ? error.message : "Could not load file inventory");
      } finally {
        setFileInventoryBusy(false);
      }
    },
    [authHeaders, filesWorkspaceId, hasToken, relayBase],
  );

  const loadSecrets = useCallback(
    async (workspaceId = secretsWorkspaceId) => {
      if (!workspaceId || !hasToken) {
        setSecrets([]);
        return;
      }

      setSecretsBusy(true);
      setSecretsError("");
      try {
        const response = await fetch(`${relayBase}/v1/workspaces/${encodeURIComponent(workspaceId)}/secrets`, {
          headers: authHeaders(),
        });
        const body = (await response.json()) as { secrets?: SecretRecord[]; error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `secret inventory failed (${response.status})`);
        }
        setSecrets(body.secrets ?? []);
      } catch (error) {
        setSecrets([]);
        setSecretsError(error instanceof Error ? error.message : "Could not load secret inventory");
      } finally {
        setSecretsBusy(false);
      }
    },
    [authHeaders, hasToken, relayBase, secretsWorkspaceId],
  );

  const loadAuditEvents = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasToken) {
        setAuditEvents([]);
        return;
      }

      setAuditBusy(true);
      setAuditError("");
      try {
        const response = await fetch(`${relayBase}/v1/audit/events?limit=100`, {
          headers: authHeaders(),
          signal,
        });
        const body = (await response.json()) as { events?: AuditEvent[]; error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `audit load failed (${response.status})`);
        }
        if (!signal?.aborted) {
          setAuditEvents(body.events ?? []);
        }
      } catch (error) {
        if (!signal?.aborted) {
          setAuditEvents([]);
          setAuditError(error instanceof Error ? error.message : "Could not load audit events");
        }
      } finally {
        if (!signal?.aborted) {
          setAuditBusy(false);
        }
      }
    },
    [authHeaders, hasToken, relayBase],
  );

  const loadTeamDetails = useCallback(
    async (teamId: string, signal?: AbortSignal) => {
      if (!teamId || !hasToken) {
        setSelectedTeam(null);
        return;
      }

      setTeamsBusy(true);
      setTeamsError("");
      try {
        const response = await fetch(`${relayBase}/v1/teams/${encodeURIComponent(teamId)}`, {
          headers: authHeaders(),
          signal,
        });
        const body = (await response.json()) as TeamDetails & { error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `team load failed (${response.status})`);
        }
        if (!signal?.aborted) {
          setSelectedTeam(body);
        }
      } catch (error) {
        if (!signal?.aborted) {
          setSelectedTeam(null);
          setTeamsError(error instanceof Error ? error.message : "Could not load team");
        }
      } finally {
        if (!signal?.aborted) {
          setTeamsBusy(false);
        }
      }
    },
    [authHeaders, hasToken, relayBase],
  );

  const loadTeams = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasToken) {
        setTeams([]);
        setPendingTeamInvites([]);
        setSelectedTeam(null);
        return;
      }

      setTeamsBusy(true);
      setTeamsError("");
      try {
        const response = await fetch(`${relayBase}/v1/teams`, {
          headers: authHeaders(),
          signal,
        });
        const body = (await response.json()) as {
          teams?: TeamSummary[];
          pendingInvites?: TeamInvite[];
          error?: string;
        };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `team list failed (${response.status})`);
        }
        if (!signal?.aborted) {
          const nextTeams = body.teams ?? [];
          setTeams(nextTeams);
          setPendingTeamInvites(body.pendingInvites ?? []);
          setSelectedTeamId((current) => (nextTeams.some((team) => team.id === current) ? current : nextTeams[0]?.id ?? ""));
        }
      } catch (error) {
        if (!signal?.aborted) {
          setTeams([]);
          setPendingTeamInvites([]);
          setTeamsError(error instanceof Error ? error.message : "Could not load teams");
        }
      } finally {
        if (!signal?.aborted) {
          setTeamsBusy(false);
        }
      }
    },
    [authHeaders, hasToken, relayBase],
  );

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasToken) {
        setSessions([]);
        return;
      }

      setSessionsBusy(true);
      setSessionsError("");
      try {
        const response = await fetch(`${relayBase}/v1/auth/sessions`, {
          headers: authHeaders(),
          credentials: "include",
          signal,
        });
        const body = (await response.json()) as { sessions?: BrowserSession[]; error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `session load failed (${response.status})`);
        }
        if (!signal?.aborted) {
          setSessions(body.sessions ?? []);
        }
      } catch (error) {
        if (!signal?.aborted) {
          setSessions([]);
          setSessionsError(error instanceof Error ? error.message : "Could not load sessions");
        }
      } finally {
        if (!signal?.aborted) {
          setSessionsBusy(false);
        }
      }
    },
    [authHeaders, hasToken, relayBase],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadRelayHealth() {
      setRelayHealthError("");
      try {
        const response = await fetch(`${relayBase}/health`, { signal: controller.signal });
        const body = (await response.json()) as RelayHealth & { error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `relay health failed (${response.status})`);
        }
        if (!controller.signal.aborted) {
          setRelayHealth(body);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setRelayHealth(null);
          setRelayHealthError(error instanceof Error ? error.message : "Could not load relay health");
        }
      }
    }
    void loadRelayHealth();
    return () => controller.abort();
  }, [relayBase]);

  useEffect(() => {
    if (!hasToken || !me) {
      return;
    }
    let cancelled = false;
    async function loadTokens() {
      try {
        const response = await fetch(`${relayBase}/v1/tokens`, {
          headers: authHeaders(),
          credentials: "include",
        });
        const body = (await response.json()) as { tokens?: TokenRow[]; error?: string };
        if (!response.ok || body.error) {
          throw new Error(body.error ?? `token load failed (${response.status})`);
        }
        if (!cancelled) {
          setTokens(body.tokens ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardMessage(error instanceof Error ? error.message : "Could not load tokens");
          setDashboardTone("error");
        }
      }
    }
    void loadTokens();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, hasToken, me, relayBase]);

  useEffect(() => {
    if (section !== "billing" || !hasToken) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout !== "success" && checkout !== "cancelled") {
      return;
    }

    const sessionId = params.get("session_id") ?? "";
    const checkoutKey = `${checkout}:${sessionId}`;
    if (handledCheckoutReturnRef.current === checkoutKey) {
      return;
    }
    handledCheckoutReturnRef.current = checkoutKey;

    if (checkout === "success") {
      setDashboardMessage("Checkout completed. Syncing subscription status from Stripe.");
      setDashboardTone("ok");
      void (async () => {
        try {
          if (sessionId) {
            const response = await fetch(`${relayBase}/v1/billing/checkout/sync`, {
              method: "POST",
              headers: authHeaders({ "content-type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({ sessionId }),
            });
            const body = (await response.json()) as { ok?: boolean } & RelayErrorResponse;
            if (!response.ok || body.error || !body.ok) {
              throw new Error(relayErrorMessage(body, `checkout sync failed (${response.status})`, response));
            }
            setDashboardMessage("Checkout synced. Subscription status refreshed.");
            setDashboardTone("ok");
          }
          await loadAccount({ silent: true });
        } catch (error) {
          setDashboardMessage(error instanceof Error ? error.message : "Checkout completed, but subscription sync failed.");
          setDashboardTone("error");
          await loadAccount({ silent: true });
        }
      })();
    } else {
      setDashboardMessage("Checkout cancelled. Your current plan is unchanged.");
      setDashboardTone("ok");
    }

    params.delete("checkout");
    params.delete("session_id");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [authHeaders, hasToken, loadAccount, relayBase, section]);

  useEffect(() => {
    if (section !== "workspaces" || !hasToken) {
      return;
    }

    const controller = new AbortController();
    void loadArchivedWorkspaces(controller.signal);
    return () => controller.abort();
  }, [hasToken, loadArchivedWorkspaces, section]);

  useEffect(() => {
    if (section !== "files" || !hasToken || !filesWorkspaceId) {
      return;
    }

    void loadFileInventory(filesWorkspaceId);
  }, [filesWorkspaceId, hasToken, loadFileInventory, section]);

  useEffect(() => {
    if (section !== "secrets" || !hasToken || !secretsWorkspaceId) {
      return;
    }

    void loadSecrets(secretsWorkspaceId);
  }, [hasToken, loadSecrets, secretsWorkspaceId, section]);

  useEffect(() => {
    if (section !== "audit" || !hasToken) {
      return;
    }

    const controller = new AbortController();
    void loadAuditEvents(controller.signal);
    return () => controller.abort();
  }, [hasToken, loadAuditEvents, section]);

  useEffect(() => {
    if (section !== "teams" || !hasToken) {
      return;
    }

    const controller = new AbortController();
    void loadTeams(controller.signal);
    return () => controller.abort();
  }, [hasToken, loadTeams, section]);

  useEffect(() => {
    if (section !== "teams" || !hasToken || !selectedTeamId) {
      return;
    }

    const controller = new AbortController();
    void loadTeamDetails(selectedTeamId, controller.signal);
    return () => controller.abort();
  }, [hasToken, loadTeamDetails, section, selectedTeamId]);

  useEffect(() => {
    if (section !== "security" || !hasToken) {
      return;
    }

    const controller = new AbortController();
    void loadSessions(controller.signal);
    return () => controller.abort();
  }, [hasToken, loadSessions, section]);

  async function deleteSecret(name: string) {
    if (!secretsWorkspaceId) {
      return;
    }

    setSecretsBusy(true);
    setSecretsError("");
    try {
      const response = await fetch(
        `${relayBase}/v1/workspaces/${encodeURIComponent(secretsWorkspaceId)}/secrets/${encodeURIComponent(name)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `secret delete failed (${response.status})`);
      }
      setSecrets((current) => current.filter((secret) => secret.name !== name));
      dashboardReport("Secret record deleted.", "ok");
    } catch (error) {
      setSecretsError(error instanceof Error ? error.message : "Could not delete secret record");
    } finally {
      setSecretsBusy(false);
    }
  }

  async function exportAuditEvents() {
    setAuditExportBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/audit/events.ndjson?limit=500`, {
        headers: authHeaders(),
      });
      const text = await response.text();
      if (!response.ok) {
        const parsed = parseJsonText<{ error?: string; feature?: string; requiredPlan?: string }>(text);
        const planMessage =
          parsed?.error === "plan_feature_required" && parsed.requiredPlan
            ? `${parsed.feature ?? "audit export"} requires the ${parsed.requiredPlan} plan`
            : parsed?.error;
        throw new Error(planMessage ?? `audit export failed (${response.status})`);
      }

      const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "application/x-ndjson" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pathstash-audit-${new Date().toISOString().slice(0, 10)}.ndjson`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      dashboardReport("Audit export downloaded.", "ok");
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not export audit events", "error");
    } finally {
      setAuditExportBusy(false);
    }
  }

  async function exportAccountData() {
    setAccountExportBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/me/export.json`, {
        headers: authHeaders(),
      });
      const text = await response.text();
      if (!response.ok) {
        const parsed = parseJsonText<{ error?: string }>(text);
        throw new Error(parsed?.error ?? `account export failed (${response.status})`);
      }

      const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pathstash-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      dashboardReport("Account export downloaded.", "ok");
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not export account data", "error");
    } finally {
      setAccountExportBusy(false);
    }
  }

  async function createWorkspace() {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/workspaces`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ name: newWorkspaceName, rootPath: newWorkspaceRoot }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || body.error || !body.id) {
        throw new Error(relayErrorMessage(body, `workspace create failed (${response.status})`, response));
      }
      dashboardReport("Workspace created. Push a manifest from the CLI to populate it.", "ok");
      await loadAccount();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not create workspace", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function updateAccountProfile(name: string) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/me`, {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as { account?: Account; error?: string };
      if (!response.ok || body.error || !body.account) {
        throw new Error(body.error ?? `account update failed (${response.status})`);
      }
      dashboardReport("Account profile updated.", "ok");
      await loadAccount({ silent: true });
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not update account profile", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function changePassword(currentPassword: string, newPassword: string, revokeOtherSessions: boolean) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/auth/change-password`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions }),
      });
      const body = (await response.json()) as { ok?: boolean; otherSessionsRevoked?: boolean; error?: string; minLength?: number };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `password change failed (${response.status})`, response));
      }
      dashboardReport(body.otherSessionsRevoked ? "Password changed. Other browser sessions were revoked." : "Password changed.", "ok");
      await loadSessions();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not change password", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function requestAccountEmailChange(newEmail: string, currentPassword: string) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/auth/request-email-change`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ newEmail, currentPassword }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        verificationDelivery?: "sent" | "failed" | "unconfigured";
        verificationUrl?: string;
      } & RelayErrorResponse;
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `email change request failed (${response.status})`, response));
      }
      if (body.verificationDelivery === "sent") {
        dashboardReport("Verification email sent to the new address. Open the link there to finish the change.", "ok");
      } else if (body.verificationUrl) {
        dashboardReport(`Email delivery is not configured, so use this local verification link: ${body.verificationUrl}`, "ok");
      } else if (body.verificationDelivery === "unconfigured") {
        dashboardReport("Email delivery is not configured yet. Add EMAIL_FROM and the selected provider secret before changing account email.", "error");
      } else {
        dashboardReport("Email change request accepted.", "ok");
      }
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not request email change", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function updateWorkspace(workspaceId: string, name: string, rootPath: string) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ name, rootPath }),
      });
      const body = (await response.json()) as { workspace?: Workspace; error?: string };
      if (!response.ok || body.error || !body.workspace) {
        throw new Error(body.error ?? `workspace update failed (${response.status})`);
      }
      dashboardReport("Workspace settings updated.", "ok");
      await loadAccount();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not update workspace", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function archiveWorkspace(workspaceId: string, name: string) {
    if (!window.confirm(`Archive workspace "${name}"? Existing manifests and blobs are retained, but the workspace is hidden from normal account and agent flows.`)) {
      return;
    }

    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `workspace archive failed (${response.status})`);
      }
      dashboardReport("Workspace archived.", "ok");
      await loadAccount();
      await loadArchivedWorkspaces();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not archive workspace", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function restoreWorkspace(workspaceId: string, name: string) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/workspaces/${encodeURIComponent(workspaceId)}/restore`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = (await response.json()) as { ok?: boolean; workspace?: Workspace; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `workspace restore failed (${response.status})`, response));
      }
      dashboardReport(`Workspace "${name}" restored.`, "ok");
      await loadAccount();
      await loadArchivedWorkspaces();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not restore workspace", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function createTeam() {
    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    setCreatedTeamInvite(null);
    try {
      const response = await fetch(`${relayBase}/v1/teams`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ name: newTeamName }),
      });
      const body = (await response.json()) as TeamDetails & { error?: string };
      if (!response.ok || body.error || !body.team?.id) {
        throw new Error(body.error ?? `team create failed (${response.status})`);
      }
      setSelectedTeamId(body.team.id);
      setSelectedTeam(body);
      dashboardReport("Team created. Add members or create a shared workspace next.", "ok");
      await loadTeams();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not create team", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function createTeamInvite() {
    if (!selectedTeamId) {
      return;
    }

    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    setCreatedTeamInvite(null);
    try {
      const response = await fetch(`${relayBase}/v1/teams/${encodeURIComponent(selectedTeamId)}/invites`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ email: teamInviteEmail, role: teamInviteRole }),
      });
      const body = (await response.json()) as { invite?: TeamInvite; error?: string };
      if (!response.ok || body.error || !body.invite) {
        throw new Error(body.error ?? `invite create failed (${response.status})`);
      }
      setCreatedTeamInvite(body.invite);
      setTeamInviteEmail("");
      if (body.invite.inviteDelivery === "sent") {
        dashboardReport("Invite created and emailed. The token is still shown once for manual backup.", "ok");
      } else if (body.invite.inviteDelivery === "unconfigured") {
        dashboardReport("Invite created, but email delivery is not configured. Share the token with the invited account.", "error");
      } else {
        dashboardReport("Invite created, but email delivery failed. Share the token with the invited account.", "error");
      }
      await loadTeams();
      await loadTeamDetails(selectedTeamId);
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not create invite", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function acceptTeamInvite() {
    const inviteId = acceptInviteId.trim();
    const inviteToken = acceptInviteToken.trim();

    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/teams/invites/${encodeURIComponent(inviteId)}/accept`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ token: inviteToken }),
      });
      const body = (await response.json()) as TeamDetails & { accepted?: boolean; error?: string };
      if (!response.ok || body.error || !body.accepted) {
        throw new Error(body.error ?? `invite accept failed (${response.status})`);
      }
      if (body.team?.id) {
        setSelectedTeamId(body.team.id);
      }
      setSelectedTeam(body);
      setAcceptInviteId("");
      setAcceptInviteToken("");
      clearDashboardInviteParams();
      dashboardReport("Invite accepted. Shared workspaces are now visible to this account.", "ok");
      await loadTeams();
      await loadAccount();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not accept invite", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function createTeamWorkspace() {
    if (!selectedTeamId) {
      return;
    }

    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/workspaces`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ name: teamWorkspaceName, rootPath: teamWorkspaceRoot, teamId: selectedTeamId }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || body.error || !body.id) {
        throw new Error(relayErrorMessage(body, `shared workspace create failed (${response.status})`, response));
      }
      dashboardReport("Shared workspace created for the team.", "ok");
      await loadTeamDetails(selectedTeamId);
      await loadAccount();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not create shared workspace", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function updateTeamMemberRole(accountId: string, role: Exclude<TeamRole, "owner">) {
    if (!selectedTeamId) {
      return;
    }

    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(
        `${relayBase}/v1/teams/${encodeURIComponent(selectedTeamId)}/members/${encodeURIComponent(accountId)}`,
        {
          method: "PATCH",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ role }),
        },
      );
      const body = (await response.json()) as TeamDetails & { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `member role update failed (${response.status})`);
      }
      setSelectedTeam(body);
      dashboardReport("Team member role updated.", "ok");
      await loadTeams();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not update team member role", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function removeTeamMember(accountId: string) {
    if (!selectedTeamId) {
      return;
    }

    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(
        `${relayBase}/v1/teams/${encodeURIComponent(selectedTeamId)}/members/${encodeURIComponent(accountId)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );
      const body = (await response.json()) as TeamDetails & { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `member remove failed (${response.status})`);
      }
      setSelectedTeam(body);
      dashboardReport("Team member removed.", "ok");
      await loadTeams();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not remove team member", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function revokeTeamInvite(inviteId: string) {
    if (!selectedTeamId) {
      return;
    }

    setTeamsBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(
        `${relayBase}/v1/teams/${encodeURIComponent(selectedTeamId)}/invites/${encodeURIComponent(inviteId)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );
      const body = (await response.json()) as TeamDetails & { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `invite revoke failed (${response.status})`);
      }
      setSelectedTeam(body);
      dashboardReport("Pending invite revoked.", "ok");
      await loadTeams();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not revoke invite", "error");
    } finally {
      setTeamsBusy(false);
    }
  }

  async function createDevice() {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/devices`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          label: newDeviceLabel,
          publicKey: newDevicePublicKey.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { device?: Device; error?: string };
      if (!response.ok || body.error || !body.device) {
        throw new Error(body.error ?? `device create failed (${response.status})`);
      }
      setNewDevicePublicKey("");
      dashboardReport("Device registered.", "ok");
      await loadAccount();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not register device", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `device revoke failed (${response.status})`);
      }
      dashboardReport("Device revoked.", "ok");
      await loadAccount();
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not revoke device", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function createToken() {
    setDashboardBusy(true);
    setCreatedToken("");
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/tokens`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          name: newTokenName,
          scopes: tokenScopesForPreset(newTokenScopePreset),
          ...tokenExpirationPayload(newTokenExpiresInDays),
        }),
      });
      const body = (await response.json()) as { token?: TokenRow & { value?: string }; error?: string };
      if (!response.ok || body.error || !body.token) {
        throw new Error(body.error ?? `token create failed (${response.status})`);
      }
      setCreatedToken(body.token.value ?? "");
      setTokens((current) => [body.token as TokenRow, ...current]);
      dashboardReport("Token created. Copy it now; the relay will not show it again.", "ok");
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not create token", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function revokeToken(tokenId: string) {
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/tokens/${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `token revoke failed (${response.status})`);
      }
      setTokens((current) =>
        current.map((item) => (item.id === tokenId ? { ...item, revoked_at: new Date().toISOString() } : item)),
      );
      dashboardReport("Token revoked.", "ok");
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not revoke token", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function revokeSession(sessionId: string) {
    setSessionsBusy(true);
    setSessionsError("");
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const body = (await response.json()) as { ok?: boolean; current?: boolean; revokedAt?: string; error?: string };
      if (!response.ok || body.error || !body.ok) {
        throw new Error(body.error ?? `session revoke failed (${response.status})`);
      }
      if (body.current) {
        localStorage.removeItem("pathstash:token");
        dashboardReport("Current browser session revoked.", "ok");
        await logout();
        return;
      } else {
        dashboardReport("Browser session revoked.", "ok");
      }
      await loadSessions();
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "Could not revoke session");
    } finally {
      setSessionsBusy(false);
    }
  }

  async function startCheckout(plan: "pro" | "team") {
    if (relayHealth?.configuration?.billing?.configured === false) {
      dashboardReport("Stripe billing is not configured yet. Set Stripe secrets and price ids before starting checkout.", "error");
      return;
    }
    if (relayHealth?.configuration?.billing?.webhookConfigured === false) {
      dashboardReport("Stripe webhook signing is not configured yet. Add STRIPE_WEBHOOK_SECRET before starting checkout.", "error");
      return;
    }
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/billing/checkout`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ plan }),
      });
      const body = (await response.json()) as { url?: string } & RelayErrorResponse;
      if (!response.ok || body.error || !body.url) {
        throw new Error(relayErrorMessage(body, `checkout failed (${response.status})`, response));
      }
      window.location.href = body.url;
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not start checkout", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function openBillingPortal() {
    if (relayHealth?.configuration?.billing?.configured === false) {
      dashboardReport("Stripe billing is not configured yet. Set Stripe secrets before opening the customer portal.", "error");
      return;
    }
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/billing/portal`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = (await response.json()) as { url?: string } & RelayErrorResponse;
      if (!response.ok || body.error || !body.url) {
        throw new Error(relayErrorMessage(body, `portal failed (${response.status})`, response));
      }
      window.location.href = body.url;
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not open billing portal", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  async function syncBillingSubscription() {
    if (relayHealth?.configuration?.billing?.configured === false) {
      dashboardReport("Stripe billing is not configured yet. Set Stripe secrets before syncing billing.", "error");
      return;
    }
    if (!me?.subscription?.stripe_subscription_id) {
      dashboardReport("Start checkout before syncing billing from Stripe.", "error");
      return;
    }
    setDashboardBusy(true);
    setDashboardMessage("");
    setDashboardTone("");
    try {
      const response = await fetch(`${relayBase}/v1/billing/sync`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      const body = (await response.json()) as { ok?: boolean; subscription?: Subscription } & RelayErrorResponse;
      if (!response.ok || body.error || !body.ok) {
        throw new Error(relayErrorMessage(body, `billing sync failed (${response.status})`, response));
      }
      dashboardReport("Billing synced from Stripe.", "ok");
      await loadAccount({ silent: true });
    } catch (error) {
      dashboardReport(error instanceof Error ? error.message : "Could not sync billing", "error");
    } finally {
      setDashboardBusy(false);
    }
  }

  return (
    <div className="grain min-h-dvh bg-paper text-ink">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-paper"
      >
        Skip to dashboard
      </a>
      <DashboardTopbar account={me?.account} />
      <main id="dashboard-main" className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 md:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <DashboardNav active={section} />
        <div className="min-w-0">
          <DashboardStatusBar
            account={me?.account}
            subscription={me?.subscription}
            entitlements={me?.entitlements}
            usage={me?.usage}
            workspaces={workspaces}
            devices={devices}
            busy={busy || dashboardBusy}
          />
          <DashboardMessageBanner message={message || dashboardMessage} tone={message ? messageTone : dashboardTone} />
          {section === "overview" ? (
            <OverviewPage
              account={me?.account}
              subscription={me?.subscription}
              entitlements={me?.entitlements}
              usage={me?.usage}
              workspaces={workspaces}
              devices={devices}
            />
          ) : null}
          {section === "workspaces" ? (
            <WorkspacesPage
              workspaces={workspaces}
              archivedWorkspaces={archivedWorkspaces}
              newWorkspaceName={newWorkspaceName}
              setNewWorkspaceName={setNewWorkspaceName}
              newWorkspaceRoot={newWorkspaceRoot}
              setNewWorkspaceRoot={setNewWorkspaceRoot}
              busy={dashboardBusy}
              hasToken={hasToken}
              onCreateWorkspace={createWorkspace}
              onUpdateWorkspace={updateWorkspace}
              onArchiveWorkspace={archiveWorkspace}
              onRestoreWorkspace={restoreWorkspace}
            />
          ) : null}
          {section === "teams" ? (
            <TeamsPage
              teams={teams}
              pendingInvites={pendingTeamInvites}
              selectedTeamId={selectedTeamId}
              setSelectedTeamId={setSelectedTeamId}
              selectedTeam={selectedTeam}
              newTeamName={newTeamName}
              setNewTeamName={setNewTeamName}
              inviteEmail={teamInviteEmail}
              setInviteEmail={setTeamInviteEmail}
              inviteRole={teamInviteRole}
              setInviteRole={setTeamInviteRole}
              createdInvite={createdTeamInvite}
              acceptInviteId={acceptInviteId}
              setAcceptInviteId={setAcceptInviteId}
              acceptInviteToken={acceptInviteToken}
              setAcceptInviteToken={setAcceptInviteToken}
              teamWorkspaceName={teamWorkspaceName}
              setTeamWorkspaceName={setTeamWorkspaceName}
              teamWorkspaceRoot={teamWorkspaceRoot}
              setTeamWorkspaceRoot={setTeamWorkspaceRoot}
              busy={teamsBusy}
              error={teamsError}
              hasToken={hasToken}
              teamFeatureEnabled={teamFeatureEnabled}
              onCreateTeam={createTeam}
              onCreateInvite={createTeamInvite}
              onAcceptInvite={acceptTeamInvite}
              onCreateTeamWorkspace={createTeamWorkspace}
              onUpdateMemberRole={updateTeamMemberRole}
              onRemoveMember={removeTeamMember}
              onRevokeInvite={revokeTeamInvite}
            />
          ) : null}
          {section === "devices" ? (
            <DevicesPage
              devices={devices}
              newDeviceLabel={newDeviceLabel}
              setNewDeviceLabel={setNewDeviceLabel}
              newDevicePublicKey={newDevicePublicKey}
              setNewDevicePublicKey={setNewDevicePublicKey}
              busy={dashboardBusy}
              hasToken={hasToken}
              onCreateDevice={createDevice}
              onRevokeDevice={revokeDevice}
            />
          ) : null}
          {section === "secrets" ? (
            <SecretsPage
              workspaces={workspaces}
              selectedWorkspaceId={secretsWorkspaceId}
              setSelectedWorkspaceId={setSelectedSecretsWorkspaceId}
              secrets={currentSecrets}
              error={secretsError}
              busy={secretsBusy}
              hasToken={hasToken}
              onRefresh={() => loadSecrets()}
              onDeleteSecret={deleteSecret}
            />
          ) : null}
          {section === "files" ? (
            <LargeFilesPage
              workspaces={workspaces}
              selectedWorkspaceId={filesWorkspaceId}
              setSelectedWorkspaceId={setSelectedFilesWorkspaceId}
              inventory={currentFileInventory}
              error={fileInventoryError}
              busy={fileInventoryBusy}
              hasToken={hasToken}
              onRefresh={() => loadFileInventory()}
            />
          ) : null}
          {section === "tokens" ? (
            <TokensPage
              tokens={tokens}
              newTokenName={newTokenName}
              setNewTokenName={setNewTokenName}
              newTokenExpiresInDays={newTokenExpiresInDays}
              setNewTokenExpiresInDays={setNewTokenExpiresInDays}
              newTokenScopePreset={newTokenScopePreset}
              setNewTokenScopePreset={setNewTokenScopePreset}
              createdToken={createdToken}
              busy={dashboardBusy}
              hasToken={hasToken}
              onCreateToken={createToken}
              onRevokeToken={revokeToken}
            />
          ) : null}
          {section === "security" ? (
            <SecurityPage
              account={me?.account}
              principal={me?.principal}
              sessions={sessions}
              busy={sessionsBusy || busy || dashboardBusy}
              error={sessionsError}
              hasToken={hasToken}
              onUpdateProfile={updateAccountProfile}
              onRequestEmailChange={requestAccountEmailChange}
              onChangePassword={changePassword}
              onRefresh={() => loadSessions()}
              onRevokeSession={revokeSession}
              onRequestPasswordSetup={requestPasswordSetup}
              accountExportBusy={accountExportBusy}
              onExportAccount={exportAccountData}
              onLogout={logout}
            />
          ) : null}
          {section === "audit" ? (
            <AuditPage
              events={auditEvents}
              busy={auditBusy}
              exportBusy={auditExportBusy}
              error={auditError}
              hasToken={hasToken}
              canExport={Boolean(me?.entitlements?.auditLogExport)}
              onRefresh={() => loadAuditEvents()}
              onExport={exportAuditEvents}
            />
          ) : null}
          {section === "billing" ? (
            <BillingPage
              subscription={me?.subscription}
              entitlements={me?.entitlements}
              usage={me?.usage}
              relayHealth={relayHealth}
              relayHealthError={relayHealthError}
              busy={dashboardBusy}
              onCheckout={startCheckout}
              onPortal={openBillingPortal}
              onSync={syncBillingSubscription}
            />
          ) : null}
          {section === "agents" ? <AgentReadinessPage /> : null}
        </div>
      </main>
    </div>
  );
}

type DashboardSection =
  | "overview"
  | "workspaces"
  | "teams"
  | "devices"
  | "secrets"
  | "files"
  | "tokens"
  | "security"
  | "audit"
  | "billing"
  | "agents";

function dashboardSectionFromRoute(route: string): DashboardSection {
  const value = route.split("/").filter(Boolean)[1];
  if (
    value === "workspaces" ||
    value === "teams" ||
    value === "devices" ||
    value === "secrets" ||
    value === "files" ||
    value === "tokens" ||
    value === "security" ||
    value === "audit" ||
    value === "billing" ||
    value === "agents"
  ) {
    return value;
  }
  return "overview";
}

function DashboardTopbar({ account }: { account?: Account }) {
  return (
    <header className="border-b border-ink-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 md:px-6">
        <a href="/" className="press focus-ring flex items-center gap-2.5 rounded-md text-[16px] font-semibold">
          <Logo />
          PathStash
        </a>
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="/"
            className="press focus-ring hidden cursor-pointer rounded-lg border border-ink-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink sm:inline-flex"
          >
            Marketing
          </a>
          <div className="min-w-0 text-right">
            <div className="truncate text-[12.5px] font-semibold">{account?.name ?? "Dashboard"}</div>
            <div className="truncate text-[11.5px] text-ink-mute">{account?.email ?? "Signed in"}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function DashboardNav({ active }: { active: DashboardSection }) {
  const items: { id: DashboardSection; label: string; href: string; icon: typeof Folder }[] = [
    { id: "overview", label: "Overview", href: "/dashboard", icon: SealCheck },
    { id: "workspaces", label: "Workspaces", href: "/dashboard/workspaces", icon: Folder },
    { id: "teams", label: "Teams", href: "/dashboard/teams", icon: TreeStructure },
    { id: "devices", label: "Devices", href: "/dashboard/devices", icon: DesktopTower },
    { id: "secrets", label: "Secrets", href: "/dashboard/secrets", icon: LockKey },
    { id: "files", label: "Large files", href: "/dashboard/files", icon: HardDrives },
    { id: "tokens", label: "Tokens", href: "/dashboard/tokens", icon: Key },
    { id: "security", label: "Security", href: "/dashboard/security", icon: ShieldCheck },
    { id: "audit", label: "Audit", href: "/dashboard/audit", icon: ClipboardText },
    { id: "billing", label: "Billing", href: "/dashboard/billing", icon: Receipt },
    { id: "agents", label: "Agent context", href: "/dashboard/agents", icon: Robot },
  ];

  return (
    <aside className="rounded-xl2 bg-ink p-3 text-paper shadow-card lg:sticky lg:top-5 lg:h-[calc(100dvh-2.5rem)]">
      <div className="hidden px-3 pb-3 pt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-paper/60 lg:block">
        Console
      </div>
      <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <a
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`press focus-ring flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                isActive ? "bg-white/10 text-paper" : "text-paper/58 hover:bg-white/[0.06] hover:text-paper"
              }`}
            >
              <Icon size={16} weight={isActive ? "duotone" : "regular"} />
              <span className="sr-only">{item.label}</span>
              <span aria-hidden="true">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

function DashboardStatusBar({
  account,
  subscription,
  entitlements,
  usage,
  workspaces,
  devices,
  busy,
}: {
  account?: Account;
  subscription?: Subscription;
  entitlements?: PlanEntitlements;
  usage?: AccountUsage;
  workspaces: Workspace[];
  devices: Device[];
  busy: boolean;
}) {
  const stats = [
    ["Plan", subscriptionLabel(subscription, entitlements), subscription?.status ?? "not connected"],
    ["Workspaces", String(workspaces.length), workspaces.length === 1 ? "workspace" : "workspaces"],
    ["Devices", usageLimitText(usage?.devices ?? devices.length, entitlements?.devices), "active devices"],
    ["Account", account?.email ?? "none", busy ? "loading" : "ready"],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(([label, value, meta]) => (
        <div key={label} className="rounded-xl border border-ink-line bg-white p-4 shadow-card">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">{label}</div>
          <div className="nums mt-2 truncate text-[22px] font-semibold tracking-tight">{value}</div>
          <div className="mt-1 text-[12px] text-ink-mute">{meta}</div>
        </div>
      ))}
    </section>
  );
}

function OverviewPage({
  account,
  subscription,
  entitlements,
  usage,
  workspaces,
  devices,
}: {
  account?: Account;
  subscription?: Subscription;
  entitlements?: PlanEntitlements;
  usage?: AccountUsage;
  workspaces: Workspace[];
  devices: Device[];
}) {
  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <DashboardPanel title="Workspace sync" actionLabel="View workspaces" actionHref="/dashboard/workspaces">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Scan", "npx pathstash init", "Capture roots and ignore rules"],
            ["Push", "npx pathstash push", "Publish manifest and small blobs"],
            ["Hydrate", "npx pathstash hydrate", "Restore without overwriting work"],
          ].map(([title, command, detail]) => (
            <div key={title} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="text-[13px] font-semibold">{title}</div>
              <code className="mt-3 block rounded-md bg-ink px-2.5 py-2 font-mono text-[12px] text-paper">{command}</code>
              <p className="mt-3 text-[12.5px] leading-5 text-ink-mute">{detail}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Account posture" actionLabel="Billing" actionHref="/dashboard/billing">
        <dl className="grid gap-4 text-[13px]">
          {[
            ["Account", account?.email ?? "No account loaded"],
            ["Plan", subscriptionLabel(subscription, entitlements)],
            ["Subscription", subscription?.status ?? "not connected"],
            ["Connected devices", usageLimitText(usage?.devices ?? devices.length, entitlements?.devices)],
            ["Encrypted secrets", usageLimitText(usage?.secrets, entitlements?.secrets)],
            ["Storage", bytesLimitText(usage?.storageBytes, entitlements?.storageBytes)],
            ["Max blob", entitlements ? formatBytes(entitlements.maxBlobBytes) : "not loaded"],
            ["Workspaces", `${workspaces.length}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-ink-line pb-3 last:border-b-0 last:pb-0">
              <dt className="text-ink-mute">{label}</dt>
              <dd className="nums max-w-[58%] truncate text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </DashboardPanel>

      <DashboardPanel title="Recent workspaces" actionLabel="All workspaces" actionHref="/dashboard/workspaces">
        {workspaces.length > 0 ? (
          <Table
            columns={["Name", "Root", "Updated"]}
            rows={workspaces.map((workspace) => [
              workspace.name,
              workspace.rootPath ?? workspace.root_path ?? "-",
              workspace.updatedAt ?? workspace.updated_at ?? "not pushed",
            ])}
          />
        ) : (
          <EmptyState
            title="No workspaces yet"
            body="Create a workspace in the console or run npx pathstash init and npx pathstash push from the CLI."
            actionLabel="Create workspace"
            actionHref="/dashboard/workspaces"
          />
        )}
      </DashboardPanel>

      <DashboardPanel title="Agent handoff" actionLabel="Agent context" actionHref="/dashboard/agents">
        <div className="grid gap-3">
          {[
            ["/llms.txt", "Public product summary for crawlers and coding agents."],
            ["/v1/me.md", "Authenticated account summary for agent clients."],
            ["/v1/workspaces/{id}/manifest.md", "Workspace file map without requiring JSON parsing."],
          ].map(([path, detail]) => (
            <div key={path} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <code className="font-mono text-[12.5px] font-semibold">{path}</code>
              <p className="mt-2 text-[12.5px] leading-5 text-ink-mute">{detail}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </section>
  );
}

function WorkspacesPage({
  workspaces,
  archivedWorkspaces,
  newWorkspaceName,
  setNewWorkspaceName,
  newWorkspaceRoot,
  setNewWorkspaceRoot,
  busy,
  hasToken,
  onCreateWorkspace,
  onUpdateWorkspace,
  onArchiveWorkspace,
  onRestoreWorkspace,
}: {
  workspaces: Workspace[];
  archivedWorkspaces: Workspace[];
  newWorkspaceName: string;
  setNewWorkspaceName: (value: string) => void;
  newWorkspaceRoot: string;
  setNewWorkspaceRoot: (value: string) => void;
  busy: boolean;
  hasToken: boolean;
  onCreateWorkspace: () => void;
  onUpdateWorkspace: (workspaceId: string, name: string, rootPath: string) => void;
  onArchiveWorkspace: (workspaceId: string, name: string) => void;
  onRestoreWorkspace: (workspaceId: string, name: string) => void;
}) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null;
  const selectedRoot = selectedWorkspace?.rootPath ?? selectedWorkspace?.root_path ?? "";
  const [workspaceDraftName, setWorkspaceDraftName] = useState("");
  const [workspaceDraftRoot, setWorkspaceDraftRoot] = useState("");

  useEffect(() => {
    setWorkspaceDraftName(selectedWorkspace?.name ?? "");
    setWorkspaceDraftRoot(selectedRoot);
  }, [selectedWorkspace?.id, selectedWorkspace?.name, selectedRoot]);

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <DashboardPanel title="Create workspace">
        <div className="grid gap-4">
          <Field label="Workspace name" hint="">
            <input
              aria-label="Workspace name"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
            />
          </Field>
          <Field label="Root path" hint="">
            <input
              aria-label="Root path"
              value={newWorkspaceRoot}
              onChange={(event) => setNewWorkspaceRoot(event.target.value)}
              className="focus-ring nums w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 font-mono text-[13px] outline-none transition focus:border-forest-500"
              spellCheck={false}
            />
          </Field>
          <button
            type="button"
            onClick={onCreateWorkspace}
            disabled={busy || !hasToken || !newWorkspaceName.trim() || !newWorkspaceRoot.trim()}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[13.5px] font-semibold text-paper hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Folder size={15} weight="bold" />}
            Create workspace
          </button>
          {!hasToken ? <p className="text-[12.5px] text-ink-mute">Log in before creating workspaces.</p> : null}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Workspaces" actionLabel="CLI quickstart" actionHref="/dashboard">
        {workspaces.length > 0 ? (
          <div className="grid gap-3">
            {workspaces.map((workspace) => {
              const isSelected = selectedWorkspace?.id === workspace.id;
              const teamLabel =
                workspace.teamName ?? workspace.team_name ?? (workspace.teamId ?? workspace.team_id ? "Shared team" : "Solo");
              return (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setSelectedWorkspaceId(workspace.id)}
                  className={`press focus-ring cursor-pointer rounded-xl border p-4 text-left transition ${
                    isSelected ? "border-forest-300 bg-forest-50" : "border-ink-line bg-paper/45 hover:border-ink/20"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{workspace.name}</div>
                      <div className="nums mt-1 truncate font-mono text-[11.5px] text-ink-mute">
                        {workspace.rootPath ?? workspace.root_path ?? "-"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-forest-700">
                      {teamLabel}
                    </span>
                  </div>
                  <div className="nums mt-4 font-mono text-[11.5px] text-ink-mute">
                    {workspace.updatedAt ?? workspace.updated_at ?? "not pushed"}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No workspace records"
            body="Create the workspace here, then push a manifest from the CLI to add files and hashes."
          />
        )}
      </DashboardPanel>
      <DashboardPanel title="Workspace settings">
        {selectedWorkspace ? (
          <div className="grid gap-4">
            <Field label="Name" hint="">
              <input
                aria-label="Selected workspace name"
                value={workspaceDraftName}
                onChange={(event) => setWorkspaceDraftName(event.target.value)}
                className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
              />
            </Field>
            <Field label="Root path" hint="">
              <input
                aria-label="Selected workspace root"
                value={workspaceDraftRoot}
                onChange={(event) => setWorkspaceDraftRoot(event.target.value)}
                className="focus-ring nums w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 font-mono text-[13px] outline-none transition focus:border-forest-500"
                spellCheck={false}
              />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onUpdateWorkspace(selectedWorkspace.id, workspaceDraftName, workspaceDraftRoot)}
                disabled={busy || !hasToken || !workspaceDraftName.trim() || !workspaceDraftRoot.trim()}
                className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
              >
                {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Faders size={15} weight="bold" />}
                Save settings
              </button>
              <button
                type="button"
                onClick={() => onArchiveWorkspace(selectedWorkspace.id, selectedWorkspace.name)}
                disabled={busy || !hasToken}
                className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Broom size={15} weight="bold" />
                Archive
              </button>
            </div>
            <p className="text-[12.5px] leading-5 text-ink-mute">
              Archive hides the workspace from normal account, agent, manifest, file, and secret flows while keeping audit history intact.
            </p>
          </div>
        ) : (
          <EmptyState title="No workspace selected" body="Create or select a workspace to edit its name, root path, or archive it." />
        )}
      </DashboardPanel>
      <DashboardPanel title="Archived workspaces">
        {archivedWorkspaces.length > 0 ? (
          <div className="grid gap-3">
            {archivedWorkspaces.map((workspace) => {
              const deletedAt = workspace.deletedAt ?? workspace.deleted_at ?? "archived";
              const rootPath = workspace.rootPath ?? workspace.root_path ?? "-";
              const teamLabel =
                workspace.teamName ?? workspace.team_name ?? (workspace.teamId ?? workspace.team_id ? "Shared team" : "Solo");
              return (
                <div
                  key={workspace.id}
                  className="grid gap-3 rounded-xl border border-ink-line bg-paper/45 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{workspace.name}</span>
                      <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-forest-700">
                        {teamLabel}
                      </span>
                    </div>
                    <div className="nums mt-1 truncate font-mono text-[11.5px] text-ink-mute">{rootPath}</div>
                    <div className="nums mt-2 font-mono text-[11.5px] text-ink-mute">Archived {deletedAt}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestoreWorkspace(workspace.id, workspace.name)}
                    disabled={busy || !hasToken}
                    className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <ArrowsClockwise size={15} weight="bold" />
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No archived workspaces" body="Archived workspaces appear here so owners and admins can restore them intentionally." />
        )}
      </DashboardPanel>
      <DashboardPanel title="Manifest contract">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Root path", "Where the workspace lives on each machine."],
            ["Entries", "Files and directories after generated folders are skipped."],
            ["Hashes", "Content-addressed blobs for bounded file hydration."],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="text-[13px] font-semibold">{title}</div>
              <p className="mt-2 text-[12.5px] leading-5 text-ink-mute">{detail}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </section>
  );
}

function TeamsPage({
  teams,
  pendingInvites,
  selectedTeamId,
  setSelectedTeamId,
  selectedTeam,
  newTeamName,
  setNewTeamName,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  createdInvite,
  acceptInviteId,
  setAcceptInviteId,
  acceptInviteToken,
  setAcceptInviteToken,
  teamWorkspaceName,
  setTeamWorkspaceName,
  teamWorkspaceRoot,
  setTeamWorkspaceRoot,
  busy,
  error,
  hasToken,
  teamFeatureEnabled,
  onCreateTeam,
  onCreateInvite,
  onAcceptInvite,
  onCreateTeamWorkspace,
  onUpdateMemberRole,
  onRemoveMember,
  onRevokeInvite,
}: {
  teams: TeamSummary[];
  pendingInvites: TeamInvite[];
  selectedTeamId: string;
  setSelectedTeamId: (teamId: string) => void;
  selectedTeam: TeamDetails | null;
  newTeamName: string;
  setNewTeamName: (value: string) => void;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteRole: Exclude<TeamRole, "owner">;
  setInviteRole: (value: Exclude<TeamRole, "owner">) => void;
  createdInvite: TeamInvite | null;
  acceptInviteId: string;
  setAcceptInviteId: (value: string) => void;
  acceptInviteToken: string;
  setAcceptInviteToken: (value: string) => void;
  teamWorkspaceName: string;
  setTeamWorkspaceName: (value: string) => void;
  teamWorkspaceRoot: string;
  setTeamWorkspaceRoot: (value: string) => void;
  busy: boolean;
  error: string;
  hasToken: boolean;
  teamFeatureEnabled: boolean;
  onCreateTeam: () => void;
  onCreateInvite: () => void;
  onAcceptInvite: () => void;
  onCreateTeamWorkspace: () => void;
  onUpdateMemberRole: (accountId: string, role: Exclude<TeamRole, "owner">) => void;
  onRemoveMember: (accountId: string) => void;
  onRevokeInvite: (inviteId: string) => void;
}) {
  const selectedSummary = selectedTeam?.team ?? teams.find((team) => team.id === selectedTeamId) ?? null;
  const members = selectedTeam?.members ?? [];
  const invites = selectedTeam?.invites ?? [];
  const teamWorkspaces = selectedTeam?.workspaces ?? [];
  const canManage = selectedSummary?.role === "owner" || selectedSummary?.role === "admin";
  const canRemoveMembers = selectedSummary?.role === "owner";
  const inviteLinkLoaded = Boolean(acceptInviteId.trim() && acceptInviteToken.trim());
  const workspaceRows = teamWorkspaces.map((workspace) => [
    workspace.name,
    workspace.rootPath ?? workspace.root_path ?? "-",
    workspace.updatedAt ?? workspace.updated_at ?? "not pushed",
  ]);

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <DashboardPanel title="Create team">
        <div className="grid gap-4">
          <div className="rounded-xl border border-ink-line bg-paper/45 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">Plan gate</div>
            <div className="mt-2 text-[18px] font-semibold tracking-tight">
              {teamFeatureEnabled ? "Team sharing enabled" : "Team plan required"}
            </div>
            <p className="mt-2 text-[12.5px] leading-5 text-ink-mute">
              Shared workspaces, member invites, and team-owned sidecar context use the Team plan entitlement.
            </p>
            {!teamFeatureEnabled ? (
              <a
                href="/dashboard/billing"
                className="press focus-ring mt-4 inline-flex cursor-pointer rounded-lg border border-ink-line bg-white px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/20"
              >
                View billing
              </a>
            ) : null}
          </div>
          <Field label="Team name" hint="">
            <input
              aria-label="Team name"
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
            />
          </Field>
          <button
            type="button"
            onClick={onCreateTeam}
            disabled={busy || !hasToken || !teamFeatureEnabled || !newTeamName.trim()}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[13.5px] font-semibold text-paper hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <TreeStructure size={15} weight="bold" />}
            Create team
          </button>
          {!hasToken ? <p className="text-[12.5px] text-ink-mute">Log in before creating teams.</p> : null}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Teams">
        {teams.length > 0 ? (
          <div className="grid gap-3">
            {teams.map((team) => {
              const isSelected = team.id === selectedTeamId;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`press focus-ring cursor-pointer rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-forest-300 bg-forest-50"
                      : "border-ink-line bg-paper/45 hover:border-ink/20"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{team.name}</div>
                      <div className="nums mt-1 truncate font-mono text-[11.5px] text-ink-mute">{team.slug}</div>
                    </div>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold capitalize text-forest-700">
                      {team.role}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-[12px] text-ink-mute sm:grid-cols-3">
                    <span>{team.counts?.members ?? 0} members</span>
                    <span>{team.counts?.workspaces ?? 0} workspaces</span>
                    <span>{team.counts?.pendingInvites ?? 0} pending invites</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No teams"
            body="Create a team to share sidecar context, encrypted secrets, large files, concept assets, and internal docs outside Git."
          />
        )}
      </DashboardPanel>

      <DashboardPanel title="Members">
        {error ? <EmptyState title="Could not load team" body={error} /> : null}
        {!selectedSummary && !error ? (
          <EmptyState title="Select a team" body="Team members and pending invites appear after a team is selected." />
        ) : null}
        {selectedSummary ? (
          <div className="grid gap-4">
            <div className="rounded-xl bg-ink p-5 text-paper">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-[20px] font-semibold tracking-tight">{selectedSummary.name}</div>
                  <div className="nums mt-1 truncate font-mono text-[11.5px] text-paper/60">{selectedSummary.id}</div>
                </div>
                <span className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold capitalize">
                  {selectedSummary.role}
                </span>
              </div>
            </div>
            <div className="grid gap-3">
              {members.map((member) => {
                const isOwner = member.role === "owner";
                const memberRoleId = `member-role-${member.accountId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                return (
                  <div
                    key={member.accountId}
                    className="grid gap-3 rounded-xl border border-ink-line bg-paper/45 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{member.name || member.email || member.accountId}</div>
                      <div className="nums mt-1 truncate font-mono text-[11.5px] text-ink-mute">{member.email ?? member.accountId}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isOwner ? (
                        <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold capitalize text-forest-700">
                          {member.role}
                        </span>
                      ) : (
                        <>
                          <label className="sr-only" htmlFor={memberRoleId}>
                            Role for {member.email ?? member.accountId}
                          </label>
                          <select
                            id={memberRoleId}
                            value={member.role}
                            onChange={(event) =>
                              onUpdateMemberRole(member.accountId, event.target.value === "admin" ? "admin" : "member")
                            }
                            disabled={busy || !canRemoveMembers}
                            className="focus-ring rounded-md border border-ink-line bg-white px-2 py-1.5 text-[11.5px] font-semibold capitalize text-forest-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveMember(member.accountId)}
                        disabled={busy || !canRemoveMembers || isOwner}
                        className="press focus-ring cursor-pointer rounded-md border border-ink-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Invite member">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
            <Field label="Email" hint="">
              <input
                aria-label="Invite email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
                placeholder="teammate@example.com"
              />
            </Field>
            <Field label="Role" hint="">
              <select
                aria-label="Invite role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value === "admin" ? "admin" : "member")}
                className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
          </div>
          <button
            type="button"
            onClick={onCreateInvite}
            disabled={busy || !hasToken || !selectedTeamId || !canManage || !teamFeatureEnabled || !inviteEmail.trim()}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Key size={15} weight="bold" />}
            Create invite
          </button>
          {createdInvite?.token ? (
            <div className="rounded-lg bg-ink p-3 text-paper">
              <div className="text-[11px] uppercase tracking-[0.14em] text-paper/60">
                Invite {createdInvite.inviteDelivery === "sent" ? "emailed" : "token"}
              </div>
              <div className="mt-2 text-[12px] text-paper/75">{teamInviteDeliveryText(createdInvite)}</div>
              <code className="mt-2 block break-all font-mono text-[12px]">{createdInvite.token}</code>
              <div className="nums mt-3 break-all font-mono text-[11.5px] text-paper/60">
                {createdInvite.acceptUrl ?? createdInvite.acceptEndpoint}
              </div>
            </div>
          ) : null}
          {invites.length > 0 ? (
            <div className="grid gap-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-3 rounded-xl border border-ink-line bg-paper/45 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{invite.email}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[12px] text-ink-mute">
                      <span className="capitalize">{invite.role}</span>
                      <span>Expires {invite.expiresAt}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevokeInvite(invite.id)}
                    disabled={busy || !canManage}
                    className="press focus-ring cursor-pointer rounded-md border border-ink-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No pending invites" body="Pending invites created by team owners and admins appear here." />
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Accept invite">
        <div className="grid gap-4">
          {inviteLinkLoaded ? (
            <div className="rounded-xl border border-forest-200 bg-forest-50 p-4 text-forest-950">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-forest-700">
                  <Check size={16} weight="bold" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">Invite link loaded</div>
                  <p className="mt-1 text-[12.5px] leading-5 text-forest-900/75">
                    Accepting adds this account to the team and clears the one-time token from the URL.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {pendingInvites.length > 0 ? (
            <div className="grid gap-3">
              {pendingInvites.map((invite) => (
                <button
                  key={invite.id}
                  type="button"
                  onClick={() => setAcceptInviteId(invite.id)}
                  className="press focus-ring cursor-pointer rounded-xl border border-ink-line bg-paper/45 p-4 text-left hover:border-ink/20"
                >
                  <div className="text-[14px] font-semibold">{invite.teamName ?? invite.teamId}</div>
                  <div className="mt-1 text-[12.5px] text-ink-mute">
                    Invited as {invite.role}; expires {invite.expiresAt}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] leading-5 text-ink-mute">
              Pending invites for the loaded account email appear here. Paste the invite token from the team owner to accept.
            </p>
          )}
          <Field label="Invite id" hint="">
            <input
              aria-label="Invite id"
              value={acceptInviteId}
              onChange={(event) => setAcceptInviteId(event.target.value)}
              className="focus-ring nums w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 font-mono text-[12.5px] outline-none transition focus:border-forest-500"
              spellCheck={false}
            />
          </Field>
          <Field label="Invite token" hint="">
            <input
              aria-label="Invite token"
              value={acceptInviteToken}
              onChange={(event) => setAcceptInviteToken(event.target.value)}
              className="focus-ring nums w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 font-mono text-[12.5px] outline-none transition focus:border-forest-500"
              spellCheck={false}
              placeholder="pst_inv_..."
            />
          </Field>
          <button
            type="button"
            onClick={onAcceptInvite}
            disabled={busy || !hasToken || !acceptInviteId.trim() || !acceptInviteToken.trim()}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Check size={15} weight="bold" />
            Accept invite
          </button>
        </div>
      </DashboardPanel>

      <DashboardPanel title="Shared workspaces">
        <div className="grid gap-4">
          <Field label="Workspace name" hint="">
            <input
              aria-label="Team workspace name"
              value={teamWorkspaceName}
              onChange={(event) => setTeamWorkspaceName(event.target.value)}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
            />
          </Field>
          <Field label="Sidecar root" hint="">
            <input
              aria-label="Team workspace root"
              value={teamWorkspaceRoot}
              onChange={(event) => setTeamWorkspaceRoot(event.target.value)}
              className="focus-ring nums w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 font-mono text-[13px] outline-none transition focus:border-forest-500"
              spellCheck={false}
            />
          </Field>
          <button
            type="button"
            onClick={onCreateTeamWorkspace}
            disabled={busy || !hasToken || !selectedTeamId || !teamFeatureEnabled || !teamWorkspaceName.trim() || !teamWorkspaceRoot.trim()}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[13.5px] font-semibold text-paper hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Folder size={15} weight="bold" />}
            Create shared workspace
          </button>
          {workspaceRows.length > 0 ? (
            <Table columns={["Name", "Root", "Updated"]} rows={workspaceRows} />
          ) : (
            <EmptyState
              title="No shared workspaces"
              body="Create a team workspace for non-code project context such as secrets, internal plans, docs, concept art, and branding."
            />
          )}
        </div>
      </DashboardPanel>
    </section>
  );
}

function DevicesPage({
  devices,
  newDeviceLabel,
  setNewDeviceLabel,
  newDevicePublicKey,
  setNewDevicePublicKey,
  busy,
  hasToken,
  onCreateDevice,
  onRevokeDevice,
}: {
  devices: Device[];
  newDeviceLabel: string;
  setNewDeviceLabel: (value: string) => void;
  newDevicePublicKey: string;
  setNewDevicePublicKey: (value: string) => void;
  busy: boolean;
  hasToken: boolean;
  onCreateDevice: () => void;
  onRevokeDevice: (deviceId: string) => void;
}) {
  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <DashboardPanel title="Register device">
        <div className="grid gap-4">
          <Field label="Device label" hint="">
            <input
              aria-label="Device label"
              value={newDeviceLabel}
              onChange={(event) => setNewDeviceLabel(event.target.value)}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
            />
          </Field>
          <Field label="Public key" hint="" optional>
            <textarea
              aria-label="Public key"
              value={newDevicePublicKey}
              onChange={(event) => setNewDevicePublicKey(event.target.value)}
              className="focus-ring min-h-[6.5rem] w-full resize-y rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 font-mono text-[12.5px] outline-none transition focus:border-forest-500"
              spellCheck={false}
              placeholder="Optional device public key"
            />
          </Field>
          <button
            type="button"
            onClick={onCreateDevice}
            disabled={busy || !hasToken || !newDeviceLabel.trim()}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[13.5px] font-semibold text-paper hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <DesktopTower size={15} weight="bold" />}
            Register device
          </button>
          {!hasToken ? <p className="text-[12.5px] text-ink-mute">Log in before registering devices.</p> : null}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Devices">
        {devices.length > 0 ? (
          <div className="grid gap-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className="grid gap-3 rounded-xl border border-ink-line bg-paper/45 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{device.label}</div>
                  <div className="nums mt-1 font-mono text-[11.5px] text-ink-mute">
                    {device.last_seen_at ?? device.created_at ?? "unknown"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      device.revoked_at ? "bg-amber-50 text-amber-900" : "bg-forest-50 text-forest-700"
                    }`}
                  >
                    {device.revoked_at ? "Revoked" : "Active"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRevokeDevice(device.id)}
                    disabled={busy || Boolean(device.revoked_at)}
                    className="press focus-ring cursor-pointer rounded-md border border-ink-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No devices registered"
            body="Devices appear here after signup, CLI login, or manual registration from this dashboard."
          />
        )}
      </DashboardPanel>
    </section>
  );
}

function SecretsPage({
  workspaces,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
  secrets,
  error,
  busy,
  hasToken,
  onRefresh,
  onDeleteSecret,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  secrets: SecretRecord[];
  error: string;
  busy: boolean;
  hasToken: boolean;
  onRefresh: () => void;
  onDeleteSecret: (name: string) => void;
}) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
      <DashboardPanel title="Secret inventory">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Workspace" hint="">
            <select
              aria-label="Workspace"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              disabled={workspaces.length === 0}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {workspaces.length === 0 ? <option value="">No workspaces</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || !hasToken || !selectedWorkspaceId}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ArrowsClockwise size={15} weight="bold" />}
            Refresh secrets
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Workspace", selectedWorkspace?.name ?? "none", selectedWorkspace?.rootPath ?? selectedWorkspace?.root_path ?? "load account"],
            ["Secret records", String(secrets.length), busy ? "loading" : "ciphertext hidden"],
            ["Storage model", "client encrypted", "nonce, key id, format, metadata"],
          ].map(([label, value, meta]) => (
            <div key={label} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">{label}</div>
              <div className="nums mt-2 truncate text-[19px] font-semibold tracking-tight">{value}</div>
              <div className="mt-1 truncate text-[12px] text-ink-mute">{meta}</div>
            </div>
          ))}
        </div>

        {!hasToken ? (
          <div className="mt-5">
            <EmptyState title="Log in to view secrets" body="Secret inventory is scoped to the signed-in account." />
          </div>
        ) : null}
        {hasToken && workspaces.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No workspaces"
              body="Create a workspace before encrypted secret inventory can be queried."
              actionLabel="Create workspace"
              actionHref="/dashboard/workspaces"
            />
          </div>
        ) : null}
        {hasToken && error ? (
          <div className="mt-5">
            <EmptyState title="Could not load secrets" body={error} />
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Encrypted storage policy">
        <p className="text-[13.5px] leading-6 text-ink-soft">
          PathStash stores ciphertext, nonce, key id, and metadata. Plaintext secret values stay on the client. The
          dashboard exposes the inventory layer, not secret values.
        </p>
        <div className="mt-5 grid gap-3">
          {["ciphertext required", "workspace scoped", "deleted via tombstone", "agent-safe markdown excludes values"].map(
            (item) => (
              <div key={item} className="flex items-center gap-2.5 text-[13px] text-ink-soft">
                <Check size={15} weight="bold" className="text-forest-600" />
                {item}
              </div>
            ),
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Secrets">
        {busy ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-mute">
            <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" />
            Loading secret inventory
          </div>
        ) : secrets.length > 0 ? (
          <div className="grid gap-3">
            {secrets.map((secret) => (
              <div
                key={`${secret.id}-${secret.name}`}
                className="grid gap-4 rounded-xl border border-ink-line bg-paper/45 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-[14px] font-semibold">{secret.name}</div>
                    <span className="rounded-md bg-forest-50 px-2 py-1 text-[11px] font-semibold text-forest-700">
                      {secret.format ?? "age-v1"}
                    </span>
                  </div>
                  <div className="nums mt-2 grid gap-1 font-mono text-[11.5px] text-ink-mute sm:grid-cols-2">
                    <span className="truncate">key: {secret.key_id ?? "-"}</span>
                    <span className="truncate">updated: {secret.updated_at ?? secret.created_at ?? "unknown"}</span>
                  </div>
                  <p className="mt-2 truncate text-[12.5px] text-ink-mute">{metadataSummary(secret.metadata)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteSecret(secret.name)}
                  disabled={busy}
                  className="press focus-ring inline-flex cursor-pointer items-center justify-center rounded-md border border-ink-line bg-white px-3 py-2 text-[12px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No encrypted secrets"
            body="Secrets created by the CLI or API appear here as encrypted records with metadata only."
          />
        )}
      </DashboardPanel>
    </section>
  );
}

function LargeFilesPage({
  workspaces,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
  inventory,
  error,
  busy,
  hasToken,
  onRefresh,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  inventory: FileInventory | null;
  error: string;
  busy: boolean;
  hasToken: boolean;
  onRefresh: () => void;
}) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const largeFileRows =
    inventory?.largeFiles.map((file) => [
      file.path,
      formatBytes(file.size),
      shortSha(file.sha256),
      file.blobState === "large-pointer" ? "Manifest pointer" : file.blobState,
    ]) ?? [];
  const fileRows =
    inventory?.files.slice(0, 12).map((file) => [
      file.path,
      formatBytes(file.size),
      file.large ? "Large" : "Blob eligible",
      shortSha(file.sha256),
    ]) ?? [];

  return (
    <section className="mt-6 grid gap-6">
      <DashboardPanel title="Manifest file inventory">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Workspace" hint="">
            <select
              aria-label="Workspace"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              disabled={workspaces.length === 0}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {workspaces.length === 0 ? <option value="">No workspaces</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || !hasToken || !selectedWorkspaceId}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ArrowsClockwise size={15} weight="bold" />}
            Refresh files
          </button>
        </div>

        {!hasToken ? (
          <div className="mt-5">
            <EmptyState title="Log in to view files" body="File inventory is scoped to the signed-in account." />
          </div>
        ) : null}
        {hasToken && workspaces.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No workspaces"
              body="Create a workspace before PathStash can show manifest-derived file inventory."
              actionLabel="Create workspace"
              actionHref="/dashboard/workspaces"
            />
          </div>
        ) : null}
        {hasToken && selectedWorkspace && error ? (
          <div className="mt-5">
            <EmptyState title="No file inventory yet" body={error} actionLabel="View workspace" actionHref="/dashboard/workspaces" />
          </div>
        ) : null}
        {inventory ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Files", String(inventory.totals.files), `${formatBytes(inventory.totals.bytes)} indexed`],
                ["Large files", String(inventory.totals.largeFiles), `${formatBytes(inventory.totals.largeBytes)} tracked`],
                ["Blob eligible", String(inventory.totals.blobEligibleFiles), `<= ${formatBytes(inventory.maxBlobBytes)}`],
                ["Manifest", `v${inventory.manifestVersion}`, inventory.manifestUpdatedAt],
              ].map(([label, value, meta]) => (
                <div key={label} className="rounded-xl border border-ink-line bg-paper/45 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">{label}</div>
                  <div className="nums mt-2 truncate text-[22px] font-semibold tracking-tight">{value}</div>
                  <div className="mt-1 truncate text-[12px] text-ink-mute">{meta}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[13px] font-semibold">{inventory.workspaceName}</div>
                  <div className="nums mt-1 truncate font-mono text-[11.5px] text-ink-mute">{inventory.rootPath}</div>
                </div>
                <div className="nums font-mono text-[11.5px] text-ink-mute">{shortSha(inventory.manifestHash)}</div>
              </div>
            </div>
          </>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Large file pointers">
        {busy ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-mute">
            <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" />
            Loading manifest files
          </div>
        ) : largeFileRows.length > 0 ? (
          <Table columns={["Path", "Size", "SHA-256", "State"]} rows={largeFileRows} />
        ) : (
          <EmptyState
            title="No large files in this manifest"
            body="Files over the configured blob limit will appear here after the CLI pushes a manifest."
          />
        )}
      </DashboardPanel>

      <DashboardPanel title="Largest manifest files">
        {fileRows.length > 0 ? (
          <Table columns={["Path", "Size", "Class", "SHA-256"]} rows={fileRows} />
        ) : (
          <EmptyState title="No files to show" body="Push a workspace manifest to populate the inventory." />
        )}
      </DashboardPanel>

      <DashboardPanel title="Blob policy">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [inventory ? `${formatBytes(inventory.maxBlobBytes)} default` : "64 MiB default", "Bounded uploads keep sync predictable."],
            ["SHA-256 keys", "Downloads are verified against manifest hashes."],
            ["No overwrite by default", "Hydrate refuses conflicts unless force is explicit."],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="text-[13px] font-semibold">{title}</div>
              <p className="mt-2 text-[12.5px] leading-5 text-ink-mute">{detail}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </section>
  );
}

function TokensPage({
  tokens,
  newTokenName,
  setNewTokenName,
  newTokenExpiresInDays,
  setNewTokenExpiresInDays,
  newTokenScopePreset,
  setNewTokenScopePreset,
  createdToken,
  busy,
  hasToken,
  onCreateToken,
  onRevokeToken,
}: {
  tokens: TokenRow[];
  newTokenName: string;
  setNewTokenName: (value: string) => void;
  newTokenExpiresInDays: string;
  setNewTokenExpiresInDays: (value: string) => void;
  newTokenScopePreset: string;
  setNewTokenScopePreset: (value: string) => void;
  createdToken: string;
  busy: boolean;
  hasToken: boolean;
  onCreateToken: () => void;
  onRevokeToken: (tokenId: string) => void;
}) {
  const selectedPreset = tokenScopePresets.find((preset) => preset.id === newTokenScopePreset) ?? tokenScopePresets[0];

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
      <DashboardPanel title="Create token">
        <Field label="Token name" hint="">
          <input
            aria-label="Token name"
            value={newTokenName}
            onChange={(event) => setNewTokenName(event.target.value)}
            className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
          />
        </Field>
        <Field label="Expires" hint="">
          <select
            aria-label="Token expiration"
            value={newTokenExpiresInDays}
            onChange={(event) => setNewTokenExpiresInDays(event.target.value)}
            className="focus-ring w-full cursor-pointer rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">365 days</option>
            <option value="never">Never</option>
          </select>
        </Field>
        <Field label="Access" hint={selectedPreset?.hint ?? ""}>
          <select
            aria-label="Token access preset"
            value={newTokenScopePreset}
            onChange={(event) => setNewTokenScopePreset(event.target.value)}
            className="focus-ring w-full cursor-pointer rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500"
          >
            {tokenScopePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          onClick={onCreateToken}
          disabled={busy || !hasToken || !newTokenName.trim()}
          className="press focus-ring mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-3 text-[13.5px] font-semibold text-paper hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Key size={15} weight="bold" />}
          Create access token
        </button>
        {!hasToken ? <p className="mt-3 text-[12.5px] text-ink-mute">Log in before creating API tokens.</p> : null}
        {createdToken ? (
          <div className="mt-4 rounded-lg bg-ink p-3 text-paper">
            <div className="text-[11px] uppercase tracking-[0.14em] text-paper/60">New token</div>
            <code className="mt-2 block break-all font-mono text-[12px]">{createdToken}</code>
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Access tokens">
        {tokens.length > 0 ? (
          <div className="grid gap-3">
            {tokens.map((item) => {
              const status = tokenStatus(item);
              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-xl border border-ink-line bg-paper/45 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{item.name}</div>
                    <div className="nums mt-1 font-mono text-[11.5px] text-ink-mute">
                      Created {item.created_at ?? item.createdAt ?? "just now"} - Last used {item.last_used_at ?? "not used"} -
                      Expires {formatTokenExpiration(item)}
                    </div>
                    <div className="mt-1 text-[12px] text-ink-mute">{formatTokenScopes(item.scopes)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                        status === "Active" ? "bg-forest-50 text-forest-700" : "bg-amber-50 text-amber-900"
                      }`}
                    >
                      {status}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRevokeToken(item.id)}
                      disabled={busy || Boolean(item.revoked_at)}
                      className="press focus-ring cursor-pointer rounded-md border border-ink-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No token list loaded"
            body="Log in to list active and revoked API tokens."
          />
        )}
      </DashboardPanel>
    </section>
  );
}

function SecurityPage({
  account,
  principal,
  sessions,
  busy,
  error,
  hasToken,
  onUpdateProfile,
  onRequestEmailChange,
  onChangePassword,
  onRefresh,
  onRevokeSession,
  onRequestPasswordSetup,
  accountExportBusy,
  onExportAccount,
  onLogout,
}: {
  account?: Account;
  principal?: string;
  sessions: BrowserSession[];
  busy: boolean;
  error: string;
  hasToken: boolean;
  onUpdateProfile: (name: string) => void;
  onRequestEmailChange: (newEmail: string, currentPassword: string) => void;
  onChangePassword: (currentPassword: string, newPassword: string, revokeOtherSessions: boolean) => void;
  onRefresh: () => void;
  onRevokeSession: (sessionId: string) => void;
  onRequestPasswordSetup: (targetEmail?: string) => Promise<void>;
  accountExportBusy: boolean;
  onExportAccount: () => void;
  onLogout: () => Promise<void>;
}) {
  const emailVerified = Boolean(account?.email_verified_at || account?.emailVerified);
  const [accountNameDraft, setAccountNameDraft] = useState(account?.name ?? "");
  const [newEmailDraft, setNewEmailDraft] = useState("");
  const [emailChangePasswordDraft, setEmailChangePasswordDraft] = useState("");
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  useEffect(() => {
    setAccountNameDraft(account?.name ?? "");
  }, [account?.name]);
  const trimmedName = accountNameDraft.trim();
  const trimmedNewEmail = newEmailDraft.trim().toLowerCase();
  const profileUnchanged = trimmedName === (account?.name ?? "").trim();
  const canRequestEmailChange =
    hasToken &&
    principal === "session" &&
    /.+@.+\..+/.test(trimmedNewEmail) &&
    trimmedNewEmail !== (account?.email ?? "").toLowerCase() &&
    emailChangePasswordDraft.length > 0;
  const canChangePassword = hasToken && principal === "session" && currentPasswordDraft.length > 0 && newPasswordDraft.length >= 10;
  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <DashboardPanel title="Account profile">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedName) {
              onUpdateProfile(trimmedName);
            }
          }}
        >
          <Field label="Display name" hint="">
            <input
              aria-label="Display name"
              value={accountNameDraft}
              onChange={(event) => setAccountNameDraft(event.target.value)}
              maxLength={256}
              disabled={busy || !hasToken}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500 disabled:cursor-not-allowed disabled:opacity-55"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="text-[12.5px] leading-5 text-ink-mute">
              This name appears in the dashboard, team member lists, and authenticated agent context.
            </div>
            <button
              type="submit"
              disabled={busy || !hasToken || !trimmedName || profileUnchanged}
              className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Check size={15} weight="bold" />}
              Save profile
            </button>
          </div>
        </form>
      </DashboardPanel>

      <DashboardPanel title="Change email">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canRequestEmailChange) {
              return;
            }
            onRequestEmailChange(trimmedNewEmail, emailChangePasswordDraft);
            setNewEmailDraft("");
            setEmailChangePasswordDraft("");
          }}
        >
          <Field label="New email" hint={newEmailDraft && !/.+@.+\..+/.test(trimmedNewEmail) ? "Enter a valid email" : ""}>
            <input
              aria-label="New email"
              type="email"
              value={newEmailDraft}
              onChange={(event) => setNewEmailDraft(event.target.value)}
              autoComplete="email"
              disabled={busy || !hasToken || principal !== "session"}
              className={`focus-ring w-full rounded-lg border bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition disabled:cursor-not-allowed disabled:opacity-55 ${
                newEmailDraft && !/.+@.+\..+/.test(trimmedNewEmail) ? "border-amber-400" : "border-ink-line focus:border-forest-500"
              }`}
            />
          </Field>
          <Field label="Current password" hint="">
            <input
              aria-label="Current password for email change"
              type="password"
              value={emailChangePasswordDraft}
              onChange={(event) => setEmailChangePasswordDraft(event.target.value)}
              autoComplete="current-password"
              disabled={busy || !hasToken || principal !== "session"}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500 disabled:cursor-not-allowed disabled:opacity-55"
            />
          </Field>
          <p className="rounded-lg bg-paper/60 px-3.5 py-2.5 text-[12.5px] leading-5 text-ink-mute">
            PathStash sends a confirmation link to the new address. The account email changes only after that link is opened.
          </p>
          {principal !== "session" ? (
            <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-5 text-amber-900">
              Email changes require a browser session. API tokens cannot change the account email.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !canRequestEmailChange}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ShieldCheck size={15} weight="bold" />}
            Send email change link
          </button>
        </form>
      </DashboardPanel>

      <DashboardPanel title="Change password">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canChangePassword) {
              return;
            }
            onChangePassword(currentPasswordDraft, newPasswordDraft, revokeOtherSessions);
            setCurrentPasswordDraft("");
            setNewPasswordDraft("");
          }}
        >
          <Field label="Current password" hint="">
            <input
              aria-label="Current password"
              type="password"
              value={currentPasswordDraft}
              onChange={(event) => setCurrentPasswordDraft(event.target.value)}
              autoComplete="current-password"
              disabled={busy || !hasToken || principal !== "session"}
              className="focus-ring w-full rounded-lg border border-ink-line bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-forest-500 disabled:cursor-not-allowed disabled:opacity-55"
            />
          </Field>
          <Field label="New password" hint={newPasswordDraft && newPasswordDraft.length < 10 ? "Use at least 10 characters" : ""}>
            <input
              aria-label="New password"
              type="password"
              value={newPasswordDraft}
              onChange={(event) => setNewPasswordDraft(event.target.value)}
              autoComplete="new-password"
              disabled={busy || !hasToken || principal !== "session"}
              className={`focus-ring w-full rounded-lg border bg-paper/40 px-3.5 py-2.5 text-[14px] outline-none transition disabled:cursor-not-allowed disabled:opacity-55 ${
                newPasswordDraft && newPasswordDraft.length < 10 ? "border-amber-400" : "border-ink-line focus:border-forest-500"
              }`}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-line bg-paper/40 p-3 text-[13px] leading-5 text-ink-soft">
            <input
              type="checkbox"
              checked={revokeOtherSessions}
              onChange={(event) => setRevokeOtherSessions(event.target.checked)}
              disabled={busy || !hasToken || principal !== "session"}
              className="mt-1 h-4 w-4 rounded border-ink-line text-forest-700 focus:ring-forest-500 disabled:cursor-not-allowed"
            />
            <span>Sign out other browser sessions after the password changes.</span>
          </label>
          {principal !== "session" ? (
            <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-5 text-amber-900">
              Password changes require a browser session. API tokens cannot change the account password.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !canChangePassword}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ShieldCheck size={15} weight="bold" />}
            Change password
          </button>
        </form>
      </DashboardPanel>

      <DashboardPanel title="Account security">
        <div className="grid gap-3">
          {[
            ["Email", account?.email ?? "not loaded", emailVerified ? "verified" : "verification required"],
            ["Browser auth", principal === "session" ? "Session cookie" : principal === "access_token" ? "API token" : "not connected", "dashboard identity"],
            ["Password", emailVerified ? "Recovery ready" : "Pending email verification", "email-gated setup and reset"],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">{label}</div>
              <div className="mt-2 break-words text-[15px] font-semibold">{value}</div>
              <div className="mt-1 text-[12.5px] text-ink-mute">{detail}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-lg bg-paper/60 px-3.5 py-2.5 text-[12.5px] leading-5 text-ink-mute">
          Account export includes profile, plan, usage, devices, sessions, teams, workspaces, secret inventory metadata,
          and recent audit events. It never includes plaintext secret values or API token values.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onRequestPasswordSetup(account?.email)}
            disabled={busy || !account?.email}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-3 text-[13px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ShieldCheck size={15} weight="bold" />
            Send password link
          </button>
          <button
            type="button"
            onClick={onExportAccount}
            disabled={busy || accountExportBusy || !hasToken}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-3 text-[13px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {accountExportBusy ? (
              <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" />
            ) : (
              <ClipboardText size={15} weight="bold" />
            )}
            Export account
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={busy || !hasToken}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <Broom size={15} weight="bold" />}
            Log out
          </button>
        </div>
      </DashboardPanel>

      <DashboardPanel title="Browser sessions">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] leading-6 text-ink-mute">
            Revoke browser sessions that should no longer have dashboard access. API tokens are managed on the Tokens page.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || !hasToken}
            className="press focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-line bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={14} weight="bold" className="motion-safe:animate-spin" /> : <ArrowsClockwise size={14} weight="bold" />}
            Refresh
          </button>
        </div>
        {error ? <p className="mb-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-5 text-amber-900">{error}</p> : null}
        {sessions.length > 0 ? (
          <div className="grid gap-3">
            {sessions.map((session) => {
              const status = sessionStatus(session);
              return (
                <div
                  key={session.id}
                  className="grid gap-3 rounded-xl border border-ink-line bg-paper/45 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{session.current ? "Current browser" : "Browser session"}</span>
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                          status === "Active" ? "bg-forest-50 text-forest-700" : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="nums mt-2 font-mono text-[11.5px] text-ink-mute">
                      Last seen {session.last_seen_at} - Expires {session.expires_at}
                    </div>
                    <p className="mt-2 truncate text-[12.5px] text-ink-mute">{session.user_agent ?? "Unknown browser"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevokeSession(session.id)}
                    disabled={busy || status !== "Active"}
                    className="press focus-ring cursor-pointer rounded-md border border-ink-line bg-white px-3 py-2 text-[12px] font-semibold text-ink-soft hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No browser sessions loaded"
            body={hasToken ? "Refresh to load dashboard sessions." : "Log in before reviewing browser sessions."}
          />
        )}
      </DashboardPanel>
    </section>
  );
}

function AuditPage({
  events,
  busy,
  exportBusy,
  error,
  hasToken,
  canExport,
  onRefresh,
  onExport,
}: {
  events: AuditEvent[];
  busy: boolean;
  exportBusy: boolean;
  error: string;
  hasToken: boolean;
  canExport: boolean;
  onRefresh: () => void;
  onExport: () => void;
}) {
  const rows = events.map((event) => [
    event.createdAt,
    event.kind,
    auditActorLabel(event),
    auditTargetLabel(event),
    event.workspaceId ?? "-",
    metadataSummary(event.metadata),
  ]);

  return (
    <section className="mt-6 grid gap-6">
      <DashboardPanel title="Audit controls">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <div className="rounded-xl border border-ink-line bg-paper/45 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">Loaded events</div>
            <div className="nums mt-2 text-[22px] font-semibold tracking-tight">{events.length}</div>
            <div className="mt-1 text-[12px] text-ink-mute">{busy ? "refreshing" : "latest account activity"}</div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || !hasToken}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ArrowsClockwise size={15} weight="bold" />}
            Refresh audit
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exportBusy || !hasToken || !canExport}
            title={canExport ? "Download audit events as NDJSON" : "Team plan required for audit export"}
            className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {exportBusy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ClipboardText size={15} weight="bold" />}
            Export NDJSON
          </button>
        </div>

        {!hasToken ? (
          <div className="mt-5">
            <EmptyState title="Log in to view audit events" body="Audit events are scoped to the signed-in account." />
          </div>
        ) : null}
        {hasToken && error ? (
          <div className="mt-5">
            <EmptyState title="Could not load audit events" body={error} />
          </div>
        ) : null}
        {hasToken && !canExport ? (
          <p className="mt-4 rounded-lg bg-paper/70 px-3.5 py-2.5 text-[12.5px] leading-5 text-ink-mute">
            NDJSON export is available on the Team plan.
          </p>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Events">
        {busy ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-mute">
            <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" />
            Loading audit events
          </div>
        ) : rows.length > 0 ? (
          <Table columns={["Created", "Kind", "Actor", "Target", "Workspace", "Metadata"]} rows={rows} />
        ) : (
          <EmptyState
            title="No audit events loaded"
            body="Account, token, device, workspace, billing, secret, manifest, and blob actions appear here."
          />
        )}
      </DashboardPanel>
    </section>
  );
}

function BillingPage({
  subscription,
  entitlements,
  usage,
  relayHealth,
  relayHealthError,
  busy,
  onCheckout,
  onPortal,
  onSync,
}: {
  subscription?: Subscription;
  entitlements?: PlanEntitlements;
  usage?: AccountUsage;
  relayHealth: RelayHealth | null;
  relayHealthError: string;
  busy: boolean;
  onCheckout: (plan: "pro" | "team") => void;
  onPortal: () => void;
  onSync: () => void;
}) {
  const emailStatus = relayHealth?.configuration?.email;
  const billingStatus = relayHealth?.configuration?.billing;
  const billingMissing = billingStatus?.missing ?? [];
  const stripeApiUnavailable = billingMissing.includes("STRIPE_SECRET_KEY");
  const checkoutConfigUnavailable = billingMissing.length > 0;
  const billingWebhookUnavailable = billingStatus?.webhookConfigured === false;
  const checkoutUnavailable = checkoutConfigUnavailable || billingWebhookUnavailable;
  const billingActionTitle = checkoutConfigUnavailable
    ? "Stripe checkout is not configured on the relay yet."
    : billingWebhookUnavailable
      ? "Stripe webhook signing is required before checkout can run."
    : "Start a Stripe checkout session";
  const portalUnavailable = stripeApiUnavailable || !subscription?.stripe_customer_id;
  const portalTitle = stripeApiUnavailable
    ? "Stripe API access is not configured on the relay yet."
    : subscription?.stripe_customer_id
      ? "Open the Stripe customer portal"
      : "A Stripe customer is created after checkout.";
  const syncUnavailable = stripeApiUnavailable || !subscription?.stripe_subscription_id;
  const syncTitle = stripeApiUnavailable
    ? "Stripe API access is not configured on the relay yet."
    : subscription?.stripe_subscription_id
      ? "Sync subscription state from Stripe"
      : "A Stripe subscription is created after checkout.";
  return (
    <section className="mt-6 grid gap-6">
      <DashboardPanel title="Subscription">
        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr] md:items-start">
          <div className="rounded-xl bg-ink p-5 text-paper">
            <div className="text-[11px] uppercase tracking-[0.16em] text-paper/60">Current plan</div>
            <div className="mt-3 text-3xl font-semibold capitalize">{subscriptionLabel(subscription, entitlements)}</div>
            <div className="mt-2 text-[13px] text-paper/58">{subscription?.status ?? "No billing connection yet"}</div>
            {subscription?.current_period_end ? (
              <div className="nums mt-5 font-mono text-[12px] text-paper/60">
                Renews {subscription.current_period_end}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3">
            <PlanAction
              name="Pro"
              price="$8 / month"
              detail="More devices, more storage, larger blobs, and more encrypted secrets."
              busy={busy}
              disabled={checkoutUnavailable}
              title={billingActionTitle}
              onClick={() => onCheckout("pro")}
            />
            <PlanAction
              name="Team"
              price="$16 / seat"
              detail="Shared workspace posture, policy controls, and audit export."
              busy={busy}
              disabled={checkoutUnavailable}
              title={billingActionTitle}
              onClick={() => onCheckout("team")}
            />
            {checkoutUnavailable ? (
              <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-5 text-amber-900">
                {checkoutConfigUnavailable
                  ? "Checkout is unavailable until Stripe secrets and plan price ids are configured on the relay."
                  : "Checkout is unavailable until the Stripe webhook endpoint and STRIPE_WEBHOOK_SECRET are configured."}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onPortal}
              disabled={busy || portalUnavailable}
              title={portalTitle}
              className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-3 text-[13.5px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Receipt size={15} weight="bold" />
              Open customer portal
            </button>
            <button
              type="button"
              onClick={onSync}
              disabled={busy || syncUnavailable}
              title={syncTitle}
              className="press focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-line bg-white px-4 py-3 text-[13.5px] font-semibold text-ink hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy ? <CircleNotch size={15} weight="bold" className="motion-safe:animate-spin" /> : <ArrowsClockwise size={15} weight="bold" />}
              Sync from Stripe
            </button>
          </div>
        </div>
      </DashboardPanel>

      <DashboardPanel title="Deployment readiness">
        {relayHealthError ? <EmptyState title="Relay status unavailable" body={relayHealthError} /> : null}
        {!relayHealthError ? (
          <div className="grid gap-3 md:grid-cols-2">
            <ConfigurationStatusPanel
              title="Email delivery"
              status={emailStatus}
              readyText="Transactional email is configured for signup, recovery, and team invites."
              missingText="Set EMAIL_FROM plus the selected email provider secret on the relay to send verification, recovery, email-change, and invite emails."
              setupHint={emailSetupHint(emailStatus)}
            />
            <ConfigurationStatusPanel
              title="Billing"
              status={billingStatus}
              readyText="Stripe checkout is configured for paid subscriptions."
              missingText="Set Stripe secret and plan price ids before paid checkout can run."
              setupHint={billingSetupHint(billingStatus)}
            />
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Usage limits">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Workspaces", usageLimitText(usage?.workspaces, entitlements?.workspaces), "Active solo and team-owned roots"],
            ["Devices", usageLimitText(usage?.devices, entitlements?.devices), "Active registered machines"],
            ["Secrets", usageLimitText(usage?.secrets, entitlements?.secrets), "Encrypted records across workspaces"],
            ["Storage", bytesLimitText(usage?.storageBytes, entitlements?.storageBytes), `${usage?.blobs ?? 0} content-addressed blobs`],
            ["Max blob", entitlements ? formatBytes(entitlements.maxBlobBytes) : "not loaded", "Per-file upload cap"],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">{label}</div>
              <div className="nums mt-2 truncate text-[22px] font-semibold tracking-tight">{value}</div>
              <p className="mt-1 text-[12px] leading-5 text-ink-mute">{detail}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </section>
  );
}

function AgentReadinessPage() {
  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
      <DashboardPanel title="Agent-facing endpoints">
        <div className="grid gap-3">
          {[
            ["/llms.txt", "Public product and docs summary."],
            ["/.well-known/oauth-protected-resource", "Bearer-token protected-resource metadata."],
            ["/", "Responds with Markdown when agents request text/markdown."],
            ["/v1/me.md", "Authenticated account state for agent clients."],
            ["/v1/workspaces/{id}/manifest.md", "Authenticated file map for a workspace."],
            ["/v1/workspaces/{id}/files", "Authenticated manifest-derived file inventory."],
            ["/v1/teams", "Authenticated team membership and shared workspace state."],
            ["/v1/audit/events", "Authenticated account activity history."],
            ["/.well-known/agent-card.json", "A2A discovery card for PathStash agent interfaces."],
          ].map(([path, detail]) => (
            <div key={path} className="rounded-xl border border-ink-line bg-paper/45 p-4">
              <code className="font-mono text-[12.5px] font-semibold">{path}</code>
              <p className="mt-2 text-[12.5px] leading-5 text-ink-mute">{detail}</p>
            </div>
          ))}
        </div>
      </DashboardPanel>
      <DashboardPanel title="Readiness coverage">
        <div className="grid gap-3">
          {[
            "robots.txt exposes sitemap and AI bot access policy.",
            "sitemap.xml lists public product, auth, and API discovery URLs while dashboard sections stay session-gated.",
            "openapi.json advertises account, team, workspace, manifest, file, secret, token, audit, and billing endpoints.",
            "Keep authenticated markdown endpoints scoped to bearer tokens.",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 rounded-xl border border-ink-line bg-paper/45 p-4 text-[13px] leading-5 text-ink-soft">
              <Check size={15} weight="bold" className="mt-0.5 shrink-0 text-forest-600" />
              {item}
            </div>
          ))}
        </div>
      </DashboardPanel>
    </section>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink-line bg-paper/45 p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-forest-700 shadow-ring">
          <Folder size={17} weight="duotone" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{title}</div>
          <p className="mt-1 max-w-[34rem] text-[13px] leading-6 text-ink-mute">{body}</p>
          {actionHref && actionLabel ? (
            <a
              href={actionHref}
              className="press focus-ring mt-4 inline-flex cursor-pointer rounded-lg border border-ink-line bg-white px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/20"
            >
              {actionLabel}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashboardPanel({
  title,
  actionLabel,
  actionHref,
  children,
}: {
  title: string;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl2 border border-ink-line bg-white p-5 shadow-card md:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {actionHref && actionLabel ? (
          <a className="press focus-ring cursor-pointer rounded-md px-2 py-1 text-[12px] font-semibold text-ink-mute hover:bg-paper hover:text-ink" href={actionHref}>
            {actionLabel}
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DashboardMessageBanner({ message, tone }: { message: string; tone: "ok" | "error" | "" }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="status"
      className={`mt-4 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-6 ${
        tone === "error" ? "bg-amber-50 text-amber-900" : "bg-forest-50 text-forest-800"
      }`}
    >
      {message}
    </p>
  );
}

function SignupReadinessNotice({
  blocked,
  message,
  status,
}: {
  blocked: boolean;
  message: string;
  status?: ConfigurationStatus;
}) {
  const missing = status?.missing ?? [];
  const setupActions = status?.setupActions ?? [];
  return (
    <div
      role={blocked ? "alert" : "status"}
      className={`mt-4 rounded-lg px-3.5 py-2.5 text-[13px] leading-6 ${
        blocked ? "bg-amber-50 text-amber-900" : "bg-paper text-ink-mute"
      }`}
    >
      <div className="flex items-start gap-2">
        <Lightning size={16} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      {missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-6">
          {missing.map((name) => (
            <code key={name} className="rounded-md bg-white/75 px-2 py-1 font-mono text-[11px] text-ink-soft">
              {name}
            </code>
          ))}
        </div>
      ) : null}
      {blocked && setupActions.length > 0 ? (
        <ol className="mt-3 grid list-decimal gap-1.5 pl-10 text-[12px] leading-5">
          {setupActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function PlanAction({
  name,
  price,
  detail,
  busy,
  disabled = false,
  title,
  onClick,
}: {
  name: string;
  price: string;
  detail: string;
  busy: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      className="press focus-ring cursor-pointer rounded-xl border border-ink-line bg-paper/45 p-4 text-left hover:border-forest-300 hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold">{name}</div>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-mute">{detail}</p>
        </div>
        <div className="nums shrink-0 font-mono text-[12px] font-semibold text-forest-700">{price}</div>
      </div>
    </button>
  );
}

function ConfigurationStatusPanel({
  title,
  status,
  readyText,
  missingText,
  setupHint,
}: {
  title: string;
  status?: ConfigurationStatus;
  readyText: string;
  missingText: string;
  setupHint?: string;
}) {
  const configured = Boolean(status?.configured);
  const missing = status?.missing ?? [];
  const setupActions = status?.setupActions ?? [];
  const provider = statusProviderLabel(status?.provider);
  return (
    <div className="rounded-xl border border-ink-line bg-paper/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">{title}</div>
          {provider ? <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">{provider}</div> : null}
          <p className="mt-1 text-[12.5px] leading-5 text-ink-mute">{configured ? readyText : missingText}</p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
            configured ? "bg-forest-50 text-forest-700" : "bg-amber-50 text-amber-900"
          }`}
        >
          {configured ? "Configured" : "Action needed"}
        </span>
      </div>
      {missing.length > 0 ? (
        <>
          <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">Missing</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((name) => (
              <code key={name} className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-ink-soft">
                {name}
              </code>
            ))}
          </div>
        </>
      ) : null}
      {!configured && setupActions.length > 0 ? (
        <ol className="mt-3 grid list-decimal gap-1.5 pl-4 text-[12px] leading-5 text-ink-mute">
          {setupActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      ) : null}
      {!configured && setupActions.length === 0 && setupHint ? <p className="mt-3 text-[12px] leading-5 text-ink-mute">{setupHint}</p> : null}
      {status?.webhookConfigured === false && status.webhookMissing?.length ? (
        <p className="mt-3 text-[12px] leading-5 text-ink-mute">
          Stripe webhooks still need {status.webhookMissing.join(", ")} for subscription updates.
        </p>
      ) : null}
    </div>
  );
}

function statusProviderLabel(provider?: string): string {
  if (!provider) {
    return "";
  }
  return provider
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function emailSetupHint(status?: ConfigurationStatus): string {
  const provider =
    status?.provider === "postmark"
      ? "Postmark"
      : status?.provider === "brevo"
        ? "Brevo"
        : status?.provider === "mailgun"
          ? "Mailgun"
        : status?.provider === "resend"
          ? "Resend"
          : "the selected provider";
  const secretName =
    status?.provider === "postmark"
      ? "POSTMARK_SERVER_TOKEN"
      : status?.provider === "brevo"
        ? "BREVO_API_KEY"
        : status?.provider === "mailgun"
          ? "MAILGUN_API_KEY and MAILGUN_DOMAIN"
        : status?.provider === "resend"
          ? "RESEND_API_KEY"
          : "the provider secret";
  return `${provider} is selected. Add a verified EMAIL_FROM sender and store ${secretName} with wrangler secret put, then redeploy the relay.`;
}

function signupEmailReadinessMessage(status?: ConfigurationStatus): string {
  const provider = statusProviderLabel(status?.provider) || "selected email provider";
  return `Signup is temporarily unavailable because ${provider} email delivery is not configured.`;
}

function billingSetupHint(status?: ConfigurationStatus): string {
  const missing = status?.missing ?? [];
  if (missing.length === 0 && status?.webhookConfigured === false) {
    return "Stripe checkout keys are present, but paid checkout stays disabled until STRIPE_WEBHOOK_SECRET is configured for subscription updates.";
  }
  return "Create the Stripe prices for Pro and Team, store STRIPE_SECRET_KEY, set the price ids, then add STRIPE_WEBHOOK_SECRET for subscription updates.";
}

function subscriptionLabel(subscription?: Subscription, entitlements?: PlanEntitlements): string {
  return entitlements?.plan ?? subscription?.plan ?? "free";
}

function usageLimitText(used?: number, limit?: number | null): string {
  const current = typeof used === "number" && Number.isFinite(used) ? used : 0;
  if (limit === null) {
    return `${current}/unlimited`;
  }
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return `${current}/${limit}`;
  }
  return String(current);
}

function bytesLimitText(used?: number, limit?: number | null): string {
  const current = typeof used === "number" && Number.isFinite(used) ? used : 0;
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return `${formatBytes(current)} / ${formatBytes(limit)}`;
  }
  return formatBytes(current);
}

function formatBytes(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  const digits = index === 0 ? 0 : current >= 10 ? 1 : 2;
  return `${current.toFixed(digits)} ${units[index]}`;
}

function tokenExpirationPayload(value: string): { expiresInDays?: number } {
  if (value === "never") {
    return {};
  }

  const expiresInDays = Number(value);
  return Number.isSafeInteger(expiresInDays) && expiresInDays > 0 ? { expiresInDays } : {};
}

function tokenScopesForPreset(presetId: string): TokenScope[] {
  return tokenScopePresets.find((preset) => preset.id === presetId)?.scopes ?? tokenScopePresets[0]?.scopes ?? ["full_access"];
}

function formatTokenScopes(scopes?: string[]): string {
  if (!scopes || scopes.length === 0) {
    return "Scopes: full access";
  }
  if (scopes.includes("full_access")) {
    return "Scopes: full access";
  }
  const labels = scopes.map((scope) => tokenScopeLabels[scope as TokenScope] ?? scope);
  return `Scopes: ${labels.join(", ")}`;
}

function teamInviteDeliveryText(invite: TeamInvite): string {
  if (invite.inviteDelivery === "sent") {
    return "Email sent. Keep this one-time token as a backup until the invite is accepted.";
  }
  if (invite.inviteDelivery === "failed") {
    return "Email delivery failed. Share this one-time token and dashboard link manually.";
  }
  return "Email delivery is not configured. Share this one-time token and dashboard link manually.";
}

function tokenExpiresAt(token: TokenRow): string | null {
  return token.expires_at ?? token.expiresAt ?? null;
}

function tokenStatus(token: TokenRow): "Active" | "Expired" | "Revoked" {
  if (token.revoked_at) {
    return "Revoked";
  }

  const expiresAt = tokenExpiresAt(token);
  if (expiresAt) {
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return "Expired";
    }
  }

  return "Active";
}

function sessionStatus(session: BrowserSession): "Active" | "Expired" | "Revoked" {
  if (session.revoked_at || session.status === "revoked") {
    return "Revoked";
  }
  if (session.status === "expired") {
    return "Expired";
  }
  const expiresAtMs = Date.parse(session.expires_at);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    return "Expired";
  }
  return "Active";
}

function formatTokenExpiration(token: TokenRow): string {
  return tokenExpiresAt(token) ?? "never";
}

function shortSha(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return value.length > 16 ? `${value.slice(0, 12)}...` : value;
}

function auditActorLabel(event: AuditEvent): string {
  if (!event.actor?.kind) {
    return "-";
  }
  return event.actor.tokenId ? `${event.actor.kind}:${shortSha(event.actor.tokenId)}` : event.actor.kind;
}

function auditTargetLabel(event: AuditEvent): string {
  if (!event.target?.type && !event.target?.id) {
    return "-";
  }
  return `${event.target.type ?? "target"}:${shortSha(event.target.id)}`;
}

function metadataSummary(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "metadata: none";
  }

  const parts = Object.entries(metadata)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  const suffix = Object.keys(metadata).length > parts.length ? " ..." : "";
  return `metadata: ${parts.join(", ")}${suffix}`;
}

function parseJsonText<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function relayErrorMessage(body: RelayErrorResponse, fallback: string, response?: Response): string {
  if (body.error === "rate_limited") {
    const retryAfter = body.retryAfterSeconds ?? parseRetryAfter(response?.headers.get("retry-after") ?? null);
    return retryAfter
      ? `Too many attempts. Try again in ${formatRetryAfter(retryAfter)}.`
      : "Too many attempts. Try again later.";
  }

  if (body.error === "email_not_configured") {
    return "Email delivery is not configured yet. Add EMAIL_FROM and the selected provider secret on the relay.";
  }
  if (body.error === "invalid_email") {
    return "Enter a valid email address.";
  }
  if (body.error === "account_exists") {
    return "That email is already in use.";
  }
  if (body.error === "plan_limit_reached") {
    const resource = body.resource ? statusProviderLabel(body.resource) : "This resource";
    const maximum = body.maximum === null ? "unlimited" : body.maximum;
    return `${resource} limit reached${typeof body.current === "number" ? ` (${body.current}/${maximum})` : ""}. Upgrade or archive unused items before trying again.`;
  }
  if (body.error === "email_unchanged") {
    return "Enter a different email address.";
  }
  if (body.error === "invalid_credentials") {
    return "Email or password is incorrect.";
  }
  if (body.error === "invalid_current_password") {
    return "Current password is incorrect.";
  }
  if (body.error === "missing_current_password") {
    return "Enter your current password.";
  }
  if (body.error === "password_too_short") {
    return "Use at least 10 characters for the new password.";
  }
  if (body.error === "password_too_long") {
    return "Use a shorter password.";
  }
  if (body.error === "session_required") {
    return "Password changes require a browser login session.";
  }
  if (body.error === "billing_not_configured") {
    return "Stripe billing is not configured yet. Set Stripe secrets and price ids before starting checkout.";
  }
  if (body.error === "billing_webhook_not_configured") {
    return "Stripe webhook signing is not configured yet. Add STRIPE_WEBHOOK_SECRET before starting checkout.";
  }
  if (body.error === "stripe_customer_required") {
    return "Start checkout before opening the customer portal.";
  }
  if (body.error === "stripe_checkout_failed") {
    return "Stripe could not start checkout. Check the relay logs and Stripe configuration.";
  }
  if (body.error === "stripe_checkout_sync_failed") {
    return "Stripe checkout completed, but the relay could not sync the session. Check Stripe configuration and relay logs.";
  }
  if (body.error === "stripe_subscription_required") {
    return "Start checkout before syncing billing from Stripe.";
  }
  if (body.error === "stripe_subscription_sync_failed") {
    return "Stripe subscription sync failed. Check Stripe configuration and relay logs.";
  }
  if (body.error === "checkout_not_complete") {
    return "Stripe checkout is not complete yet. Refresh billing in a moment.";
  }
  if (body.error === "checkout_session_not_found" || body.error === "invalid_checkout_session") {
    return "That checkout session could not be matched to this account.";
  }
  if (body.error === "stripe_portal_failed") {
    return "Stripe could not open the customer portal. Check the relay logs and Stripe configuration.";
  }
  if (body.error === "stripe_checkout_invalid_response" || body.error === "stripe_portal_invalid_response") {
    return "Stripe returned an unexpected session response. Check the relay logs before retrying.";
  }
  if (body.error === "email_not_verified") {
    return "Verify your email before logging in.";
  }
  if (body.error === "invalid_or_expired_verification_token") {
    return "That verification link is invalid or expired. Request a fresh setup link.";
  }
  if (body.error === "missing_verification_token") {
    return "The verification link is missing its token.";
  }

  return body.message ?? body.error ?? fallback;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return null;
  }
  return Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
}

function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="nums w-full min-w-[26rem] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-y border-ink-line text-[11px] uppercase tracking-wider text-ink-mute">
            {columns.map((c) => (
              <th key={c} className="px-2 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join(":")} className="border-b border-ink-line transition hover:bg-paper/60">
              {row.map((cell, i) => (
                <td key={`${cell}-${i}`} className={`px-2 py-3 ${i === 0 ? "font-medium text-ink" : "text-ink-soft"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  const cols = [
    {
      title: "Product",
      links: [
        ["How it works", "#how"],
        ["Features", "#features"],
        ["Pricing", "#pricing"],
        ["Dashboard", "/dashboard"],
      ],
    },
    {
      title: "Resources",
      links: [
        ["Quickstart", "https://github.com/ifBars/pathstash/blob/main/docs/quickstart.md"],
        ["Relay API", "https://github.com/ifBars/pathstash/blob/main/docs/api.md"],
        ["Agent guide", "https://github.com/ifBars/pathstash/blob/main/docs/agents.md"],
        ["MCP server", "https://github.com/ifBars/pathstash/tree/main/packages/mcp"],
      ],
    },
    {
      title: "Legal",
      links: [
        ["Privacy", "#privacy"],
        ["Terms", "#terms"],
        ["Security", "#security"],
      ],
    },
  ] as const;

  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-[1240px] px-5 py-16 md:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 text-[16px] font-semibold">
              <Logo />
              PathStash
            </div>
            <p className="mt-4 text-[13.5px] leading-6 text-paper/60">
              The workspace layer around Git, in sync across every machine and agent.
            </p>
            <a
              href="https://github.com/ifBars/pathstash"
              className="press focus-ring mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-paper/90 hover:bg-white/[0.08]"
            >
              <GithubLogo size={15} weight="bold" />
              ifBars / pathstash
              <ArrowUpRight size={13} />
            </a>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <div className="eyebrow text-paper/40">{col.title}</div>
              <ul className="mt-4 space-y-2.5 text-[13.5px]">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="press focus-ring inline-flex cursor-pointer items-center gap-1 text-paper/70 hover:text-paper"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-[12px] text-paper/60 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-forest-300 motion-safe:animate-pulseDot" />
            All systems normal - relay on Cloudflare
          </div>
          <div className="font-mono">(c) {new Date().getFullYear()} PathStash</div>
        </div>
      </div>
    </footer>
  );
}
