'use strict';
'require view';
'require form';
'require uci';
'require tools.sing-box-config.common as common';

function outboundTypeDepends(option) {
	option.depends({ type: 'vless' });
	option.depends({ type: 'vmess' });
	option.depends({ type: 'trojan' });
	option.depends({ type: 'shadowsocks' });
	option.depends({ type: 'hysteria2' });
	option.depends({ type: 'tuic' });
	option.depends({ type: 'socks' });
	option.depends({ type: 'http' });
	return option;
}

function tlsDepends(option) {
	option.depends({ type: 'vless', tls_enabled: '1' });
	option.depends({ type: 'vmess', tls_enabled: '1' });
	option.depends({ type: 'trojan', tls_enabled: '1' });
	option.depends({ type: 'hysteria2', tls_enabled: '1' });
	option.depends({ type: 'tuic', tls_enabled: '1' });
	option.depends({ type: 'http', tls_enabled: '1' });
	return option;
}

return view.extend({
	load: function() {
		return uci.load('sing-box-config');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('sing-box-config', 'Sing-box Config');
		m.description = 'TUN, inbounds и outbounds';

		s = m.section(form.NamedSection, 'main', 'global', 'TUN');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'tun_enable', 'Включить TUN');
		o.rmempty = false;

		o = s.option(form.Value, 'tun_interface_name', 'Имя TUN интерфейса');
		o.placeholder = 'tun0';
		o.depends('tun_enable', '1');

		o = s.option(form.Value, 'tun_tag', 'Тег TUN inbound');
		o.placeholder = 'tun-in';
		o.depends('tun_enable', '1');

		o = s.option(form.ListValue, 'tun_stack', 'TUN stack');
		o.value('system', 'system');
		o.value('mixed', 'mixed');
		o.value('gvisor', 'gvisor');
		o.default = 'system';
		o.depends('tun_enable', '1');

		o = s.option(form.Value, 'tun_mtu', 'MTU');
		o.datatype = 'uinteger';
		o.placeholder = '1500';
		o.depends('tun_enable', '1');

		o = s.option(form.Flag, 'tun_auto_route', 'auto_route');
		o.rmempty = false;
		o.depends('tun_enable', '1');

		o = s.option(form.Flag, 'tun_strict_route', 'strict_route');
		o.rmempty = false;
		o.depends('tun_enable', '1');

		o = s.option(form.DynamicList, 'tun_address', 'TUN address (CIDR)');
		o.depends('tun_enable', '1');

		s = m.section(form.GridSection, 'inbound', 'Inbounds');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'Inbound';
		s.max_cols = 4;

			o = s.option(form.Flag, 'enabled', 'Enable');
			o.default = '1';
			o.rmempty = false;
			o.editable = true;

		o = s.option(form.Value, 'tag', 'Tag');
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.ListValue, 'type', 'Type');
		o.value('tun', 'tun');
		o.value('direct', 'direct');
		o.default = 'tun';
		o.editable = true;

		o = s.option(form.Value, 'listen_port', 'Listen port');
		o.datatype = 'port';
		o.editable = true;
		o.depends({ type: 'direct' });

			o = common.modalOnly(s.option(form.Value, 'interface_name', 'Interface name'));
		o.placeholder = 'singtun';
		o.depends({ type: 'tun' });
			o = common.modalOnly(s.option(form.DynamicList, 'address', 'Address (CIDR)'));
		o.depends({ type: 'tun' });
			o = common.modalOnly(s.option(form.Value, 'mtu', 'MTU'));
		o.datatype = 'uinteger';
		o.depends({ type: 'tun' });
			o = common.modalOnly(s.option(form.Flag, 'auto_route', 'auto_route'));
		o.default = '1';
		o.depends({ type: 'tun' });
			o = common.modalOnly(s.option(form.Flag, 'strict_route', 'strict_route'));
		o.default = '0';
		o.depends({ type: 'tun' });
			o = common.modalOnly(s.option(form.ListValue, 'stack', 'stack'));
		o.value('system', 'system');
		o.value('mixed', 'mixed');
		o.value('gvisor', 'gvisor');
		o.depends({ type: 'tun' });
			o = common.modalOnly(s.option(form.Value, 'listen', 'Listen'));
		o.placeholder = '127.0.0.1';
		o.depends({ type: 'direct' });
			o = common.modalOnly(s.option(form.Value, 'extra_json', 'extra_json'));
		o.monospace = true;

		s = m.section(form.GridSection, 'outbound', 'Outbounds');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'Outbound';
		s.max_cols = 4;

			o = s.option(form.Flag, 'enabled', 'Enable');
			o.default = '1';
			o.rmempty = false;
			o.editable = true;

		o = s.option(form.Value, 'tag', 'Tag');
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.ListValue, 'type', 'Type');
		o.value('vless');
		o.value('vmess');
		o.value('trojan');
		o.value('shadowsocks');
		o.value('hysteria2');
		o.value('tuic');
		o.value('socks');
		o.value('http');
		o.value('selector');
		o.value('urltest');
		o.value('direct');
		o.value('block');
		o.default = 'vless';
		o.editable = true;

		o = s.option(form.Value, 'server', 'Server');
		o.editable = true;

			o = common.modalOnly(s.option(form.Value, 'server_port', 'Port'));
		o.datatype = 'port';
		outboundTypeDepends(o);

			o = common.modalOnly(s.option(form.Value, 'uuid', 'UUID'));
		o.depends({ type: 'vless' });
		o.depends({ type: 'vmess' });
			o = common.modalOnly(s.option(form.Value, 'flow', 'Flow'));
		o.placeholder = 'xtls-rprx-vision';
		o.depends({ type: 'vless' });
			o = common.modalOnly(s.option(form.Value, 'password', 'Password'));
		o.password = true;
		o.depends({ type: 'trojan' });
		o.depends({ type: 'shadowsocks' });
		o.depends({ type: 'hysteria2' });
		o.depends({ type: 'tuic' });
		o.depends({ type: 'http' });
		o.depends({ type: 'socks' });
			o = common.modalOnly(s.option(form.Value, 'username', 'Username'));
		o.depends({ type: 'http' });
		o.depends({ type: 'socks' });
			o = common.modalOnly(s.option(form.Value, 'method', 'Method'));
		o.placeholder = 'aes-128-gcm';
		o.depends({ type: 'shadowsocks' });
			o = common.modalOnly(s.option(form.Flag, 'tls_enabled', 'TLS enabled'));
			o.default = '1';
			o.rmempty = false;
		o.depends({ type: 'vless' });
		o.depends({ type: 'vmess' });
		o.depends({ type: 'trojan' });
		o.depends({ type: 'hysteria2' });
		o.depends({ type: 'tuic' });
		o.depends({ type: 'http' });
			tlsDepends(common.modalOnly(s.option(form.Value, 'tls_server_name', 'TLS SNI')));
			o = tlsDepends(common.modalOnly(s.option(form.Flag, 'tls_insecure', 'TLS insecure')));
			o.default = '0';
			o.rmempty = false;
			tlsDepends(common.modalOnly(s.option(form.DynamicList, 'tls_alpn', 'TLS ALPN')));
			o = tlsDepends(common.modalOnly(s.option(form.Flag, 'tls_utls_enabled', 'uTLS enabled')));
			o.default = '0';
			o.rmempty = false;
			o = tlsDepends(common.modalOnly(s.option(form.Value, 'tls_utls_fingerprint', 'uTLS fingerprint')));
		o.placeholder = 'chrome';
		o.depends({ type: 'vless', tls_enabled: '1', tls_utls_enabled: '1' });
		o.depends({ type: 'vmess', tls_enabled: '1', tls_utls_enabled: '1' });
		o.depends({ type: 'trojan', tls_enabled: '1', tls_utls_enabled: '1' });
		o.depends({ type: 'hysteria2', tls_enabled: '1', tls_utls_enabled: '1' });
		o.depends({ type: 'tuic', tls_enabled: '1', tls_utls_enabled: '1' });
		o.depends({ type: 'http', tls_enabled: '1', tls_utls_enabled: '1' });
			o = common.modalOnly(s.option(form.Flag, 'tls_reality_enabled', 'Reality enabled'));
			o.default = '0';
			o.rmempty = false;
		o.depends({ type: 'vless', tls_enabled: '1' });
			o = common.modalOnly(s.option(form.Value, 'tls_reality_public_key', 'Reality public key'));
		o.depends({ type: 'vless', tls_enabled: '1', tls_reality_enabled: '1' });
			o = common.modalOnly(s.option(form.Value, 'tls_reality_short_id', 'Reality short_id'));
		o.depends({ type: 'vless', tls_enabled: '1', tls_reality_enabled: '1' });
			o = common.modalOnly(s.option(form.DynamicList, 'outbounds', 'Linked outbounds'));
		o.depends({ type: 'selector' });
		o.depends({ type: 'urltest' });
			o = common.modalOnly(s.option(form.Value, 'interval', 'URLTest interval (s)'));
		o.datatype = 'uinteger';
		o.depends({ type: 'urltest' });
			o = common.modalOnly(s.option(form.Value, 'tolerance', 'URLTest tolerance'));
		o.datatype = 'uinteger';
		o.depends({ type: 'urltest' });
			o = common.modalOnly(s.option(form.DynamicList, 'network', 'Network list'));
		o.depends({ type: 'vless' });
		o.depends({ type: 'vmess' });
		o.depends({ type: 'trojan' });
		o.depends({ type: 'shadowsocks' });
		o.depends({ type: 'hysteria2' });
		o.depends({ type: 'tuic' });
			o = common.modalOnly(s.option(form.Value, 'extra_json', 'extra_json'));
		o.monospace = true;

		return m.render();
	}
});
