import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type TailscaleSelfStatus = {
  HostName?: string;
  DNSName?: string;
  TailscaleIPs?: string[];
  Online?: boolean;
  Relay?: string;
  KeyExpiry?: string;
};

type TailscaleStatus = {
  Version?: string;
  TUN?: boolean;
  BackendState?: string;
  HaveNodeKey?: boolean;
  Health?: string[];
  CurrentTailnet?: {
    Name?: string;
    MagicDNSSuffix?: string;
    MagicDNSEnabled?: boolean;
  };
  Self?: TailscaleSelfStatus;
  Peer?: unknown;
};

export type TailscaleHostSummary = {
  ready: boolean;
  backendState: string;
  hostname: string;
  dnsName: string;
  ipv4: string;
  relay: string;
  tailnet: string;
  version: string;
  keyExpiry: string;
  warnings: string[];
};

export type PowerSettings = {
  battery: Record<string, string>;
  ac: Record<string, string>;
};

export type PowerSettingsSummary = {
  ready: boolean;
  settings: PowerSettings;
  warnings: string[];
};

export type LocalSwarmHostReport = {
  ready: boolean;
  tailscale: TailscaleHostSummary;
  power: PowerSettingsSummary;
};

function firstIpv4(ips: string[] | undefined): string {
  return ips?.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) ?? "";
}

function normalizedDnsName(value: string | undefined): string {
  return (value ?? "").trim().replace(/\.$/, "");
}

function wholeDaysUntil(dateValue: string, now: Date): number | null {
  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) return null;
  const ms = timestamp - now.getTime();
  return Math.floor(ms / 86_400_000);
}

export function summarizeTailscaleStatus(
  status: TailscaleStatus,
  now = new Date(),
): TailscaleHostSummary {
  const self = status.Self ?? {};
  const backendState = status.BackendState ?? "unknown";
  const hostname = self.HostName ?? "";
  const dnsName = normalizedDnsName(self.DNSName);
  const ipv4 = firstIpv4(self.TailscaleIPs);
  const relay = self.Relay ?? "";
  const tailnet = status.CurrentTailnet?.Name ?? "";
  const version = status.Version ?? "";
  const keyExpiry = self.KeyExpiry ?? "";
  const warnings: string[] = [];

  if (backendState !== "Running") {
    warnings.push(`Tailscale backend state is ${backendState}.`);
  }
  if (status.HaveNodeKey === false) {
    warnings.push("Tailscale has no node key; sign in again.");
  }
  if (status.TUN === false) {
    warnings.push("Tailscale TUN is not active.");
  }
  if (self.Online === false) {
    warnings.push("This Mac is not online in Tailscale.");
  }
  if (!dnsName) {
    warnings.push("This Mac has no Tailscale DNS name.");
  }
  if (!ipv4) {
    warnings.push("This Mac has no Tailscale IPv4 address.");
  }
  for (const health of status.Health ?? []) {
    warnings.push(`Tailscale health: ${health}`);
  }

  if (keyExpiry) {
    const days = wholeDaysUntil(keyExpiry, now);
    if (days != null && days <= 14) {
      warnings.push(`Tailscale key expires in ${days} day(s).`);
    }
  }

  return {
    ready: warnings.length === 0,
    backendState,
    hostname,
    dnsName,
    ipv4,
    relay,
    tailnet,
    version,
    keyExpiry,
    warnings,
  };
}

export function parsePmsetCustom(output: string): PowerSettings {
  const settings: PowerSettings = { battery: {}, ac: {} };
  let current: keyof PowerSettings | null = null;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^Battery Power:/i.test(trimmed)) {
      current = "battery";
      continue;
    }
    if (/^AC Power:/i.test(trimmed)) {
      current = "ac";
      continue;
    }
    if (!current) continue;

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s+(.+)$/);
    if (match) {
      settings[current][match[1]] = match[2].trim();
    }
  }

  return settings;
}

export function summarizePowerSettings(output: string): PowerSettingsSummary {
  const settings = parsePmsetCustom(output);
  const warnings: string[] = [];

  if (settings.ac.sleep !== "0") {
    warnings.push(`AC sleep is ${settings.ac.sleep ?? "unset"}; set it to 0.`);
  }
  if (settings.ac.womp !== "1") {
    warnings.push("Wake-on-network is not enabled on AC power.");
  }
  if (settings.ac.tcpkeepalive !== "1") {
    warnings.push("TCP keepalive is not enabled on AC power.");
  }
  if (settings.battery.sleep !== "0") {
    warnings.push(
      `Battery sleep is ${settings.battery.sleep ?? "unset"}; set it to 0 for remote work.`,
    );
  }
  if (settings.battery.tcpkeepalive !== "1") {
    warnings.push("TCP keepalive is not enabled on battery power.");
  }

  return {
    ready: warnings.length === 0,
    settings,
    warnings,
  };
}

function readCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readTailscaleStatus(): TailscaleHostSummary {
  try {
    const output = readCommand("tailscale", ["status", "--json"]);
    return summarizeTailscaleStatus(JSON.parse(output) as TailscaleStatus);
  } catch (err) {
    return {
      ready: false,
      backendState: "unavailable",
      hostname: "",
      dnsName: "",
      ipv4: "",
      relay: "",
      tailnet: "",
      version: "",
      keyExpiry: "",
      warnings: [
        err instanceof Error
          ? `Unable to read Tailscale status: ${err.message}`
          : "Unable to read Tailscale status.",
      ],
    };
  }
}

function readPowerSettings(): PowerSettingsSummary {
  try {
    return summarizePowerSettings(readCommand("pmset", ["-g", "custom"]));
  } catch (err) {
    return {
      ready: false,
      settings: { battery: {}, ac: {} },
      warnings: [
        err instanceof Error
          ? `Unable to read pmset power settings: ${err.message}`
          : "Unable to read pmset power settings.",
      ],
    };
  }
}

export function buildLocalSwarmHostReport(): LocalSwarmHostReport {
  const tailscale = readTailscaleStatus();
  const power = readPowerSettings();
  return {
    ready: tailscale.ready && power.ready,
    tailscale,
    power,
  };
}

export function formatLocalSwarmHostReport(
  report: LocalSwarmHostReport,
): string {
  const lines = [
    "# HeyTelli Local Swarm Host",
    "",
    `Ready: ${report.ready ? "yes" : "no"}`,
    `Tailscale: ${report.tailscale.ready ? "ready" : "needs attention"}`,
    `Host: ${report.tailscale.hostname || "unknown"}`,
    `DNS: ${report.tailscale.dnsName || "missing"}`,
    `IPv4: ${report.tailscale.ipv4 || "missing"}`,
    `Relay: ${report.tailscale.relay || "unknown"}`,
    `Power: ${report.power.ready ? "ready" : "needs attention"}`,
  ];

  const warnings = [...report.tailscale.warnings, ...report.power.warnings];
  if (warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const report = buildLocalSwarmHostReport();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatLocalSwarmHostReport(report));
  }
  if (!report.ready) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
