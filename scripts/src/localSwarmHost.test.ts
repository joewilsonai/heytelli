import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  parsePmsetCustom,
  summarizePowerSettings,
  summarizeTailscaleStatus,
} from "./localSwarmHost";

test("summarizes a ready Tailscale host without exposing peers", () => {
  const summary = summarizeTailscaleStatus(
    {
      Version: "1.96.4",
      TUN: true,
      BackendState: "Running",
      HaveNodeKey: true,
      Health: [],
      CurrentTailnet: {
        Name: "joe@example.com",
        MagicDNSSuffix: "tail.example.ts.net",
        MagicDNSEnabled: true,
      },
      Self: {
        HostName: "Joes-MacBook-Pro-3",
        DNSName: "joes-macbook-pro-3.tail.example.ts.net.",
        TailscaleIPs: ["100.97.186.33", "fd7a:115c:a1e0::1"],
        Online: true,
        Relay: "ord",
        KeyExpiry: "2026-10-25T18:21:54Z",
      },
      Peer: {
        "nodekey:private": {
          HostName: "friend-phone",
        },
      },
    },
    new Date("2026-05-28T15:00:00Z"),
  );

  assert.equal(summary.ready, true);
  assert.equal(summary.hostname, "Joes-MacBook-Pro-3");
  assert.equal(summary.dnsName, "joes-macbook-pro-3.tail.example.ts.net");
  assert.equal(summary.ipv4, "100.97.186.33");
  assert.equal(summary.relay, "ord");
  assert.equal(summary.tailnet, "joe@example.com");
  assert.deepEqual(summary.warnings, []);
  assert.deepEqual(Object.keys(summary), [
    "ready",
    "backendState",
    "hostname",
    "dnsName",
    "ipv4",
    "relay",
    "tailnet",
    "version",
    "keyExpiry",
    "warnings",
  ]);
});

test("flags Tailscale states that are not remotely reliable", () => {
  const summary = summarizeTailscaleStatus(
    {
      Version: "1.96.4",
      TUN: false,
      BackendState: "Stopped",
      HaveNodeKey: false,
      Health: ["not logged in"],
      Self: {
        HostName: "Joes-MacBook-Pro-3",
        DNSName: "",
        TailscaleIPs: [],
        Online: false,
        KeyExpiry: "2026-06-01T00:00:00Z",
      },
    },
    new Date("2026-05-28T15:00:00Z"),
  );

  assert.equal(summary.ready, false);
  assert.match(summary.warnings.join("\n"), /backend state is Stopped/);
  assert.match(summary.warnings.join("\n"), /no node key/);
  assert.match(summary.warnings.join("\n"), /TUN is not active/);
  assert.match(summary.warnings.join("\n"), /no Tailscale IPv4 address/);
  assert.match(summary.warnings.join("\n"), /key expires in 3 day/);
});

test("parses pmset custom output into battery and AC settings", () => {
  const parsed = parsePmsetCustom(`Battery Power:
 sleep                0
 tcpkeepalive         1
AC Power:
 sleep                0
 womp                 1
 tcpkeepalive         1
`);

  assert.deepEqual(parsed, {
    battery: {
      sleep: "0",
      tcpkeepalive: "1",
    },
    ac: {
      sleep: "0",
      womp: "1",
      tcpkeepalive: "1",
    },
  });
});

test("summarizes power settings for a reliable Mac swarm host", () => {
  const summary = summarizePowerSettings(`Battery Power:
 sleep                0
 tcpkeepalive         1
AC Power:
 sleep                0
 womp                 1
 tcpkeepalive         1
`);

  assert.equal(summary.ready, true);
  assert.deepEqual(summary.warnings, []);
});

test("warns when power settings can break remote access", () => {
  const summary = summarizePowerSettings(`Battery Power:
 sleep                10
 tcpkeepalive         0
AC Power:
 sleep                15
 womp                 0
 tcpkeepalive         0
`);

  assert.equal(summary.ready, false);
  assert.match(summary.warnings.join("\n"), /AC sleep is 15/);
  assert.match(summary.warnings.join("\n"), /Wake-on-network is not enabled/);
  assert.match(summary.warnings.join("\n"), /TCP keepalive is not enabled/);
});

test("local swarm host script prevents overlapping launchd runs", async () => {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../run-local-swarm-host.sh",
  );
  const source = await readFile(scriptPath, "utf8");

  assert.match(source, /local-swarm\.lock/);
  assert.match(source, /mkdir "\$LOCK_DIR"/);
  assert.match(source, /already running/);
  assert.match(source, /trap 'rm -rf "\$LOCK_DIR"' EXIT/);
});
