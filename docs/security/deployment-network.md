# Reference deployment network

[Security guides](README.md) | [Server operations](server-operations.md)

This is the intended network model, not an assertion about your installed
firewall or router. Default ports are shown; preserve and verify any configured
nonstandard ports.

```text
Staff on approved LAN/VPN ---- HTTPS ----+
                                        |
Internet recipients -- site firewall -- nginx HTTPS -- Broadcaster -- approved storage
                         shares only       |
                                    admin-network policy

Host SSH / Cockpit: separate management access and firewall policies
Direct Broadcaster HTTP: private compatibility traffic only, never public
```

## Inbound access

| Default port | Intended access | Purpose |
|---|---|---|
| TCP 443 | Approved LAN/VPN for staff; Internet only when external sharing is intended | nginx HTTPS. Public recipient routes enforce link access; staff routes also require an allowed network and the applicable authentication/authorization. |
| TCP 80 | Only where HTTP redirects or ACME HTTP challenges are needed | nginx redirects to HTTPS except for permitted certificate-challenge files. Do not send credentials here. |
| TCP 9095 | Only explicitly approved private compatibility clients | Direct Broadcaster HTTP for discovery/setup and legacy integrations. Never forward it from the Internet. |
| TCP 22 | Approved management networks | SSH administration and desktop trust/setup workflows. |
| UDP 5353 | Local link only | Optional mDNS discovery. |
| TCP 9090 | Approved management networks, if Cockpit is installed | Separate host management interface, not covered by 45Flow's nginx policy. |
| TCP 139/445, UDP 137/138 | Private storage networks, if Samba is enabled | Host file sharing, separately managed from the HTTP API. |

Port 9095 does not encrypt passwords or tokens. Legacy integrations may still use
it for authenticated requests. Keep that traffic off untrusted networks and plan
integration upgrades to HTTPS; an nginx allowlist cannot protect a request that
bypasses nginx.

The backend normally listens on all IPv4 interfaces. Packaged bootstrap policy
limits 9095 to private IPv4 sources, but this is not proof of effective filtering
on every interface, firewall zone, tunnel or upstream router. Where no clients
need direct access, an administrator can use `HOST=127.0.0.1`; first verify that
discovery, setup and integrations will still work.

## Staff networks and proxies

Use **Settings -> Admin Networks** where supported, or the administrator-managed
nginx allow file, to restrict staff HTTPS access. Packaged defaults include
loopback, private IPv4, CGNAT/Tailscale, IPv6 ULA and link-local ranges. These are
broad compatibility defaults, not automatic approval of every device on those
networks. Review them against the site's actual staff networks.

nginx evaluates its connection peer, not an arbitrary incoming
`X-Forwarded-For` value. Do not globally trust forwarding headers or put an
unrestricted proxy with a trusted private address in front of it. Network
admission does not replace API authentication or staff account approval.

An optional customer-managed share gateway can forward recipient requests over a
private tunnel. It must enforce the supported public-share route allowlist and
forward to the site's nginx HTTPS listener, not directly to 9095. Forwarding all
paths from a trusted tunnel address can unintentionally expose administration.
Gateway setup is not implied by installing Broadcaster.

## Outbound access

Allow only traffic required by enabled features: host DNS/time services,
configured package repositories, licensing, certificate issuance/renewal,
TLS-enabled SMTP, malware-signature updates, and optional network diagnostics or
a customer-managed tunnel. Disabling an application outbound feature does not
necessarily stop separate host timers, package managers or certificate tools
from making their own connections.

## Checks before external sharing

1. Keep a working management session and an independent recovery route. Record
   the intended ports, networks, interfaces and any gateway privately.
2. From an approved LAN/VPN client, verify HTTPS staff sign-in, file workflows
   and progress updates. Without credentials, protected APIs should deny access.
3. From an authorized non-allowlisted source, verify staff HTTPS endpoints such
   as `/api/login`, `/api/users` and `/api-docs` receive nginx 403, including with
   forged forwarding headers. Verify intended public recipient flows still work.
4. Verify 9095 cannot be reached from untrusted sources or through port forwards,
   alternate interfaces, tunnels, IPv6 listeners or cloud/router rules. A timeout
   alone is not proof that the intended firewall rule caused the denial.
5. Verify the certificate, TLS policy, public links and certificate renewal.
   Include protected links, upload/download and review workflows actually used
   at the site; a reachable viewer shell is not full functional acceptance.

A local or isolated-interface test is not a substitute for an external test.
Record what was tested and what remains unverified without publishing host
details, credentials or usable share links.
