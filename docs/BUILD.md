# Build Instructions

This package is built with an OpenWrt SDK or full OpenWrt buildroot that matches
the target router release and architecture.

Use an unprivileged user for OpenWrt builds. Do not build as root.

## Requirements

- OpenWrt SDK or buildroot for the target release.
- Standard OpenWrt build dependencies for the host OS.
- This repository checked out locally.

The package metadata is in `luci-app-sing-box-config/Makefile` and depends on:

```make
LUCI_DEPENDS:=+luci-base +ucode +ucode-mod-fs +ucode-mod-uci +uclient-fetch +ca-bundle
LUCI_EXTRA_DEPENDS:=sing-box
```

## Build In An OpenWrt SDK

From the SDK root, copy or symlink the package directory into a LuCI-style feed
layout. The package `Makefile` includes `../../luci.mk`, so the package must sit
two levels below a directory that contains `luci.mk`.

One simple local layout is:

```sh
./scripts/feeds update base packages luci
./scripts/feeds install luci-base ucode ucode-mod-fs ucode-mod-uci uclient-fetch ca-bundle

mkdir -p feeds/local/applications package/feeds/local
cp feeds/luci/luci.mk feeds/local/luci.mk
cp -a /path/to/sing-box-config/luci-app-sing-box-config feeds/local/applications/luci-app-sing-box-config
ln -s ../../../feeds/local/applications/luci-app-sing-box-config package/feeds/local/luci-app-sing-box-config
```

Build the package:

```sh
make -j"$(nproc)" package/feeds/local/luci-app-sing-box-config/compile V=s
```

The resulting package should appear under a target-specific directory such as:

```text
bin/packages/<arch>/local/luci-app-sing-box-config*.apk
```

The exact `<arch>` name depends on the SDK target.

## Build With GitHub Actions

The repository includes `.github/workflows/build-apk.yml`.

The workflow runs automatically on pushes to `main`. Manual build:

```text
Actions -> Build OpenWrt APK -> Run workflow
```

Default inputs build for OpenWrt `25.12.2`, target `x86`, subtarget `64`.
Change those inputs to match the router target.

Pushing a tag like `v0.1.0` runs the same build and uploads the generated `.apk`
and `SHA256SUMS` to the GitHub Release for that tag. Regular `main` pushes only
upload workflow artifacts and do not create a release.

## CI Log Notes

During SDK builds, OpenWrt may print Kconfig warnings such as:

- `recursive dependency detected`
- `defaults for choice values not supported`

These warnings come from upstream feed metadata parsing and can appear even when
the target package is built correctly.

Build duration is dominated by dependency toolchains and runtime packages,
especially `sing-box` and Go components. This is expected for clean GitHub
Actions runners without a warm build cache.

## Install The Built Package

Copy the generated `.apk` to the router and install it:

```sh
apk add --allow-untrusted ./luci-app-sing-box-config*.apk
```

If LuCI does not show the page immediately, refresh LuCI caches and restart the
web services:

```sh
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

## Local Static Checks

These checks can run outside OpenWrt:

```sh
node --check luci-app-sing-box-config/htdocs/luci-static/resources/tools/sing-box-config/common.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/common.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/general.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/dns.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/tun.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/rule-sets.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/catalog.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/routing.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/manage.js
node --check luci-app-sing-box-config/htdocs/luci-static/resources/view/sing-box-config/logs.js
sh -n luci-app-sing-box-config/root/usr/libexec/sing-box-config-cli
sh -n luci-app-sing-box-config/root/etc/uci-defaults/95-luci-app-sing-box-config
sh -n tests/run-fixture-check.sh
jq empty luci-app-sing-box-config/root/usr/share/luci/menu.d/luci-app-sing-box-config.json
jq empty luci-app-sing-box-config/root/usr/share/rpcd/acl.d/luci-app-sing-box-config.json
jq empty luci-app-sing-box-config/root/usr/share/sing-box-config/rule-set-catalog.json
jq empty tests/fixtures/target-profile.json
jq empty tests/fixtures/fallback-no-outbounds.json
```

Generator and profile validation require OpenWrt runtime tools:

- `ucode`
- `uci`
- `sing-box`

Run `/usr/libexec/sing-box-config-cli validate` on the router before using a
profile in production.
