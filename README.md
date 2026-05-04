# luci-app-sing-box-config

LuCI application for configuring [sing-box](https://sing-box.sagernet.org/) on
apk-based OpenWrt systems.

The package stores router-side settings in UCI
(`/etc/config/sing-box-config`) and generates a sing-box JSON configuration at
`/etc/sing-box/config.json`. It is intended for users who want to manage a
single active sing-box router profile from LuCI instead of editing JSON by hand.

## Features

- LuCI pages under `Services -> sing-box config`.
- UCI-backed forms for global settings, DNS, TUN, inbounds, outbounds, rule
  sets, routing rules, and advanced JSON fragments.
- Backend CLI for previewing, validating, applying, importing, and managing the
  generated sing-box configuration.
- Service controls for starting, stopping, and restarting sing-box from LuCI.
- Runtime outbound status through the local sing-box Clash API controller.
- Live sing-box log viewer backed by OpenWrt `logread`.
- Built-in SagerNet geosite/geoip rule-set catalog with optional online refresh.
- Compatibility import from an existing `/etc/sing-box/config.json` into the UCI
  model.

## Requirements

- OpenWrt 25.12 or newer, or another OpenWrt build that uses `apk`.
- LuCI.
- `sing-box`.
- `ucode`, `ucode-mod-fs`, and `ucode-mod-uci`.
- `uclient-fetch` and `ca-bundle` for local Clash API access and online catalog
  refresh.

The OpenWrt package metadata declares these runtime dependencies:

```make
LUCI_DEPENDS:=+luci-base +sing-box +ucode +ucode-mod-fs +ucode-mod-uci +uclient-fetch +ca-bundle
```

## Installation

Download the `.apk` package from the project GitHub Release for your OpenWrt
target and copy it to the router.

Install the local package:

```sh
apk add --allow-untrusted ./luci-app-sing-box-config*.apk
```

Restart LuCI services if the page is not visible immediately:

```sh
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

Open LuCI and navigate to:

```text
Services -> sing-box config
```

OpenWrt documents apk package management at
<https://openwrt.org/docs/guide-user/additional-software/apk>.

## Building From Source

Build this package with an OpenWrt SDK or full OpenWrt buildroot matching your
router target and release.

High-level flow:

```sh
./scripts/feeds update -a
./scripts/feeds install -a
make package/luci-app-sing-box-config/compile V=s
```

See [docs/BUILD.md](docs/BUILD.md) for detailed build instructions and expected
artifact locations.

## Backend CLI

The LuCI UI calls `/usr/libexec/sing-box-config-cli`. The same commands can be
used from SSH for troubleshooting:

```sh
/usr/libexec/sing-box-config-cli preview
/usr/libexec/sing-box-config-cli validate
/usr/libexec/sing-box-config-cli apply
/usr/libexec/sing-box-config-cli import-current /etc/sing-box/config.json
/usr/libexec/sing-box-config-cli runtime-status
/usr/libexec/sing-box-config-cli logs 300
/usr/libexec/sing-box-config-cli catalog
/usr/libexec/sing-box-config-cli catalog-refresh
```

Important behavior:

- `preview` generates JSON and prints it.
- `validate` generates JSON and runs `sing-box check`.
- `apply` validates, writes `/etc/sing-box/config.json`, and synchronizes
  `/etc/config/sing-box`.
- `import-current` imports an existing sing-box JSON config into the UCI model.
- `runtime-status` reads only loopback Clash API controllers.
- `logs` returns recent sing-box lines from `logread`.

## Configuration Notes

The default UCI profile is an example profile. It contains placeholder values
that must be replaced before the profile can be used as a real sing-box config.

In particular:

- replace example server addresses, UUIDs, and Reality public keys;
- create any local rule-set files referenced by your profile;
- run `validate` before applying or starting the service.

If `validate` fails with a sing-box profile error, the package can still be
installed correctly. Fix the profile values through LuCI or UCI and validate
again.

## Release Process

This repository uses GitHub Actions to build `.apk` artifacts with an OpenWrt
SDK. Pushes to `main` produce downloadable workflow artifacts. Pushing a tag
like `v0.1.0` builds the package and attaches the `.apk` plus `SHA256SUMS` to a
GitHub Release.

See [docs/RELEASE.md](docs/RELEASE.md) for the release checklist.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
