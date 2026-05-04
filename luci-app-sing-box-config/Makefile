include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for sing-box router client config
LUCI_DEPENDS:=+luci-base +sing-box +ucode +ucode-mod-fs +ucode-mod-uci +uclient-fetch +ca-bundle
LUCI_PKGARCH:=all

PKG_LICENSE:=GPL-3.0-or-later
PKG_MAINTAINER:=Konstantin Koshkin

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
