# Credential handling

[Security guides](README.md) | [Server operations](server-operations.md)

This contract distinguishes server login passwords, saved client credentials,
session credentials and server-owned provider secrets. Encryption of one
category does not mean every file or database on the server is encrypted.
Confirm the [release scope](README.md#version-and-release-scope) for your version.

## Staff sign-in and saved credentials

Staff sign-in normally verifies a system account through the server's PAM
authentication stack. The login password is supplied for verification, not
stored as a provider credential. Accounts and staff authorization remain the
server administrator's responsibility.

Use the desktop client's HTTPS connection or the browser's HTTPS server origin.
The desktop client verifies the server certificate using its SSH trust flow;
the browser relies on browser certificate validation. Do not bypass an
unexpected certificate change or warning.

The desktop's optional **Remember my password on this computer** setting uses
the operating system's protected storage. If that storage is unavailable, the
client warns and keeps credentials only for the current session. Logging out or
removing a connection clears saved login credentials. Leave the option unchecked
when password retention is not wanted.

The browser does not offer saved-password storage in 45Flow. Its authenticated
session uses an httpOnly, Secure cookie and CSRF protection for writes. Desktop
tokens and browser session cookies are credentials: do not copy them into URLs,
screenshots, tickets or logs.

The legacy direct backend port is plain HTTP. It is not a safe replacement for
HTTPS sign-in, even on a private network. See the [network guide](deployment-network.md).

### Storage Wizard backup reports

The staged shared-server integration can issue backup-only tokens to valid
PAM accounts when Storage Wizard is registered and login supplies an installation
ID. These tokens are not staff credentials. They authorize only the verified
user/installation's backup metadata and reports, not 45Flow, host administration,
staff settings or setup logs. Existing network restrictions still apply.

No provider-secret storage or Samba-only password verifier is added by this
contract. The existing Storage Wizard direct-HTTP transport remains a supported
compatibility limitation, not a confidential channel. Do not use it across
untrusted networks. See the [ownership and client-upgrade procedure](server-operations.md#storage-wizard-backup-client-authentication).

## Server-owned provider secrets

On servers with the encrypted credential store, SMTP credentials are stored
encrypted at rest using AES-256-GCM. Encryption is bound to the credential's
namespace so values cannot be moved between provider namespaces as valid secrets.
The encryption key is separate from the encrypted database values.

The default provider-key location is
`/etc/45drives/houston-broadcaster/credentials.key`. It is root-only, with file
mode `0600` and a protected parent directory. Do not loosen permissions to solve
an application error. Provider-key protection is separate from JWT/session
signing secrets and TLS private keys.

Authorized credential-management responses expose safe configuration status,
not the stored password, provider authentication username, ciphertext or key
material. Replacing a provider credential requires supplying the new value;
there is no password-readback operation.

SMTP connections require TLS, either implicit TLS or STARTTLS, with certificate
verification. Do not disable verification or downgrade to plaintext to work
around a configuration failure. Provider credentials necessarily become
available to the server process when it uses them; encryption at rest does not
protect against an administrator or a compromised privileged server process.

The staged privilege-separation work adds a restricted local credential broker.
It performs namespace-bound encryption/decryption and key rotation without
exporting the master key to the application account. The application still
receives provider credentials in memory when it uses them; this is key isolation,
not protection from an already compromised application sending mail. A configured
broker outage fails closed, without reverting to direct key-file access. Missing
keys require the root-controlled install/recovery step, not a request that
silently initializes a replacement.
The staged broker supports provider objects up to 64 KiB of serialized UTF-8
JSON, including field names. Oversized existing records must be checked before
migration; they are not truncated or reset.

## Unconfigured is not unavailable

An unconfigured provider has no saved configuration. An unavailable credential
store may contain configuration that cannot safely be read, for example because
its key is missing, corrupt, unreadable or has unsafe permissions.

Credential-management endpoints distinguish authentication failure (401),
insufficient authorization (403), and credential-store unavailability (503).
An unavailable store must not be presented as an empty configuration or a
successful reset. Some mail-status screens can still show historical delivery
results while the store is unavailable; that does not prove a new send can work.
SMTP acceptance is not proof of inbox delivery.

## Key backup, rotation and recovery

- Back up the provider key separately from the encrypted database, under its
  own access controls. Putting both in the same less-protected archive defeats
  that separation.
- Coordinate backups so the key backup contains every key version referenced
  by the database snapshot. Rotation retains prior key versions; it does not
  make older backups disposable or automatically re-encrypt all saved values.
- A new empty store can create its initial key automatically. An existing
  encrypted store whose key is missing must fail rather than silently generate
  a replacement key and appear reset.
- If existing values cannot be decrypted, preserve the current files and use a
  controlled recovery procedure with the matching protected key backup. Do not
  delete the key or database as a troubleshooting shortcut.

If both the needed key material and its protected backup are lost, the encrypted
values cannot be recovered. An authorized administrator must arrange replacement
credentials with the provider.

## Handling credentials during support and testing

Do not pass real passwords or tokens as command-line arguments. Use protected
input mechanisms or a secure application sign-in flow. Audit records should
identify the operation and outcome without recording secret values. Redact
credentials and usable share links before sharing diagnostic material.
