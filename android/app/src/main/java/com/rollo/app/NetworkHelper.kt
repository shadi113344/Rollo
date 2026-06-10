package com.rollo.app

import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkHelper {
    fun getLanIp(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (intf in interfaces) {
                if (!intf.isUp || intf.isLoopback) continue
                val name = intf.name.lowercase()
                if (name.contains("tailscale") || name.contains("vpn") || name.contains("dummy")) continue
                for (addr in intf.inetAddresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val ip = addr.hostAddress ?: continue
                        if (ip.startsWith("192.168.") || ip.startsWith("10.")) return ip
                    }
                }
            }
        } catch (_: Exception) {
        }
        return null
    }

    fun accessUrls(context: android.content.Context): List<Pair<String, String>> {
        val port = RolloConfig.getPort(context)
        val urls = mutableListOf<Pair<String, String>>()
        urls.add("This phone" to "http://127.0.0.1:$port/")
        getLanIp()?.let { urls.add("Same Wi‑Fi" to "http://$it:$port/") }
        urls.add("Tailscale" to "http://YOUR-TAILSCALE-IP:$port/")
        return urls
    }

    fun bestShareUrl(context: android.content.Context): String {
        val port = RolloConfig.getPort(context)
        val lan = getLanIp()
        return if (lan != null) "http://$lan:$port/" else "http://127.0.0.1:$port/"
    }
}
