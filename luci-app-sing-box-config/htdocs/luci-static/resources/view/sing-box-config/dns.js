'use strict';
'require view';
'require form';
'require uci';
'require tools.sing-box-config.common as common';

return view.extend({
	load: function() {
		return uci.load('sing-box-config');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('sing-box-config', 'Sing-box Config');
		m.description = 'DNS параметры, серверы и правила';

		s = m.section(form.NamedSection, 'main', 'global', 'DNS');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'dns_enable', 'Включить DNS модуль');
		o.rmempty = false;

		o = s.option(form.Flag, 'dns_hijack_lan', 'Hijack DNS для LAN');
		o.rmempty = false;
		o.depends('dns_enable', '1');

		o = s.option(form.ListValue, 'dns_strategy', 'Стратегия DNS');
		o.value('', 'по умолчанию');
		o.value('prefer_ipv4', 'prefer_ipv4');
		o.value('prefer_ipv6', 'prefer_ipv6');
		o.value('ipv4_only', 'ipv4_only');
		o.value('ipv6_only', 'ipv6_only');
		o.depends('dns_enable', '1');

		o = s.option(form.Value, 'dns_final', 'Финальный DNS сервер (tag)');
		o.placeholder = 'dns-remote';
		o.depends('dns_enable', '1');

		o = s.option(form.Value, 'dns_cache_capacity', 'DNS cache_capacity');
		o.datatype = 'uinteger';
		o.placeholder = '4096';
		o.depends('dns_enable', '1');

		o = s.option(form.Value, 'route_default_domain_resolver_server', 'Route default_domain_resolver.server');
		o.placeholder = 'dns-direct';

		s = m.section(form.GridSection, 'dns_server', 'DNS servers');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'DNS server';
		s.max_cols = 4;

			o = s.option(form.Flag, 'enabled', 'Enable');
			o.default = '1';
			o.rmempty = false;
			o.editable = true;

		o = s.option(form.Value, 'tag', 'Tag');
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.ListValue, 'type', 'Type');
		o.value('', 'legacy');
		o.value('local', 'local');
		o.value('udp', 'udp');
		o.value('tcp', 'tcp');
		o.value('tls', 'tls');
		o.value('quic', 'quic');
		o.value('https', 'https');
		o.value('h3', 'h3');
		o.value('dhcp', 'dhcp');
		o.value('resolved', 'resolved');
		o.default = '';
		o.editable = true;

		o = s.option(form.Value, 'server', 'Server');
		o.editable = true;

			o = common.modalOnly(s.option(form.Value, 'server_port', 'Server port'));
		o.datatype = 'port';
		o.depends({ type: 'udp' });
		o.depends({ type: 'tcp' });
		o.depends({ type: 'tls' });
		o.depends({ type: 'quic' });
		o.depends({ type: 'https' });
		o.depends({ type: 'h3' });

			o = common.modalOnly(s.option(form.Value, 'path', 'Path'));
		o.placeholder = '/dns-query';
		o.depends({ type: 'https' });
		o.depends({ type: 'h3' });

			o = common.modalOnly(s.option(form.Value, 'detour', 'Detour'));
		o.placeholder = 'proxy';

			o = common.modalOnly(s.option(form.ListValue, 'strategy', 'Strategy'));
		o.value('', 'default');
		o.value('prefer_ipv4', 'prefer_ipv4');
		o.value('prefer_ipv6', 'prefer_ipv6');
		o.value('ipv4_only', 'ipv4_only');
		o.value('ipv6_only', 'ipv6_only');

			o = common.modalOnly(s.option(form.Flag, 'insecure', 'TLS insecure'));
		o.default = '0';

			o = common.modalOnly(s.option(form.Value, 'address', 'Legacy address'));
		o.placeholder = 'https://1.1.1.1/dns-query';

			o = common.modalOnly(s.option(form.Value, 'address_resolver', 'Legacy address_resolver'));
		o.placeholder = 'dns-direct';

			o = common.modalOnly(s.option(form.ListValue, 'address_strategy', 'Legacy address_strategy'));
		o.value('', 'default');
		o.value('prefer_ipv4', 'prefer_ipv4');
		o.value('prefer_ipv6', 'prefer_ipv6');
		o.value('ipv4_only', 'ipv4_only');
		o.value('ipv6_only', 'ipv6_only');

			o = common.modalOnly(s.option(form.Value, 'client_subnet', 'client_subnet'));
		o.placeholder = '1.2.3.0/24';

			o = common.modalOnly(s.option(form.Value, 'extra_json', 'extra_json'));
		o.monospace = true;

		s = m.section(form.GridSection, 'dns_rule', 'DNS rules');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = 'DNS rule';
		s.max_cols = 4;

			o = s.option(form.Flag, 'enabled', 'Enable');
			o.default = '1';
			o.rmempty = false;
			o.editable = true;

		o = s.option(form.Value, 'label', 'Name');
		o.editable = true;

		o = s.option(form.ListValue, 'action', 'Action');
		o.value('route', 'route');
		o.value('reject', 'reject');
		o.value('predefined', 'predefined');
		o.default = 'route';
		o.editable = true;

		o = s.option(form.Value, 'server', 'Server tag');
		o.placeholder = 'dns-remote';
		o.editable = true;
		o.depends({ action: 'route' });

			o = common.modalOnly(s.option(form.Flag, 'disable_cache', 'disable_cache'));
		o.default = '0';
			o = common.modalOnly(s.option(form.Flag, 'invert', 'Invert'));
		o.default = '0';
			common.modalOnly(s.option(form.DynamicList, 'rule_set', 'Rule set tags'));
			common.modalOnly(s.option(form.DynamicList, 'domain', 'Domain'));
			common.modalOnly(s.option(form.DynamicList, 'domain_suffix', 'Domain suffix'));
			common.modalOnly(s.option(form.DynamicList, 'domain_keyword', 'Domain keyword'));
			common.modalOnly(s.option(form.DynamicList, 'inbound', 'Inbound tags'));
			common.modalOnly(s.option(form.DynamicList, 'ip_cidr', 'IP CIDR'));
			common.modalOnly(s.option(form.DynamicList, 'source_ip_cidr', 'Source IP CIDR'));
			common.modalOnly(s.option(form.DynamicList, 'port', 'Port'));
			common.modalOnly(s.option(form.DynamicList, 'source_port', 'Source port'));
			common.modalOnly(s.option(form.DynamicList, 'process_name', 'Process name'));
			common.modalOnly(s.option(form.DynamicList, 'package_name', 'Package name'));
			common.modalOnly(s.option(form.DynamicList, 'source_mac_address', 'Source MAC'));
			common.modalOnly(s.option(form.DynamicList, 'source_hostname', 'Source hostname'));
			o = common.modalOnly(s.option(form.Flag, 'ip_is_private', 'ip_is_private'));
		o.default = '0';
			o = common.modalOnly(s.option(form.Flag, 'source_ip_is_private', 'source_ip_is_private'));
		o.default = '0';
			o = common.modalOnly(s.option(form.Value, 'extra_json', 'extra_json'));
		o.monospace = true;

		return m.render();
	}
});
