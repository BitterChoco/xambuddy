package com.bitterchoco.localnetworkaddress

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address
import java.net.NetworkInterface

class LocalNetworkAddressModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LocalNetworkAddress")

    Function("getIPv4Addresses") {
      val addresses = mutableListOf<Map<String, Any>>()
      val interfaces = NetworkInterface.getNetworkInterfaces() ?: return@Function addresses

      while (interfaces.hasMoreElements()) {
        val networkInterface = interfaces.nextElement()
        val isUsableInterface = try {
          networkInterface.isUp && !networkInterface.isLoopback && !networkInterface.isVirtual
        } catch (_: Exception) {
          false
        }
        if (!isUsableInterface) continue

        val interfaceAddresses = networkInterface.inetAddresses
        while (interfaceAddresses.hasMoreElements()) {
          val address = interfaceAddresses.nextElement()
          if (
            address !is Inet4Address ||
            address.isAnyLocalAddress ||
            address.isLoopbackAddress ||
            address.isLinkLocalAddress ||
            address.isMulticastAddress
          ) {
            continue
          }

          addresses.add(
            mapOf(
              "address" to address.hostAddress,
              "interfaceName" to networkInterface.name,
            ),
          )
        }
      }

      addresses.sortBy { entry ->
        val interfaceName = (entry["interfaceName"] as String).lowercase()
        when {
          interfaceName.contains("wlan") ||
            interfaceName.contains("wifi") ||
            interfaceName.startsWith("ap") ||
            interfaceName.contains("softap") -> 0
          interfaceName.contains("rmnet") ||
            interfaceName.contains("ccmni") ||
            interfaceName.contains("pdp") ||
            interfaceName.contains("tun") -> 2
          else -> 1
        }
      }

      return@Function addresses
    }
  }
}
