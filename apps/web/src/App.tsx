import {
  ArrowRight,
  Check,
  ClipboardText,
  CloudArrowUp,
  Code,
  DesktopTower,
  DeviceMobile,
  Folder,
  Key,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react";
import { FormEvent, useMemo, useState } from "react";

const DEFAULT_RELAY = "https://pathstash-relay.ifbars.workers.dev";

type Account = {
  id?: string;
  email?: string;
  name?: string;
};

type Workspace = {
  id: string;
  name: string;
  root_path?: string;
  rootPath?: string;
  updated_at?: string;
  updatedAt?: string;
};

type Device = {
  id: string;
  label: string;
  last_seen_at?: string;
  created_at?: string;
};

type MeResponse = {
  account?: Account;
  workspaces?: Workspace[];
  devices?: Device[];
  principal?: string;
};

type SignupResponse = {
  account: Account;
  token: {
    value: string;
  };
};

const pricing = [
  {
    name: "Free",
    price: "$0",
    body: "For a solo developer getting started.",
    items: ["Up to 3 devices", "5 GB sync storage", "25 encrypted secrets", "Large files up to 1 GB"],
  },
  {
    name: "Pro",
    price: "$8",
    body: "For people who move across machines every week.",
    items: ["Up to 10 devices", "100 GB sync storage", "500 encrypted secrets", "Large files up to 20 GB"],
    featured: true,
  },
  {
    name: "Team",
    price: "$16",
    body: "For teams that need shared workspace posture.",
    items: ["Unlimited devices", "1 TB sync storage per user", "Shared vault policies", "Audit log export"],
  },
];

const sampleTransfers = [
  ["dataset-2024-05.bin", "acme-app", "68%", "Transferring"],
  ["video-demo.mp4", "maker-site", "42%", "Transferring"],
  ["model.safetensors", "agent-tools", "15%", "Queued"],
];

export default function App() {
  const [relay, setRelay] = useState(() => localStorage.getItem("pathstash:relay") ?? DEFAULT_RELAY);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("pathstash:token") ?? "");
  const [message, setMessage] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const hasToken = token.trim().length > 0;
  const workspaces = me?.workspaces ?? [];
  const devices = me?.devices ?? [];

  const installCommand = useMemo(() => {
    return "cargo install pathstash --locked";
  }, []);

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          deviceLabel: navigator.platform || "browser",
        }),
      });
      const body = (await response.json()) as SignupResponse | { error?: string };
      if (!response.ok || !("token" in body)) {
        throw new Error("error" in body && body.error ? body.error : `signup failed (${response.status})`);
      }
      setToken(body.token.value);
      localStorage.setItem("pathstash:token", body.token.value);
      localStorage.setItem("pathstash:relay", relay);
      setMessage(`Account created for ${body.account.email}. Your browser stored the token locally.`);
      await loadAccount(body.token.value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadAccount(nextToken = token) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${relay.replace(/\/$/, "")}/v1/me`, {
        headers: { authorization: `Bearer ${nextToken.trim()}` },
      });
      const body = (await response.json()) as MeResponse | { error?: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body && body.error ? body.error : `account load failed (${response.status})`);
      }
      setMe(body as MeResponse);
      localStorage.setItem("pathstash:token", nextToken.trim());
      localStorage.setItem("pathstash:relay", relay);
      setMessage("Dashboard connected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-stone-950">
      <header className="sticky top-0 z-30 border-b border-stone-950/10 bg-[#f7f7f4]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <a href="#top" className="flex items-center gap-3 text-lg font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-emerald-900/25 bg-white">
              <Folder size={18} weight="duotone" />
            </span>
            PathStash
          </a>
          <nav className="hidden items-center gap-1 text-[13px] font-medium text-stone-600 lg:flex">
            <a href="#product" className="px-3 py-2 hover:text-stone-950">
              Product
            </a>
            <a href="#pricing" className="px-3 py-2 hover:text-stone-950">
              Pricing
            </a>
            <a href="#dashboard" className="px-3 py-2 hover:text-stone-950">
              Dashboard
            </a>
            <a href="https://github.com/ifBars/pathstash" className="px-3 py-2 hover:text-stone-950">
              Docs
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#install"
              className="hidden rounded-md border border-stone-950/15 bg-white px-4 py-2.5 text-[13px] font-medium text-stone-900 hover:border-stone-950/30 sm:inline-flex"
            >
              Install CLI
            </a>
            <a
              href="#signup"
              className="rounded-md bg-emerald-800 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-emerald-900"
            >
              Start free
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid min-h-[720px] max-w-[1480px] gap-10 px-4 py-12 md:px-6 lg:min-h-[760px] lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:pt-24">
          <div className="max-w-[42rem]">
            <h1 className="text-[clamp(3.1rem,6vw,5.4rem)] font-semibold leading-[0.94] tracking-[-0.02em]">
              Your dev workspace, everywhere.
            </h1>
            <p className="mt-6 max-w-[35rem] text-lg leading-8 text-stone-600">
              PathStash keeps the layer around Git in sync: roots, devices, selected files, and encrypted secrets.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#signup"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-5 py-3.5 text-sm font-medium text-white hover:bg-emerald-900"
              >
                Start free
                <ArrowRight size={17} weight="bold" />
              </a>
              <a
                href="#install"
                className="inline-flex items-center gap-2 rounded-md border border-emerald-900/25 bg-white px-5 py-3.5 text-sm font-medium text-stone-900 hover:border-emerald-900/45"
              >
                <Code size={17} />
                Install CLI
              </a>
            </div>
            <div className="mt-10 grid gap-4 border-y border-stone-950/10 py-5 text-sm text-stone-600 sm:grid-cols-3">
              <span className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-800" />
                Encrypted secrets
              </span>
              <span className="flex items-center gap-2">
                <CloudArrowUp size={18} className="text-emerald-800" />
                Selective sync
              </span>
              <span className="flex items-center gap-2">
                <LockKey size={18} className="text-emerald-800" />
                Git stays Git
              </span>
            </div>
          </div>

          <div className="relative lg:pt-2">
            <DeviceGraph />
          </div>
        </section>

        <section id="product" className="border-y border-stone-950/10 bg-white">
          <div className="mx-auto max-w-[1480px] px-4 py-14 md:px-6 md:py-20">
            <h2 className="text-center text-[clamp(2rem,4vw,3.7rem)] font-semibold tracking-[-0.01em]">
              Proof first. Works in minutes.
            </h2>
            <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <InstallPanel installCommand={installCommand} />
              <FlowPanel />
            </div>
            <div className="mt-7 rounded-md border border-amber-400/60 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
              PathStash does not replace Git. It syncs the workspace layer around it.
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-[1480px] px-4 py-14 md:px-6 md:py-20">
          <h2 className="text-center text-[clamp(2rem,4vw,3.6rem)] font-semibold tracking-[-0.01em]">
            Simple, transparent pricing
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pricing.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-md border bg-white p-7 ${
                  plan.featured ? "border-emerald-800 shadow-[0_0_0_1px_rgba(6,95,70,0.25)]" : "border-stone-950/10"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{plan.body}</p>
                  </div>
                  {plan.featured ? (
                    <span className="rounded-sm bg-emerald-800 px-2 py-1 text-[11px] font-medium text-white">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <div className="mt-7 flex items-end gap-2">
                  <span className="text-5xl font-semibold">{plan.price}</span>
                  <span className="pb-2 text-sm text-stone-500">/ month</span>
                </div>
                <ul className="mt-7 space-y-3 text-sm text-stone-700">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check size={16} weight="bold" className="text-emerald-800" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="#signup"
                  className={`mt-8 flex justify-center rounded-md border px-4 py-3 text-sm font-medium ${
                    plan.featured
                      ? "border-emerald-800 bg-emerald-800 text-white"
                      : "border-emerald-800/50 bg-white text-emerald-900"
                  }`}
                >
                  Start {plan.name === "Free" ? "for free" : `${plan.name} trial`}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section id="signup" className="border-y border-stone-950/10 bg-white">
          <div className="mx-auto grid max-w-[1480px] gap-8 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-[clamp(2.3rem,5vw,4.7rem)] font-semibold leading-[0.95] tracking-[-0.02em]">
                Create the account. Then let the CLI do the boring part.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-stone-600">
                Self-serve signup returns a one-time token. The browser can keep it locally, and the CLI can store the same
                token with `pathstash login`.
              </p>
            </div>
            <form onSubmit={signup} className="rounded-md border border-stone-950/10 bg-[#fafaf8] p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="rounded-md border border-stone-950/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-800"
                    placeholder="you@example.com"
                    type="email"
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="rounded-md border border-stone-950/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-800"
                    placeholder="Alex Developer"
                  />
                </label>
              </div>
              <label className="mt-4 grid gap-2 text-sm font-medium">
                Relay
                <input
                  value={relay}
                  onChange={(event) => setRelay(event.target.value)}
                  className="rounded-md border border-stone-950/15 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-emerald-800"
                />
              </label>
              <button
                disabled={busy}
                className="mt-5 w-full rounded-md bg-emerald-800 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Working..." : "Create account"}
              </button>
              {message ? <p className="mt-4 text-sm leading-6 text-stone-700">{message}</p> : null}
            </form>
          </div>
        </section>

        <section id="dashboard" className="mx-auto max-w-[1480px] px-4 py-14 md:px-6 md:py-20">
          <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <DashboardSidebar account={me?.account} />
            <div className="space-y-5">
              <div className="rounded-md border border-stone-950/10 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">Dashboard</h2>
                    <p className="mt-1 text-sm text-stone-600">
                      Manage workspaces, devices, encrypted secrets, tokens, and large files.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      className="min-w-[18rem] rounded-md border border-stone-950/15 bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-emerald-800"
                      placeholder="ps_live_..."
                    />
                    <button
                      onClick={() => loadAccount()}
                      disabled={!hasToken || busy}
                      className="rounded-md bg-stone-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Load account
                    </button>
                  </div>
                </div>
              </div>
              <DashboardGrid workspaces={workspaces} devices={devices} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1480px] px-4 pb-16 md:px-6">
          <img
            src="/images/pathstash-v1-concept.png"
            alt="PathStash product concept showing marketing, pricing, and dashboard surfaces"
            className="w-full rounded-md border border-stone-950/10 bg-white shadow-sm"
          />
        </section>
      </main>
    </div>
  );
}

function DeviceGraph() {
  const devices = [
    ["MacBook Pro", DesktopTower],
    ["Work Laptop", DeviceMobile],
    ["Home Desktop", DesktopTower],
  ] as const;

  return (
    <div className="rounded-md border border-stone-950/10 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:hidden">
        {devices.slice(0, 1).map(([label, Icon]) => (
          <DeviceNode key={label} label={label} Icon={Icon} />
        ))}
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-md border-2 border-emerald-800 bg-emerald-50 text-emerald-900">
          <CloudArrowUp size={38} weight="duotone" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {devices.slice(1).map(([label, Icon]) => (
            <DeviceNode key={label} label={label} Icon={Icon} />
          ))}
        </div>
      </div>

      <div className="relative hidden min-h-[34rem] md:block">
        <div className="absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border-2 border-emerald-800 bg-emerald-50 text-emerald-900">
          <CloudArrowUp size={38} weight="duotone" />
        </div>
        {[
          ["MacBook Pro", "top-8 left-1/2 -translate-x-1/2", DesktopTower],
          ["Work Laptop", "left-8 bottom-16", DeviceMobile],
          ["Home Desktop", "right-8 bottom-16", DesktopTower],
        ].map(([label, position, Icon]) => (
          <div
            key={label as string}
            className={`absolute ${position as string} w-52 rounded-md border border-stone-950/10 bg-[#fafaf8] p-4 shadow-sm`}
          >
            <div className="flex items-center gap-3">
              <Icon size={28} />
              <div>
                <div className="text-sm font-semibold">{label as string}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  Online
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-stone-500">
              <Folder size={18} />
              <ClipboardText size={18} />
              <Key size={18} />
              <LockKey size={18} />
            </div>
          </div>
        ))}
        <div className="absolute left-[26%] top-[47%] h-px w-[48%] border-t border-dashed border-emerald-800/50" />
        <div className="absolute left-1/2 top-[18%] h-[60%] border-l border-dashed border-emerald-800/50" />
      </div>
    </div>
  );
}

function DeviceNode({ label, Icon }: { label: string; Icon: typeof DesktopTower }) {
  return (
    <div className="rounded-md border border-stone-950/10 bg-[#fafaf8] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Icon size={28} />
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-stone-500">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Online
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-stone-500">
        <Folder size={18} />
        <ClipboardText size={18} />
        <Key size={18} />
        <LockKey size={18} />
      </div>
    </div>
  );
}

function InstallPanel({ installCommand }: { installCommand: string }) {
  return (
    <article id="install" className="rounded-md border border-stone-950/10 bg-[#fafaf8] p-5">
      <h3 className="text-lg font-semibold">Install the CLI</h3>
      {[
        ["1. Install", installCommand],
        ["2. Authenticate", "pathstash signup --email you@example.com"],
        ["3. Add your workspace", "pathstash init --root ~/projects/acme-app"],
        ["4. Sync", "pathstash push --root ~/projects/acme-app"],
      ].map(([label, command]) => (
        <div key={label} className="mt-4">
          <div className="text-sm font-medium">{label}</div>
          <pre className="mt-2 overflow-x-auto rounded-md bg-stone-950 px-4 py-3 font-mono text-sm text-white">
            $ {command}
          </pre>
        </div>
      ))}
    </article>
  );
}

function FlowPanel() {
  return (
    <article className="rounded-md border border-stone-950/10 bg-[#fafaf8] p-5">
      <h3 className="text-lg font-semibold">Workspace sync flow</h3>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          [Folder, "Select", "Choose roots and ignore rules."],
          [LockKey, "Encrypt", "Secrets are encrypted locally."],
          [CloudArrowUp, "Sync", "Changes move through the relay."],
          [DesktopTower, "Use anywhere", "Hydrate on the next machine."],
        ].map(([Icon, title, body]) => (
          <div key={title as string} className="rounded-md border border-stone-950/10 bg-white p-4">
            <Icon size={28} className="text-emerald-800" />
            <div className="mt-4 text-sm font-semibold">{title as string}</div>
            <p className="mt-2 text-xs leading-5 text-stone-600">{body as string}</p>
          </div>
        ))}
      </div>
      <pre className="mt-6 overflow-x-auto rounded-md border border-stone-950/10 bg-white p-4 font-mono text-sm leading-7 text-stone-700">
        Workspace: acme-app{"\n"}Status: in sync{"\n"}Devices: 3 online{"\n"}Secrets: 7 items{"\n"}Large files: 2 transferring
      </pre>
    </article>
  );
}

function DashboardSidebar({ account }: { account?: Account }) {
  return (
    <aside className="rounded-md bg-stone-950 p-4 text-white lg:min-h-[36rem]">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Folder size={20} />
        PathStash
      </div>
      <nav className="mt-8 space-y-1 text-sm text-stone-300">
        {["Workspaces", "Devices", "Secrets", "Large files", "Tokens"].map((item, index) => (
          <a
            key={item}
            href={`#${item.toLowerCase().replace(" ", "-")}`}
            className={`flex items-center gap-2 rounded-md px-3 py-2.5 ${index === 0 ? "bg-white/10 text-white" : ""}`}
          >
            {item}
          </a>
        ))}
      </nav>
      <div className="mt-10 border-t border-white/10 pt-4 text-xs text-stone-400">
        <div className="font-medium text-white">{account?.name ?? "No account loaded"}</div>
        <div className="mt-1">{account?.email ?? "Create or load an account"}</div>
      </div>
    </aside>
  );
}

function DashboardGrid({ workspaces, devices }: { workspaces: Workspace[]; devices: Device[] }) {
  const shownWorkspaces =
    workspaces.length > 0
      ? workspaces
      : [
          { id: "sample-1", name: "acme-app", rootPath: "~/projects/acme-app" },
          { id: "sample-2", name: "infra-scripts", rootPath: "~/projects/infra-scripts" },
          { id: "sample-3", name: "agent-tools", rootPath: "~/projects/agent-tools" },
        ];
  const shownDevices =
    devices.length > 0
      ? devices
      : [
          { id: "sample-device-1", label: "MacBook Pro", last_seen_at: "12s ago" },
          { id: "sample-device-2", label: "Work Laptop", last_seen_at: "2m ago" },
          { id: "sample-device-3", label: "Home Desktop", last_seen_at: "5m ago" },
        ];

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <DataPanel title="Workspaces" wide>
        <Table
          columns={["Name", "Root", "Devices", "Status"]}
          rows={shownWorkspaces.map((workspace, index) => [
            workspace.name,
            workspace.rootPath ?? workspace.root_path ?? "-",
            String(index + 1),
            "In sync",
          ])}
        />
      </DataPanel>
      <DataPanel title="Devices">
        <Table
          columns={["Device", "Last seen", "Status"]}
          rows={shownDevices.map((device) => [device.label, device.last_seen_at ?? device.created_at ?? "unknown", "Online"])}
        />
      </DataPanel>
      <DataPanel title="Secrets">
        <Table
          columns={["Name", "Type", "Updated"]}
          rows={[
            ["GITHUB_TOKEN", "Token", "12s ago"],
            ["NPM_TOKEN", "Token", "2m ago"],
            ["DATABASE_URL", "Password", "2d ago"],
          ]}
        />
      </DataPanel>
      <DataPanel title="Large files">
        <Table columns={["File", "Workspace", "Progress", "Status"]} rows={sampleTransfers} />
      </DataPanel>
      <DataPanel title="Tokens">
        <Table
          columns={["Name", "Scope", "Last used"]}
          rows={[
            ["CLI", "All workspaces", "1h ago"],
            ["GitHub Actions", "acme-app", "3h ago"],
          ]}
        />
      </DataPanel>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section id={title.toLowerCase().replace(" ", "-")} className="rounded-md border border-stone-950/10 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button className="text-xs font-medium text-stone-500 hover:text-stone-950">View all</button>
      </div>
      {children}
    </section>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-stone-950/10 text-xs text-stone-500">
            {columns.map((column) => (
              <th key={column} className="px-2 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join(":")} className="border-b border-stone-950/10">
              {row.map((cell, index) => (
                <td key={`${cell}-${index}`} className="px-2 py-3 text-stone-700">
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
