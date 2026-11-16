# Security and server administration

These are the canonical customer-facing security guides for 45Flow and its
houston-broadcaster server:

| Guide | Covers |
|---|---|
| [Credential handling](credentials.md) | Login credentials, provider secrets, encryption, key backup and recovery. |
| [Reference deployment network](deployment-network.md) | Staff and recipient access, ports, proxies, firewalls and exposure checks. |
| [Server configuration, upgrades and rollback](server-operations.md) | Approved storage, staff authorization, maintenance, validation and operating limits. |
| [Manual acceptance checklist](manual-validation.md) | Shared service identity, both applications, upgrade/rollback and deployment checks. |

For application workflows, see the [45Flow user guide](../45Flow_User_Guide.md).
These documents do not require access to the private Broadcaster source repository.

## Version and release scope

Server behavior depends on the installed Broadcaster version, not only the
desktop or browser client version. Confirm the installed version and its release
notes before applying configuration changes.

The approved-storage boundary, descriptor-relative share operations, optional
staff-group/network enforcement, privilege brokers and controlled service-account
migration, shared application profiles and scoped Storage Wizard backup-client
authentication described in the operations guide are **staged B1 changes**.
Their documentation here is not a claim that they are available in an existing
published package. Use those settings only with a server release that includes
them; older releases may not recognize or enforce them.

## What these guides establish

Network restrictions, authenticated staff APIs and recipient link permissions
are separate controls. A license or an accessible sign-in page is not an
authorization boundary. Descriptor-relative storage operations are not a complete
sandbox for subprocesses or a compromised host.

Deployment diagrams describe an intended policy, not proof that a particular
installation enforces it. Verify the actual host, interfaces, firewall, router
and any gateway before enabling external access.

## Public evidence and private records

Any public validation summary should identify the exact released server/client
versions, test date, scope, results and untested areas. Do not treat development
or single-host results as certification of a release or every deployment.

Keep raw logs, internal findings, host inventories, backup locations, account
names, private addresses and site-specific recovery records in protected
operational records. Never publish passwords, tokens, private keys or usable
share links. No release-specific validation claim is made by this documentation.
