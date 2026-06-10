const os = require("os");

const SKIP_INTERFACE = /nord|vpn|openvpn|bluetooth|loopback|virtual/i;

function isTailscale(name, ip) {
  if (/tailscale/i.test(name)) return true;
  const parts = ip.split(".").map(Number);
  if (parts[0] !== 100) return false;
  return parts[1] >= 64 && parts[1] <= 127;
}

function isLocalLan(name, ip) {
  if (SKIP_INTERFACE.test(name)) return false;
  return ip.startsWith("192.168.") || ip.startsWith("10.");
}

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  let local = null;
  let tailscale = null;

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      const ip = addr.address;
      if (ip.startsWith("127.") || ip.startsWith("169.254.")) continue;
      if (isTailscale(name, ip)) tailscale = tailscale || ip;
      else if (isLocalLan(name, ip)) local = local || ip;
    }
  }

  return { local, tailscale };
}

function getAccessInfo(port) {
  const { local, tailscale } = getNetworkAddresses();
  return {
    port,
    ips: { local, tailscale },
    urls: {
      localhost: `http://localhost:${port}`,
      local: local ? `http://${local}:${port}` : null,
      remote: tailscale ? `http://${tailscale}:${port}` : null,
    },
  };
}

function printAccessInfo(port) {
  const info = getAccessInfo(port);
  console.log(`Rollo running at ${info.urls.localhost}`);
  if (info.urls.local) console.log(`  Same Wi-Fi:  ${info.urls.local}`);
  if (info.urls.remote) {
    console.log(`  Tailscale:   ${info.urls.remote}  (works anywhere)`);
  } else {
    console.log("  Tailscale:   not detected");
  }
}

module.exports = { getAccessInfo, printAccessInfo };
