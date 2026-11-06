<template>
    <FlowModal :model-value="true" title="HOW TO PORT FORWARD" size="xl" position="top" surface="default"
        body-class="text-sm text-left space-y-6" @close="close">
                <section class="space-y-3">
                    <p>
                        To let people <em>outside</em> your network open 45Flow links, you must forward the
                        <b>45Flow HTTPS port</b> on your router to your Studio box.
                    </p>
                    <p class="text-xs opacity-80">
                        The default is <b>TCP 443</b>, but if you changed the HTTPS port in the 45Flow app, you
                        must forward
                        <b>that</b> port instead.
                    </p>
                    <p class="text-xs opacity-80">
                        You’ll do four things: (1) find your Studio box LAN IP, (2) log into your router, (3) add a
                        port-forward
                        rule, (4) test from outside your network.
                    </p>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 1 — Find your Studio box local IP (LAN IP)</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>
                            <b>Windows:</b> Open Command Prompt → run <code>ipconfig</code> → find the active adapter
                            (Ethernet/Wi-Fi)
                            → copy the <b>IPv4 Address</b> (example: <code>192.168.1.50</code>).
                        </li>
                        <li>
                            <b>macOS:</b> System Settings → Network → select Wi-Fi/Ethernet → copy <b>IP Address</b>.
                            (Or Terminal:
                            <code>ipconfig getifaddr en0</code> for Wi-Fi.)
                        </li>
                        <li>
                            <b>Linux:</b> Terminal → run <code>ip route get 1.1.1.1 | awk '/src/ {print $7}'</code> and
                            copy the IP.
                        </li>
                    </ul>
                    <p class="text-xs opacity-80">
                        Your LAN IP usually starts with <code>192.168.</code>, <code>10.</code>, or
                        <code>172.16–172.31</code>.
                        You’ll use this IP in Step 3 as the “Internal IP”.
                    </p>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 2 — Log into your router</h4>
                    <p>On a computer connected to the same network, open your router’s admin page in a browser.</p>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>
                            <b>Best method:</b> find your <b>Default Gateway</b>, then open that address in your
                            browser.
                            <ul class="list-disc pl-5 mt-1 space-y-1">
                                <li><b>Windows:</b> <code>ipconfig</code> → look for <b>Default Gateway</b></li>
                                <li><b>macOS:</b> <code>netstat -rn | grep default | head -n 1</code></li>
                                <li><b>Linux:</b> <code>ip route | grep default</code></li>
                            </ul>
                        </li>
                        <li>
                            <b>Common router addresses:</b> <code>http://192.168.1.1</code>,
                            <code>http://192.168.0.1</code>,
                            <code>http://192.168.100.1</code>
                        </li>
                        <li>
                            Sign in using your router username/password (often printed on the router label or provided
                            by your ISP).
                        </li>
                    </ul>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 3 — Add a Port Forwarding rule</h4>
                    <p>
                        In your router, open the section named <b>Port Forwarding</b>, <b>NAT</b>, <b>Virtual
                            Server</b>, or
                        <b>Advanced</b>, then add a new rule with these values:
                    </p>

                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <tbody class="[&>tr>td]:py-1 [&>tr>td]:pr-3">
                                <tr>
                                    <td class="font-medium">Name / Service</td>
                                    <td>45Flow</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">External Port</td>
                                    <td>Your 45Flow HTTPS port (default 443)</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">Internal Port</td>
                                    <td>Same as External Port</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">Protocol</td>
                                    <td>TCP</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">Internal IP / Device</td>
                                    <td>Your Studio box LAN IP from Step 1</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <p>Save/apply the rule. Some routers may briefly restart.</p>

                    <p class="text-xs opacity-80">
                        If your router asks for a port range, use <code>PORT–PORT</code> (example: <code>443–443</code>
                        or
                        <code>8443–8443</code>). If it asks for “WAN interface”, choose your internet/WAN connection.
                    </p>

                    <p class="text-xs opacity-80">
                        Most setups use the same external and internal port. Only use different values if you
                        intentionally run
                        45Flow on one port internally and map a different port externally.
                    </p>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 4 — Test from outside your network</h4>
                    <p>Port forwarding tests can be misleading from inside the same network. For the best test:</p>
                    <ol class="list-decimal pl-5 space-y-1">
                        <li>On your phone, turn <b>Wi-Fi OFF</b> (use cellular data).</li>
                        <li>Open your 45Flow link in the phone browser.</li>
                    </ol>

                    <p class="text-xs opacity-80">
                        If you chose a non-default HTTPS port, your link will include <code>:PORT</code> (example:
                        <code>https://your-ip-or-domain:8443/...</code>).
                    </p>

                    <p class="text-xs opacity-80">
                        Optional: you can also use a port checker like <code>canyouseeme.org</code> to test your HTTPS
                        port, but
                        testing from a device off your Wi-Fi is the most reliable.
                    </p>
                </section>

                <section class="space-y-2">
                    <h4 class="font-semibold text-base">Optional — Prevent the LAN IP from changing</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>
                            In your router, set a <b>DHCP Reservation</b> (or assign a static IP) for your Studio box so
                            the LAN IP
                            stays the same.
                        </li>
                    </ul>
                </section>

                <section class="space-y-2">
                    <h4 class="font-semibold text-base">Troubleshooting</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>
                            <b>Link still doesn’t work externally:</b> confirm the Studio box is actually listening on
                            the
                            <b>configured HTTPS port</b> and that its firewall allows inbound TCP on that port.
                        </li>
                        <li>
                            <b>Wrong internal IP:</b> re-check Step 1. Make sure you used the IP of the Studio box on
                            your LAN (not a
                            VPN/Docker address).
                        </li>
                        <li>
                            <b>Double NAT / two routers:</b> if your ISP modem is also a router, you may need to forward
                            the HTTPS
                            port on both devices (modem → router, then router → Studio box) or put your router in the
                            modem’s DMZ.
                        </li>
                        <li>
                            <b>CGNAT / no public IP:</b> if your router’s “WAN/Internet IP” starts with
                            <code>10.</code>,
                            <code>192.168.</code>, or <code>100.64–100.127</code>, your ISP may be using CGNAT and port
                            forwarding will
                            not work. Ask your ISP for a public IPv4 address.
                        </li>
                        <li>
                            <b>ISP blocks 443:</b> some ISPs block inbound 443 on residential plans. If so, pick another
                            port (example
                            <code>8443</code>), set that same port as the HTTPS port in 45Flow, forward it on your
                            router, and
                            expect links to include <code>:8443</code>.
                        </li>
                    </ul>
                </section>

                <section class="space-y-2">
                    <h4 class="font-semibold text-base">Security note</h4>
                    <p class="text-xs opacity-80">
                        Port forwarding exposes your Studio box to the internet. Use strong passwords and keep your
                        system updated.
                    </p>
                </section>
    </FlowModal>
</template>

<script setup lang="ts">
import FlowModal from '../../ui/FlowModal.vue'
const emit = defineEmits(["close"]);
function close() {
    emit("close");
}
</script>
